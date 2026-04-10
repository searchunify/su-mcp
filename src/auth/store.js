import crypto from "node:crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

let encryptionKey;

function getEncryptionKey() {
  if (encryptionKey) return encryptionKey;
  const keyHex = process.env.OAUTH_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("OAUTH_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  encryptionKey = Buffer.from(keyHex, "hex");
  return encryptionKey;
}

function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(encoded) {
  const key = getEncryptionKey();
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext, null, "utf8") + decipher.final("utf8");
}

// TTLs in seconds
const OAUTH_SESSION_TTL = 600;
const AUTH_CODE_TTL = 300;
const ACCESS_TOKEN_TTL = 3600;
const REFRESH_TOKEN_TTL = 2592000;
const CLIENT_TTL = 2592000;

// --- Encryption helpers for store payloads ---

function encryptPayload(data, secretField) {
  const payload = { ...data };
  if (payload[secretField]) {
    const val = typeof payload[secretField] === "string" ? payload[secretField] : JSON.stringify(payload[secretField]);
    payload[secretField] = encrypt(val);
    payload._encrypted = secretField;
  }
  return payload;
}

function decryptPayload(parsed, isJson) {
  if (parsed._encrypted) {
    const field = parsed._encrypted;
    if (parsed[field]) {
      const decrypted = decrypt(parsed[field]);
      parsed[field] = isJson ? JSON.parse(decrypted) : decrypted;
    }
    delete parsed._encrypted;
  }
  return parsed;
}

// =====================================================================
// MemoryStore — in-process storage with TTL, no external dependencies
// =====================================================================

class MemoryStore {
  constructor() {
    this._data = new Map();
    this._timers = new Map();
  }

  async connect() { return true; }
  isReady() { return true; }
  async disconnect() {
    for (const timer of this._timers.values()) clearTimeout(timer);
    this._timers.clear();
    this._data.clear();
  }

  _set(key, value, ttlSeconds) {
    this._data.set(key, value);
    if (this._timers.has(key)) clearTimeout(this._timers.get(key));
    if (ttlSeconds > 0) {
      // Node.js setTimeout max delay is 2^31-1 ms (~24.8 days); cap to prevent overflow
      const ms = Math.min(ttlSeconds * 1000, 2147483647);
      this._timers.set(key, setTimeout(() => {
        this._data.delete(key);
        this._timers.delete(key);
      }, ms));
    }
  }

  _get(key) { return this._data.get(key) ?? null; }
  _del(key) {
    this._data.delete(key);
    if (this._timers.has(key)) { clearTimeout(this._timers.get(key)); this._timers.delete(key); }
  }

  // --- OAuth Client Registration ---
  async saveClient(client) { this._set(`client:${client.client_id}`, encryptPayload(client, "_none"), CLIENT_TTL); }
  async getClient(clientId) { const d = this._get(`client:${clientId}`); return d ? { ...d } : undefined; }

  // --- OAuth Sessions ---
  async saveOAuthSession(sessionId, data) { this._set(`session:${sessionId}`, encryptPayload(data, "suClientSecret"), OAUTH_SESSION_TTL); }
  async getOAuthSession(sessionId) { const d = this._get(`session:${sessionId}`); return d ? decryptPayload({ ...d }, false) : null; }
  async deleteOAuthSession(sessionId) { this._del(`session:${sessionId}`); }

  // --- Authorization Codes ---
  async saveAuthCode(code, data) { this._set(`authcode:${code}`, encryptPayload(data, "suTokens"), AUTH_CODE_TTL); }
  async getAuthCode(code) { const d = this._get(`authcode:${code}`); return d ? decryptPayload({ ...d }, true) : null; }
  async deleteAuthCode(code) { this._del(`authcode:${code}`); }

  // --- Access Tokens ---
  async saveAccessToken(token, data) { this._set(`access:${token}`, encryptPayload(data, "suTokens"), ACCESS_TOKEN_TTL); }
  async getAccessToken(token) { const d = this._get(`access:${token}`); return d ? decryptPayload({ ...d }, true) : null; }
  async deleteAccessToken(token) { this._del(`access:${token}`); }

  // --- Refresh Tokens ---
  async saveRefreshToken(token, data) { this._set(`refresh:${token}`, encryptPayload(data, "suTokens"), REFRESH_TOKEN_TTL); }
  async getRefreshToken(token) { const d = this._get(`refresh:${token}`); return d ? decryptPayload({ ...d }, true) : null; }
  async deleteRefreshToken(token) { this._del(`refresh:${token}`); }
}

// =====================================================================
// RedisStore — production-grade, persistent, multi-instance safe
// =====================================================================

class RedisStore {
  constructor(redisUrl) {
    this._redisUrl = redisUrl;
    this.redis = null;
    this.connected = false;
  }

  async connect() {
    try {
      const Redis = (await import("ioredis")).default;
      this.redis = new Redis(this._redisUrl || process.env.REDIS_URL || "redis://localhost:6379", {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 5) return null;
          return Math.min(times * 500, 3000);
        },
      });
      this.redis.on("error", (err) => {
        this.connected = false;
        console.error("[Redis] Connection error:", err.message);
      });
      this.redis.on("connect", () => { this.connected = true; });
      this.redis.on("close", () => { this.connected = false; });
      await this.redis.ping();
      this.connected = true;
      return true;
    } catch (err) {
      this.connected = false;
      console.error("[Redis] Failed to connect:", err.message);
      return false;
    }
  }

  isReady() { return this.connected && this.redis?.status === "ready"; }

  async disconnect() {
    try { await this.redis?.disconnect(); } catch {}
    this.connected = false;
  }

  async _set(key, value, ttl) { await this.redis.set(`su-mcp:${key}`, JSON.stringify(value), "EX", ttl); }
  async _get(key) { const d = await this.redis.get(`su-mcp:${key}`); return d ? JSON.parse(d) : null; }
  async _del(key) { await this.redis.del(`su-mcp:${key}`); }

  // --- OAuth Client Registration ---
  async saveClient(client) { await this._set(`client:${client.client_id}`, client, CLIENT_TTL); }
  async getClient(clientId) { return (await this._get(`client:${clientId}`)) ?? undefined; }

  // --- OAuth Sessions ---
  async saveOAuthSession(sessionId, data) { await this._set(`session:${sessionId}`, encryptPayload(data, "suClientSecret"), OAUTH_SESSION_TTL); }
  async getOAuthSession(sessionId) { const d = await this._get(`session:${sessionId}`); return d ? decryptPayload(d, false) : null; }
  async deleteOAuthSession(sessionId) { await this._del(`session:${sessionId}`); }

  // --- Authorization Codes ---
  async saveAuthCode(code, data) { await this._set(`authcode:${code}`, encryptPayload(data, "suTokens"), AUTH_CODE_TTL); }
  async getAuthCode(code) { const d = await this._get(`authcode:${code}`); return d ? decryptPayload(d, true) : null; }
  async deleteAuthCode(code) { await this._del(`authcode:${code}`); }

  // --- Access Tokens ---
  async saveAccessToken(token, data) { await this._set(`access:${token}`, encryptPayload(data, "suTokens"), ACCESS_TOKEN_TTL); }
  async getAccessToken(token) { const d = await this._get(`access:${token}`); return d ? decryptPayload(d, true) : null; }
  async deleteAccessToken(token) { await this._del(`access:${token}`); }

  // --- Refresh Tokens ---
  async saveRefreshToken(token, data) { await this._set(`refresh:${token}`, encryptPayload(data, "suTokens"), REFRESH_TOKEN_TTL); }
  async getRefreshToken(token) { const d = await this._get(`refresh:${token}`); return d ? decryptPayload(d, true) : null; }
  async deleteRefreshToken(token) { await this._del(`refresh:${token}`); }
}

// =====================================================================
// Factory — picks RedisStore if REDIS_URL is set, else MemoryStore
// =====================================================================

function createStore(redisUrl) {
  const url = redisUrl || process.env.REDIS_URL;
  if (url) {
    console.error("[Store] Using Redis store");
    return new RedisStore(url);
  }
  console.error("[Store] Using in-memory store (tokens lost on restart)");
  return new MemoryStore();
}

export { createStore, MemoryStore, RedisStore, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL };
