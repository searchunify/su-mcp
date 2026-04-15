import { initializeSuCoreTools } from "./su-core/index.js";

export const initializeTools = async ({ server, creds, getCreds, mcpSessionId, oauthProvider }) => {
  console.error("Initializing tools...");
  await initializeSuCoreTools({ server, creds, getCreds });

  // Register the login tool only on the /mcp-connect endpoint (tool-based auth flow).
  // mcpSessionId and oauthProvider are only passed from the /mcp-connect handler.
  if (mcpSessionId && oauthProvider) {
    const base = (process.env.MCP_ISSUER_URL || "").replace(/\/$/, "");
    server.tool(
      "login",
      "Log in to your SearchUnify instance. Call this before using any other tool. Returns a link — click it to open the login form in your browser, then come back and continue.",
      {},
      async () => ({
        content: [{
          type: "text",
          text:
            `Click the link below to connect your SearchUnify instance:\n\n` +
            `[Connect SearchUnify](${base}/mcp-connect/login?s=${encodeURIComponent(mcpSessionId)})\n\n` +
            `After completing login in your browser, let me know and I will continue with your request.`,
        }],
      })
    );
  }
};
