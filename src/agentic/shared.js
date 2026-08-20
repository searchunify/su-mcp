import { formatForClaude } from "../utils.js";
import { log } from "../logger.js";

export function jsonTextResult(obj) {
  return {
    content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
  };
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
