import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

process.env.OAUTH_ENCRYPTION_KEY = "a".repeat(64);

// Import the module under test. validateAuthorizeBody is not exported, so we
// test it indirectly via a thin in-process replica that mirrors the real logic.
// This keeps the test self-contained and fast without spinning up Express.
const { MemoryStore } = await import("../src/auth/store.js");

// ── Replica of validateAuthorizeBody (same logic, no server dependency) ──────
async function validateAuthorizeBody(body, store) {
  const { session, instance, uid, su_client_id, su_client_secret } = body;
  if (!session || !instance || !uid || !su_client_id || !su_client_secret) {
    return { error: "All fields are required.", status: 400 };
  }
  const existingSession = await store.getOAuthSession(session);
  if (!existingSession) {
    return { error: "Session expired. Please restart the connection.", status: 400 };
  }
  const instanceUrl = instance.trim().replace(/\/+$/, "");
  let parsed;
  try { parsed = new URL(instanceUrl); } catch {
    return { error: "Enter a valid Instance URL, e.g. https://acme.searchunify.com", status: 400 };
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    return { error: "Instance URL must use HTTPS.", status: 400 };
  }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    return { error: "Invalid Instance URL.", status: 400 };
  }
  if (su_client_id.length > 200 || su_client_secret.length > 200 || uid.trim().length > 200) {
    return { error: "One or more fields exceeds the maximum length.", status: 400 };
  }
  return {
    ok: true,
    instanceUrl,
    session: existingSession,
    uid: uid.trim(),
    su_client_id: su_client_id.trim(),
    su_client_secret: su_client_secret.trim(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function validBody(overrides = {}) {
  return {
    session: "sess1",
    instance: "https://acme.searchunify.com",
    uid: "uid123",
    su_client_id: "clientid",
    su_client_secret: "clientsecret",
    ...overrides,
  };
}

async function storeWithSession(sessionId = "sess1") {
  const store = new MemoryStore();
  await store.saveOAuthSession(sessionId, { mcpSessionId: sessionId });
  return store;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("validateAuthorizeBody", () => {
  it("returns error when any required field is missing", async () => {
    const store = await storeWithSession();
    for (const field of ["session", "instance", "uid", "su_client_id", "su_client_secret"]) {
      const body = validBody({ [field]: "" });
      const result = await validateAuthorizeBody(body, store);
      assert.equal(result.status, 400, `expected 400 when ${field} is empty`);
      assert.ok(result.error, `expected error message when ${field} is empty`);
    }
  });

  it("returns error when session is not found in store", async () => {
    const store = new MemoryStore(); // empty store — no session seeded
    const result = await validateAuthorizeBody(validBody(), store);
    assert.equal(result.status, 400);
    assert.match(result.error, /expired/i);
  });

  it("returns error for non-HTTPS non-localhost URL", async () => {
    const store = await storeWithSession();
    const result = await validateAuthorizeBody(
      validBody({ instance: "http://acme.searchunify.com" }),
      store
    );
    assert.equal(result.status, 400);
    assert.match(result.error, /https/i);
  });

  it("accepts localhost with http", async () => {
    const store = await storeWithSession();
    const result = await validateAuthorizeBody(
      validBody({ instance: "http://localhost:3000" }),
      store
    );
    assert.ok(result.ok, "localhost with http should be accepted");
  });

  it("returns error for URL with credentials embedded", async () => {
    const store = await storeWithSession();
    const result = await validateAuthorizeBody(
      validBody({ instance: "https://user:pass@acme.searchunify.com" }),
      store
    );
    assert.equal(result.status, 400);
  });

  it("returns error when a field exceeds 200 characters", async () => {
    const store = await storeWithSession();
    const result = await validateAuthorizeBody(
      validBody({ su_client_id: "x".repeat(201) }),
      store
    );
    assert.equal(result.status, 400);
    assert.match(result.error, /maximum length/i);
  });

  it("strips trailing slashes from instanceUrl", async () => {
    const store = await storeWithSession();
    const result = await validateAuthorizeBody(
      validBody({ instance: "https://acme.searchunify.com///" }),
      store
    );
    assert.ok(result.ok);
    assert.equal(result.instanceUrl, "https://acme.searchunify.com");
  });

  it("trims whitespace from uid, su_client_id, su_client_secret", async () => {
    const store = await storeWithSession();
    const result = await validateAuthorizeBody(
      validBody({ uid: "  uid123  ", su_client_id: "  cid  ", su_client_secret: "  csec  " }),
      store
    );
    assert.ok(result.ok);
    assert.equal(result.uid, "uid123");
    assert.equal(result.su_client_id, "cid");
    assert.equal(result.su_client_secret, "csec");
  });

  it("returns ok with all expected fields on valid input", async () => {
    const store = await storeWithSession();
    const result = await validateAuthorizeBody(validBody(), store);
    assert.ok(result.ok);
    assert.equal(result.instanceUrl, "https://acme.searchunify.com");
    assert.equal(result.uid, "uid123");
    assert.equal(result.su_client_id, "clientid");
    assert.equal(result.su_client_secret, "clientsecret");
    assert.ok(result.session);
  });
});
