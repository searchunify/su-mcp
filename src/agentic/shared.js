import { formatForClaude, jsonTextResult } from "../utils.js";
import { log } from "../logger.js";

export { jsonTextResult };

/**
 * Trusted end-user email for identity-bound reportTypes (myScoreCard/myScoreCardDetails) - the
 * same server-injected `userInfo` the `search`/`get-filter-options` tools use (forwarded by the
 * agentic-suite connector from a validated JWT/zemail, not an LLM argument), else the
 * connection's own configured email. Callers of resolveTrustedEmail must let this value win
 * over any caller-supplied identity field when present - never let agenticParams override it.
 */
export function resolveTrustedEmail(userInfo, credsForRequest) {
  const injected = userInfo && typeof userInfo === "object" ? userInfo.email : undefined;
  return injected || credsForRequest?.config?.email || undefined;
}

/** Same conventions as su-core-analytics.js: SDK Response(false, error) on failure, formatForClaude(data) on success. */
export async function callSdk(reportType, sdkCallPromise) {
  let response;
  try {
    response = await sdkCallPromise;
  } catch (e) {
    log(`[AgenticAnalytics] SDK error — reportType: ${reportType}, message: ${e?.message ?? String(e)}`);

    return jsonTextResult({ error: e?.message ?? String(e), reportType });
  }

  if (response?.status === false) {
    let errMsg =
      response.message?.response?.data?.message || response.message?.message || JSON.stringify(response.message);
    if (errMsg === "You are not authorized") {
      errMsg =
        'You are not authorized: this report type requires a token/API-key scoped "AgenticAnalytics" ' +
        "(the current credential does not have that scope).";
    }
    log(`[AgenticAnalytics] API error — reportType: ${reportType}, message: ${errMsg}`);

    return jsonTextResult({ error: errMsg, reportType });
  }

  if (response?.data === undefined || response?.data === null) {
    log(`[AgenticAnalytics] empty response — reportType: ${reportType}`);

    return jsonTextResult({ error: "empty_response", reportType });
  }

  log(`[AgenticAnalytics] ${reportType} completed successfully`);

  return formatForClaude(response.data);
}
