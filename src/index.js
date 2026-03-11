import { createServer as createHttpServer } from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { validateCreds, getCredsFromHeaders } from "./validations.js";
import { initializeTools } from "./tools.js";
import { getResourceMetadata, getMetadata, registerClient, getAuthorizePage, handleAuthorize, handleToken, resolveToken } from "./auth.js";

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

function createMcpServer() {
  return new McpServer({
    name: "searchunify",
    version: "1.0.0",
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

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
}

/** Read the full request body as a string */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

async function runHttp(creds, port) {
  // Key sessions by Bearer token so the same authenticated user reuses one transport
  const tokenSessions = new Map(); // bearerToken -> { server, transport }

  async function getOrCreateSession(bearerToken, sessionCreds) {
    if (bearerToken && tokenSessions.has(bearerToken)) {
      return tokenSessions.get(bearerToken).transport;
    }

    const server = createMcpServer();
    const effectiveCreds = sessionCreds || creds;
    const getCreds = () => httpCredsStorage.getStore() ?? effectiveCreds;
    await initializeTools({ server, creds: effectiveCreds, getCreds });

    // Stateless mode: no sessionIdGenerator so GET works without prior POST/initialize
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    transport.onclose = () => {
      if (bearerToken) tokenSessions.delete(bearerToken);
      console.error(`[MCP HTTP] Session for token closed`);
    };

    await server.connect(transport);

    if (bearerToken) {
      tokenSessions.set(bearerToken, { server, transport });
    }

    return transport;
  }

  const httpServer = createHttpServer(async (req, res) => {
    const ts = new Date().toISOString();
    const url = new URL(req.url ?? "", `http://localhost:${port}`);
    const method = req.method ?? "";
    const rawPath = url.pathname.replace(/\/+$/, "") || "/";
    // Strip /mcp prefix if proxy keeps it, so routes match consistently
    const path = rawPath.startsWith("/mcp/") ? rawPath.slice(4) : (rawPath === "/mcp" ? "/" : rawPath);
    console.error(`[MCP HTTP] ${ts} ${method} ${rawPath} -> ${path}`);

    setCorsHeaders(res);

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // --- Protected Resource Metadata (RFC 9728) ---
      if (method === "GET" && path === "/.well-known/oauth-protected-resource") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(getResourceMetadata()));
        return;
      }

      // --- OAuth Authorization Server Metadata (RFC 8414 + OpenID Connect Discovery) ---
      if (method === "GET" && (path === "/.well-known/oauth-authorization-server" || path === "/.well-known/openid-configuration")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(getMetadata()));
        return;
      }

      // --- Dynamic Client Registration ---
      if (method === "POST" && path === "/register") {
        const body = JSON.parse(await readBody(req));
        const result = registerClient(body);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // --- Authorization Endpoint ---
      if (path === "/authorize") {
        if (method === "GET") {
          const query = Object.fromEntries(url.searchParams.entries());
          const html = getAuthorizePage(query);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
          return;
        }
        if (method === "POST") {
          const body = JSON.parse(await readBody(req));
          const result = handleAuthorize(body);
          if (result.error) {
            res.writeHead(400, { "Content-Type": "application/json" });
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify(result));
          return;
        }
      }

      // --- Token Endpoint ---
      if (method === "POST" && path === "/token") {
        const rawBody = await readBody(req);
        let body;
        const contentType = req.headers["content-type"] || "";
        if (contentType.includes("application/x-www-form-urlencoded")) {
          body = Object.fromEntries(new URLSearchParams(rawBody));
        } else {
          body = JSON.parse(rawBody);
        }
        const result = handleToken(body);
        res.writeHead(result.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result.body));
        return;
      }

      // --- MCP Endpoint ---
      // Match both "/" and "/stream" — the /stream path avoids proxy redirect issues
      // (some proxies 301-redirect POST /mcp → GET /mcp/, dropping the body)
      if (path === "/" || path === "/stream") {
        // Resolve creds: Bearer token (from OAuth) > custom headers > default
        const authHeader = req.headers["authorization"] || "";
        const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        const tokenCreds = resolveToken(authHeader);
        const headerCreds = getCredsFromHeaders(req.headers || {});
        const requestCreds = tokenCreds || headerCreds || creds;

        // If no creds at all, return 401 with OAuth metadata hint
        if (!requestCreds) {
          const base = process.env.MCP_BASE_URL || "https://feature6.searchunify.com/mcp";
          res.writeHead(401, {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
          });
          res.end(JSON.stringify({ error: "Unauthorized. Authentication required." }));
          return;
        }

        // Get or reuse transport keyed by Bearer token
        const transport = await getOrCreateSession(bearerToken, requestCreds);

        httpCredsStorage.run(requestCreds, () => {
          transport.handleRequest(req, res);
        });
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found." }));
    } catch (err) {
      console.error("[MCP HTTP] Error handling request:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error." }));
      }
    }
  });

  httpServer.listen(port, () => {
    console.error(`SearchUnify MCP Server (HTTP) listening on http://localhost:${port}`);
  });
}

async function main() {
  const mode = getTransportMode();
  const port = getHttpPort();
  console.error('mode: ', mode);
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
