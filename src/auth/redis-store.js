import crypto from "node:crypto";
import Redis from "ioredis";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Key derived from OAUTH_ENCRYPTION_KEY env var (must be 32 bytes / 64 hex chars)
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
const OAUTH_SESSION_TTL = 600;    // 10 minutes (authorize flow)
const AUTH_CODE_TTL = 300;        // 5 minutes
const ACCESS_TOKEN_TTL = 3600;    // 1 hour
const REFRESH_TOKEN_TTL = 2592000; // 30 days
const CLIENT_TTL = 2592000;       // 30 days

const PREFIX = "su-mcp:";

class RedisStore {
  constructor(redisUrl) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || "redis://localhost:6379");
    this.redis.on("error", (err) => console.error("[Redis] Connection error:", err.message));
  }

  // --- OAuth Client Registration ---

  async saveClient(client) {
    const key = `${PREFIX}client:${client.client_id}`;
    await this.redis.set(key, JSON.stringify(client), "EX", CLIENT_TTL);
  }

  async getClient(clientId) {
    const key = `${PREFIX}client:${clientId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : undefined;
  }

  // --- OAuth Sessions (temporary, during authorize flow) ---
  // Sessions contain SU client credentials — encrypt sensitive fields

  async saveOAuthSession(sessionId, data) {
    const key = `${PREFIX}session:${sessionId}`;
    const payload = { ...data };
    if (payload.suClientSecret) {
      payload.suClientSecret = encrypt(payload.suClientSecret);
      payload._secretEncrypted = true;
    }
    await this.redis.set(key, JSON.stringify(payload), "EX", OAUTH_SESSION_TTL);
  }

  async getOAuthSession(sessionId) {
    const key = `${PREFIX}session:${sessionId}`;
    const data = await this.redis.get(key);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (parsed._secretEncrypted && parsed.suClientSecret) {
      parsed.suClientSecret = decrypt(parsed.suClientSecret);
      delete parsed._secretEncrypted;
    }
    return parsed;
  }

  async deleteOAuthSession(sessionId) {
    await this.redis.del(`${PREFIX}session:${sessionId}`);
  }

  // --- Authorization Codes ---

  async saveAuthCode(code, data) {
    const key = `${PREFIX}authcode:${code}`;
    const payload = { ...data };
    if (payload.suTokens) {
      payload.suTokens = encrypt(JSON.stringify(payload.suTokens));
      payload.encrypted = true;
    }
    await this.redis.set(key, JSON.stringify(payload), "EX", AUTH_CODE_TTL);
  }

  async getAuthCode(code) {
    const key = `${PREFIX}authcode:${code}`;
    const data = await this.redis.get(key);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (parsed.encrypted && parsed.suTokens) {
      parsed.suTokens = JSON.parse(decrypt(parsed.suTokens));
    }
    return parsed;
  }

  async deleteAuthCode(code) {
    await this.redis.del(`${PREFIX}authcode:${code}`);
  }

  // --- Access Tokens ---

  async saveAccessToken(token, data) {
    const key = `${PREFIX}access:${token}`;
    const payload = { ...data };
    if (payload.suTokens) {
      payload.suTokens = encrypt(JSON.stringify(payload.suTokens));
      payload.encrypted = true;
    }
    await this.redis.set(key, JSON.stringify(payload), "EX", ACCESS_TOKEN_TTL);
  }

  async getAccessToken(token) {
    const key = `${PREFIX}access:${token}`;
    const data = await this.redis.get(key);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (parsed.encrypted && parsed.suTokens) {
      parsed.suTokens = JSON.parse(decrypt(parsed.suTokens));
    }
    return parsed;
  }

  // --- Refresh Tokens ---

  async saveRefreshToken(token, data) {
    const key = `${PREFIX}refresh:${token}`;
    const payload = { ...data };
    if (payload.suTokens) {
      payload.suTokens = encrypt(JSON.stringify(payload.suTokens));
      payload.encrypted = true;
    }
    await this.redis.set(key, JSON.stringify(payload), "EX", REFRESH_TOKEN_TTL);
  }

  async getRefreshToken(token) {
    const key = `${PREFIX}refresh:${token}`;
    const data = await this.redis.get(key);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (parsed.encrypted && parsed.suTokens) {
      parsed.suTokens = JSON.parse(decrypt(parsed.suTokens));
    }
    return parsed;
  }

  async deleteRefreshToken(token) {
    await this.redis.del(`${PREFIX}refresh:${token}`);
  }
}

export { RedisStore, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL };
