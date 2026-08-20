import { callSdk } from "./shared.js";

/** LLM token/cost consumption dashboard - Agentic Suite Analytics. */
export const LLM_USAGE_REPORT_TYPES = {
  llmUsageDashboard: "llmUsageDashboard",
};

export const llmUsageParamsDescription =
  '{"range"|"startDate"/"endDate"|"days","model","provider","agentName","metric"} for llmUsageDashboard';

export async function handleLlmUsageReport(reportType, p, suRestClient) {
  const R = LLM_USAGE_REPORT_TYPES;

  switch (reportType) {
    case R.llmUsageDashboard:
      return callSdk(reportType, suRestClient.LlmUsage().getLlmUsageDashboard(p));
    default:
      return null;
  }
}
