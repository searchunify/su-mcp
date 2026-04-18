import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

process.env.OAUTH_ENCRYPTION_KEY = "a".repeat(64);

const { createStore, MemoryStore, RedisStore } = await import("../src/auth/store.js");

describe("Store fallback behaviour", () => {
  it("createStore returns MemoryStore when no REDIS_URL is given", () => {
    const store = createStore(null);
    assert.ok(store instanceof MemoryStore, "expected MemoryStore when redisUrl is null");
  });

  it("createStore returns RedisStore when a REDIS_URL is given", () => {
    const store = createStore("redis://localhost:6379");
    assert.ok(store instanceof RedisStore, "expected RedisStore when redisUrl is provided");
  });

  it("RedisStore.connect() returns false for an unreachable Redis", async () => {
    // Port 1 is always refused — simulates an unreachable Redis
    const store = new RedisStore("redis://localhost:1");
    const connected = await store.connect();
    assert.equal(connected, false, "connect() should return false for unreachable Redis");
    // Ensure the client is cleaned up so the test process can exit
    try { await store.disconnect(); } catch {}
  });

  it("MemoryStore.connect() always returns true", async () => {
    const store = new MemoryStore();
    const connected = await store.connect();
    assert.equal(connected, true);
  });

  it("MemoryStore.isReady() returns true immediately after connect", async () => {
    const store = new MemoryStore();
    await store.connect();
    assert.equal(store.isReady(), true);
  });

  it("RedisStore.isReady() returns false before connect", () => {
    const store = new RedisStore("redis://localhost:6379");
    assert.equal(store.isReady(), false);
  });
});
