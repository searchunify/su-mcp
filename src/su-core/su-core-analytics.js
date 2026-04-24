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
import { ENABLE_EXECUTIVE_RECIPE_REPORTS } from "./executive-recipes-config.js";

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
  /** POST /api/v2/overview/searchClickPosition — Click Position Report (uid from auth; no tenantId). */
  overviewSearchClickPosition: "overviewSearchClickPosition",
  /** POST /api/v2/overview/createdCases — Cases Created */
  overviewCreatedCases: "overviewCreatedCases",
  /** POST /api/v2/overview/featuredSnippet — Top Rated Featured Results */
  overviewFeaturedSnippet: "overviewFeaturedSnippet",
  /** POST /api/v2/overview/knowledgeTitle — Top Knowledge Graph Titles */
  overviewKnowledgeTitle: "overviewKnowledgeTitle",
  /** POST /api/v2/overview/pageRating — Content Experience Feedback */
  overviewPageRating: "overviewPageRating",
  /** POST /api/v2/overview/searchFeedback — Search Experience Feedback */
  overviewSearchFeedback: "overviewSearchFeedback",
  /** POST /api/v2/overview/advertisements — Advertisement Performance Report */
  overviewAdvertisements: "overviewAdvertisements",
  /** POST /api/v2/llm/llm-response-feedback — SearchUnifyGPT Feedback */
  llmResponseFeedback: "llmResponseFeedback",
};

const reportTypes = {
  ...baseReportTypes,
  ...(ENABLE_EXECUTIVE_RECIPE_REPORTS ? RECIPES : {}),
};

/** Map `analytics` tool args to executive runner input: startDate/endDate → from/to, count → classificationCount. */
function buildAnalyticsExecutiveInput(args) {
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

/** Scope params like session list: uid from creds unless ecosystem. Never includes tenantId. */
function scopeParamsForOverview(args, credsForRequest) {
  const { startDate, endDate, count, pageNumber, internalUser, ecoSystemId } = args;
  const base = {
    startDate,
    endDate,
    count,
    pageNumber,
    internalUser: internalUser ?? "all",
  };
  if (ecoSystemId) {
    return { ...base, ecoSystemId };
  }
  return { ...base, searchClientId: credsForRequest.config.uid };
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
  internalUser: z
    .enum(["all", "internal", "external", "externalOnly"])
    .optional()
    .describe("Overview / LLM mirrors: maps to analytics internalUser (default all)."),
  ecoSystemId: z
    .string()
    .uuid()
    .optional()
    .describe("When set, scope requests with ecoId instead of uid (mutually exclusive with creds uid on the wire)."),
  searchQuery: z
    .string()
    .optional()
    .describe("Click Position Report and SearchUnifyGPT Feedback: search text filter (default empty)."),
  reactionFilterType: z
    .union([z.enum(["all", "true", "false", "0", "1"]), z.boolean()])
    .optional()
    .describe("SearchUnifyGPT Feedback: reaction filter (default all)."),
  sortingField: z
    .string()
    .optional()
    .describe("Click Position Report: column to sort by (default click)."),
  casesCaseUid: z.string().optional().describe("Cases Created: SearchUnify case id filter."),
  casesCaseSubject: z.string().optional().describe("Cases Created: case title filter."),
  casesSessionCookie: z.string().optional().describe("Cases Created: session id filter."),
  casesEmailId: z.string().optional().describe("Cases Created: email filter."),
  isAscending: z.boolean().optional().describe("Cases Created: sort direction for case list (default true)."),
  searchKey: z.string().optional().describe("Advertisement Performance: search_key filter."),
  advertisementSortType: z.string().optional().describe("Advertisement Performance: sort_type."),
};

const analyticsInputSchema = ENABLE_EXECUTIVE_RECIPE_REPORTS
  ? z.object(baseAnalyticsFieldShape).merge(executiveOptionsForAnalyticsTool)
  : z.object(baseAnalyticsFieldShape);

const analyticsToolDescription = ENABLE_EXECUTIVE_RECIPE_REPORTS
  ? "Analytics from SearchUnify. Raw APIs: tileDataContent, tileDataMetrics1, tileDataMetrics2, search classification, conversion, sessions, **Overview tab** (overviewSearchClickPosition, overviewCreatedCases, overviewFeaturedSnippet, overviewKnowledgeTitle, overviewPageRating, overviewSearchFeedback, overviewAdvertisements, llmResponseFeedback). **Executive orchestrations (same as `executive_business_query`):** all `reportType` values in Phase 1 (traffic, search_no_click_pct, … self_solve_rate), Phase 2 (roi_case_deflection, savings_from_conversion, cases_without_self_service, direct_views_case_creation, stage2_deflection), Phase 3 (article_deflection_contrast, attach_article_case_journey, community_content_ctr, top_article_driven_cases_month, su_gpt_attribution_deferred) — use startDate/endDate. Extra executive fields (e.g. costPerCase, communityNameHints) match the executive tool. Search client uid comes from auth (optional ecoSystemId). MCP does not send `tenantId` on requests."
  : "Analytics from SearchUnify. Raw APIs: tileDataContent, tileDataMetrics1, tileDataMetrics2, search classification, conversion, sessions, **Overview tab** (overviewSearchClickPosition, overviewCreatedCases, overviewFeaturedSnippet, overviewKnowledgeTitle, overviewPageRating, overviewSearchFeedback, overviewAdvertisements, llmResponseFeedback). Executive recipe orchestrations are not available as `reportType` here; use the `executive_business_query` tool for those. Search client uid comes from auth (optional ecoSystemId). MCP does not send `tenantId` on requests.";

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
      const {
        reportType,
        startDate,
        endDate,
        count,
        sessionId,
        pageNumber,
        startIndex,
        sortByField,
        sortType,
        searchQuery,
        reactionFilterType,
        sortingField,
        casesCaseUid,
        casesCaseSubject,
        casesSessionCookie,
        casesEmailId,
        isAscending,
        searchKey,
        advertisementSortType,
      } = args;
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
              const input = buildAnalyticsExecutiveInput(args);
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
        case reportTypes.overviewSearchClickPosition: {
          console.error("overviewSearchClickPosition triggered");
          analyticsResponse = await Analytics.getOverviewSearchClickPosition({
            ...scopeParamsForOverview(args, credsForRequest),
            searchQuery: searchQuery ?? "",
            sortingField: sortingField ?? "click",
            sortType: sortType ?? "desc",
            pageNumber: pageNumber ?? 1,
          });
          break;
        }
        case reportTypes.overviewCreatedCases: {
          console.error("overviewCreatedCases triggered");
          analyticsResponse = await Analytics.getOverviewCreatedCases({
            ...scopeParamsForOverview(args, credsForRequest),
            caseUid: casesCaseUid ?? "",
            caseSubject: casesCaseSubject ?? "",
            sessionCookie: casesSessionCookie ?? "",
            emailId: casesEmailId ?? "",
            pageNumber: pageNumber ?? 1,
            isAscending: isAscending ?? true,
          });
          break;
        }
        case reportTypes.overviewFeaturedSnippet: {
          console.error("overviewFeaturedSnippet triggered");
          analyticsResponse = await Analytics.getOverviewFeaturedSnippet(scopeParamsForOverview(args, credsForRequest));
          break;
        }
        case reportTypes.overviewKnowledgeTitle: {
          console.error("overviewKnowledgeTitle triggered");
          analyticsResponse = await Analytics.getOverviewKnowledgeTitle(scopeParamsForOverview(args, credsForRequest));
          break;
        }
        case reportTypes.overviewPageRating: {
          console.error("overviewPageRating triggered");
          analyticsResponse = await Analytics.getOverviewPageRating(scopeParamsForOverview(args, credsForRequest));
          break;
        }
        case reportTypes.overviewSearchFeedback: {
          console.error("overviewSearchFeedback triggered");
          analyticsResponse = await Analytics.getOverviewSearchFeedback({
            ...scopeParamsForOverview(args, credsForRequest),
            pageNumber: pageNumber ?? 1,
          });
          break;
        }
        case reportTypes.overviewAdvertisements: {
          console.error("overviewAdvertisements triggered");
          analyticsResponse = await Analytics.getOverviewAdvertisements({
            ...scopeParamsForOverview(args, credsForRequest),
            pageNumber: pageNumber ?? 1,
            searchKey: searchKey ?? "",
            advertisementSortType: advertisementSortType ?? "",
          });
          break;
        }
        case reportTypes.llmResponseFeedback: {
          console.error("llmResponseFeedback triggered");
          analyticsResponse = await Analytics.getLlmResponseFeedback({
            startDate,
            endDate,
            searchClientId: credsForRequest.config.uid,
            count: count ?? 10,
            pageNumber: pageNumber ?? 1,
            internalUser: args.internalUser ?? "all",
            searchQuery: searchQuery ?? "",
            reactionFilterType: reactionFilterType ?? "all",
          });
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
