import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

process.env.OAUTH_ENCRYPTION_KEY = "a".repeat(64);

const { getCredsFromHeaders } = await import("../src/validations.js");

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiKeyHeaders(overrides = {}) {
  return {
    "searchunify-instance": "https://acme.searchunify.com",
    "searchunify-uid": "uid123",
    "searchunify-auth-type": "apiKey",
    "searchunify-api-key": "testapikey",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getCredsFromHeaders — /mcp-api auth", () => {
  it("returns null when searchunify-instance is missing", () => {
    const headers = apiKeyHeaders({ "searchunify-instance": undefined });
    assert.equal(getCredsFromHeaders(headers), null);
  });

  it("returns null when searchunify-uid is missing", () => {
    const headers = apiKeyHeaders({ "searchunify-uid": undefined });
    assert.equal(getCredsFromHeaders(headers), null);
  });

  it("returns null when searchunify-api-key is missing for apiKey auth", () => {
    const headers = apiKeyHeaders({ "searchunify-api-key": undefined });
    assert.equal(getCredsFromHeaders(headers), null);
  });

  it("returns null for an unknown auth type", () => {
    const headers = apiKeyHeaders({ "searchunify-auth-type": "magic" });
    assert.equal(getCredsFromHeaders(headers), null);
  });

  it("returns valid creds for correct apiKey headers", () => {
    const creds = getCredsFromHeaders(apiKeyHeaders());
    assert.ok(creds, "expected non-null creds");
    assert.equal(creds.config.instance, "https://acme.searchunify.com");
    assert.equal(creds.config.uid, "uid123");
    assert.equal(creds.config.authType, "apiKey");
    assert.equal(creds.config.apiKey, "testapikey");
    assert.ok(creds.suRestClient, "expected suRestClient to be present");
  });

  it("defaults auth type to apiKey when searchunify-auth-type header is absent", () => {
    const headers = apiKeyHeaders({ "searchunify-auth-type": undefined });
    const creds = getCredsFromHeaders(headers);
    assert.ok(creds, "expected non-null creds when auth-type defaults to apiKey");
    assert.equal(creds.config.authType, "apiKey");
  });

  it("trims instance and uid values", () => {
    const headers = apiKeyHeaders({
      "searchunify-instance": "  https://acme.searchunify.com  ",
      "searchunify-uid": "  uid123  ",
    });
    const creds = getCredsFromHeaders(headers);
    assert.ok(creds);
    assert.equal(creds.config.instance, "https://acme.searchunify.com");
    assert.equal(creds.config.uid, "uid123");
  });

  it("includes ecosystemId in config when searchunify-ecosystem-id header is set", () => {
    const headers = apiKeyHeaders({ "searchunify-ecosystem-id": "eco-abc" });
    const creds = getCredsFromHeaders(headers);
    assert.ok(creds);
    assert.equal(creds.config.ecoSystemId, "eco-abc");
  });
});
