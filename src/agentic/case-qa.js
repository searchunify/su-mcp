import { callSdk } from "./shared.js";

/** Case QA scores & agent scorecards - Agentic Suite Analytics ("L1"/AI agent quality surface). */
export const CASE_QA_REPORT_TYPES = {
  caseQaFilters: "caseQaFilters",
  caseQaMetrics: "caseQaMetrics",
  caseQaCaseDetails: "caseQaCaseDetails",
  caseQaDetail: "caseQaDetail",
  caseQaInsights: "caseQaInsights",
  agentScoreCardMetrics: "agentScoreCardMetrics",
  myScoreCard: "myScoreCard",
  myScoreCardDetails: "myScoreCardDetails",
};

export const caseQaParamsDescription =
  '{"aiAgentUid","teamId","managerEmail"} for caseQaFilters - call it first with no params to discover the available aiAgentUid/teamId/managerEmail values for the tenant when the user names an agent, team, or manager instead of giving its id; do not ask the end user for a uid; ' +
  '{"filters":{"from","to","teamIds","agentIds","accountIds","aiAgentIds","managerEmails"},"requiredData"} for caseQaMetrics/agentScoreCardMetrics; ' +
  '{"filters",...,"page","limit","search","searchColumns","sortBy","sortOrder"} for caseQaCaseDetails; ' +
  '{"caseId","uid","analyticsId"} for caseQaDetail; ' +
  '{"tenantId","uid"} for myScoreCard (add "page","limit","caseId" for myScoreCardDetails) - userEmail is resolved server-side from the caller\'s own identity, not a caller-supplied field';

export async function handleCaseQaReport(reportType, p, suRestClient, identity = {}) {
  const R = CASE_QA_REPORT_TYPES;
  const CaseQa = suRestClient.CaseQa();

  switch (reportType) {
    case R.caseQaFilters:
      return callSdk(reportType, CaseQa.getCaseQaFilters(p));
    case R.caseQaMetrics:
      return callSdk(reportType, CaseQa.getCaseQaMetrics(p));
    case R.caseQaCaseDetails:
      return callSdk(reportType, CaseQa.getCaseQaCaseDetails(p));
    case R.caseQaDetail:
      return callSdk(reportType, CaseQa.getCaseQaDetail(p));
    case R.caseQaInsights:
      return callSdk(reportType, CaseQa.getCqaInsights());
    case R.agentScoreCardMetrics:
      return callSdk(reportType, CaseQa.getAgentScoreCardMetrics(p));
    case R.myScoreCard: {
      // "my" score card must be bound to the actual caller, not a client-supplied userEmail -
      // identity.email (from trusted userInfo, else the connection's configured email) always
      // wins over p.userEmail when available.
      const params = { ...p, ...(identity.email ? { userEmail: identity.email } : {}) };
      return callSdk(reportType, CaseQa.getMyScoreCard(params));
    }
    case R.myScoreCardDetails: {
      const params = { ...p, ...(identity.email ? { userEmail: identity.email } : {}) };
      return callSdk(reportType, CaseQa.getMyScoreCardDetails(params));
    }
    default:
      return null;
  }
}
