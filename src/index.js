import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { validateCreds } from "./validations.js";
import { initializeTools } from "./tools.js";

// Create server instance
const server = new McpServer({
    name: "searchunify",
    version: "1.0.0",
    capabilities: {
        resources: {},
          tools: {},
    },
});

let creds;

async function main() {
  const transport = new StdioServerTransport();
  creds = validateCreds();
  await initializeTools({ server, creds});
  await server.connect(transport);
  console.error("SearchUnify MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});