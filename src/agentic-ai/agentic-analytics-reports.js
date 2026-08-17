import { z } from "zod";
import { formatForClaude } from "./../utils.js";
import { log } from "../logger.js";

/**
 * Agentic Suite Analytics report types, folded into the single `analytics` tool (see
 * su-core-analytics.js) rather than a separate tool - an LLM picks a tool by name/description
 * before filling in parameters, so a second tool wouldn't remove "which domain does this belong
 * to" ambiguity, it would just relocate it from reportType-selection to tool-selection.
 *
 * The MCP SDK registers `server.tool()` with a flat `.shape` only - Zod discriminated unions /
 * refinements on a composed schema are not applied by the SDK (see su-core-analytics.js:674),
 * so these report types cannot get their own strongly-typed parameter branch the way a
 * z.discriminatedUnion would allow. Rather than add ~40 more top-level fields to an already
 * very large flat shape, all agentic-analytics-specific parameters travel in one new object
 * field, `agenticParams` - the caller passes whatever that reportType needs as a JSON object.
 */
export const AGENTIC_REPORT_TYPES = {
  // Case QA & Agent Scorecards
  caseQaFilters: "caseQaFilters",
  caseQaMetrics: "caseQaMetrics",
  caseQaCaseDetails: "caseQaCaseDetails",
  caseQaDetail: "caseQaDetail",
  caseQaInsights: "caseQaInsights",
  agentScoreCardMetrics: "agentScoreCardMetrics",
  myScoreCard: "myScoreCard",
  myScoreCardDetails: "myScoreCardDetails",
  // Support Agent Analytics (bot/conversation analytics)
  supportAgentAgents: "supportAgentAgents",
  supportAgentKpis: "supportAgentKpis",
  supportAgentTrendsVolumeOutcome: "supportAgentTrendsVolumeOutcome",
  supportAgentTrendsDuration: "supportAgentTrendsDuration",
  supportAgentTrendsCsat: "supportAgentTrendsCsat",
  supportAgentOutcomeDistribution: "supportAgentOutcomeDistribution",
  supportAgentSankey: "supportAgentSankey",
  supportAgentSessions: "supportAgentSessions",
  supportAgentSessionTranscript: "supportAgentSessionTranscript",
  // Agent Partner Analytics
  agentPartnerSearchClients: "agentPartnerSearchClients",
  agentPartnerAdoptionContentSources: "agentPartnerAdoptionContentSources",
  agentPartnerOverviewTileData: "agentPartnerOverviewTileData",
  agentPartnerOverviewAgentEngagement: "agentPartnerOverviewAgentEngagement",
  agentPartnerOverviewAgentEngagementExport: "agentPartnerOverviewAgentEngagementExport",
  agentPartnerOverviewMttrReport: "agentPartnerOverviewMttrReport",
  agentPartnerOverviewMttrReportExport: "agentPartnerOverviewMttrReportExport",
  agentPartnerOverviewAgentWiseReport: "agentPartnerOverviewAgentWiseReport",
  agentPartnerOverviewAgentWiseReportExport: "agentPartnerOverviewAgentWiseReportExport",
  agentPartnerTagTrendsSpikeWatchlist: "agentPartnerTagTrendsSpikeWatchlist",
  agentPartnerTagTrendsSpikeWatchlistExport: "agentPartnerTagTrendsSpikeWatchlistExport",
  agentPartnerTagTrendsFrequency: "agentPartnerTagTrendsFrequency",
  agentPartnerTagTrendsFrequencyExport: "agentPartnerTagTrendsFrequencyExport",
  agentPartnerTagTrendsTopPairs: "agentPartnerTagTrendsTopPairs",
  agentPartnerTagTrendsFilterAgents: "agentPartnerTagTrendsFilterAgents",
  agentPartnerTagTrendsFilterProducts: "agentPartnerTagTrendsFilterProducts",
  agentPartnerAdoptionRaAdoption: "agentPartnerAdoptionRaAdoption",
  agentPartnerAdoptionRaAdoptionExport: "agentPartnerAdoptionRaAdoptionExport",
  agentPartnerAdoptionAhAdoption: "agentPartnerAdoptionAhAdoption",
  agentPartnerAdoptionAhAdoptionExport: "agentPartnerAdoptionAhAdoptionExport",
  agentPartnerAdoptionCaseEscalation: "agentPartnerAdoptionCaseEscalation",
  agentPartnerAdoptionCaseEscalationExport: "agentPartnerAdoptionCaseEscalationExport",
  agentPartnerAdoptionAverageTtr: "agentPartnerAdoptionAverageTtr",
  agentPartnerAdoptionAverageTtrExport: "agentPartnerAdoptionAverageTtrExport",
  agentPartnerFeedbackResponseFeedback: "agentPartnerFeedbackResponseFeedback",
  agentPartnerFeedbackResponseFeedbackDetails: "agentPartnerFeedbackResponseFeedbackDetails",
  agentPartnerFeedbackFeatureTypes: "agentPartnerFeedbackFeatureTypes",
  agentPartnerFeedbackAgentNames: "agentPartnerFeedbackAgentNames",
  agentPartnerFeedbackExport: "agentPartnerFeedbackExport",
  // LLM token/cost consumption
  llmUsageDashboard: "llmUsageDashboard",
};

export const AGENTIC_REPORT_TYPE_SET = new Set(Object.values(AGENTIC_REPORT_TYPES));

export const agenticAnalyticsFieldShape = {
  agenticParams: z
    .record(z.any())
    .optional()
    .describe(
      "Parameters for Agentic Suite Analytics reportTypes (caseQa*/supportAgent*/agentPartner*/llmUsage*), " +
        "as a flat JSON object matching su-sdk-js's method signature for that reportType. Examples: " +
        '{"aiAgentUid","teamId","managerEmail"} for caseQaFilters; ' +
        '{"filters":{"from","to","teamIds","agentIds","accountIds","aiAgentIds"},"requiredData"} for caseQaMetrics/agentScoreCardMetrics; ' +
        '{"filters",...,"page","limit","search","searchColumns","sortBy","sortOrder"} for caseQaCaseDetails; ' +
        '{"caseId","uid","analyticsId"} for caseQaDetail; ' +
        '{"userEmail","tenantId","uid"} for myScoreCard (add "page","limit","caseId" for myScoreCardDetails); ' +
        '{"startDate"|"endDate"|"datePreset","granularity","agentIds"} for supportAgent trend/kpi/outcome/sankey reportTypes; ' +
        '{"outcome","page","pageSize","sortBy","sortOrder","search", ...common} for supportAgentSessions; ' +
        '{"sessionId"} for supportAgentSessionTranscript; ' +
        '{"filters",...} for agentPartner* reportTypes (search-clients/adoption/overview/tag-trends/feedback); ' +
        '{"range"|"startDate"/"endDate"|"days","model","provider","agentName","metric"} for llmUsageDashboard.'
    ),
};

function jsonTextResult(obj) {
  return {
    content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
  };
}

/** Same conventions as su-core-analytics.js: SDK Response(false, error) on failure, formatForClaude(data) on success. */
async function callSdk(reportType, sdkCallPromise) {
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

/** Dispatches the agentic-analytics reportTypes to their su-sdk-js methods. Returns null for unknown reportTypes (caller falls through to the core switch). */
export async function handleAgenticAnalyticsReport(reportType, args, credsForRequest) {
  if (!AGENTIC_REPORT_TYPE_SET.has(reportType)) {
    return null;
  }

  const p = args.agenticParams || {};
  const { suRestClient } = credsForRequest;
  const R = AGENTIC_REPORT_TYPES;

  switch (reportType) {
    case R.caseQaFilters:
      return callSdk(reportType, suRestClient.CaseQa().getCaseQaFilters(p));
    case R.caseQaMetrics:
      return callSdk(reportType, suRestClient.CaseQa().getCaseQaMetrics(p));
    case R.caseQaCaseDetails:
      return callSdk(reportType, suRestClient.CaseQa().getCaseQaCaseDetails(p));
    case R.caseQaDetail:
      return callSdk(reportType, suRestClient.CaseQa().getCaseQaDetail(p));
    case R.caseQaInsights:
      return callSdk(reportType, suRestClient.CaseQa().getCqaInsights());
    case R.agentScoreCardMetrics:
      return callSdk(reportType, suRestClient.CaseQa().getAgentScoreCardMetrics(p));
    case R.myScoreCard:
      return callSdk(reportType, suRestClient.CaseQa().getMyScoreCard(p));
    case R.myScoreCardDetails:
      return callSdk(reportType, suRestClient.CaseQa().getMyScoreCardDetails(p));

    case R.supportAgentAgents:
      return callSdk(reportType, suRestClient.SupportAgentAnalytics().getAgents());
    case R.supportAgentKpis:
      return callSdk(reportType, suRestClient.SupportAgentAnalytics().getKpis(p));
    case R.supportAgentTrendsVolumeOutcome:
      return callSdk(reportType, suRestClient.SupportAgentAnalytics().getTrendsVolumeOutcome(p));
    case R.supportAgentTrendsDuration:
      return callSdk(reportType, suRestClient.SupportAgentAnalytics().getTrendsDuration(p));
    case R.supportAgentTrendsCsat:
      return callSdk(reportType, suRestClient.SupportAgentAnalytics().getTrendsCsat(p));
    case R.supportAgentOutcomeDistribution:
      return callSdk(reportType, suRestClient.SupportAgentAnalytics().getOutcomeDistribution(p));
    case R.supportAgentSankey:
      return callSdk(reportType, suRestClient.SupportAgentAnalytics().getSankey(p));
    case R.supportAgentSessions:
      return callSdk(reportType, suRestClient.SupportAgentAnalytics().getSessions(p));
    case R.supportAgentSessionTranscript:
      return callSdk(reportType, suRestClient.SupportAgentAnalytics().getSessionTranscript(p));

    case R.agentPartnerSearchClients:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getSearchClients(p));
    case R.agentPartnerAdoptionContentSources:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getAdoptionContentSources(p));
    case R.agentPartnerOverviewTileData:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getOverviewTileData(p));
    case R.agentPartnerOverviewAgentEngagement:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getOverviewAgentEngagement(p));
    case R.agentPartnerOverviewAgentEngagementExport:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().exportOverviewAgentEngagementReport(p));
    case R.agentPartnerOverviewMttrReport:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getOverviewMttrReport(p));
    case R.agentPartnerOverviewMttrReportExport:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().exportOverviewMttrReport(p));
    case R.agentPartnerOverviewAgentWiseReport:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getOverviewAgentWiseReport(p));
    case R.agentPartnerOverviewAgentWiseReportExport:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().exportOverviewAgentWiseReport(p));
    case R.agentPartnerTagTrendsSpikeWatchlist:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getTagTrendsSpikeWatchlist(p));
    case R.agentPartnerTagTrendsSpikeWatchlistExport:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().exportTagTrendsSpikeWatchlistReport(p));
    case R.agentPartnerTagTrendsFrequency:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getTagTrendsFrequency(p));
    case R.agentPartnerTagTrendsFrequencyExport:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().exportTagTrendsFrequencyReport(p));
    case R.agentPartnerTagTrendsTopPairs:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getTagTrendsTopPairs(p));
    case R.agentPartnerTagTrendsFilterAgents:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getTagTrendsFilterAgents(p));
    case R.agentPartnerTagTrendsFilterProducts:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getTagTrendsFilterProducts(p));
    case R.agentPartnerAdoptionRaAdoption:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getAdoptionRaAdoptionReport(p));
    case R.agentPartnerAdoptionRaAdoptionExport:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().exportAdoptionRaAdoptionReport(p));
    case R.agentPartnerAdoptionAhAdoption:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getAdoptionAhAdoptionReport(p));
    case R.agentPartnerAdoptionAhAdoptionExport:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().exportAdoptionAhAdoptionReport(p));
    case R.agentPartnerAdoptionCaseEscalation:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getAdoptionCaseEscalationReport(p));
    case R.agentPartnerAdoptionCaseEscalationExport:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().exportAdoptionCaseEscalationReport(p));
    case R.agentPartnerAdoptionAverageTtr:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getAdoptionAverageTtrReport(p));
    case R.agentPartnerAdoptionAverageTtrExport:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().exportAdoptionAverageTtrReport(p));
    case R.agentPartnerFeedbackResponseFeedback:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getFeedbackReport(p));
    case R.agentPartnerFeedbackResponseFeedbackDetails:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getFeedbackReportDetails(p));
    case R.agentPartnerFeedbackFeatureTypes:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getFeedbackFeatureTypes(p));
    case R.agentPartnerFeedbackAgentNames:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().getFeedbackAgentNames(p));
    case R.agentPartnerFeedbackExport:
      return callSdk(reportType, suRestClient.AgentPartnerAnalytics().exportFeedbackReport(p));

    case R.llmUsageDashboard:
      return callSdk(reportType, suRestClient.LlmUsage().getLlmUsageDashboard(p));

    default:
      return jsonTextResult({ error: "no_handler_for_reportType", reportType });
  }
}
