import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { validateCreds } from "./validations.js";
import { initializeTools } from "./tools.js";

const DEFAULT_HTTP_PORT = 3000;
const TRANSPORT_STDIO = "stdio";
const TRANSPORT_HTTP = "http";
const TRANSPORT_BOTH = "both";

function getTransportMode() {
  const raw = (process.env.MCP_TRANSPORT || TRANSPORT_STDIO).toLowerCase();
  if (raw === TRANSPORT_HTTP || raw === TRANSPORT_BOTH) return raw;
  return TRANSPORT_STDIO;
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

async function runHttp(creds, port) {
  const server = createMcpServer();
  await initializeTools({ server, creds });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);

  const httpServer = createHttpServer((req, res) => {
    transport.handleRequest(req, res);
  });

  httpServer.listen(port, () => {
    console.error(`SearchUnify MCP Server (HTTP) listening on http://localhost:${port}`);
  });
}

async function main() {
  const creds = validateCreds();
  const mode = getTransportMode();
  const port = getHttpPort();

  if (mode === TRANSPORT_STDIO) {
    await runStdio(creds);
    return;
  }

  if (mode === TRANSPORT_HTTP) {
    await runHttp(creds, port);
    return;
  }

  if (mode === TRANSPORT_BOTH) {
    await runHttp(creds, port);
    await runStdio(creds);
    return;
  }

  await runStdio(creds);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
