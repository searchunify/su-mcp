#!/usr/bin/env node
/**
 * Boilerplate MCP client to verify the SearchUnify MCP server (stdio or HTTP).
 *
 * Usage:
 *   # Test stdio (spawns server; requires creds at src/input/creds.json)
 *   node scripts/test-mcp-client.js stdio
 *
 *   # Test HTTP (server must already be running, e.g. MCP_TRANSPORT=http node src/index.js)
 *   node scripts/test-mcp-client.js http
 *
 *   # HTTP with custom URL
 *   MCP_HTTP_URL=http://localhost:4000 node scripts/test-mcp-client.js http
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const transportType = (process.argv[2] || process.env.MCP_TEST_TRANSPORT || "stdio").toLowerCase();
const httpUrl = process.env.MCP_HTTP_URL || "http://localhost:3000";

async function runTest() {
  console.log(`\n--- SearchUnify MCP client test (transport: ${transportType}) ---\n`);

  let transport;
  if (transportType === "stdio") {
    transport = new StdioClientTransport({
      command: "node",
      args: ["src/index.js"],
      cwd: projectRoot,
      env: { ...process.env, MCP_TRANSPORT: "stdio" },
    });
    console.log("Spawning server via stdio (cwd: %s)...", projectRoot);
  } else if (transportType === "http") {
    transport = new StreamableHTTPClientTransport(new URL(httpUrl));
    console.log("Connecting to HTTP server at %s...", httpUrl);
  } else {
    console.error("Unknown transport: %s. Use 'stdio' or 'http'.", transportType);
    process.exit(1);
  }

  const client = new Client(
    { name: "searchunify-mcp-test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  client.onerror = (err) => {
    console.error("Client error:", err);
  };

  try {
    await client.connect(transport);
    console.log("Connected. Server: %s\n", JSON.stringify(client.getServerVersion(), null, 2));

    // 1. List tools
    const toolsResult = await client.listTools();
    console.log("Tools (%d):", toolsResult.tools?.length ?? 0);
    (toolsResult.tools || []).forEach((t) => {
      console.log("  - %s: %s", t.name, t.description || "(no description)");
    });

    // 2. Ping
    await client.ping();
    console.log("\nPing: OK");

    // 3. Optional: call "search" tool if present (minimal query to avoid heavy work)
    const searchTool = (toolsResult.tools || []).find((t) => t.name === "search");
    if (searchTool) {
      console.log("\nCalling tool 'search' with query 'content source salesforce'...");
      const callResult = await client.callTool({
        name: "search",
        arguments: { searchString: "content source salesforce" },
      });
      console.log("Tool result (content length):", callResult.content?.length ?? 0);
      if (callResult.content?.length) {
        const first = callResult.content[0];
        const text = first?.type === "text" ? first.text : JSON.stringify(first);
        console.log("First chunk preview:", text.slice(0, 200) + (text.length > 200 ? "..." : ""));
      }
      if (callResult.isError) {
        console.log("Tool reported error:", callResult.content);
      }
    } else {
      console.log("\nNo 'search' tool found; skipping tool call.");
    }

    console.log("\n--- All checks passed ---\n");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    await transport.close?.();
  }
}

runTest();
