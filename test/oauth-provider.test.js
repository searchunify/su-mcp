import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
process.env.OAUTH_ENCRYPTION_KEY = "a".repeat(64);
const { MemoryStore } = await import("../src/auth/store.js");
const { SUMcpOAuthProvider } = await import("../src/auth/oauth-provider.js");

function makeProvider() {
  const provider = new SUMcpOAuthProvider(null); // no Redis URL → MemoryStore
  return provider;
}

describe("SUMcpOAuthProvider", () => {
  it("challengeForAuthorizationCode throws for unknown code", async () => {
    const p = makeProvider();
    await assert.rejects(
      () => p.challengeForAuthorizationCode({ client_id: "c1" }, "nonexistent"),
      /Invalid or expired/
    );
  });

  it("challengeForAuthorizationCode returns challenge for known code", async () => {
    const p = makeProvider();
    await p.store.saveAuthCode("code1", {
      clientId: "c1", codeChallenge: "abc123", redirectUri: "http://localhost", scopes: [], suTokens: {}
    });
    const challenge = await p.challengeForAuthorizationCode({ client_id: "c1" }, "code1");
    assert.equal(challenge, "abc123");
  });

  it("revokeToken ignores token belonging to different client", async () => {
    const p = makeProvider();
    await p.store.saveAccessToken("tok1", { clientId: "clientA", scopes: [], expiresAt: 9999, suTokens: {} });
    // clientB tries to revoke clientA's token — should be silently ignored
    await p.revokeToken({ client_id: "clientB" }, { token: "tok1", token_type_hint: "access_token" });
    const still = await p.store.getAccessToken("tok1");
    assert.ok(still, "token should still exist after unauthorized revoke attempt");
  });

  it("revokeToken deletes token when client matches", async () => {
    const p = makeProvider();
    await p.store.saveAccessToken("tok2", { clientId: "clientA", scopes: [], expiresAt: 9999, suTokens: {} });
    await p.revokeToken({ client_id: "clientA" }, { token: "tok2", token_type_hint: "access_token" });
    const gone = await p.store.getAccessToken("tok2");
    assert.equal(gone, null);
  });

  it("revokeToken for refresh_token ignores wrong client", async () => {
    const p = makeProvider();
    await p.store.saveRefreshToken("rt1", { clientId: "clientA", scopes: [], suTokens: {} });
    await p.revokeToken({ client_id: "clientB" }, { token: "rt1", token_type_hint: "refresh_token" });
    const still = await p.store.getRefreshToken("rt1");
    assert.ok(still);
  });

  it("revokeToken deletes refresh_token when client matches", async () => {
    const p = makeProvider();
    await p.store.saveRefreshToken("rt2", { clientId: "clientA", scopes: [], suTokens: {} });
    await p.revokeToken({ client_id: "clientA" }, { token: "rt2", token_type_hint: "refresh_token" });
    assert.equal(await p.store.getRefreshToken("rt2"), null);
  });
});
