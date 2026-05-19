/**
 * Master switch for executive analytics orchestrations on MCP:
 * - `false`: `executive_business_query` is not registered; `analytics` omits recipe `reportType`s (same as raw analytics-only surface).
 * - `true`: both tools expose and run executive recipes.
 */
export const ENABLE_EXECUTIVE_RECIPE_REPORTS = false;
