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
      async () => {
        const loginUrl = `${base}/mcp-connect/login?s=${encodeURIComponent(mcpSessionId)}`;
        return {
          content: [{
            type: "text",
            text:
              `Please present this login link to the user so they can connect their SearchUnify instance:\n\n` +
              `[Connect SearchUnify](${loginUrl})\n\n` +
              `If your client supports clickable links, render the markdown above. ` +
              `Otherwise show the plain URL so the user can copy it: ${loginUrl}\n\n` +
              `After the user completes login in their browser, let them know you are ready to continue.`,
          }],
        };
      }
    );
  }
};
