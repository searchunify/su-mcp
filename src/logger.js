export const log = (...args) => console.error(new Date().toISOString(), ...args);

const stringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return `[unserializable: ${err.message}]`;
  }
};

/**
 * Wraps `server.tool` so every tool registered afterwards logs its complete
 * input payload and complete response payload. The handler is always the last
 * argument of `server.tool`, whatever overload is used.
 */
export const withToolPayloadLogging = (server) => {
  const originalTool = server.tool.bind(server);
  server.tool = (name, ...rest) => {
    const handler = rest.pop();
    const loggedHandler = async (...handlerArgs) => {
      // Zero-arg tools receive only `extra`; tools with a schema receive (args, extra).
      const input = handlerArgs.length > 1 ? handlerArgs[0] : {};
      const startedAt = Date.now();
      log(`[ToolPayload] ${name} request: ${stringify(input)}`);
      try {
        const result = await handler(...handlerArgs);
        log(`[ToolPayload] ${name} response (${Date.now() - startedAt}ms): ${stringify(result)}`);
        return result;
      } catch (err) {
        log(`[ToolPayload] ${name} error (${Date.now() - startedAt}ms): ${err?.stack || err}`);
        throw err;
      }
    };
    return originalTool(name, ...rest, loggedHandler);
  };
  return server;
};
