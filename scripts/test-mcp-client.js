#!/usr/bin/env node
/**
 * Boilerplate MCP client to verify the SearchUnify MCP server.
 *
 * Usage:
 *   # Integration 3: stdio (spawns server locally; requires creds at src/input/creds.json)
 *   node scripts/test-mcp-client.js stdio
 *
 *   # Integration 2: root / with header auth
 *   MCP_HTTP_URL=https://mcp.searchunify.com/ \
 *   SU_INSTANCE=https://acme.searchunify.com SU_UID=<uid> SU_AUTH_TYPE=apiKey SU_API_KEY=<key> \
 *   node scripts/test-mcp-client.js http
 *
 *   # Integration 6: /mcp-api with header auth
 *   MCP_HTTP_URL=https://mcp.searchunify.com/mcp-api \
 *   SU_INSTANCE=https://acme.searchunify.com SU_UID=<uid> SU_AUTH_TYPE=apiKey SU_API_KEY=<key> \
 *   node scripts/test-mcp-client.js http
 *
 *   # Integration 1: /mcp OAuth — requires a Bearer token obtained via the OAuth browser flow
 *   MCP_HTTP_URL=https://mcp.searchunify.com/mcp MCP_BEARER_TOKEN=<token> \
 *   node scripts/test-mcp-client.js oauth
 *
 *   # Integration 4: /mcp-connect — connects, calls login tool, prints URL for manual completion
 *   MCP_HTTP_URL=https://mcp.searchunify.com/mcp-connect \
 *   node scripts/test-mcp-client.js mcp-connect
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

async function buildTransport() {
  if (transportType === "stdio") {
    console.log("Spawning server via stdio (cwd: %s)...", projectRoot);
    return new StdioClientTransport({
      command: "node",
      args: ["src/index.js"],
      cwd: projectRoot,
      env: { ...process.env, MCP_TRANSPORT: "stdio" },
    });
  }

  if (transportType === "http") {
    // Integration 2 (root /) and Integration 6 (/mcp-api) — header-based auth
    const suHeaders = {};
    if (process.env.SU_INSTANCE)   suHeaders["searchunify-instance"]  = process.env.SU_INSTANCE;
    if (process.env.SU_UID)        suHeaders["searchunify-uid"]       = process.env.SU_UID;
    if (process.env.SU_AUTH_TYPE)  suHeaders["searchunify-auth-type"] = process.env.SU_AUTH_TYPE;
    if (process.env.SU_API_KEY)    suHeaders["searchunify-api-key"]   = process.env.SU_API_KEY;
    const opts = Object.keys(suHeaders).length ? { requestInit: { headers: suHeaders } } : {};
    console.log("Connecting to %s (header auth)...", httpUrl);
    return new StreamableHTTPClientTransport(new URL(httpUrl), opts);
  }

  if (transportType === "oauth") {
    // Integration 1: /mcp — Bearer token from OAuth flow
    const token = process.env.MCP_BEARER_TOKEN;
    if (!token) {
      console.error([
        "MCP_BEARER_TOKEN is required for oauth transport.",
        "",
        "To get a token:",
        "  1. Add https://mcp.searchunify.com/mcp to Claude or use mcp-remote",
        "  2. Complete the OAuth connection form and SU login",
        "  3. Extract the Bearer token from the Authorization header of any MCP request",
        "     (visible in mcp-remote debug output or network inspector)",
        "",
        "Then re-run:",
        "  MCP_HTTP_URL=https://mcp.searchunify.com/mcp MCP_BEARER_TOKEN=<token> \\",
        "  node scripts/test-mcp-client.js oauth",
      ].join("\n"));
      process.exit(1);
    }
    console.log("Connecting to %s (OAuth Bearer token)...", httpUrl);
    return new StreamableHTTPClientTransport(new URL(httpUrl), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
  }

  if (transportType === "mcp-connect") {
    // Integration 4: /mcp-connect — stateful, tool-based login
    console.log("Connecting to %s (mcp-connect, no auth)...", httpUrl);
    return new StreamableHTTPClientTransport(new URL(httpUrl));
  }

  console.error("Unknown transport: %s. Use stdio | http | oauth | mcp-connect.", transportType);
  process.exit(1);
}

async function runTest() {
  console.log(`\n--- SearchUnify MCP client test (transport: ${transportType}) ---\n`);

  const transport = await buildTransport();
  const client = new Client(
    { name: "searchunify-mcp-test-client", version: "1.0.0" },
    { capabilities: {} }
  );
  client.onerror = (err) => console.error("Client error:", err);

  try {
    await client.connect(transport);
    console.log("Connected. Server: %s\n", JSON.stringify(client.getServerVersion(), null, 2));

    // 1. List tools
    const toolsResult = await client.listTools();
    console.log("Tools (%d):", toolsResult.tools?.length ?? 0);
    (toolsResult.tools || []).forEach((t) => {
      console.log("  - %s: %s", t.name, (t.description || "(no description)").slice(0, 80));
    });

    // 2. Ping
    await client.ping();
    console.log("\nPing: OK");

    // 3. mcp-connect: call login tool to get the connection URL, then stop
    if (transportType === "mcp-connect") {
      const loginTool = (toolsResult.tools || []).find((t) => t.name === "login");
      if (loginTool) {
        console.log("\nCalling 'login' tool to get connection URL...");
        const loginResult = await client.callTool({ name: "login", arguments: {} });
        const text = loginResult.content?.[0]?.text ?? JSON.stringify(loginResult.content);
        console.log("Login tool response:\n", text);
        console.log("\nOpen the URL above in a browser, fill in SU credentials, and complete login.");
        console.log("After login, re-run with MCP_BEARER_TOKEN or use Claude Desktop to test tools.");
      } else {
        console.log("\nNo 'login' tool found on mcp-connect endpoint.");
      }
      console.log("\n--- mcp-connect connectivity check passed ---\n");
      return;
    }

    // 4. Call search tool
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
      if (callResult.isError) console.log("Tool reported error:", callResult.content);
    } else {
      console.log("\nNo 'search' tool found; skipping.");
    }

    // 5. Call get-filter-options tool
    const filterTool = (toolsResult.tools || []).find((t) => t.name === "get-filter-options");
    if (filterTool) {
      console.log("\nCalling tool 'get-filter-options' with query 'search client salesforce'...");
      const filterResult = await client.callTool({
        name: "get-filter-options",
        arguments: { searchString: "search client salesforce" },
      });
      console.log("Tool result (content length):", filterResult.content?.length ?? 0);
      if (filterResult.content?.length) {
        const first = filterResult.content[0];
        const text = first?.type === "text" ? first.text : JSON.stringify(first);
        console.log("Filter options preview:", text.slice(0, 400) + (text.length > 400 ? "..." : ""));
      }
      if (filterResult.isError) console.log("Tool reported error:", filterResult.content);
    } else {
      console.log("\nNo 'get-filter-options' tool found; skipping.");
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
