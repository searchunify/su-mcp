import { z } from "zod";
import { jsonTextResult, resolveTrustedEmail } from "./shared.js";
import { CASE_QA_REPORT_TYPES, caseQaParamsDescription, handleCaseQaReport } from "./case-qa.js";
import { SUPPORT_AGENT_REPORT_TYPES, supportAgentParamsDescription, handleSupportAgentReport } from "./support-agent.js";
import { AGENT_PARTNER_REPORT_TYPES, agentPartnerParamsDescription, handleAgentPartnerReport } from "./agent-partner.js";
import { LLM_USAGE_REPORT_TYPES, llmUsageParamsDescription, handleLlmUsageReport } from "./llm-usage.js";

/**
 * Agentic Suite Analytics report types, folded into the single `analytics` tool (see
 * su-core-analytics.js) rather than a separate tool - an LLM picks a tool by name/description
 * before filling in parameters, so a second tool wouldn't remove "which domain does this belong
 * to" ambiguity, it would just relocate it from reportType-selection to tool-selection.
 *
 * The MCP SDK registers `server.tool()` with a flat `.shape` only - Zod discriminated unions /
 * refinements on a composed schema are not applied by the SDK (see su-core-analytics.js), so
 * these report types cannot get their own strongly-typed parameter branch the way a
 * z.discriminatedUnion would allow. Rather than add ~40 more top-level fields to an already
 * very large flat shape, all agentic-analytics-specific parameters travel in one new object
 * field, `agenticParams` - the caller passes whatever that reportType needs as a JSON object.
 *
 * This is the ONLY file su-core-analytics.js imports from - everything agentic-specific (enum
 * values, field shape, dispatch) lives here and in the domain files below, not in su-core/.
 */
export const AGENTIC_REPORT_TYPES = {
  ...CASE_QA_REPORT_TYPES,
  ...SUPPORT_AGENT_REPORT_TYPES,
  ...AGENT_PARTNER_REPORT_TYPES,
  ...LLM_USAGE_REPORT_TYPES,
};

export const AGENTIC_REPORT_TYPE_SET = new Set(Object.values(AGENTIC_REPORT_TYPES));

export const agenticAnalyticsFieldShape = {
  agenticParams: z
    .record(z.any())
    .optional()
    .describe(
      "Parameters for Agentic Suite Analytics reportTypes (caseQa*/supportAgent*/agentPartner*/llmUsage*), " +
        "as a flat JSON object matching su-sdk-js's method signature for that reportType. Examples: " +
        `${caseQaParamsDescription}; ${supportAgentParamsDescription}; ${agentPartnerParamsDescription}; ${llmUsageParamsDescription}.`
    ),
  userInfo: z
    .object({})
    .passthrough()
    .optional()
    .describe(
      "Server-injected end-user identity (same field as the search tool's userInfo; NOT an LLM argument, do not populate from user input). " +
        "Used to bind myScoreCard/myScoreCardDetails to the actual caller instead of a caller-supplied userEmail."
    ),
};

/** Dispatches the agentic-analytics reportTypes to the domain handler that owns them. Returns null for unknown reportTypes (caller falls through to the core switch). */
export async function handleAgenticAnalyticsReport(reportType, args, credsForRequest) {
  if (!AGENTIC_REPORT_TYPE_SET.has(reportType)) {
    return null;
  }

  const p = args.agenticParams || {};
  const { suRestClient } = credsForRequest;
  const identity = { email: resolveTrustedEmail(args.userInfo, credsForRequest) };

  const result =
    (await handleCaseQaReport(reportType, p, suRestClient, identity)) ??
    (await handleSupportAgentReport(reportType, p, suRestClient)) ??
    (await handleAgentPartnerReport(reportType, p, suRestClient)) ??
    (await handleLlmUsageReport(reportType, p, suRestClient));

  return result ?? jsonTextResult({ error: "no_handler_for_reportType", reportType });
}
