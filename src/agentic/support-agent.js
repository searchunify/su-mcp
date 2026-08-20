import { callSdk } from "./shared.js";

/** Bot/chatbot conversation analytics - Agentic Suite "Support Agent" domain. */
export const SUPPORT_AGENT_REPORT_TYPES = {
  supportAgentAgents: "supportAgentAgents",
  supportAgentKpis: "supportAgentKpis",
  supportAgentTrendsVolumeOutcome: "supportAgentTrendsVolumeOutcome",
  supportAgentTrendsDuration: "supportAgentTrendsDuration",
  supportAgentTrendsCsat: "supportAgentTrendsCsat",
  supportAgentOutcomeDistribution: "supportAgentOutcomeDistribution",
  supportAgentSankey: "supportAgentSankey",
  supportAgentSessions: "supportAgentSessions",
  supportAgentSessionTranscript: "supportAgentSessionTranscript",
};

export const supportAgentParamsDescription =
  '{"startDate"|"endDate"|"datePreset","granularity","agentIds"} for supportAgent trend/kpi/outcome/sankey reportTypes; ' +
  '{"outcome","page","pageSize","sortBy","sortOrder","search", ...common} for supportAgentSessions; ' +
  '{"sessionId"} for supportAgentSessionTranscript';

export async function handleSupportAgentReport(reportType, p, suRestClient) {
  const R = SUPPORT_AGENT_REPORT_TYPES;
  const SupportAgent = suRestClient.SupportAgentAnalytics();

  switch (reportType) {
    case R.supportAgentAgents:
      return callSdk(reportType, SupportAgent.getAgents());
    case R.supportAgentKpis:
      return callSdk(reportType, SupportAgent.getKpis(p));
    case R.supportAgentTrendsVolumeOutcome:
      return callSdk(reportType, SupportAgent.getTrendsVolumeOutcome(p));
    case R.supportAgentTrendsDuration:
      return callSdk(reportType, SupportAgent.getTrendsDuration(p));
    case R.supportAgentTrendsCsat:
      return callSdk(reportType, SupportAgent.getTrendsCsat(p));
    case R.supportAgentOutcomeDistribution:
      return callSdk(reportType, SupportAgent.getOutcomeDistribution(p));
    case R.supportAgentSankey:
      return callSdk(reportType, SupportAgent.getSankey(p));
    case R.supportAgentSessions:
      return callSdk(reportType, SupportAgent.getSessions(p));
    case R.supportAgentSessionTranscript:
      return callSdk(reportType, SupportAgent.getSessionTranscript(p));
    default:
      return null;
  }
}
