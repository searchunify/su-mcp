import crypto from "node:crypto";
import { SearchUnifyRestClient } from "su-sdk";

/**
 * In-memory OAuth store for Claude MCP connector authentication.
 * Implements OAuth 2.1 with PKCE and Dynamic Client Registration.
 */

// Stores: clients, auth codes, tokens
const clients = new Map();
const authCodes = new Map(); // code -> { clientId, creds, codeChallengeHash, redirectUri, expiresAt }
const tokens = new Map();    // token -> { creds, expiresAt }

const CODE_TTL = 5 * 60 * 1000;       // 5 minutes
const TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getBaseUrl() {
  return process.env.MCP_BASE_URL || "https://feature6.searchunify.com/mcp";
}

/** Protected Resource Metadata (RFC 9728) — step 1 of discovery */
function getResourceMetadata() {
  const base = getBaseUrl();
  return {
    resource: base,
    authorization_servers: [base],
    scopes_supported: ["mcp:tools"],
    bearer_methods_supported: ["header"],
  };
}

/** OAuth 2.0 Authorization Server Metadata (RFC 8414) — step 2 of discovery */
function getMetadata() {
  const base = getBaseUrl();
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp:tools"],
  };
}

/** Dynamic Client Registration (RFC 7591) */
function registerClient(body) {
  const clientId = crypto.randomUUID();
  const clientSecret = crypto.randomUUID();
  const client = {
    client_id: clientId,
    client_secret: clientSecret,
    client_name: body.client_name || "MCP Client",
    redirect_uris: body.redirect_uris || [],
    grant_types: body.grant_types || ["authorization_code"],
    response_types: body.response_types || ["code"],
    token_endpoint_auth_method: body.token_endpoint_auth_method || "client_secret_post",
  };
  clients.set(clientId, client);
  return { ...client, client_id_issued_at: Math.floor(Date.now() / 1000), client_secret_expires_at: 0 };
}

/** Generate the authorize HTML page */
function getAuthorizePage(query) {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = query;
  const base = getBaseUrl();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SearchUnify - Connect to Claude</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: white; border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.1); padding: 32px; width: 100%; max-width: 440px; }
    h2 { margin-bottom: 8px; color: #1a1a1a; }
    .subtitle { color: #666; margin-bottom: 24px; font-size: 14px; }
    label { display: block; font-weight: 600; margin-bottom: 4px; font-size: 14px; color: #333; }
    input, select { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 16px; }
    input:focus, select:focus { outline: none; border-color: #0066ff; box-shadow: 0 0 0 3px rgba(0,102,255,0.1); }
    button { width: 100%; padding: 12px; background: #0066ff; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
    button:hover { background: #0052cc; }
    .hidden { display: none; }
    .error { color: #cc0000; font-size: 13px; margin-bottom: 12px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h2>SearchUnify</h2>
    <p class="subtitle">Connect your SearchUnify instance to Claude</p>
    <div id="error" class="error"></div>
    <form id="authForm">
      <input type="hidden" name="client_id" value="${client_id || ""}">
      <input type="hidden" name="redirect_uri" value="${redirect_uri || ""}">
      <input type="hidden" name="state" value="${state || ""}">
      <input type="hidden" name="code_challenge" value="${code_challenge || ""}">
      <input type="hidden" name="code_challenge_method" value="${code_challenge_method || "S256"}">

      <label for="instance">Instance URL</label>
      <input type="url" id="instance" name="instance" placeholder="https://your-instance.searchunify.com" required>

      <label for="uid">UID (Search Client ID)</label>
      <input type="text" id="uid" name="uid" placeholder="Enter your UID" required>

      <label for="authType">Authentication Type</label>
      <select id="authType" name="authType" onchange="toggleAuthFields()">
        <option value="apiKey">API Key</option>
        <option value="clientCredentials">Client Credentials</option>
        <option value="password">Password (OAuth2)</option>
      </select>

      <div id="apiKeyFields">
        <label for="apiKey">API Key</label>
        <input type="password" id="apiKey" name="apiKey" placeholder="Enter your API key">
      </div>

      <div id="clientCredFields" class="hidden">
        <label for="ccClientId">Client ID</label>
        <input type="text" id="ccClientId" name="oauthClientId" placeholder="OAuth Client ID">
        <label for="ccClientSecret">Client Secret</label>
        <input type="password" id="ccClientSecret" name="oauthClientSecret" placeholder="OAuth Client Secret">
      </div>

      <div id="passwordFields" class="hidden">
        <label for="pwUsername">Username</label>
        <input type="text" id="pwUsername" name="oauthUsername" placeholder="Username">
        <label for="pwPassword">Password</label>
        <input type="password" id="pwPassword" name="oauthPassword" placeholder="Password">
        <label for="pwClientId">Client ID</label>
        <input type="text" id="pwClientId" name="oauthClientId2" placeholder="OAuth Client ID">
        <label for="pwClientSecret">Client Secret</label>
        <input type="password" id="pwClientSecret" name="oauthClientSecret2" placeholder="OAuth Client Secret">
      </div>

      <button type="submit">Connect</button>
    </form>
  </div>
  <script>
    function toggleAuthFields() {
      const t = document.getElementById('authType').value;
      document.getElementById('apiKeyFields').classList.toggle('hidden', t !== 'apiKey');
      document.getElementById('clientCredFields').classList.toggle('hidden', t !== 'clientCredentials');
      document.getElementById('passwordFields').classList.toggle('hidden', t !== 'password');
    }
    document.getElementById('authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      try {
        const resp = await fetch('${base}/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await resp.json();
        if (result.redirect) {
          window.location.href = result.redirect;
        } else {
          document.getElementById('error').textContent = result.error || 'Authorization failed.';
          document.getElementById('error').style.display = 'block';
        }
      } catch (err) {
        document.getElementById('error').textContent = 'Network error: ' + err.message;
        document.getElementById('error').style.display = 'block';
      }
    });
  </script>
</body>
</html>`;
}

/** Handle POST /authorize — validate SU creds, issue auth code, return redirect URL */
function handleAuthorize(body) {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method,
    instance, uid, authType, apiKey,
    oauthClientId, oauthClientSecret,
    oauthClientId2, oauthClientSecret2,
    oauthUsername, oauthPassword } = body;

  if (!instance || !uid) {
    return { error: "Instance and UID are required." };
  }

  // Build SU config
  const config = { instance, uid, authType: authType || "apiKey", timeout: 60000 };

  if (config.authType === "apiKey") {
    if (!apiKey) return { error: "API Key is required." };
    config.apiKey = apiKey;
  } else if (config.authType === "clientCredentials") {
    if (!oauthClientId || !oauthClientSecret) return { error: "Client ID and Secret are required." };
    config.oauth2 = { clientId: oauthClientId, clientSecret: oauthClientSecret };
  } else if (config.authType === "password") {
    const cId = oauthClientId2 || oauthClientId;
    const cSecret = oauthClientSecret2 || oauthClientSecret;
    if (!oauthUsername || !oauthPassword || !cId || !cSecret) {
      return { error: "Username, password, client ID, and client secret are all required." };
    }
    config.oauth2 = { username: oauthUsername, password: oauthPassword, clientId: cId, clientSecret: cSecret };
  } else {
    return { error: "Invalid auth type." };
  }

  // Build SU REST client to validate
  const restClientConfig = { ...config };
  delete restClientConfig.uid;
  let suRestClient;
  try {
    suRestClient = new SearchUnifyRestClient(restClientConfig);
  } catch (err) {
    return { error: "Failed to create SearchUnify client: " + err.message };
  }

  const creds = { suRestClient, config };

  // Generate auth code
  const code = crypto.randomUUID();
  const codeChallengeHash = code_challenge || null;

  authCodes.set(code, {
    clientId: client_id,
    creds,
    codeChallengeHash,
    codeChallengeMethod: code_challenge_method || "S256",
    redirectUri: redirect_uri,
    expiresAt: Date.now() + CODE_TTL,
  });

  // Build redirect back to Claude
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  return { redirect: redirectUrl.toString() };
}

/** Handle POST /token — exchange auth code for access token */
function handleToken(body) {
  const { grant_type, code, code_verifier, redirect_uri, client_id, refresh_token } = body;

  if (grant_type === "refresh_token") {
    if (!refresh_token || !tokens.has(refresh_token)) {
      return { status: 400, body: { error: "invalid_grant", error_description: "Invalid refresh token." } };
    }
    const tokenData = tokens.get(refresh_token);
    // Issue new access token with same creds
    const newAccessToken = crypto.randomUUID();
    const newRefreshToken = crypto.randomUUID();
    tokens.set(newAccessToken, { creds: tokenData.creds, expiresAt: Date.now() + TOKEN_TTL });
    tokens.set(newRefreshToken, { creds: tokenData.creds, expiresAt: Date.now() + TOKEN_TTL * 7 });
    tokens.delete(refresh_token);
    return {
      status: 200,
      body: {
        access_token: newAccessToken,
        token_type: "Bearer",
        expires_in: TOKEN_TTL / 1000,
        refresh_token: newRefreshToken,
        scope: "mcp:tools",
      },
    };
  }

  if (grant_type !== "authorization_code") {
    return { status: 400, body: { error: "unsupported_grant_type" } };
  }

  if (!code || !authCodes.has(code)) {
    return { status: 400, body: { error: "invalid_grant", error_description: "Invalid or expired authorization code." } };
  }

  const authCode = authCodes.get(code);
  authCodes.delete(code);

  if (authCode.expiresAt < Date.now()) {
    return { status: 400, body: { error: "invalid_grant", error_description: "Authorization code expired." } };
  }

  // PKCE validation
  if (authCode.codeChallengeHash && code_verifier) {
    const hash = crypto.createHash("sha256").update(code_verifier).digest("base64url");
    if (hash !== authCode.codeChallengeHash) {
      return { status: 400, body: { error: "invalid_grant", error_description: "PKCE code_verifier mismatch." } };
    }
  }

  // Issue tokens
  const accessToken = crypto.randomUUID();
  const refreshToken = crypto.randomUUID();
  tokens.set(accessToken, { creds: authCode.creds, expiresAt: Date.now() + TOKEN_TTL });
  tokens.set(refreshToken, { creds: authCode.creds, expiresAt: Date.now() + TOKEN_TTL * 7 });

  return {
    status: 200,
    body: {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: TOKEN_TTL / 1000,
      refresh_token: refreshToken,
      scope: "mcp:tools",
    },
  };
}

/** Resolve a Bearer token to SU creds. Returns null if invalid. */
function resolveToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const data = tokens.get(token);
  if (!data) return null;
  if (data.expiresAt < Date.now()) {
    tokens.delete(token);
    return null;
  }
  return data.creds;
}

export { getResourceMetadata, getMetadata, registerClient, getAuthorizePage, handleAuthorize, handleToken, resolveToken };
