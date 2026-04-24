import { z } from "zod";
import { formatForClaude } from "./../utils.js";
import {
  RECIPES,
  executiveOptionsForAnalyticsTool,
  runTrafficRecipe,
  runSearchNoClickPctRecipe,
  runRelevanceRateRecipe,
  runContentGapRecipe,
  runSelfSolveRateRecipe,
  runRoiCaseDeflectionRecipe,
  runSavingsFromConversionRecipe,
  runCasesWithoutSelfServiceRecipe,
  runDirectViewsCaseCreationRecipe,
  runStage2DeflectionRecipe,
  runArticleDeflectionContrastRecipe,
  runAttachArticleCaseJourneyRecipe,
  runCommunityContentCtrRecipe,
  runTopArticleDrivenCasesMonthRecipe,
  runSuGptAttributionDeferredRecipe,
} from "./su-core-business-queries.js";

/**
 * `false` = executive recipe `reportType`s are omitted from the `analytics` tool (not in the enum, not runnable here).
 * `true` = same `recipeId` values as `executive_business_query` are valid `reportType`s and get the merged schema.
 * Does not affect `executive_business_query` or non-recipe report types.
 */
const ENABLE_EXECUTIVE_RECIPE_REPORTS = false;

const baseReportTypes = {
  searchQueryWithNoClicks: "searchQueryWithNoClicks",
  searchQueryWithResult: "searchQueryWithResult",
  searchQueryWithoutResults: "searchQueryWithoutResults",
  getAllSearchQuery: "getAllSearchQuery",
  getAllSearchConversion: "getAllSearchConversion",
  averageClickPosition: "averageClickPosition",
  sessionDetails: "sessionDetails",
  sessionListTable: "sessionListTable",
  /** POST /api/v2/content/tileDataContent — content-gap counts (failed/no-click/no-result, daily avgs) */
  tileDataContent: "tileDataContent",
  /** POST /api/v2/overview/tileDataMetrics1 — data.visitors is session count; searchUsers, uniqueUsersByDevice, email metrics */
  tileDataMetrics1: "tileDataMetrics1",
  /** POST /api/v2/overview/tileDataMetrics2 — searches, clicks, cases, withResult/withoutResult, uniqueSearches */
  tileDataMetrics2: "tileDataMetrics2",
};

const reportTypes = {
  ...baseReportTypes,
  ...(ENABLE_EXECUTIVE_RECIPE_REPORTS ? RECIPES : {}),
};

/** Map `analytics` tool args to executive runner input: startDate/endDate → from/to, count → classificationCount; creds for tenant. */
function buildAnalyticsExecutiveInput(args, creds) {
  const {
    reportType: _reportType,
    startDate,
    endDate,
    count,
    pageNumber,
    sortByField,
    sortType,
    startIndex: _sIdx,
    sessionId: _sid,
    ...rest
  } = args;
  return {
    from: startDate,
    to: endDate,
    classificationCount: count,
    pageNumber,
    sortByField,
    sortType,
    ...rest,
    tenantId: rest.tenantId ?? creds?.config?.tenantId,
  };
}

const EXECUTIVE_RUNNERS = {
  [RECIPES.traffic]: runTrafficRecipe,
  [RECIPES.search_no_click_pct]: runSearchNoClickPctRecipe,
  [RECIPES.relevance_rate]: runRelevanceRateRecipe,
  [RECIPES.content_gap]: runContentGapRecipe,
  [RECIPES.self_solve_rate]: runSelfSolveRateRecipe,
  [RECIPES.roi_case_deflection]: runRoiCaseDeflectionRecipe,
  [RECIPES.savings_from_conversion]: runSavingsFromConversionRecipe,
  [RECIPES.cases_without_self_service]: runCasesWithoutSelfServiceRecipe,
  [RECIPES.direct_views_case_creation]: runDirectViewsCaseCreationRecipe,
  [RECIPES.stage2_deflection]: runStage2DeflectionRecipe,
  [RECIPES.article_deflection_contrast]: runArticleDeflectionContrastRecipe,
  [RECIPES.attach_article_case_journey]: runAttachArticleCaseJourneyRecipe,
  [RECIPES.community_content_ctr]: runCommunityContentCtrRecipe,
  [RECIPES.top_article_driven_cases_month]: runTopArticleDrivenCasesMonthRecipe,
};

const executiveReportIdSet = ENABLE_EXECUTIVE_RECIPE_REPORTS
  ? new Set(Object.values(RECIPES))
  : new Set();

function jsonTextResult(obj) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(obj, null, 2),
      },
    ],
  };
}

const allReportTypeEnumValues = Object.values(reportTypes);

const reportTypeZodDescription = ENABLE_EXECUTIVE_RECIPE_REPORTS
  ? "Report id: raw API types (tileData*, search*, session*…) or the same `recipeId` values as `executive_business_query` (all Phase 1–3 orchestrations: traffic … su_gpt_attribution_deferred)."
  : "Report id: raw SearchUnify analytics APIs only (tileData*, search*, session*…). Executive recipe IDs are not available on this tool; use `executive_business_query` for those orchestrations.";

const baseAnalyticsFieldShape = {
  reportType: z
    .enum(allReportTypeEnumValues)
    .describe(reportTypeZodDescription),
  startDate: z.string().describe("Start date in YYYY-MM-DD (also maps to executive `from`)."),
  endDate: z.string().describe("End date in YYYY-MM-DD (also maps to executive `to`)."),
  count: z
    .number()
    .min(1)
    .max(500)
    .describe("Row/page count for classification; maps to `classificationCount` in executive recipes that use it."),
  sessionId: z
    .string()
    .optional()
    .describe("Session cookie for sessionDetails / sessionListTable."),
  pageNumber: z.number().min(1).max(10).optional(),
  startIndex: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Pagination for session list/detail (max 10 in MCP)."),
  sortByField: z
    .enum(["count", "click", "search", "case", "page_view", "support", "end_date", "start_date"])
    .optional(),
  sortType: z.enum(["asc", "desc"]).optional(),
};

const analyticsInputSchema = ENABLE_EXECUTIVE_RECIPE_REPORTS
  ? z.object(baseAnalyticsFieldShape).merge(executiveOptionsForAnalyticsTool)
  : z.object(baseAnalyticsFieldShape);

const analyticsToolDescription = ENABLE_EXECUTIVE_RECIPE_REPORTS
  ? "Analytics from SearchUnify. Raw APIs: tileDataContent, tileDataMetrics1, tileDataMetrics2, search classification, conversion, sessions. **Executive orchestrations (same as `executive_business_query`):** all `reportType` values in Phase 1 (traffic, search_no_click_pct, … self_solve_rate), Phase 2 (roi_case_deflection, savings_from_conversion, cases_without_self_service, direct_views_case_creation, stage2_deflection), Phase 3 (article_deflection_contrast, attach_article_case_journey, community_content_ctr, top_article_driven_cases_month, su_gpt_attribution_deferred) — use startDate/endDate; optional `tenantId` in args or creds. Extra executive fields (e.g. costPerCase, communityNameHints) match the executive tool. Tenant for conversion/session routes is in args or creds; host may inject when proxied through admin."
  : "Analytics from SearchUnify. Raw APIs: tileDataContent, tileDataMetrics1, tileDataMetrics2, search classification, conversion, sessions. Executive recipe orchestrations are not available as `reportType` here; use the `executive_business_query` tool for those. Optional `tenantId` in args or creds for conversion/session routes; host may inject when proxied through admin.";

const initializeAnalyticsTools = async ({ server, creds, getCreds }) => {
  const c = async () => (getCreds ? await getCreds() : creds);
  server.tool(
    "analytics",
    analyticsToolDescription,
    analyticsInputSchema.shape,
    {
      title: "Analytics",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async (args) => {
      const { reportType, startDate, endDate, count, sessionId, pageNumber, startIndex, sortByField, sortType } = args;
      const credsForRequest = await c();
      if (!credsForRequest) {
        return {
          content: [
            {
              type: "text",
              text: "IMPORTANT: Not authenticated. You MUST call the 'login' tool first to get a login link for the user. Do not ask the user to go to settings — use the login tool.",
            },
          ],
        };
      }
      const Analytics = credsForRequest.suRestClient.Analytics();

      if (executiveReportIdSet.has(reportType)) {
        try {
          let payload;
          if (reportType === RECIPES.su_gpt_attribution_deferred) {
            payload = runSuGptAttributionDeferredRecipe();
          } else {
            const run = EXECUTIVE_RUNNERS[reportType];
            if (!run) {
              payload = { error: "no runner for reportType", reportType };
            } else {
              const input = buildAnalyticsExecutiveInput(args, credsForRequest);
              payload = await run(input, credsForRequest);
            }
          }
          return jsonTextResult(payload);
        } catch (e) {
          return jsonTextResult({
            error: e?.message ?? String(e),
            reportType,
          });
        }
      }

      let analyticsResponse = {};
      switch (reportType) {
        case reportTypes.searchQueryWithNoClicks: {
          console.error("searchQueryWithNoClicks triggered");
          analyticsResponse = await Analytics.searchQueryWithNoClicks({
            searchClientId: credsForRequest.config.uid,
            startDate,
            endDate,
            count,
            pageNumber,
            sortByField,
            sortType,
          });
          break;
        }
        case reportTypes.searchQueryWithResult: {
          console.error("searchQueryWithResult triggered");
          analyticsResponse = await Analytics.searchQueryWithResult({
            searchClientId: credsForRequest.config.uid,
            startDate,
            endDate,
            count,
            pageNumber,
            sortByField,
            sortType,
          });
          break;
        }
        case reportTypes.searchQueryWithoutResults: {
          console.error("searchQueryWithoutResults triggered");
          analyticsResponse = await Analytics.searchQueryWithoutResults({
            searchClientId: credsForRequest.config.uid,
            startDate,
            endDate,
            count,
            pageNumber,
            sortByField,
            sortType,
          });
          break;
        }
        case reportTypes.getAllSearchQuery: {
          console.error("getAllSearchQuery triggered");
          analyticsResponse = await Analytics.getAllSearchQuery({
            searchClientId: credsForRequest.config.uid,
            startDate,
            endDate,
            count,
            pageNumber,
            sortByField,
            sortType,
          });
          break;
        }
        case reportTypes.getAllSearchConversion: {
          console.error("getAllSearchConversion triggered");
          analyticsResponse = await Analytics.getAllSearchConversion({ searchClientId: credsForRequest.config.uid, startDate, endDate, count });
          break;
        }
        case reportTypes.averageClickPosition: {
          console.error("averageClickPosition triggered");
          analyticsResponse = await Analytics.getAverageClickPosition({
            searchClientId: credsForRequest.config.uid,
            startDate,
            endDate,
            internalUser: "all",
          });
          break;
        }
        case reportTypes.sessionDetails: {
          console.error("sessionDetails triggered");
          const sessionParams = {
            searchClientId: credsForRequest.config.uid,
            startDate,
            endDate,
            count,
            sessionId,
            startIndex,
          };
          if (sortByField !== undefined) {
            sessionParams.sortByField = sortByField === "count" ? "click" : sortByField;
          }
          if (sortType !== undefined) {
            sessionParams.sortType = sortType;
          }
          analyticsResponse = await Analytics.getSessionDetails(sessionParams);
          break;
        }
        case reportTypes.sessionListTable: {
          console.error("sessionListTable triggered");
          const sessionParams = {
            searchClientId: credsForRequest.config.uid,
            startDate,
            endDate,
            count,
            sessionId,
            startIndex,
          };
          if (sortByField !== undefined) {
            sessionParams.sortByField = sortByField === "count" ? "click" : sortByField;
          }
          if (sortType !== undefined) {
            sessionParams.sortType = sortType;
          }
          analyticsResponse = await Analytics.getSessionListTable(sessionParams);
          break;
        }
        case reportTypes.tileDataContent: {
          console.error("tileDataContent triggered");
          const tileParams = {
            searchClientId: credsForRequest.config.uid,
            startDate,
            endDate,
          };
          analyticsResponse = await Analytics.getTileDataContent(tileParams);
          break;
        }
        case reportTypes.tileDataMetrics1: {
          console.error("tileDataMetrics1 triggered");
          const tileParams = {
            searchClientId: credsForRequest.config.uid,
            startDate,
            endDate,
          };
          analyticsResponse = await Analytics.getTileDataMetrics1(tileParams);
          {
            const d = analyticsResponse?.data;
            if (d && typeof d === "object" && !Array.isArray(d)) {
              analyticsResponse = {
                ...analyticsResponse,
                data: {
                  ...d,
                  sessionCount: d.visitors,
                },
              };
            }
          }
          break;
        }
        case reportTypes.tileDataMetrics2: {
          console.error("tileDataMetrics2 triggered");
          const tileParams = {
            searchClientId: credsForRequest.config.uid,
            startDate,
            endDate,
          };
          analyticsResponse = await Analytics.getTileDataMetrics2(tileParams);
          break;
        }
        default:
          console.error("invalid reportType ", reportType);
      }

      if (!analyticsResponse?.data) {
        return {
          type: "text",
          json: "some error occured while searching, response is empty",
        };
      }
      console.error("analyticsResponse", analyticsResponse.data);
      return formatForClaude(analyticsResponse.data);
    }
  );
};

export { initializeAnalyticsTools };
