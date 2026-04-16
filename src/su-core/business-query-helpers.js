/**
 * Helpers for Phase 1 executive business-query orchestration (Q4, Q5, Q11–Q13).
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
 * Q12 helper: same query context on both endpoints; ratio uses summed counts on returned pages only.
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
    return { ok: false, statusCode: status, error: msg };
  }
  return { ok: false, statusCode: 0, error: "empty or unknown response" };
}
