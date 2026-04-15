import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { rateLimit } from "express-rate-limit";
import { validateCreds, getCredsFromHeaders, buildCredsFromSuToken } from "./validations.js";
import { initializeTools } from "./tools.js";
import { SUMcpOAuthProvider } from "./auth/oauth-provider.js";

const DEFAULT_HTTP_PORT = 3000;
const TRANSPORT_STDIO = "stdio";
const TRANSPORT_HTTP = "http";
const TRANSPORT_BOTH = "both";

function getTransportMode() {
  const raw = (process.env.MCP_TRANSPORT ?? "").toLowerCase();
  if (raw === TRANSPORT_HTTP || raw === TRANSPORT_BOTH || raw === TRANSPORT_STDIO) return raw;
  return TRANSPORT_BOTH;
}

function getHttpPort() {
  const port = parseInt(process.env.MCP_HTTP_PORT || String(DEFAULT_HTTP_PORT), 10);
  return Number.isFinite(port) ? port : DEFAULT_HTTP_PORT;
}

function isOAuthEnabled() {
  // OAuth requires OAUTH_ENCRYPTION_KEY. Redis is optional (falls back to in-memory).
  return !!process.env.OAUTH_ENCRYPTION_KEY;
}

function createMcpServer() {
  return new McpServer({
    name: process.env.npm_package_name || "searchunify-mcp",
    version: process.env.npm_package_version || "1.2.0",
    capabilities: {
      resources: {},
      tools: {},
    },
  });
}

async function runStdio(creds) {
  const server = createMcpServer();
  await initializeTools({ server, creds });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SearchUnify MCP Server running on stdio");
}

const httpCredsStorage = new AsyncLocalStorage();

async function runHttp(creds, port) {
  const server = createMcpServer();
  const getCreds = () => httpCredsStorage.getStore() ?? creds;
  await initializeTools({ server, creds, getCreds });

  // Stateless mode (no sessionIdGenerator) so multiple clients can connect and initialize.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  let oauthEnabled = isOAuthEnabled();
  let oauthProvider;

  if (oauthEnabled) {
    oauthProvider = new SUMcpOAuthProvider(process.env.REDIS_URL);
    const storeConnected = await oauthProvider.connect();
    if (storeConnected) {
      console.error("[OAuth] OAuth enabled — proxy flow via SU login");
    } else {
      console.error("[OAuth] WARNING: Store not reachable — OAuth disabled, server will run without OAuth");
      try { await oauthProvider.store.disconnect(); } catch {}
      oauthEnabled = false;
      oauthProvider = null;
    }
  } else {
    console.error("[OAuth] OAuth disabled — set OAUTH_ENCRYPTION_KEY to enable (REDIS_URL optional)");
  }

  const app = express();
  // Trust reverse proxies (nginx, Cloudflare) so req.ip reflects the real client IP
  // and express-rate-limit works correctly with X-Forwarded-For headers.
  app.set("trust proxy", 2);
  // Note: do NOT use app.use(express.json()) globally — it consumes the request body
  // before StreamableHTTPServerTransport can read it. Only apply JSON parsing on specific routes.

  if (oauthEnabled && oauthProvider) {
    const issuerUrl = new URL(process.env.MCP_ISSUER_URL || `http://localhost:${port}`);
    // Derive base path from issuer URL (e.g., "/7777" from "https://host/7777")
    // so OAuth endpoints are mounted at the correct path behind a reverse proxy.
    const basePath = issuerUrl.pathname.replace(/\/$/, "") || "";

    // Security headers for all responses (must be before auth router)
    app.use((req, res, next) => {
      res.set({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      });
      next();
    });

    // Override OAuth metadata to include basePath in endpoint URLs.
    // The SDK resolves absolute paths like '/authorize' against the issuer origin,
    // which drops any path prefix. This must be mounted BEFORE the SDK router.
    if (basePath) {
      const issuerOrigin = issuerUrl.origin;
      const metadataOverride = {
        issuer: issuerUrl.href,
        service_documentation: "https://github.com/searchunify/su-mcp#readme",
        authorization_endpoint: `${issuerOrigin}${basePath}/authorize`,
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint: `${issuerOrigin}${basePath}/token`,
        token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        revocation_endpoint: `${issuerOrigin}${basePath}/revoke`,
        revocation_endpoint_auth_methods_supported: ["client_secret_post"],
        registration_endpoint: `${issuerOrigin}${basePath}/register`,
      };
      app.get(`${basePath}/.well-known/oauth-authorization-server`, (req, res) => {
        res.status(200).json(metadataOverride);
      });
    }

    // Mount the SDK's OAuth auth router (handles /authorize, /token, /register, /.well-known/*)
    // Uses basePath so endpoints are accessible behind a reverse proxy (e.g., /7777/authorize)
    app.use(basePath, mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl,
      serviceDocumentationUrl: new URL("https://github.com/searchunify/su-mcp#readme"),
    }));

    // Rate limiting for auth endpoints (prevent brute force / abuse)
    const authRateLimit = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 50,                   // 50 requests per window per IP
      standardHeaders: true,
      legacyHeaders: false,
      validate: { trustProxy: false, xForwardedForHeader: false },
      message: { error: "Too many requests, please try again later" },
    });

    // Guard: reject OAuth requests if store is unavailable
    const requireStore = (req, res, next) => {
      if (!oauthProvider.isReady()) {
        console.error("[OAuth] Store unavailable — rejecting request");
        return res.status(503).json({ error: "Service temporarily unavailable. Please try again later." });
      }
      next();
    };

    // Instance form submission (POST — secrets in body, never in URL/logs)
    // Returns JSON so the form can handle errors inline without navigating away.
    // Success: { redirectUrl } — form JS does window.location.href = redirectUrl
    // Error:   { error } — form JS shows the message on the same page (mcp-remote stays open at port 8033)
    app.post(`${basePath}/authorize/start`, requireStore, authRateLimit, express.urlencoded({ extended: false }), async (req, res) => {
      try {
        const { session, instance, uid, su_client_id, su_client_secret } = req.body;
        if (!session || !instance || !uid || !su_client_id || !su_client_secret) {
          return res.status(400).json({ error: "All fields are required." });
        }

        // Validate session exists in Redis (prevents forged session IDs)
        const existingSession = await oauthProvider.store.getOAuthSession(session);
        if (!existingSession) {
          return res.status(400).json({ error: "Session expired. Please restart the connection from Claude Desktop." });
        }

        // Validate instance URL format and require HTTPS in production
        const instanceUrl = instance.trim().replace(/\/+$/, "");
        let parsed;
        try {
          parsed = new URL(instanceUrl);
        } catch {
          return res.status(400).json({ error: "Enter a valid Instance URL, e.g. https://acme.searchunify.com" });
        }
        if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
          return res.status(400).json({ error: "Instance URL must use HTTPS." });
        }
        if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
          return res.status(400).json({ error: "Invalid Instance URL." });
        }

        // Validate credential lengths
        if (su_client_id.length > 200 || su_client_secret.length > 200 || uid.trim().length > 200) {
          return res.status(400).json({ error: "One or more fields exceeds the maximum length." });
        }

        const suAuthorizeUrl = await oauthProvider.handleAuthorizeStart(
          session, instanceUrl, su_client_id.trim(), su_client_secret.trim(), uid.trim()
        );
        // Return JSON — form JS follows the redirect in the same tab
        return res.json({ redirectUrl: suAuthorizeUrl });
      } catch (err) {
        console.error("[OAuth] Authorize start error:", err.message);
        return res.status(500).json({ error: "Authorization failed. Please try again." });
      }
    });

    // Callback from SU's /authorise_redirect — SU sends us back with ?code=xxx&state=sessionId
    app.get(`${basePath}/su-callback`, requireStore, authRateLimit, async (req, res) => {
      try {
        const { code, state } = req.query;
        console.error(`[OAuth] /su-callback received — code: ${code?.slice(0, 8)}... state: ${state?.slice(0, 8)}... (len: ${state?.length})`);
        if (!code || !state) {
          return res.status(400).send("Missing code or state from SearchUnify");
        }
        // Validate code and state format (hex strings, reasonable length)
        if (typeof code !== "string" || code.length > 256 || typeof state !== "string" || state.length > 256) {
          return res.status(400).send("Invalid callback parameters");
        }

        // Tool-based login flow (mcp-connect): store tokens by MCP session ID, show success page
        const isToolSession = await oauthProvider.handleSuCallbackForTool(code, state);
        if (isToolSession) {
          return res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Login Successful</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f7fa;margin:0}
.card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);padding:40px;max-width:420px;text-align:center}
h1{color:#16a34a;font-size:20px;margin-bottom:12px}p{color:#555;font-size:14px;line-height:1.5}</style></head>
<body><div class="card"><h1>&#10003; Login Successful</h1>
<p>You have been connected to SearchUnify.<br>Return to Claude and continue your conversation.</p></div></body></html>`);
        }

        // Standard OAuth flow: redirect back to Claude Desktop's callback
        const redirectUrl = await oauthProvider.handleSuCallback(code, state);
        res.redirect(302, redirectUrl);
      } catch (err) {
        console.error("[OAuth] SU callback error:", err.message);
        // Don't leak internal error details to the user
        res.status(400).send("Authorization failed. Please try again.");
      }
    });

    // MCP endpoint with bearer auth — OAuth-authenticated requests
    // SDK 1.28.0: requireBearerAuth uses { verifier }, sets req.auth, and
    // handleRequest requires (req, res, parsedBody) — body must be pre-parsed.
    const bearerAuth = requireBearerAuth({ verifier: oauthProvider });

    app.all(`${basePath}/mcp`, express.json(), bearerAuth, async (req, res) => {
      const ts = new Date().toISOString();
      console.error(`[MCP HTTP] ${ts} ${req.method} ${basePath}/mcp (OAuth)`);

      try {
        const token = req.headers.authorization?.split(" ")[1];
        const suTokens = token ? await oauthProvider.getSuTokensForMcpToken(token) : null;
        if (!suTokens) {
          res.status(401).json({ error: "Invalid or expired token" });
          return;
        }

        const requestCreds = buildCredsFromSuToken(suTokens);

        // SDK 1.28.0 stateless mode: create fresh server+transport per request.
        // Sharing one server across requests breaks notifications/initialized
        // because the second POST arrives with no prior initialize context.
        const reqServer = createMcpServer();
        const getCreds = () => requestCreds;
        await initializeTools({ server: reqServer, creds: requestCreds, getCreds });
        const reqTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await reqServer.connect(reqTransport);

        await reqTransport.handleRequest(req, res, req.body);

        res.on("close", () => {
          reqTransport.close().catch(() => {});
          reqServer.close().catch(() => {});
        });
      } catch (err) {
        console.error(`[MCP] HANDLER ERROR: ${err.message}`);
        if (!res.headersSent) res.status(500).json({ error: "server_error", error_description: err.message });
      }
    });
  }

  // Non-OAuth MCP endpoint — header-based auth (backward compatible)
  app.all("/mcp", express.json(), async (req, res) => {
    const ts = new Date().toISOString();
    console.error(`[MCP HTTP] ${ts} ${req.method} /mcp (headers)`);
    try {
      const requestCreds = getCredsFromHeaders(req.headers || {}) || creds;
      const reqServer = createMcpServer();
      const getCreds = () => requestCreds;
      await initializeTools({ server: reqServer, creds: requestCreds, getCreds });
      const reqTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await reqServer.connect(reqTransport);
      await reqTransport.handleRequest(req, res, req.body);
      res.on("close", () => {
        reqTransport.close().catch(() => {});
        reqServer.close().catch(() => {});
      });
    } catch (err) {
      console.error(`[MCP] headers handler error: ${err.message}`);
      if (!res.headersSent) res.status(500).json({ error: "server_error", error_description: err.message });
    }
  });

  // ── Tool-based login flow (/mcp-connect) ────────────────────────────────────
  // Alternative to the OAuth browser flow. Claude Desktop connects here without
  // OAuth — no browser opens. The login() MCP tool returns a link to the config
  // form; the user fills it, logs in on SU, and SU tokens are stored by MCP
  // session ID for all subsequent tool calls.

  if (oauthEnabled && oauthProvider) {
    // Per-session state: mcpSessionId → { server, transport, createdAt }
    const mcpConnectSessions = new Map();

    // Evict sessions older than 2 hours every 30 minutes
    setInterval(() => {
      const cutoff = Date.now() - 2 * 60 * 60 * 1000;
      for (const [id, s] of mcpConnectSessions) {
        if (s.createdAt < cutoff) {
          s.transport.close().catch(() => {});
          s.server.close().catch(() => {});
          mcpConnectSessions.delete(id);
        }
      }
    }, 30 * 60 * 1000);

    // GET /mcp-connect/login — serve the config form
    app.get("/mcp-connect/login", requireStore, async (req, res) => {
      const mcpSessionId = req.query.s;
      if (!mcpSessionId || typeof mcpSessionId !== "string" || mcpSessionId.length > 128) {
        return res.status(400).send("Invalid or missing session parameter.");
      }
      const { getInstanceFormHTML } = await import("./auth/config-form.js");
      res.status(200).type("html").send(
        getInstanceFormHTML({ formAction: "/mcp-connect/authorize/start", sessionId: mcpSessionId })
      );
    });

    // POST /mcp-connect/authorize/start — handle config form submission
    app.post("/mcp-connect/authorize/start", requireStore, authRateLimit, express.urlencoded({ extended: false }), async (req, res) => {
      try {
        const { session, instance, uid, su_client_id, su_client_secret } = req.body;
        if (!session || !instance || !uid || !su_client_id || !su_client_secret) {
          return res.status(400).json({ error: "All fields are required." });
        }

        const existingSession = await oauthProvider.store.getOAuthSession(session);
        if (!existingSession) {
          return res.status(400).json({ error: "Session expired. Please call the login tool again in Claude." });
        }

        const instanceUrl = instance.trim().replace(/\/+$/, "");
        let parsed;
        try { parsed = new URL(instanceUrl); } catch {
          return res.status(400).json({ error: "Enter a valid Instance URL, e.g. https://acme.searchunify.com" });
        }
        if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
          return res.status(400).json({ error: "Instance URL must use HTTPS." });
        }
        if (parsed.username || parsed.password) {
          return res.status(400).json({ error: "Invalid Instance URL." });
        }
        if (su_client_id.length > 200 || su_client_secret.length > 200 || uid.trim().length > 200) {
          return res.status(400).json({ error: "One or more fields exceeds the maximum length." });
        }

        const suAuthorizeUrl = await oauthProvider.handleAuthorizeStartForTool(
          session, instanceUrl, su_client_id.trim(), su_client_secret.trim(), uid.trim()
        );
        return res.json({ redirectUrl: suAuthorizeUrl });
      } catch (err) {
        console.error("[mcp-connect] Authorize start error:", err.message);
        return res.status(500).json({ error: "Authorization failed. Please try again." });
      }
    });

    // MCP endpoint — stateful, no OAuth middleware
    app.all("/mcp-connect", express.json(), async (req, res) => {
      const ts = new Date().toISOString();
      console.error(`[MCP HTTP] ${ts} ${req.method} /mcp-connect (tool-auth)`);

      try {
        const existingId = req.headers["mcp-session-id"];

        // Reuse existing session
        if (existingId && mcpConnectSessions.has(existingId)) {
          const { transport } = mcpConnectSessions.get(existingId);
          await transport.handleRequest(req, res, req.body);
          return;
        }

        // New session — assign a stable session ID
        const mcpSessionId = crypto.randomBytes(16).toString("hex");

        // Seed an OAuth session in the store so the login route can look it up
        await oauthProvider.store.saveOAuthSession(mcpSessionId, { mcpSessionId });

        // getCreds is called per-request by tool handlers; picks up tokens after login
        const getCreds = async () => {
          const suTokens = await oauthProvider.getSuTokensForToolSession(mcpSessionId);
          return suTokens ? buildCredsFromSuToken(suTokens) : null;
        };

        const reqServer = createMcpServer();
        await initializeTools({ server: reqServer, creds: null, getCreds, mcpSessionId, oauthProvider });

        const reqTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => mcpSessionId,
        });

        mcpConnectSessions.set(mcpSessionId, { server: reqServer, transport: reqTransport, createdAt: Date.now() });

        await reqServer.connect(reqTransport);
        await reqTransport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error(`[mcp-connect] handler error: ${err.message}`);
        if (!res.headersSent) res.status(500).json({ error: "server_error", error_description: err.message });
      }
    });
  }

  // Legacy root endpoint for backward compatibility
  app.all("/", express.json(), async (req, res) => {
    const ts = new Date().toISOString();
    console.error(`[MCP HTTP] ${ts} ${req.method} / (legacy)`);
    try {
      const requestCreds = getCredsFromHeaders(req.headers || {}) || creds;
      const reqServer = createMcpServer();
      const getCreds = () => requestCreds;
      await initializeTools({ server: reqServer, creds: requestCreds, getCreds });
      const reqTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await reqServer.connect(reqTransport);
      await reqTransport.handleRequest(req, res, req.body);
      res.on("close", () => {
        reqTransport.close().catch(() => {});
        reqServer.close().catch(() => {});
      });
    } catch (err) {
      console.error(`[MCP] legacy handler error: ${err.message}`);
      if (!res.headersSent) res.status(500).json({ error: "server_error", error_description: err.message });
    }
  });

  app.listen(port, () => {
    console.error(`SearchUnify MCP Server (HTTP) listening on http://localhost:${port}`);
    if (oauthEnabled) {
      console.error(`  OAuth endpoints: /authorize, /token, /register`);
      console.error(`  OAuth metadata: /.well-known/oauth-authorization-server`);
      console.error(`  Instance form → /authorize/start → SU login → /su-callback`);
    }
    console.error(`  MCP endpoint: /mcp`);
    if (oauthEnabled) {
      console.error(`  Tool-auth endpoint: /mcp-connect (no OAuth — login tool returns form link)`);
    }
  });
}

async function main() {
  const mode = getTransportMode();
  const port = getHttpPort();
  console.error('mode: ', mode);

  // Important: for stdio mode, creds JSON must be provided in the input/creds.json file.
  if (mode === TRANSPORT_STDIO) {
    const creds = validateCreds();
    await runStdio(creds);
    return;
  }

  if (mode === TRANSPORT_HTTP) {
    await runHttp(null, port);
    return;
  }

  if (mode === TRANSPORT_BOTH) {
    try {
      const creds = validateCreds();
      await runStdio(creds);
    } catch (err) {
      console.error("validateCreds failed in TRANSPORT_BOTH mode, falling back to http only:", err?.message ?? err);
    }
    await runHttp(null, port);
    return;
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
