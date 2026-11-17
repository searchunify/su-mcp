import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Per-tool-call usage context. Every registered tool handler runs inside a store holding
 * { tool, callId, user }; su-sdk reads it (via the `mcpTrackContext` option) on each outbound
 * request and sends it as X-SearchUnify-MCP-Tool / -Call-Id / -User headers, so the customer's
 * own SearchUnify instance can record MCP usage. Nothing is stored or sent anywhere else.
 */
const storage = new AsyncLocalStorage();

/** End-user email passed by the client on behalf of a user (search tool `userInfo.email`). */
const emailFromToolArgs = (toolArgs) => {
  const email = toolArgs && typeof toolArgs === "object" ? toolArgs.userInfo?.email : undefined;
  return typeof email === "string" && email.trim() ? email.trim() : undefined;
};

/**
 * Patch `server.tool` so every handler registered afterwards runs inside a usage context.
 * The handler is always the last argument of `server.tool(...)`.
 */
export const withUsageTracking = (server) => {
  const registerTool = server.tool.bind(server);
  server.tool = (...registerArgs) => {
    const toolName = registerArgs[0];
    const handlerIndex = registerArgs.length - 1;
    const handler = registerArgs[handlerIndex];
    if (typeof handler === "function") {
      registerArgs[handlerIndex] = (...callArgs) =>
        storage.run(
          { tool: toolName, callId: randomUUID(), user: emailFromToolArgs(callArgs[0]) },
          () => handler(...callArgs)
        );
    }
    return registerTool(...registerArgs);
  };
  return server;
};

/**
 * Build the su-sdk `mcpTrackContext` function for one credential set.
 * @param {string|null|undefined} defaultUser email of the authenticated SU user (OAuth token), used
 *   when the tool call did not carry an end-user email.
 */
export const trackContextFor = (defaultUser) => () => {
  const current = storage.getStore();
  if (!current) return {};
  return { tool: current.tool, callId: current.callId, user: current.user || defaultUser || undefined };
};
