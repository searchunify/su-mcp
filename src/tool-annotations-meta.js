/**
 * MCP tool annotations for SearchUnify MCP server (`server.tool` fourth argument).
 * `safeForAutomation` is an extension beyond the MCP spec’s four hints; hosts may ignore unknown keys.
 */

export const loginToolAnnotations = {
  title: "Login",
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  safeForAutomation: false,
};

export const searchToolAnnotations = {
  title: "Search",
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
  safeForAutomation: false,
};

export const getFilterOptionsToolAnnotations = {
  title: "Get Filter Options",
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
  safeForAutomation: false,
};

export const getSearchClientsToolAnnotations = {
  title: "Get Search Clients",
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
  safeForAutomation: false,
};

/**
 * Single entrypoint for many POST analytics routes (read-only data; leadership CSV export not exposed).
 */
export const analyticsToolAnnotations = {
  title: "Analytics",
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
  safeForAutomation: false,
};

/** Orchestrated multi-call recipes (read-only; no leadership download APIs). */
export const executiveBusinessQueryToolAnnotations = {
  title: "Executive business query",
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
  safeForAutomation: false,
};
