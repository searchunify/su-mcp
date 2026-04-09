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
    app.post(`${basePath}/authorize/start`, requireStore, authRateLimit, express.urlencoded({ extended: false }), async (req, res) => {
      try {
        const { session, instance, su_client_id, su_client_secret } = req.body;
        if (!session || !instance || !su_client_id || !su_client_secret) {
          return res.status(400).send("Missing required fields");
        }

        // Validate session exists in Redis (prevents forged session IDs)
        const existingSession = await oauthProvider.store.getOAuthSession(session);
        if (!existingSession) {
          return res.status(400).send("Invalid or expired session. Please start over.");
        }

        // Validate instance URL format and require HTTPS in production
        const instanceUrl = instance.trim();
        let parsed;
        try {
          parsed = new URL(instanceUrl);
        } catch {
          return res.status(400).send("Invalid instance URL");
        }
        if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
          return res.status(400).send("Instance URL must use HTTPS");
        }
        // Block non-http(s) schemes and URLs with credentials
        if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
          return res.status(400).send("Invalid instance URL");
        }

        // Validate client_id and client_secret format (alphanumeric + common chars, max 200 chars)
        if (su_client_id.length > 200 || su_client_secret.length > 200) {
          return res.status(400).send("Invalid credentials format");
        }

        const suAuthorizeUrl = await oauthProvider.handleAuthorizeStart(
          session, instanceUrl, su_client_id.trim(), su_client_secret.trim()
        );
        res.redirect(302, suAuthorizeUrl);
      } catch (err) {
        console.error("[OAuth] Authorize start error:", err.message);
        res.status(400).send("Authorization failed. Please try again.");
      }
    });

    // Callback from SU's /authorise_redirect — SU sends us back with ?code=xxx&state=sessionId
    app.get(`${basePath}/su-callback`, requireStore, authRateLimit, async (req, res) => {
      try {
        const { code, state } = req.query;
        if (!code || !state) {
          return res.status(400).send("Missing code or state from SearchUnify");
        }
        // Validate code and state format (hex strings, reasonable length)
        if (typeof code !== "string" || code.length > 256 || typeof state !== "string" || state.length > 256) {
          return res.status(400).send("Invalid callback parameters");
        }
        const redirectUrl = await oauthProvider.handleSuCallback(code, state);
        res.redirect(302, redirectUrl);
      } catch (err) {
        console.error("[OAuth] SU callback error:", err.message);
        // Don't leak internal error details to the user
        res.status(400).send("Authorization failed. Please try again.");
      }
    });

    // MCP endpoint with bearer auth — OAuth-authenticated requests
    const bearerAuth = requireBearerAuth({ verifier: oauthProvider });

    app.all(`${basePath}/mcp`, bearerAuth, async (req, res) => {
      const ts = new Date().toISOString();
      console.error(`[MCP HTTP] ${ts} ${req.method} ${basePath}/mcp (OAuth)`);

      // Extract SU tokens from the bearer token and build credentials
      const token = req.headers.authorization?.split(" ")[1];
      if (token) {
        const suTokens = await oauthProvider.getSuTokensForMcpToken(token);
        if (suTokens) {
          const requestCreds = buildCredsFromSuToken(suTokens);
          httpCredsStorage.run(requestCreds, () => {
            transport.handleRequest(req, res);
          });
          return;
        }
      }
      res.status(401).json({ error: "Invalid or expired token" });
    });
  }

  // Non-OAuth MCP endpoint — header-based auth (backward compatible)
  app.all("/mcp", (req, res) => {
    const ts = new Date().toISOString();
    const method = req.method ?? "";
    console.error(`[MCP HTTP] ${ts} ${method} /mcp (headers)`);
    const headerCreds = getCredsFromHeaders(req.headers || {});
    const requestCreds = headerCreds || creds;
    httpCredsStorage.run(requestCreds, () => {
      transport.handleRequest(req, res);
    });
  });

  // Legacy root endpoint for backward compatibility
  app.all("/", (req, res) => {
    const ts = new Date().toISOString();
    const method = req.method ?? "";
    console.error(`[MCP HTTP] ${ts} ${method} / (legacy)`);
    const headerCreds = getCredsFromHeaders(req.headers || {});
    const requestCreds = headerCreds || creds;
    httpCredsStorage.run(requestCreds, () => {
      transport.handleRequest(req, res);
    });
  });

  app.listen(port, () => {
    console.error(`SearchUnify MCP Server (HTTP) listening on http://localhost:${port}`);
    if (oauthEnabled) {
      console.error(`  OAuth endpoints: /authorize, /token, /register`);
      console.error(`  OAuth metadata: /.well-known/oauth-authorization-server`);
      console.error(`  Instance form → /authorize/start → SU login → /su-callback`);
    }
    console.error(`  MCP endpoint: /mcp`);
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
