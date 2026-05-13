/**
 * Helpers for executive business-query orchestration (traffic, relevance, self-solve, etc.).
 * Pure functions — safe to unit test without live analytics.
 */

/** Sum numeric `count` (or `click`, `search`) from search-classification rows. */
export function sumClassificationCounts(rows) {
  if (!Array.isArray(rows)) return { sum: 0, rowCount: 0 };
  let sum = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const raw = row.count ?? row.click ?? row.search ?? row.case;
    const n = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
    if (Number.isFinite(n)) sum += n;
  }
  return { sum, rowCount: rows.length };
}

/**
 * Search-no-click ratio: same query context on both endpoints; ratio uses summed counts on returned pages only.
 * When `count` is below total distinct queries, this is a lower-bound / slice metric, not a global total.
 */
export function computeSearchNoClickRatio(withNoClicksRows, withResultsRows) {
  const num = sumClassificationCounts(withNoClicksRows);
  const den = sumClassificationCounts(withResultsRows);
  if (den.sum <= 0) {
    return {
      ratio: null,
      numeratorSum: num.sum,
      denominatorSum: den.sum,
      note: "Denominator is zero or missing; cannot compute percentage.",
    };
  }
  return {
    ratio: (num.sum / den.sum) * 100,
    numeratorSum: num.sum,
    denominatorSum: den.sum,
    numeratorRows: num.rowCount,
    denominatorRows: den.rowCount,
  };
}

/** Normalize su-sdk `HttpRequest` outcome for orchestration (success envelope vs axios error). */
export function normalizeSdkResult(raw) {
  if (raw && raw.status === true) {
    return { ok: true, statusCode: 200, data: raw.data };
  }
  if (raw && raw.status === false) {
    const err = raw.message;
    const status =
      err && typeof err === "object" && err.response && err.response.status
        ? err.response.status
        : 0;
    const msg =
      err && typeof err === "object" && err.message
        ? err.message
        : String(err ?? "request failed");
    const requestUrl =
      err && typeof err === "object" && typeof err.config?.url === "string" ? err.config.url : undefined;
    const base = { ok: false, statusCode: status, error: msg, requestUrl };
    if (status === 404) {
      return {
        ...base,
        errorCode: "analytics_endpoint_not_available",
        userMessage:
          "This SearchUnify analytics API is not present in this release (HTTP 404). It is not an authentication failure and not caused by the user’s question.",
        modelGuidance:
          "Say explicitly that this analytics endpoint is not present in this release of SearchUnify the MCP server is calling. Suggest the admin UI for the same report or upgrading to a release that exposes this `/api/v2/...` route.",
      };
    }
    return base;
  }
  return { ok: false, statusCode: 0, error: "empty or unknown response" };
}

/**
 * `clicksCountContentSource` returns rows with `Name__1` (facet label) and `Data__1` (click count for that branch).
 * Use top-level `Data__1` only so we align with dashboard-style rollups and avoid double-counting nested `Data__*` nodes.
 */
function topLevelClickCount(row) {
  if (!row || typeof row !== "object") return 0;
  const raw = row.Data__1;
  const n = typeof raw === "string" ? parseFloat(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Sum top-level `Data__1` across all content-source rows. */
export function sumTopLevelContentSourceClicks(rows) {
  if (!Array.isArray(rows)) return 0;
  let sum = 0;
  for (const row of rows) {
    sum += topLevelClickCount(row);
  }
  return sum;
}

function rowNameTopLevel(row) {
  if (!row || typeof row !== "object") return "";
  return String(row.Name__1 ?? row.name ?? "");
}

/** True if `name` matches any hint (case-insensitive substring). */
export function nameMatchesHints(name, hints) {
  if (!hints || hints.length === 0) return false;
  const n = String(name).toLowerCase();
  return hints.some((h) => n.includes(String(h).toLowerCase()));
}

/** Sum `Data__1` for rows whose top-level name matches any of `hints`. */
export function sumTopLevelClicksForHints(rows, hints) {
  if (!Array.isArray(rows) || !hints || hints.length === 0) return null;
  let sum = 0;
  for (const row of rows) {
    if (nameMatchesHints(rowNameTopLevel(row), hints)) {
      sum += topLevelClickCount(row);
    }
  }
  return sum;
}

/** Sum `Data__1` for rows that do not match `excludeHints` (baseline slice). */
export function sumTopLevelClicksExcludingHints(rows, excludeHints) {
  if (!Array.isArray(rows)) return 0;
  if (!excludeHints || excludeHints.length === 0) return sumTopLevelContentSourceClicks(rows);
  let sum = 0;
  for (const row of rows) {
    if (!nameMatchesHints(rowNameTopLevel(row), excludeHints)) {
      sum += topLevelClickCount(row);
    }
  }
  return sum;
}
