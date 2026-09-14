import { callSdk } from "./shared.js";

/** Agent Partner Analytics - self-service partner reporting suite (search-clients, adoption, overview, tag-trends, feedback). */
export const AGENT_PARTNER_REPORT_TYPES = {
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
};

export const agentPartnerParamsDescription =
  'agentPartner* reportTypes take FLAT fields (no "filters" wrapper) - each endpoint has its own field set: ' +
  '{} for agentPartnerSearchClients/agentPartnerFeedbackFeatureTypes; ' +
  '{"caseId"} for agentPartnerFeedbackAgentNames; ' +
  '{"uid"} for agentPartnerAdoptionContentSources; ' +
  '{"uid","indexName","filter":"monthly"|"quarterly"} for agentPartnerAdoptionRaAdoption/AhAdoption/AverageTtr; ' +
  '{"indexName","filter"} (no uid) for agentPartnerAdoptionCaseEscalation; ' +
  '{"uid","indexName","from","to"} for agentPartnerOverviewTileData/AgentEngagement (add "granularity" for MttrReport, "featureCategory","pageNumber","pageSize" for AgentWiseReport); ' +
  '{"uid","agents","products","from","to","spikeThreshold","pagination":{"enabled","page","pageSize"}} for agentPartnerTagTrendsSpikeWatchlist (add "ahId" for Frequency); ' +
  '{"uid","agents","products","from","to","topLimit"} for agentPartnerTagTrendsTopPairs; ' +
  '{"uid","from","to"} for agentPartnerTagTrendsFilterAgents/FilterProducts; ' +
  '{"uid","indexName","from","to","caseId","featureTypes","limit","offset","sortingField","sortType"} for agentPartnerFeedbackResponseFeedback (drop limit/offset/sortingField/sortType for Details); ' +
  '*Export variants add {"delivery":"email"|"download","recipients","scName"} (email requires 1-5 recipients); ' +
  'to resolve an agent named by the user (instead of its id) before filtering a feedback report, call agentPartnerFeedbackAgentNames first (optional {"caseId"}); ' +
  'before filtering a tag-trends report by agent, call agentPartnerTagTrendsFilterAgents first ({"uid","from","to"}); do not ask the end user for an id';

export async function handleAgentPartnerReport(reportType, p, suRestClient) {
  const R = AGENT_PARTNER_REPORT_TYPES;
  const AgentPartner = suRestClient.AgentPartnerAnalytics();

  switch (reportType) {
    case R.agentPartnerSearchClients:
      return callSdk(reportType, AgentPartner.getSearchClients(p));
    case R.agentPartnerAdoptionContentSources:
      return callSdk(reportType, AgentPartner.getAdoptionContentSources(p));
    case R.agentPartnerOverviewTileData:
      return callSdk(reportType, AgentPartner.getOverviewTileData(p));
    case R.agentPartnerOverviewAgentEngagement:
      return callSdk(reportType, AgentPartner.getOverviewAgentEngagement(p));
    case R.agentPartnerOverviewAgentEngagementExport:
      return callSdk(reportType, AgentPartner.exportOverviewAgentEngagementReport(p));
    case R.agentPartnerOverviewMttrReport:
      return callSdk(reportType, AgentPartner.getOverviewMttrReport(p));
    case R.agentPartnerOverviewMttrReportExport:
      return callSdk(reportType, AgentPartner.exportOverviewMttrReport(p));
    case R.agentPartnerOverviewAgentWiseReport:
      return callSdk(reportType, AgentPartner.getOverviewAgentWiseReport(p));
    case R.agentPartnerOverviewAgentWiseReportExport:
      return callSdk(reportType, AgentPartner.exportOverviewAgentWiseReport(p));
    case R.agentPartnerTagTrendsSpikeWatchlist:
      return callSdk(reportType, AgentPartner.getTagTrendsSpikeWatchlist(p));
    case R.agentPartnerTagTrendsSpikeWatchlistExport:
      return callSdk(reportType, AgentPartner.exportTagTrendsSpikeWatchlistReport(p));
    case R.agentPartnerTagTrendsFrequency:
      return callSdk(reportType, AgentPartner.getTagTrendsFrequency(p));
    case R.agentPartnerTagTrendsFrequencyExport:
      return callSdk(reportType, AgentPartner.exportTagTrendsFrequencyReport(p));
    case R.agentPartnerTagTrendsTopPairs:
      return callSdk(reportType, AgentPartner.getTagTrendsTopPairs(p));
    case R.agentPartnerTagTrendsFilterAgents:
      return callSdk(reportType, AgentPartner.getTagTrendsFilterAgents(p));
    case R.agentPartnerTagTrendsFilterProducts:
      return callSdk(reportType, AgentPartner.getTagTrendsFilterProducts(p));
    case R.agentPartnerAdoptionRaAdoption:
      return callSdk(reportType, AgentPartner.getAdoptionRaAdoptionReport(p));
    case R.agentPartnerAdoptionRaAdoptionExport:
      return callSdk(reportType, AgentPartner.exportAdoptionRaAdoptionReport(p));
    case R.agentPartnerAdoptionAhAdoption:
      return callSdk(reportType, AgentPartner.getAdoptionAhAdoptionReport(p));
    case R.agentPartnerAdoptionAhAdoptionExport:
      return callSdk(reportType, AgentPartner.exportAdoptionAhAdoptionReport(p));
    case R.agentPartnerAdoptionCaseEscalation:
      return callSdk(reportType, AgentPartner.getAdoptionCaseEscalationReport(p));
    case R.agentPartnerAdoptionCaseEscalationExport:
      return callSdk(reportType, AgentPartner.exportAdoptionCaseEscalationReport(p));
    case R.agentPartnerAdoptionAverageTtr:
      return callSdk(reportType, AgentPartner.getAdoptionAverageTtrReport(p));
    case R.agentPartnerAdoptionAverageTtrExport:
      return callSdk(reportType, AgentPartner.exportAdoptionAverageTtrReport(p));
    case R.agentPartnerFeedbackResponseFeedback:
      return callSdk(reportType, AgentPartner.getFeedbackReport(p));
    case R.agentPartnerFeedbackResponseFeedbackDetails:
      return callSdk(reportType, AgentPartner.getFeedbackReportDetails(p));
    case R.agentPartnerFeedbackFeatureTypes:
      return callSdk(reportType, AgentPartner.getFeedbackFeatureTypes(p));
    case R.agentPartnerFeedbackAgentNames:
      return callSdk(reportType, AgentPartner.getFeedbackAgentNames(p));
    case R.agentPartnerFeedbackExport:
      return callSdk(reportType, AgentPartner.exportFeedbackReport(p));
    default:
      return null;
  }
}
