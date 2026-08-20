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
  '{"aiAgentUid","teamId","managerEmail"} for caseQaFilters; ' +
  '{"filters":{"from","to","teamIds","agentIds","accountIds","aiAgentIds"},"requiredData"} for caseQaMetrics/agentScoreCardMetrics; ' +
  '{"filters",...,"page","limit","search","searchColumns","sortBy","sortOrder"} for caseQaCaseDetails; ' +
  '{"caseId","uid","analyticsId"} for caseQaDetail; ' +
  '{"userEmail","tenantId","uid"} for myScoreCard (add "page","limit","caseId" for myScoreCardDetails)';

export async function handleCaseQaReport(reportType, p, suRestClient) {
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
    case R.myScoreCard:
      return callSdk(reportType, CaseQa.getMyScoreCard(p));
    case R.myScoreCardDetails:
      return callSdk(reportType, CaseQa.getMyScoreCardDetails(p));
    default:
      return null;
  }
}
