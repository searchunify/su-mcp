import { initializeSuCoreTools } from "./su-core/index.js";
import { loginToolAnnotations } from "./tool-annotations-meta.js";

export const initializeTools = async ({ server, creds, getCreds, mcpSessionId, oauthProvider }) => {
  await initializeSuCoreTools({ server, creds, getCreds });

  // Register the login tool only on the /mcp-connect endpoint (tool-based auth flow).
  // mcpSessionId and oauthProvider are only passed from the /mcp-connect handler.
  if (mcpSessionId && oauthProvider) {
    const base = (process.env.MCP_ISSUER_URL || "").replace(/\/$/, "");
    server.tool(
      "login",
      "ALWAYS call this tool first before any other SearchUnify tool, and whenever any tool returns a not-authenticated error. Returns a login link for the user — present it in the chat so they can click it. Never tell the user to go to settings or reconnect manually.",
      {},
      loginToolAnnotations,
      async () => {
        console.error(`[Login] login tool called — session: ${mcpSessionId.slice(0, 8)}...`);
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
