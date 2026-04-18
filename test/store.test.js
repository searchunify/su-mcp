import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
// Set required env var before importing store
process.env.OAUTH_ENCRYPTION_KEY = "a".repeat(64);
const { MemoryStore, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } = await import("../src/auth/store.js");

describe("MemoryStore", () => {
  it("stores and retrieves an OAuth session", async () => {
    const store = new MemoryStore();
    await store.saveOAuthSession("sess1", { suClientSecret: "mysecret", foo: "bar" });
    const result = await store.getOAuthSession("sess1");
    assert.equal(result.foo, "bar");
    assert.equal(result.suClientSecret, "mysecret"); // decrypted on retrieval
  });

  it("does not expose _encrypted field after retrieval", async () => {
    const store = new MemoryStore();
    await store.saveOAuthSession("sess2", { suClientSecret: "s3cr3t" });
    const result = await store.getOAuthSession("sess2");
    assert.equal(result._encrypted, undefined);
  });

  it("saveClient stores client without _encrypted field", async () => {
    const store = new MemoryStore();
    await store.saveClient({ client_id: "c1", redirect_uris: ["http://localhost"] });
    const result = await store.getClient("c1");
    assert.equal(result._encrypted, undefined);
    assert.equal(result.client_id, "c1");
  });

  it("evicts expired entries (TTL)", async () => {
    const store = new MemoryStore();
    store._set("test:ttl", "val", 0.001); // ~1ms
    await new Promise(r => setTimeout(r, 50));
    assert.equal(store._get("test:ttl"), null);
  });

  it("stores and retrieves access token with encrypted suTokens", async () => {
    const store = new MemoryStore();
    const tokenData = { clientId: "c1", scopes: [], expiresAt: 9999, suTokens: { accessToken: "tok", instanceUrl: "https://x.com" } };
    await store.saveAccessToken("at1", tokenData);
    const result = await store.getAccessToken("at1");
    assert.equal(result.suTokens.accessToken, "tok");
    assert.equal(result.suTokens.instanceUrl, "https://x.com");
  });

  it("deleteOAuthSession removes entry", async () => {
    const store = new MemoryStore();
    await store.saveOAuthSession("del1", { foo: "x" });
    await store.deleteOAuthSession("del1");
    assert.equal(await store.getOAuthSession("del1"), null);
  });

  it("REFRESH_TOKEN_TTL does not exceed Node setTimeout 32-bit max", () => {
    assert.ok(REFRESH_TOKEN_TTL * 1000 <= 2147483647, "TTL exceeds 32-bit ms limit");
  });
});
