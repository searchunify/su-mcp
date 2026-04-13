#!/usr/bin/env node
/**
 * OAuth flow test for SearchUnify MCP Server.
 *
 * Modes:
 *   1. Automated (headless) — programmatically submits the config form:
 *      node scripts/test-oauth-flow.js auto
 *
 *   2. Visual (browser) — opens config form in browser, waits for you to submit:
 *      node scripts/test-oauth-flow.js visual
 *
 * Prerequisites:
 *   - MCP server running with OAuth enabled:
 *     REDIS_URL=redis://localhost:6379 \
 *     OAUTH_ENCRYPTION_KEY=<64-hex-chars> \
 *     MCP_ISSUER_URL=http://localhost:3000 \
 *     MCP_TRANSPORT=http \
 *     MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL=true \
 *     node src/index.js
 *
 *   - For automated mode: set these env vars (or edit the defaults below):
 *     SU_INSTANCE=https://your-instance.searchunify.com
 *     SU_API_KEY=your-api-key
 *     SU_UID=your-search-client-uid
 *
 * Environment variables:
 *   MCP_HTTP_URL  — MCP server URL (default: http://localhost:3000)
 *   SU_INSTANCE   — SearchUnify instance URL (automated mode)
 *   SU_AUTH_TYPE   — apiKey or clientCredentials (default: apiKey)
 *   SU_API_KEY     — API key (automated mode, apiKey auth)
 *   SU_CLIENT_ID   — OAuth client ID (automated mode, clientCredentials auth)
 *   SU_CLIENT_SECRET — OAuth client secret (automated mode, clientCredentials auth)
 *   SU_UID         — Search client UID (automated mode)
 */

import crypto from "node:crypto";
import http from "node:http";
import { execSync } from "node:child_process";

const MCP_URL = process.env.MCP_HTTP_URL || "http://localhost:3000";
const CALLBACK_PORT = 8765;
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;

const mode = (process.argv[2] || "auto").toLowerCase();

// --- PKCE helpers ---

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// --- HTTP helpers ---

async function httpJson(method, url, body, headers = {}) {
  const u = new URL(url);
  const payload = body ? JSON.stringify(body) : null;
  const opts = {
    method,
    hostname: u.hostname,
    port: u.port,
    path: u.pathname + u.search,
    headers: {
      ...headers,
      ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function httpForm(url, formData) {
  const u = new URL(url);
  const params = new URLSearchParams(formData).toString();
  const opts = {
    method: "POST",
    hostname: u.hostname,
    port: u.port,
    path: u.pathname,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(params),
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    req.write(params);
    req.end();
  });
}

// --- Test steps ---

function step(num, msg) {
  console.log(`\n[${"=".repeat(40)}]`);
  console.log(`  Step ${num}: ${msg}`);
  console.log(`[${"=".repeat(40)}]`);
}

async function testMetadata() {
  step(1, "Check OAuth metadata");
  const res = await httpJson("GET", `${MCP_URL}/.well-known/oauth-authorization-server`);
  if (res.status !== 200) {
    throw new Error(`Metadata endpoint returned ${res.status}. Is OAuth enabled on the server?`);
  }
  console.log("  authorization_endpoint:", res.data.authorization_endpoint);
  console.log("  token_endpoint:", res.data.token_endpoint);
  console.log("  registration_endpoint:", res.data.registration_endpoint);
  console.log("  code_challenge_methods:", res.data.code_challenge_methods_supported);
  return res.data;
}

async function registerClient() {
  step(2, "Register OAuth client (Dynamic Client Registration)");
  const res = await httpJson("POST", `${MCP_URL}/register`, {
    redirect_uris: [CALLBACK_URL],
    client_name: "su-mcp-test-client",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Client registration failed (${res.status}): ${JSON.stringify(res.data)}`);
  }
  console.log("  client_id:", res.data.client_id);
  console.log("  client_secret:", res.data.client_secret ? "****" + res.data.client_secret.slice(-4) : "(none)");
  return res.data;
}

async function runAutomatedFlow(client, pkce) {
  step(3, "Submit config form (automated)");

  const suInstance = process.env.SU_INSTANCE;
  const suUid = process.env.SU_UID;
  const suAuthType = process.env.SU_AUTH_TYPE || "apiKey";

  if (!suInstance || !suUid) {
    throw new Error("Set SU_INSTANCE and SU_UID env vars for automated mode");
  }

  const formData = {
    client_id: client.client_id,
    redirect_uri: CALLBACK_URL,
    code_challenge: pkce.challenge,
    state: "test-state-123",
    scopes: "",
    instance: suInstance,
    authType: suAuthType,
    uid: suUid,
  };

  if (suAuthType === "apiKey") {
    formData.apiKey = process.env.SU_API_KEY;
    if (!formData.apiKey) throw new Error("Set SU_API_KEY env var for apiKey auth");
  } else if (suAuthType === "clientCredentials") {
    formData.oauthClientId = process.env.SU_CLIENT_ID;
    formData.oauthClientSecret = process.env.SU_CLIENT_SECRET;
    if (!formData.oauthClientId || !formData.oauthClientSecret) {
      throw new Error("Set SU_CLIENT_ID and SU_CLIENT_SECRET env vars for clientCredentials auth");
    }
  }

  console.log("  Submitting config form...");
  console.log("  Instance:", suInstance);
  console.log("  Auth type:", suAuthType);
  console.log("  UID:", suUid);

  const res = await httpJson("POST", `${MCP_URL}/authorize/callback`, formData);

  if (res.status !== 200 || !res.data.redirectUrl) {
    throw new Error(`Config form submission failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  const redirectUrl = new URL(res.data.redirectUrl);
  const authCode = redirectUrl.searchParams.get("code");
  const state = redirectUrl.searchParams.get("state");

  console.log("  Auth code received:", authCode.slice(0, 8) + "...");
  console.log("  State:", state);
  return authCode;
}

async function runVisualFlow(client, pkce) {
  step(3, "Opening config form in browser (visual mode)");

  const authorizeUrl = `${MCP_URL}/authorize?response_type=code&client_id=${client.client_id}&code_challenge=${pkce.challenge}&code_challenge_method=S256&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&state=visual-test-123`;

  console.log("\n  Authorize URL:");
  console.log(`  ${authorizeUrl}\n`);

  // Start a local callback server to capture the redirect
  const authCode = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<html><body><h2 style="color:red">Error: ${error}</h2><p>${url.searchParams.get("error_description") || ""}</p></body></html>`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:60px">
            <h2 style="color:#22c55e">Authorization Successful!</h2>
            <p>Auth code received. You can close this tab.</p>
            <p style="color:#888;font-size:12px">Code: ${code.slice(0, 12)}...</p>
          </body></html>`);
          server.close();
          resolve(code);
          return;
        }
      }
      res.writeHead(404);
      res.end("Not found");
    });

    server.listen(CALLBACK_PORT, () => {
      console.log(`  Callback server listening on http://localhost:${CALLBACK_PORT}`);
      console.log("  Opening browser...\n");

      // Open browser
      try {
        const platform = process.platform;
        if (platform === "darwin") execSync(`open "${authorizeUrl}"`);
        else if (platform === "win32") execSync(`start "" "${authorizeUrl}"`);
        else execSync(`xdg-open "${authorizeUrl}"`);
      } catch {
        console.log("  Could not open browser automatically.");
        console.log("  Please open the authorize URL above in your browser.\n");
      }

      console.log("  Waiting for you to fill the form and submit...\n");

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error("Timed out waiting for callback (5 minutes)"));
      }, 5 * 60 * 1000);
    });
  });

  console.log("  Auth code received:", authCode.slice(0, 8) + "...");
  return authCode;
}

async function exchangeCodeForToken(client, authCode, pkce) {
  step(4, "Exchange auth code for access token");

  const res = await httpForm(`${MCP_URL}/token`, {
    grant_type: "authorization_code",
    code: authCode,
    code_verifier: pkce.verifier,
    client_id: client.client_id,
    client_secret: client.client_secret || "",
    redirect_uri: CALLBACK_URL,
  });

  if (res.status !== 200 || !res.data.access_token) {
    throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  console.log("  access_token:", res.data.access_token.slice(0, 8) + "...");
  console.log("  token_type:", res.data.token_type);
  console.log("  expires_in:", res.data.expires_in, "seconds");
  console.log("  refresh_token:", res.data.refresh_token ? res.data.refresh_token.slice(0, 8) + "..." : "(none)");
  return res.data;
}

async function testMcpWithToken(tokens) {
  step(5, "Call MCP tools/list with bearer token");

  const res = await httpJson("POST", `${MCP_URL}/mcp`, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "oauth-test", version: "1.0.0" },
    },
  }, {
    Authorization: `Bearer ${tokens.access_token}`,
  });

  console.log("  Initialize response status:", res.status);

  if (res.status === 200) {
    console.log("  Server info:", JSON.stringify(res.data?.result?.serverInfo || res.data, null, 2));
  }

  // List tools
  console.log("\n  Listing tools...");
  const toolsRes = await httpJson("POST", `${MCP_URL}/mcp`, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  }, {
    Authorization: `Bearer ${tokens.access_token}`,
  });

  if (toolsRes.status === 200 && toolsRes.data?.result?.tools) {
    const tools = toolsRes.data.result.tools;
    console.log(`  Found ${tools.length} tools:`);
    tools.forEach((t) => {
      const annotations = t.annotations ? ` [readOnly=${t.annotations.readOnlyHint}]` : "";
      console.log(`    - ${t.name}${annotations}`);
    });
  } else {
    console.log("  tools/list response:", JSON.stringify(toolsRes.data, null, 2).slice(0, 300));
  }
}

async function testRefreshToken(client, tokens) {
  step(6, "Refresh access token");

  if (!tokens.refresh_token) {
    console.log("  No refresh token — skipping");
    return tokens;
  }

  const res = await httpForm(`${MCP_URL}/token`, {
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: client.client_id,
    client_secret: client.client_secret || "",
  });

  if (res.status !== 200 || !res.data.access_token) {
    throw new Error(`Token refresh failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  console.log("  New access_token:", res.data.access_token.slice(0, 8) + "...");
  console.log("  New refresh_token:", res.data.refresh_token ? res.data.refresh_token.slice(0, 8) + "..." : "(none)");
  return res.data;
}

// --- Main ---

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   SearchUnify MCP — OAuth Flow Test          ║");
  console.log(`║   Mode: ${mode.padEnd(37)}║`);
  console.log(`║   Server: ${MCP_URL.padEnd(35)}║`);
  console.log("╚══════════════════════════════════════════════╝");

  if (mode !== "auto" && mode !== "visual") {
    console.error('\nUsage: node scripts/test-oauth-flow.js [auto|visual]');
    console.error('  auto   — headless test, requires SU_INSTANCE/SU_API_KEY/SU_UID env vars');
    console.error('  visual — opens browser, you fill the config form manually');
    process.exit(1);
  }

  try {
    // Step 1: Check metadata
    await testMetadata();

    // Step 2: Register client
    const client = await registerClient();

    // Step 3: Generate PKCE
    const pkce = generatePKCE();
    console.log("\n  PKCE verifier:", pkce.verifier.slice(0, 12) + "...");
    console.log("  PKCE challenge:", pkce.challenge.slice(0, 12) + "...");

    // Step 3b: Get auth code (automated or visual)
    let authCode;
    if (mode === "auto") {
      authCode = await runAutomatedFlow(client, pkce);
    } else {
      authCode = await runVisualFlow(client, pkce);
    }

    // Step 4: Exchange code for token
    const tokens = await exchangeCodeForToken(client, authCode, pkce);

    // Step 5: Test MCP tools
    await testMcpWithToken(tokens);

    // Step 6: Test refresh
    const newTokens = await testRefreshToken(client, tokens);

    // Step 7: Verify refreshed token works
    if (newTokens !== tokens) {
      step(7, "Verify refreshed token works");
      await testMcpWithToken(newTokens);
      console.log("  Refreshed token works!");
    }

    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║   ALL TESTS PASSED                           ║");
    console.log("╚══════════════════════════════════════════════╝\n");
  } catch (err) {
    console.error("\n  TEST FAILED:", err.message);
    if (err.cause) console.error("  Cause:", err.cause);
    process.exit(1);
  }
}

main();
