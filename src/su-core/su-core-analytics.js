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

/** Admin content-gap "Searches with no result" default `actionStatusFilters` when MCP omits `contentGapActionStatusFilters`. */
const DEFAULT_SEARCHES_WITH_NO_RESULT_ACTION_STATUS_FILTERS = [
  "Pending",
  "In Progress",
  "Update Content",
  "New Content",
  "Add synonyms",
  "No Action required",
  "Completed",
];

/** `contentGapActionStatusFilters`: omitted, non-array, `[]`, or all-blank → defaults; otherwise trimmed non-empty strings (e.g. `["Pending"]`). */
function resolvedContentGapActionStatusFilters(contentGapActionStatusFilters) {
  if (!Array.isArray(contentGapActionStatusFilters)) {
    return DEFAULT_SEARCHES_WITH_NO_RESULT_ACTION_STATUS_FILTERS;
  }
  const arr = contentGapActionStatusFilters.map(String).map((s) => s.trim()).filter(Boolean);
  return arr.length > 0 ? arr : DEFAULT_SEARCHES_WITH_NO_RESULT_ACTION_STATUS_FILTERS;
}

const baseReportTypes = {
  searchQueryWithNoClicks: "searchQueryWithNoClicks",
  searchQueryWithResult: "searchQueryWithResult",
  searchQueryWithoutResults: "searchQueryWithoutResults",
  getAllSearchQuery: "getAllSearchQuery",
  getAllSearchConversion: "getAllSearchConversion",
  averageClickPosition: "averageClickPosition",
  sessionDetails: "sessionDetails",
  sessionListTable: "sessionListTable",
  /** GET /api/v2/getSessionTrackingFormattedResult — Session Tracking formatted (admin). */
  sessionTrackingFormattedResult: "sessionTrackingFormattedResult",
  /** POST /api/v2/conversion/clicksCountContentSource — Search filter based clicks. */
  conversionClicksCountContentSource: "conversionClicksCountContentSource",
  /** POST /api/v2/conversion/conversionSummary — Search Summary (conversions). */
  conversionSearchSummary: "conversionSearchSummary",
  /** POST /api/v2/conversion/topClickedDocs — Most popular documents. */
  conversionTopClickedDocs: "conversionTopClickedDocs",
  /** POST /api/v2/conversion/searchesOnClick — “Most popular documents → Search keywords”: terms that led to clicks on one document `url` (not sessionDetails). */
  conversionSearchesOnClick: "conversionSearchesOnClick",
  /** POST /api/v2/conversion/topSearchesWithClicks — Top clicked searches. */
  conversionTopSearchesWithClicks: "conversionTopSearchesWithClicks",
  /** POST /api/v2/conversion/clickedResults — Top Clicked Searches: documents clicked for one search phrase (`text_entered`). */
  conversionClickedResults: "conversionClickedResults",
  /** POST /api/v2/conversion/current-relevance-index — Relevance index (current window). */
  conversionCurrentRelevanceIndex: "conversionCurrentRelevanceIndex",
  /** POST /api/v2/conversion/relevance-index — Relevance index drilldown for a from/to range. */
  conversionRelevanceIndex: "conversionRelevanceIndex",
  /** POST /api/v2/conversion/caseDeflectionStage1 — Session analytics overview (stage 1). */
  conversionCaseDeflectionStage1: "conversionCaseDeflectionStage1",
  /** POST /api/v2/conversion/sessionDetails — Session Tracking grid (filters); not clickedResults / searchesOnClick drill-downs. */
  conversionSessionTrackingDetails: "conversionSessionTrackingDetails",
  /** POST /api/v2/conversion/discussions — Discussions ready to become help articles. */
  conversionDiscussions: "conversionDiscussions",
  /** POST /api/v2/conversion/attachedArticles — Attached to case. */
  conversionAttachedArticles: "conversionAttachedArticles",
  /** POST /api/v2/conversion/articlesCreatedCases — Unsuccessful case deflection. */
  conversionArticlesCreatedCases: "conversionArticlesCreatedCases",
  /** POST /api/v2/conversion/searchesCreatedCase — Failed deflect: “searches for clicked result” for one article `url`. */
  conversionSearchesCreatedCase: "conversionSearchesCreatedCase",
  /** POST /api/v2/conversion/articlesDeflectedCase — Successful case deflection. */
  conversionArticlesDeflectedCase: "conversionArticlesDeflectedCase",
  /** POST /api/v2/conversion/searchesOnDeflection — Successful deflect: “all searches for clicked result” for one article `url`. */
  conversionSearchesOnDeflection: "conversionSearchesOnDeflection",
  /** POST /api/v2/conversion/articlesCreatedCasesSessions — Session list for an article (failed vs deflected via `caseDeflaction`). */
  conversionArticlesCreatedCasesSessions: "conversionArticlesCreatedCasesSessions",
  /** POST /api/v2/conversion/linkSharing — Share results analytics. */
  conversionLinkSharing: "conversionLinkSharing",
  /** POST /api/v2/content/tileDataContent — content-gap counts (failed/no-click/no-result, daily avgs) */
  tileDataContent: "tileDataContent",
  /** POST /api/v2/content/splitTileDataContent — ecosystem split rows for tile-data content gap. */
  contentSplitTileDataContent: "contentSplitTileDataContent",
  /** POST /api/v2/content/unSuccessfulSummaryChart — Unsuccessful Searches chart. */
  contentUnsuccessfulSummaryChart: "contentUnsuccessfulSummaryChart",
  /** POST /api/v2/overview/searchsWithNoClicks — Search Classifications (searches with no clicks). */
  contentSearchesWithNoClicks: "contentSearchesWithNoClicks",
  /** POST /api/v2/content/succesiveNoClicks — no-click successive searches drill-down for one keyword. */
  contentSuccessiveNoClicks: "contentSuccessiveNoClicks",
  /** POST /api/v2/overview/searchesWithNoResult — Search Classifications (searches with no result). */
  contentSearchesWithNoResult: "contentSearchesWithNoResult",
  /** POST /api/v2/content/succesiveNoResults — no-result successive searches drill-down for one keyword. */
  contentSuccessiveNoResults: "contentSuccessiveNoResults",
  /** POST /api/v2/content/unSuccessfulSearchSessionChart — Sessions with unsuccessful searches chart. */
  contentUnsuccessfulSearchSessionChart: "contentUnsuccessfulSearchSessionChart",
  /** POST /api/v2/content/highConversion — High Conversion Results Not on Page One. */
  contentHighConversion: "contentHighConversion",
  /** POST /api/v2/content/highConversionClicks — High Conversion click rows for one `searchText` URL. */
  contentHighConversionClicks: "contentHighConversionClicks",
  /** POST /api/v2/content/highConversionSessions — High Conversion session rows for one `searchText` URL. */
  contentHighConversionSessions: "contentHighConversionSessions",
  /** POST /api/v2/content/articleUsageByAgents — Articles Usage By Agents main grid. */
  contentArticleUsageByAgents: "contentArticleUsageByAgents",
  /** POST /api/v2/content/successiveArticlesUsage — Articles Usage By Agents drill-down rows. */
  contentSuccessiveArticlesUsage: "contentSuccessiveArticlesUsage",
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
  /** POST /leadership/get-content-sources — list content sources (`elasticIndexName` for assisted case volume). */
  leadershipGetContentSources: "leadershipGetContentSources",
  /** POST /leadership/unassisted-self-solve-volume — Unassisted Self Solve / implicit deflection volume (Leadership dashboard). */
  leadershipUnassistedSelfSolveVolume: "leadershipUnassistedSelfSolveVolume",
  /** POST /leadership/assisted-self-solve-volume — Assisted Self Solve / explicit deflection & KM metrics. */
  leadershipAssistedSelfSolveVolume: "leadershipAssistedSelfSolveVolume",
  /** POST /leadership/assisted-case-volume — Assisted case volume by content source index. */
  leadershipAssistedCaseVolume: "leadershipAssistedCaseVolume",
  /** POST /leadership/deflection-count — raw implicit/explicit deflection counts per quarter (no USD). */
  leadershipDeflectionCount: "leadershipDeflectionCount",
  /** Same counts as deflection-count with USD cost columns; cost per case defaults to 200 if not provided. */
  leadershipCostSavingsDeflectionUsd: "leadershipCostSavingsDeflectionUsd",
  /** POST /leadership/deflection-cost-savings-download — CSV / email export (requires analytics-secret via admin). */
  leadershipDeflectionCostSavingsDownload: "leadershipDeflectionCostSavingsDownload",
};

const reportTypes = {
  ...baseReportTypes,
  ...(ENABLE_EXECUTIVE_RECIPE_REPORTS ? RECIPES : {}),
};

/**
 * Overview-tab + LLM feedback `reportType` values — each has a dedicated `switch` branch that passes only
 * keys allowed by `su-sdk-js` Joi (`analytics-validation.js`). Never spread full `args` into the SDK.
 * `pageNumber` MCP max 500 matches SDK overview + LLM validators; `scopeParamsForOverview` omits `pageNumber`;
 * featured/knowledge use `scopeParamsForSimilarValidationOverview` (no `count` / `pageNumber`).
 */
const OVERVIEW_AND_LLM_FEEDBACK_REPORT_TYPES = [
  reportTypes.overviewSearchClickPosition,
  reportTypes.overviewCreatedCases,
  reportTypes.overviewFeaturedSnippet,
  reportTypes.overviewKnowledgeTitle,
  reportTypes.overviewPageRating,
  reportTypes.overviewSearchFeedback,
  reportTypes.overviewAdvertisements,
  reportTypes.llmResponseFeedback,
];
for (const id of OVERVIEW_AND_LLM_FEEDBACK_REPORT_TYPES) {
  if (!Object.values(baseReportTypes).includes(id)) {
    throw new Error(`su-core-analytics: invalid OVERVIEW_AND_LLM_FEEDBACK_REPORT_TYPES entry: ${id}`);
  }
}

/** Core POST /api/v2/conversion/* body: from/to, internalUser, uid or ecoId. MCP does not add `tenantId`; admin/BFF adds it when proxying to analytics. */
function conversionPostBase(args, credsForRequest) {
  const internalUser = args.internalUser ?? "all";
  const body = {
    from: `${args.startDate} 00:00:00`,
    to: `${args.endDate} 23:59:59`,
    internalUser,
  };
  if (args.ecoSystemId) {
    body.ecoId = args.ecoSystemId;
    body.uid = null;
  } else {
    body.uid = credsForRequest.config.uid;
    body.ecoId = null;
  }
  if (args.userMetricsFlag !== undefined) body.userMetricsFlag = args.userMetricsFlag;
  if (args.userMetricsFilters !== undefined) body.userMetricsFilters = args.userMetricsFilters;
  if (args.userMetricsLimit !== undefined) body.userMetricsLimit = args.userMetricsLimit;
  if (args.userMetricsOffset !== undefined) body.userMetricsOffset = args.userMetricsOffset;
  return body;
}

/** Leadership POST bodies: optional explicit `from`/`to` (omit both to use analytics *last six quarters* default). */
function leadershipOptionalFromTo(args) {
  if (args.leadershipUseBackendLastSixQuarters === true) {
    return {};
  }
  return {
    from: `${args.startDate} 00:00:00`,
    to: `${args.endDate} 23:59:59`,
  };
}

/** uid xor ecoId + internalUser + optional quarter window for `/leadership/*` routes that require scope. */
function leadershipUidEcoBody(args, credsForRequest) {
  const internalUser = args.internalUser ?? "all";
  const base = { internalUser, ...leadershipOptionalFromTo(args) };
  if (args.ecoSystemId) {
    return { ...base, ecoId: args.ecoSystemId, uid: null };
  }
  return { ...base, uid: credsForRequest.config.uid, ecoId: null };
}

function leadershipUsdRound2(n) {
  return Math.round(Number(n) * 100) / 100;
}

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

/** Minimal scope for SDK `similarValidation` only (featured snippet, knowledge graph titles).
 * Omits `count` and `pageNumber` — those routes do not read them in `su-sdk-js`, and Joi rejects unknown keys
 * (e.g. `pageNumber`) if they were ever merged here by mistake. */
function scopeParamsForSimilarValidationOverview(args, credsForRequest) {
  const { startDate, endDate, internalUser, ecoSystemId } = args;
  const base = {
    startDate,
    endDate,
    internalUser: internalUser ?? "all",
  };
  if (ecoSystemId) {
    return { ...base, ecoSystemId };
  }
  return { ...base, searchClientId: credsForRequest.config.uid };
}

/** Scope for paginated / count-aware overview mirrors: dates, `count`, `internalUser`, uid or eco.
 * Never includes `tenantId` or `pageNumber` — add `pageNumber` (and filters) per `switch` case where the SDK schema allows it. */
function scopeParamsForOverview(args, credsForRequest) {
  const { startDate, endDate, count, internalUser, ecoSystemId } = args;
  const base = {
    startDate,
    endDate,
    count,
    internalUser: internalUser ?? "all",
  };
  if (ecoSystemId) {
    return { ...base, ecoSystemId };
  }
  return { ...base, searchClientId: credsForRequest.config.uid };
}

/** Params for `getLlmResponseFeedback` only (`llmResponseFeedbackOverview` Joi — no `ecoSystemId` in SDK yet). */
function paramsForLlmResponseFeedback(args, credsForRequest) {
  const { startDate, endDate, count, pageNumber, searchQuery, reactionFilterType, internalUser } = args;
  return {
    startDate,
    endDate,
    searchClientId: credsForRequest.config.uid,
    count: count ?? 10,
    pageNumber: pageNumber ?? 1,
    internalUser: internalUser ?? "all",
    searchQuery: searchQuery ?? "",
    reactionFilterType: reactionFilterType ?? "all",
  };
}

const allReportTypeEnumValues = Object.values(reportTypes);

const conversionsReportRoutingHint =
  "**Conversions routing (pick `reportType` + fields):** (A) *Most popular documents → what search terms led to clicks on this one doc URL?* → **conversionSearchesOnClick** + **clickedDocumentUrl** (from **conversionTopClickedDocs** if the user only names a title). (B) *Top Clicked Searches widget → for this search phrase, which result rows were clicked?* → **conversionClickedResults** + **clickedResultsSearchQuery** only (API `text_entered`). **Not** (B) if the user means case-deflection “searches for this *article* URL”—that uses **caseDeflectionArticleUrl** below. (C) **Attached to Case** grid → **conversionAttachedArticles**. (D) **Unsuccessful case deflection** (“Articles failed to Deflect cases”): article list → **conversionArticlesCreatedCases**; *searches for clicked result* on one article → **conversionSearchesCreatedCase** + **caseDeflectionArticleUrl** + **conversionSearchTypeArticle**; *session list* for that article → **conversionArticlesCreatedCasesSessions** + same url/searchType + **caseDeflectionSessionsSuccessfulDeflection** `false`. (E) **Successful case deflection** (“Articles that Deflected cases”): article list → **conversionArticlesDeflectedCase**; *all searches for clicked result* → **conversionSearchesOnDeflection** + **caseDeflectionArticleUrl** + **conversionSearchTypeArticle**; sessions → **conversionArticlesCreatedCasesSessions** + **caseDeflectionSessionsSuccessfulDeflection** `true`. **Top clicked search *keywords* list** (no phrase filter yet) → **conversionTopSearchesWithClicks**, not **conversionClickedResults**. **Never** use **conversionSessionTrackingDetails** for (A)–(E)—it is only the Session Tracking *grid* (filters), not these reports.";

const contentGapReportRoutingHint =
  "**Content-gap routing:** (1) **Tile Data Content Gap** → **tileDataContent** (ecosystem split rows: **contentSplitTileDataContent**, eco only). (2) **Unsuccessful Searches** chart → **contentUnsuccessfulSummaryChart**. (3) **Search Classifications** tables: no-click list → **contentSearchesWithNoClicks**; no-result list → **contentSearchesWithNoResult**. Their sub-report “next/successive searches for selected keyword” uses **contentSuccessiveNoClicks** or **contentSuccessiveNoResults** with **contentGapText** set to that selected keyword. (4) **Sessions with unsuccessful searches** → **contentUnsuccessfulSearchSessionChart**. (5) **High Conversion Results Not on Page One** main grid → **contentHighConversion**; selected row clicks → **contentHighConversionClicks** with **contentGapSearchTextUrl**; selected row sessions → **contentHighConversionSessions** with **contentGapSearchTextUrl** (plus optional cookie/email/search query filters). (6) **Articles Usage By Agents** main grid → **contentArticleUsageByAgents**; sub-report attached articles for selected agent → **contentSuccessiveArticlesUsage** with **contentGapText** set to agent email.";

const leadershipReportRoutingHint =
  "**Leadership dashboard (admin):** rollup data is **quarterly**; without explicit dates the analytics service defaults to the **last six completed quarters**. **Always** ask the user which quarter or date range they care about, and say the series may span up to six quarters. **leadershipUseBackendLastSixQuarters** `true` → omit `from`/`to` (same default window as the charts); otherwise **startDate**/**endDate** map to `from`/`to`. **Unassisted Self Solve Volume** (implicit deflection volume, self-solve rate, etc.) → **leadershipUnassistedSelfSolveVolume**; set **directlyViewSetting** `true` only when the org uses “All sessions” direct-view semantics (mirrors admin). **Assisted Self Solve Volume** (explicit deflection / KM metrics) → **leadershipAssistedSelfSolveVolume**. **Assisted Case Volume** → **leadershipAssistedCaseVolume**; optional **leadershipContentSourceIndexName** = `elasticIndexName` from **leadershipGetContentSources**. **Cost savings (USD)** from deflection counts → **leadershipCostSavingsDeflectionUsd** (ask for **leadershipCostPerCaseUsd**; if the user does not give a value use **200**). Raw counts only → **leadershipDeflectionCount**. **CSV export** → **leadershipDeflectionCostSavingsDownload** + **leadershipCostPerCaseUsd** (default 200) + **leadershipCsvVariant** (default 1). `/leadership/*` may need admin/BFF `analytics-secret` when proxied.";

const reportTypeZodDescription = ENABLE_EXECUTIVE_RECIPE_REPORTS
  ? `Report id: raw API types (tileData*, search*, session*…) or the same \`recipeId\` values as \`executive_business_query\` (all Phase 1–3 orchestrations: traffic … su_gpt_attribution_deferred). ${conversionsReportRoutingHint} ${contentGapReportRoutingHint} ${leadershipReportRoutingHint}`
  : `Report id: raw SearchUnify analytics APIs only (tileData*, search*, session*…). Executive recipe IDs are not available on this tool; use \`executive_business_query\` for those orchestrations. ${conversionsReportRoutingHint} ${contentGapReportRoutingHint} ${leadershipReportRoutingHint}`;

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
    .describe(
      "Row/page count (required on this tool for uniformity). Maps to `classificationCount` in executive recipes, LLM `limit`, **overviewPageRating** API `limit`, etc. Ignored on the wire for **overviewFeaturedSnippet** / **overviewKnowledgeTitle** (fixed backend limits)."
    ),
  sessionId: z
    .string()
    .optional()
    .describe("Session cookie for sessionDetails / sessionListTable."),
  pageNumber: z
    .number()
    .min(1)
    .max(500)
    .optional()
    .describe(
      "1-based page index (max 500, matches `su-sdk-js` overview + LLM Joi). Used for overviewSearchClickPosition, overviewCreatedCases, overviewPageRating, overviewSearchFeedback, overviewAdvertisements, llmResponseFeedback; ignored for overviewFeaturedSnippet / overviewKnowledgeTitle."
    ),
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
    .describe(
      "Maps to analytics `internalUser` (default **all**). Used on Overview/LLM routes and on **conversion** POST bodies (via `conversionPostBase`)."
    ),
  ecoSystemId: z
    .string()
    .uuid()
    .optional()
    .describe("When set, scope requests with ecoId instead of uid (mutually exclusive with creds uid on the wire)."),
  directlyViewSetting: z
    .boolean()
    .optional()
    .describe(
      "**leadershipUnassistedSelfSolveVolume** only: `true` matches admin when Direct View is enabled (All sessions + direct page view exit). Omit if unknown."
    ),
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
  conversionDetailKeyword: z
    .string()
    .optional()
    .describe(
      "**conversionSessionTrackingDetails only:** Session Tracking *grid* text filter (admin keyword). **Do not** use for: popular-doc search-on-click (**conversionSearchesOnClick** + **clickedDocumentUrl**); top-clicked phrase → documents (**conversionClickedResults** + **clickedResultsSearchQuery**); case-deflection per-article searches or sessions (**conversionSearchesCreatedCase** / **conversionSearchesOnDeflection** / **conversionArticlesCreatedCasesSessions** + **caseDeflectionArticleUrl**)."
    ),
  conversionSearchingType: z.string().optional().describe("conversionSessionTrackingDetails: searchingType."),
  conversionExactSearch: z.union([z.boolean(), z.string()]).optional().describe("conversionSessionTrackingDetails: exactSearch."),
  conversionDetailOffset: z
    .number()
    .min(1)
    .optional()
    .describe(
      "**conversionSessionTrackingDetails** / **conversionLinkSharing** / **conversionArticlesCreatedCasesSessions** (admin `offset`, 1-based page for sessions)."
    ),
  conversionDetailLimit: z
    .number()
    .min(1)
    .max(500)
    .optional()
    .describe(
      "**conversionSessionTrackingDetails** page size, or **conversionArticlesCreatedCasesSessions** `limit` (coerced to string on the wire like admin, default 10 if omitted)."
    ),
  conversionSearchFilter: z.string().optional().describe("conversionSessionTrackingDetails: searchFilter menu value."),
  conversionClickFilter: z.string().optional().describe("conversionSessionTrackingDetails: clickFilter."),
  conversionSupportFilter: z.string().optional().describe("conversionSessionTrackingDetails: supportFilter."),
  conversionCaseFilter: z.string().optional().describe("conversionSessionTrackingDetails: caseFilter."),
  conversionArticleFilter: z.string().optional().describe("conversionSessionTrackingDetails: articleFilter."),
  shareResultsCaseNumber: z.string().optional().describe("conversionLinkSharing: case number filter."),
  shareResultsLinkedBy: z.string().optional().describe("conversionLinkSharing: linked-by filter."),
  shareResultsModeSelect: z.any().optional().describe("conversionLinkSharing: modeselectInsideResults (same shape as admin)."),
  conversionSearchTypeArticle: z
    .string()
    .optional()
    .describe(
      "**conversionArticlesCreatedCases** / **conversionArticlesDeflectedCase** lists: `searchType` (e.g. all). **Required** for **conversionSearchesCreatedCase**, **conversionSearchesOnDeflection**, and **conversionArticlesCreatedCasesSessions** (admin Conversions case-deflection drill-downs)."
    ),
  conversionArticleOffset: z.number().min(1).optional().describe("conversionArticles*: pagination offset (default 1)."),
  clickedDocumentUrl: z
    .string()
    .optional()
    .describe(
      "**Required for conversionSearchesOnClick only:** `url` from **conversionTopClickedDocs** (Most popular documents). **Not** **caseDeflectionArticleUrl** (that is for case-deflection drill-downs on **conversionArticles**\* rows)."
    ),
  clickedResultsSearchQuery: z
    .string()
    .optional()
    .describe(
      "**Only for conversionClickedResults** (Top Clicked Searches → *documents* for one **search phrase**). Maps to `text_entered`. **Do not** use for case-deflection “searches for this article”—use **caseDeflectionArticleUrl** + **conversionSearchesCreatedCase** or **conversionSearchesOnDeflection**."
    ),
  caseDeflectionArticleUrl: z
    .string()
    .optional()
    .describe(
      "**Only** for **conversionSearchesCreatedCase** (failed deflect), **conversionSearchesOnDeflection** (successful deflect), or **conversionArticlesCreatedCasesSessions**: the article `url` from a row in **conversionArticlesCreatedCases** or **conversionArticlesDeflectedCase**. **Not** the same as **clickedDocumentUrl** (that is *Most popular documents* / searchesOnClick)."
    ),
  caseDeflectionSessionsSuccessfulDeflection: z
    .boolean()
    .optional()
    .describe(
      "**conversionArticlesCreatedCasesSessions only:** `false` = drill-down from **Articles failed to Deflect cases** (admin `caseDeflaction: false`); `true` = from **Articles that Deflected cases** (`caseDeflaction: true`)."
    ),
  contentGapSearchQuery: z
    .string()
    .optional()
    .describe("Content-gap filters (`searchQuery`) for classification/high-conversion/agents grids."),
  contentGapText: z
    .string()
    .optional()
    .describe("Selected keyword/agent text (`text`) for successive drill-downs: contentSuccessiveNoClicks/NoResults/successiveArticlesUsage."),
  contentGapSortingField: z
    .string()
    .optional()
    .describe("Content-gap sortingField for search classifications/high conversion."),
  contentGapSortType: z
    .enum(["asc", "desc", "ASC", "DESC"])
    .optional()
    .describe("Content-gap sortType (`asc`/`desc`)."),
  contentGapOrderBy: z
    .enum(["ASC", "DESC"])
    .optional()
    .describe("Articles Usage By Agents ordering (`orderBy`: ASC or DESC)."),
  contentGapSearchGrouping: z
    .boolean()
    .optional()
    .describe(
      "When explicitly true, sets `searchGrouping` for /overview/searchsWithNoClicks and /overview/searchesWithNoResult; otherwise su-mcp sends false (admin default)."
    ),
  contentGapActionStatusFilters: z
    .array(z.string())
    .optional()
    .describe(
      "Activity/action status filter for **contentSearchesWithNoResult** → `actionStatusFilters`. Use `[]` or omit for the admin default list; pass values such as `[\"Pending\"]` to restrict."
    ),
  contentGapSearchTextUrl: z
    .string()
    .optional()
    .describe("High Conversion sub-reports: selected main-row URL mapped to `searchText` (required for contentHighConversionClicks/Sessions)."),
  contentGapCookie: z
    .string()
    .optional()
    .describe("contentHighConversionSessions optional cookie filter."),
  contentGapEmailId: z
    .string()
    .optional()
    .describe("contentHighConversionSessions optional emailId filter."),
  contentGapArticleTitleSearchQuery: z
    .string()
    .optional()
    .describe("contentSuccessiveArticlesUsage optional articleTitleSearchQuery filter."),
  contentGapCaseSubjectSearchQuery: z
    .string()
    .optional()
    .describe("contentSuccessiveArticlesUsage optional caseSubjectSearchQuery filter."),
  leadershipUseBackendLastSixQuarters: z
    .boolean()
    .optional()
    .describe(
      "Leadership `reportType`s only: when true, omit `from`/`to` on the wire so analytics uses its built-in **last six quarters** rollup (matches admin Leadership charts). **startDate**/**endDate** are ignored in that mode. Otherwise map **startDate**/**endDate** to `from`/`to` for a custom quarter window. Always confirm with the user which quarter(s) they need."
    ),
  leadershipContentSourceIndexName: z
    .string()
    .optional()
    .describe(
      "**leadershipAssistedCaseVolume** only: `indexName` / `elasticIndexName` from **leadershipGetContentSources**; omit for tenant-wide assisted case rollups."
    ),
  leadershipCostPerCaseUsd: z
    .number()
    .min(0)
    .max(10000)
    .optional()
    .describe(
      "**leadershipCostSavingsDeflectionUsd** and **leadershipDeflectionCostSavingsDownload**: USD per deflected case—**ask the user**; if they do not specify, use **200** (same default as admin Leadership cost chart)."
    ),
  leadershipCsvVariant: z
    .union([z.literal(0), z.literal(1), z.literal(4)])
    .optional()
    .describe("**leadershipDeflectionCostSavingsDownload** only: `csv` download format (default 1)."),
};

const analyticsInputSchema = ENABLE_EXECUTIVE_RECIPE_REPORTS
  ? z.object(baseAnalyticsFieldShape).merge(executiveOptionsForAnalyticsTool)
  : z.object(baseAnalyticsFieldShape);

const analyticsToolDescription = ENABLE_EXECUTIVE_RECIPE_REPORTS
  ? "Analytics from SearchUnify. Raw APIs: tileDataContent, tileDataMetrics1, tileDataMetrics2, search classification, sessions (`sessionDetails`, `sessionListTable`, `sessionTrackingFormattedResult`), **Conversions tab** (`conversionClicksCountContentSource`, `conversionSearchSummary`, `conversionTopClickedDocs`, `conversionSearchesOnClick` + `clickedDocumentUrl`, `conversionTopSearchesWithClicks`, `conversionClickedResults` + `clickedResultsSearchQuery`, `conversionCurrentRelevanceIndex`, `conversionRelevanceIndex`, `conversionCaseDeflectionStage1`, `conversionSessionTrackingDetails`, `conversionDiscussions`, `conversionAttachedArticles`, `conversionArticlesCreatedCases`, `conversionSearchesCreatedCase` + `caseDeflectionArticleUrl`, `conversionArticlesDeflectedCase`, `conversionSearchesOnDeflection` + `caseDeflectionArticleUrl`, `conversionArticlesCreatedCasesSessions` + `caseDeflectionSessionsSuccessfulDeflection`, `conversionLinkSharing`). **Content Gap tab** (`contentSplitTileDataContent`, `contentUnsuccessfulSummaryChart`, `contentSearchesWithNoClicks`, `contentSuccessiveNoClicks`, `contentSearchesWithNoResult`, `contentSuccessiveNoResults`, `contentUnsuccessfulSearchSessionChart`, `contentHighConversion`, `contentHighConversionClicks`, `contentHighConversionSessions`, `contentArticleUsageByAgents`, `contentSuccessiveArticlesUsage`) with content-gap helper fields (`contentGap*`). **Disambiguation:** *User gave a search phrase and wants documents clicked in Top Clicked Searches* → **conversionClickedResults** + **clickedResultsSearchQuery**. *User gave a doc URL from **Most popular documents*** → **conversionSearchesOnClick** + **clickedDocumentUrl**. *User gave an article URL from **Articles failed / deflected** grids* → **conversionSearchesCreatedCase** or **conversionSearchesOnDeflection** or **conversionArticlesCreatedCasesSessions** + **caseDeflectionArticleUrl** + **conversionSearchTypeArticle** (see `reportType` hint). **Per-document “what searches led to clicks on this doc?”** → **conversionSearchesOnClick** + **clickedDocumentUrl**. **Per-search “what documents were clicked for this query?”** → **conversionClickedResults** + **clickedResultsSearchQuery**. **Case deflection drill-downs:** **caseDeflectionArticleUrl** + **conversionSearchTypeArticle**; sessions add **caseDeflectionSessionsSuccessfulDeflection**. **Not** **conversionSessionTrackingDetails** for these. **Overview tab** (overviewSearchClickPosition, overviewCreatedCases, overviewFeaturedSnippet, overviewKnowledgeTitle, overviewPageRating, overviewSearchFeedback, overviewAdvertisements, llmResponseFeedback). **Leadership dashboard:** `leadershipGetContentSources`, `leadershipUnassistedSelfSolveVolume`, `leadershipAssistedSelfSolveVolume`, `leadershipAssistedCaseVolume`, `leadershipDeflectionCount`, `leadershipCostSavingsDeflectionUsd`, `leadershipDeflectionCostSavingsDownload` — see `reportType` hint; **leadershipUseBackendLastSixQuarters** for admin default window; **leadershipCostPerCaseUsd** defaults to **200** when the user does not specify cost per case. **Executive orchestrations (same as `executive_business_query`):** all `reportType` values in Phase 1 (traffic, search_no_click_pct, … self_solve_rate), Phase 2 (roi_case_deflection, savings_from_conversion, cases_without_self_service, direct_views_case_creation, stage2_deflection), Phase 3 (article_deflection_contrast, attach_article_case_journey, community_content_ctr, top_article_driven_cases_month, su_gpt_attribution_deferred) — use startDate/endDate. Extra executive fields (e.g. costPerCase, communityNameHints) match the executive tool. Search client uid comes from auth (optional ecoSystemId). MCP does not expose `tenantId` as a tool parameter; where analytics requires `tenantId` in the body (same as admin), the platform proxy must inject it."
  : "Analytics from SearchUnify. Raw APIs: tileDataContent, tileDataMetrics1, tileDataMetrics2, search classification, sessions (`sessionDetails`, `sessionListTable`, `sessionTrackingFormattedResult`), **Conversions tab** (`conversionClicksCountContentSource`, `conversionSearchSummary`, `conversionTopClickedDocs`, `conversionSearchesOnClick` + `clickedDocumentUrl`, `conversionTopSearchesWithClicks`, `conversionClickedResults` + `clickedResultsSearchQuery`, `conversionCurrentRelevanceIndex`, `conversionRelevanceIndex`, `conversionCaseDeflectionStage1`, `conversionSessionTrackingDetails`, `conversionDiscussions`, `conversionAttachedArticles`, `conversionArticlesCreatedCases`, `conversionSearchesCreatedCase` + `caseDeflectionArticleUrl`, `conversionArticlesDeflectedCase`, `conversionSearchesOnDeflection` + `caseDeflectionArticleUrl`, `conversionArticlesCreatedCasesSessions` + `caseDeflectionSessionsSuccessfulDeflection`, `conversionLinkSharing`). **Content Gap tab** (`contentSplitTileDataContent`, `contentUnsuccessfulSummaryChart`, `contentSearchesWithNoClicks`, `contentSuccessiveNoClicks`, `contentSearchesWithNoResult`, `contentSuccessiveNoResults`, `contentUnsuccessfulSearchSessionChart`, `contentHighConversion`, `contentHighConversionClicks`, `contentHighConversionSessions`, `contentArticleUsageByAgents`, `contentSuccessiveArticlesUsage`) with `contentGap*` helper fields. **Disambiguation:** *Search phrase → documents clicked (Top Clicked Searches)* → **conversionClickedResults** + **clickedResultsSearchQuery**. *Doc URL from **Most popular documents*** → **conversionSearchesOnClick** + **clickedDocumentUrl**. *Article URL from **Articles failed / deflected*** → **conversionSearchesCreatedCase** / **conversionSearchesOnDeflection** / **conversionArticlesCreatedCasesSessions** + **caseDeflectionArticleUrl** + **conversionSearchTypeArticle** (see `reportType` hint). **Per-document “what searches led to clicks on this doc?”** → **conversionSearchesOnClick** + **clickedDocumentUrl**. **Per-search “what documents were clicked for this query?”** → **conversionClickedResults** + **clickedResultsSearchQuery**. **Case deflection:** **caseDeflectionArticleUrl** + **conversionSearchTypeArticle**; sessions: **caseDeflectionSessionsSuccessfulDeflection**. **Not** **conversionSessionTrackingDetails** for these. **Overview tab** (overviewSearchClickPosition, overviewCreatedCases, overviewFeaturedSnippet, overviewKnowledgeTitle, overviewPageRating, overviewSearchFeedback, overviewAdvertisements, llmResponseFeedback). **Leadership dashboard:** `leadershipGetContentSources`, `leadershipUnassistedSelfSolveVolume`, `leadershipAssistedSelfSolveVolume`, `leadershipAssistedCaseVolume`, `leadershipDeflectionCount`, `leadershipCostSavingsDeflectionUsd`, `leadershipDeflectionCostSavingsDownload` — see `reportType` hint; **leadershipUseBackendLastSixQuarters** for admin default window; **leadershipCostPerCaseUsd** defaults to **200** when the user does not specify cost per case. Executive recipe orchestrations are not available as `reportType` here; use the `executive_business_query` tool for those. Search client uid comes from auth (optional ecoSystemId). MCP does not expose `tenantId` as a tool parameter; where analytics requires `tenantId` in the body (same as admin), the platform proxy must inject it.";

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
        internalUser,
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
        conversionDetailKeyword,
        conversionSearchingType,
        conversionExactSearch,
        conversionDetailOffset,
        conversionDetailLimit,
        conversionSearchFilter,
        conversionClickFilter,
        conversionSupportFilter,
        conversionCaseFilter,
        conversionArticleFilter,
        shareResultsCaseNumber,
        shareResultsLinkedBy,
        shareResultsModeSelect,
        conversionSearchTypeArticle,
        conversionArticleOffset,
        clickedDocumentUrl,
        clickedResultsSearchQuery,
        caseDeflectionArticleUrl,
        caseDeflectionSessionsSuccessfulDeflection,
        contentGapSearchQuery,
        contentGapText,
        contentGapSortingField,
        contentGapSortType,
        contentGapOrderBy,
        contentGapSearchGrouping,
        contentGapActionStatusFilters,
        contentGapSearchTextUrl,
        contentGapCookie,
        contentGapEmailId,
        contentGapArticleTitleSearchQuery,
        contentGapCaseSubjectSearchQuery,
        leadershipUseBackendLastSixQuarters,
        leadershipContentSourceIndexName,
        leadershipCostPerCaseUsd,
        leadershipCsvVariant,
        directlyViewSetting,
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
            startDate,
            endDate,
            internalUser: internalUser ?? "all",
            userMetricsFlag: args.userMetricsFlag,
            userMetricsFilters: args.userMetricsFilters,
            userMetricsLimit: args.userMetricsLimit,
            userMetricsOffset: args.userMetricsOffset,
          };
          if (args.ecoSystemId) {
            tileParams.ecoSystemId = args.ecoSystemId;
          } else {
            tileParams.searchClientId = credsForRequest.config.uid;
          }
          analyticsResponse = await Analytics.getTileDataContent(tileParams);
          break;
        }
        case reportTypes.contentSplitTileDataContent: {
          console.error("contentSplitTileDataContent triggered");
          if (!args.ecoSystemId) {
            return jsonTextResult({
              error:
                "contentSplitTileDataContent requires ecoSystemId (admin /content/splitTileDataContent is ecosystem-only).",
            });
          }
          analyticsResponse = await Analytics.postContentSplitTileDataContent({
            ...conversionPostBase(args, credsForRequest),
            ecoId: args.ecoSystemId,
            uid: null,
          });
          break;
        }
        case reportTypes.contentUnsuccessfulSummaryChart: {
          console.error("contentUnsuccessfulSummaryChart triggered");
          analyticsResponse = await Analytics.postContentUnsuccessfulSummaryChart(
            conversionPostBase(args, credsForRequest)
          );
          break;
        }
        case reportTypes.contentSearchesWithNoClicks: {
          console.error("contentSearchesWithNoClicks triggered");
          analyticsResponse = await Analytics.postOverviewSearchesWithNoClicks({
            ...conversionPostBase(args, credsForRequest),
            searchQuery: contentGapSearchQuery ?? "",
            sortingField: contentGapSortingField ?? "Searches",
            sortType: String(contentGapSortType ?? "desc").toLowerCase(),
            offset: conversionDetailOffset ?? pageNumber ?? 1,
            limit: conversionDetailLimit ?? count ?? 50,
            searchGrouping: contentGapSearchGrouping === true,
          });
          break;
        }
        case reportTypes.contentSuccessiveNoClicks: {
          console.error("contentSuccessiveNoClicks triggered");
          const txt = contentGapText?.trim();
          if (!txt) {
            return jsonTextResult({
              error:
                "contentGapText is required for contentSuccessiveNoClicks (selected keyword text from contentSearchesWithNoClicks row).",
            });
          }
          analyticsResponse = await Analytics.postContentSuccessiveNoClicks({
            ...conversionPostBase(args, credsForRequest),
            text: txt,
          });
          break;
        }
        case reportTypes.contentSearchesWithNoResult: {
          console.error("contentSearchesWithNoResult triggered");
          const actionStatusFilters = resolvedContentGapActionStatusFilters(contentGapActionStatusFilters);
          analyticsResponse = await Analytics.postOverviewSearchesWithNoResult({
            ...conversionPostBase(args, credsForRequest),
            searchQuery: contentGapSearchQuery ?? "",
            sortingField: contentGapSortingField ?? "Searches",
            sortType: String(contentGapSortType ?? "desc").toLowerCase(),
            offset: conversionDetailOffset ?? pageNumber ?? 1,
            limit: conversionDetailLimit ?? count ?? 50,
            searchGrouping: contentGapSearchGrouping === true,
            actionStatusFilters,
          });
          break;
        }
        case reportTypes.contentSuccessiveNoResults: {
          console.error("contentSuccessiveNoResults triggered");
          const txt = contentGapText?.trim();
          if (!txt) {
            return jsonTextResult({
              error:
                "contentGapText is required for contentSuccessiveNoResults (selected keyword text from contentSearchesWithNoResult row).",
            });
          }
          analyticsResponse = await Analytics.postContentSuccessiveNoResults({
            ...conversionPostBase(args, credsForRequest),
            text: txt,
          });
          break;
        }
        case reportTypes.contentUnsuccessfulSearchSessionChart: {
          console.error("contentUnsuccessfulSearchSessionChart triggered");
          analyticsResponse = await Analytics.postContentUnsuccessfulSearchSessionChart(
            conversionPostBase(args, credsForRequest)
          );
          break;
        }
        case reportTypes.contentHighConversion: {
          console.error("contentHighConversion triggered");
          analyticsResponse = await Analytics.postContentHighConversion({
            ...conversionPostBase(args, credsForRequest),
            searchQuery: contentGapSearchQuery ?? "",
            offset: conversionDetailOffset ?? pageNumber ?? 1,
            sortingField: contentGapSortingField ?? "click",
            sortType: String(contentGapSortType ?? "desc").toLowerCase(),
          });
          break;
        }
        case reportTypes.contentHighConversionClicks: {
          console.error("contentHighConversionClicks triggered");
          const searchText = contentGapSearchTextUrl?.trim();
          if (!searchText) {
            return jsonTextResult({
              error:
                "contentGapSearchTextUrl is required for contentHighConversionClicks (selected `url` from contentHighConversion row; maps to `searchText`).",
            });
          }
          analyticsResponse = await Analytics.postContentHighConversionClicks({
            ...conversionPostBase(args, credsForRequest),
            searchText,
            searchQuery: contentGapSearchQuery ?? "",
            offset: conversionDetailOffset ?? pageNumber ?? 1,
            sortingField: contentGapSortingField ?? "search_count",
            sortType: String(contentGapSortType ?? "desc").toLowerCase(),
          });
          break;
        }
        case reportTypes.contentHighConversionSessions: {
          console.error("contentHighConversionSessions triggered");
          const searchText = contentGapSearchTextUrl?.trim();
          if (!searchText) {
            return jsonTextResult({
              error:
                "contentGapSearchTextUrl is required for contentHighConversionSessions (selected `url` from contentHighConversion row; maps to `searchText`).",
            });
          }
          analyticsResponse = await Analytics.postContentHighConversionSessions({
            ...conversionPostBase(args, credsForRequest),
            searchText,
            searchQuery: contentGapSearchQuery ?? "",
            cookie: contentGapCookie ?? "",
            emailId: contentGapEmailId ?? "",
            offset: conversionDetailOffset ?? pageNumber ?? 1,
            limit: conversionDetailLimit ?? count ?? 10,
            sortingField: contentGapSortingField ?? "activity_time",
            sortType: String(contentGapSortType ?? "desc").toLowerCase(),
          });
          break;
        }
        case reportTypes.contentArticleUsageByAgents: {
          console.error("contentArticleUsageByAgents triggered");
          analyticsResponse = await Analytics.postContentArticleUsageByAgents({
            ...conversionPostBase(args, credsForRequest),
            orderBy: String(contentGapOrderBy ?? "DESC").toUpperCase(),
            searchQuery: contentGapSearchQuery ?? "",
          });
          break;
        }
        case reportTypes.contentSuccessiveArticlesUsage: {
          console.error("contentSuccessiveArticlesUsage triggered");
          const txt = contentGapText?.trim();
          if (!txt) {
            return jsonTextResult({
              error:
                "contentGapText is required for contentSuccessiveArticlesUsage (selected agent email from contentArticleUsageByAgents row).",
            });
          }
          analyticsResponse = await Analytics.postContentSuccessiveArticlesUsage({
            ...conversionPostBase(args, credsForRequest),
            text: txt,
            orderBy: String(contentGapOrderBy ?? "DESC").toUpperCase(),
            articleTitleSearchQuery: contentGapArticleTitleSearchQuery ?? "",
            caseSubjectSearchQuery: contentGapCaseSubjectSearchQuery ?? "",
          });
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
          analyticsResponse = await Analytics.getOverviewFeaturedSnippet(
            scopeParamsForSimilarValidationOverview(args, credsForRequest)
          );
          break;
        }
        case reportTypes.overviewKnowledgeTitle: {
          console.error("overviewKnowledgeTitle triggered");
          analyticsResponse = await Analytics.getOverviewKnowledgeTitle(
            scopeParamsForSimilarValidationOverview(args, credsForRequest)
          );
          break;
        }
        case reportTypes.overviewPageRating: {
          console.error("overviewPageRating triggered");
          analyticsResponse = await Analytics.getOverviewPageRating({
            ...scopeParamsForOverview(args, credsForRequest),
            pageNumber: pageNumber ?? 1,
          });
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
          analyticsResponse = await Analytics.getLlmResponseFeedback(
            paramsForLlmResponseFeedback(args, credsForRequest)
          );
          break;
        }
        case reportTypes.sessionTrackingFormattedResult: {
          console.error("sessionTrackingFormattedResult triggered");
          const stf = {
            startDate,
            endDate,
            count: count ?? 500,
            startIndex: startIndex ?? 1,
            internalUser: internalUser ?? "all",
            sortByField: sortByField === "count" ? "click" : sortByField,
            sortType,
          };
          if (args.ecoSystemId) {
            stf.ecoSystemId = args.ecoSystemId;
          } else {
            stf.searchClientId = credsForRequest.config.uid;
          }
          analyticsResponse = await Analytics.getSessionTrackingFormattedResult(stf);
          break;
        }
        case reportTypes.conversionClicksCountContentSource: {
          console.error("conversionClicksCountContentSource triggered");
          analyticsResponse = await Analytics.postClicksCountContentSource(conversionPostBase(args, credsForRequest));
          break;
        }
        case reportTypes.conversionSearchSummary: {
          console.error("conversionSearchSummary triggered");
          const sBody = {
            ...conversionPostBase(args, credsForRequest),
            limit: count,
            offset: pageNumber ?? 1,
          };
          analyticsResponse = await Analytics.postConversionSummary(sBody);
          break;
        }
        case reportTypes.conversionTopClickedDocs: {
          console.error("conversionTopClickedDocs triggered");
          const tBody = { ...conversionPostBase(args, credsForRequest) };
          if (conversionDetailLimit != null) tBody.limit = conversionDetailLimit;
          if (conversionDetailOffset != null) tBody.offset = conversionDetailOffset;
          analyticsResponse = await Analytics.postConversionTopClickedDocs(tBody);
          break;
        }
        case reportTypes.conversionSearchesOnClick: {
          const urlTrimmed = clickedDocumentUrl?.trim();
          if (!urlTrimmed) {
            return jsonTextResult({
              error:
                "clickedDocumentUrl is required for conversionSearchesOnClick (document `url` from conversionTopClickedDocs; maps to POST /api/v2/conversion/searchesOnClick `url`).",
            });
          }
          analyticsResponse = await Analytics.postConversionSearchesOnClick({
            ...conversionPostBase(args, credsForRequest),
            url: urlTrimmed,
          });
          break;
        }
        case reportTypes.conversionTopSearchesWithClicks: {
          console.error("conversionTopSearchesWithClicks triggered");
          const tsBody = { ...conversionPostBase(args, credsForRequest) };
          if (conversionDetailLimit != null) tsBody.limit = conversionDetailLimit;
          if (conversionDetailOffset != null) tsBody.offset = conversionDetailOffset;
          analyticsResponse = await Analytics.postConversionTopSearchesWithClicks(tsBody);
          break;
        }
        case reportTypes.conversionClickedResults: {
          const q = clickedResultsSearchQuery?.trim();
          if (!q) {
            return jsonTextResult({
              error:
                "clickedResultsSearchQuery is required for conversionClickedResults (the search phrase; maps to POST /api/v2/conversion/clickedResults `text_entered`, admin “Top Clicked Searches – Documents”).",
            });
          }
          analyticsResponse = await Analytics.postConversionClickedResults({
            ...conversionPostBase(args, credsForRequest),
            text_entered: q,
          });
          break;
        }
        case reportTypes.conversionCurrentRelevanceIndex: {
          console.error("conversionCurrentRelevanceIndex triggered");
          analyticsResponse = await Analytics.postCurrentRelevanceIndex({
            uid: credsForRequest.config.uid,
            internalUser: internalUser ?? "all",
          });
          break;
        }
        case reportTypes.conversionRelevanceIndex: {
          console.error("conversionRelevanceIndex triggered");
          analyticsResponse = await Analytics.postRelevanceIndex({
            uid: credsForRequest.config.uid,
            internalUser: internalUser ?? "all",
            from: startDate,
            to: endDate,
          });
          break;
        }
        case reportTypes.conversionCaseDeflectionStage1: {
          console.error("conversionCaseDeflectionStage1 triggered");
          analyticsResponse = await Analytics.postCaseDeflectionStage1(conversionPostBase(args, credsForRequest));
          break;
        }
        case reportTypes.conversionSessionTrackingDetails: {
          console.error("conversionSessionTrackingDetails triggered");
          const sdBody = {
            ...conversionPostBase(args, credsForRequest),
            keyword: conversionDetailKeyword ?? "",
            searchingType: conversionSearchingType ?? "",
            exactSearch: conversionExactSearch ?? false,
            offset: conversionDetailOffset ?? 1,
            limit: conversionDetailLimit != null ? String(conversionDetailLimit) : "10",
            searchFilter: conversionSearchFilter ?? "",
            clickFilter: conversionClickFilter ?? "",
            supportFilter: conversionSupportFilter ?? "",
            caseFilter: conversionCaseFilter ?? "",
            articleFilter: conversionArticleFilter ?? "",
          };
          analyticsResponse = await Analytics.postConversionSessionDetails(sdBody);
          break;
        }
        case reportTypes.conversionDiscussions: {
          console.error("conversionDiscussions triggered");
          const dBody = { ...conversionPostBase(args, credsForRequest) };
          if (conversionDetailLimit != null) dBody.limit = conversionDetailLimit;
          if (conversionDetailOffset != null) dBody.offset = conversionDetailOffset;
          analyticsResponse = await Analytics.postConversionDiscussions(dBody);
          break;
        }
        case reportTypes.conversionAttachedArticles: {
          console.error("conversionAttachedArticles triggered");
          analyticsResponse = await Analytics.getAttachedArticles({
            startDate,
            endDate,
            searchClientId: credsForRequest.config.uid,
            ecoSystemId: args.ecoSystemId,
            count: conversionDetailLimit ?? count ?? 100,
            offset: conversionArticleOffset ?? conversionDetailOffset ?? 1,
            userMetricsFlag: args.userMetricsFlag,
            userMetricsFilters: args.userMetricsFilters,
            userMetricsLimit: args.userMetricsLimit,
            userMetricsOffset: args.userMetricsOffset,
          });
          break;
        }
        case reportTypes.conversionArticlesCreatedCases: {
          console.error("conversionArticlesCreatedCases triggered");
          analyticsResponse = await Analytics.getCaseCreatedArticles({
            startDate,
            endDate,
            searchClientId: credsForRequest.config.uid,
            ecoSystemId: args.ecoSystemId,
            searchType: conversionSearchTypeArticle ?? "all",
            count: conversionDetailLimit ?? count ?? 100,
            offset: conversionArticleOffset ?? conversionDetailOffset ?? 1,
            userMetricsFlag: args.userMetricsFlag,
            userMetricsFilters: args.userMetricsFilters,
            userMetricsLimit: args.userMetricsLimit,
            userMetricsOffset: args.userMetricsOffset,
          });
          break;
        }
        case reportTypes.conversionArticlesDeflectedCase: {
          console.error("conversionArticlesDeflectedCase triggered");
          analyticsResponse = await Analytics.getCaseDeflectedArticles({
            startDate,
            endDate,
            searchClientId: credsForRequest.config.uid,
            ecoSystemId: args.ecoSystemId,
            searchType: conversionSearchTypeArticle ?? "all",
            count: conversionDetailLimit ?? count ?? 100,
            offset: conversionArticleOffset ?? conversionDetailOffset ?? 1,
            userMetricsFlag: args.userMetricsFlag,
            userMetricsFilters: args.userMetricsFilters,
            userMetricsLimit: args.userMetricsLimit,
            userMetricsOffset: args.userMetricsOffset,
          });
          break;
        }
        case reportTypes.conversionSearchesCreatedCase: {
          const defUrl = caseDeflectionArticleUrl?.trim();
          const stArticle = conversionSearchTypeArticle?.trim();
          if (!defUrl || !stArticle) {
            return jsonTextResult({
              error:
                "caseDeflectionArticleUrl and conversionSearchTypeArticle are required for conversionSearchesCreatedCase (admin “Articles failed to Deflect cases” → searches for clicked result; POST …/searchesCreatedCase).",
            });
          }
          analyticsResponse = await Analytics.postConversionSearchesCreatedCase({
            ...conversionPostBase(args, credsForRequest),
            url: defUrl,
            searchType: stArticle,
            terminateQueryLogic: true,
          });
          break;
        }
        case reportTypes.conversionSearchesOnDeflection: {
          const defUrl2 = caseDeflectionArticleUrl?.trim();
          const stArticle2 = conversionSearchTypeArticle?.trim();
          if (!defUrl2 || !stArticle2) {
            return jsonTextResult({
              error:
                "caseDeflectionArticleUrl and conversionSearchTypeArticle are required for conversionSearchesOnDeflection (admin “Articles that Deflected cases” → all searches for clicked result; POST …/searchesOnDeflection).",
            });
          }
          analyticsResponse = await Analytics.postConversionSearchesOnDeflection({
            ...conversionPostBase(args, credsForRequest),
            url: defUrl2,
            searchType: stArticle2,
            terminateQueryLogic: true,
          });
          break;
        }
        case reportTypes.conversionArticlesCreatedCasesSessions: {
          const sessUrl = caseDeflectionArticleUrl?.trim();
          const stSess = conversionSearchTypeArticle?.trim();
          if (caseDeflectionSessionsSuccessfulDeflection === undefined || caseDeflectionSessionsSuccessfulDeflection === null) {
            return jsonTextResult({
              error:
                "caseDeflectionSessionsSuccessfulDeflection is required for conversionArticlesCreatedCasesSessions (`false` = Articles failed to Deflect sessions, `true` = Articles that Deflected; maps to admin `caseDeflaction`).",
            });
          }
          if (!sessUrl || !stSess) {
            return jsonTextResult({
              error:
                "caseDeflectionArticleUrl and conversionSearchTypeArticle are required for conversionArticlesCreatedCasesSessions (POST …/articlesCreatedCasesSessions).",
            });
          }
          analyticsResponse = await Analytics.postConversionArticlesCreatedCasesSessions({
            ...conversionPostBase(args, credsForRequest),
            url: sessUrl,
            searchType: stSess,
            offset: conversionDetailOffset ?? 1,
            limit: conversionDetailLimit != null ? String(conversionDetailLimit) : "10",
            caseDeflaction: caseDeflectionSessionsSuccessfulDeflection,
          });
          break;
        }
        case reportTypes.conversionLinkSharing: {
          console.error("conversionLinkSharing triggered");
          const lsBody = {
            ...conversionPostBase(args, credsForRequest),
            limit: conversionDetailLimit ?? 10,
            offset: conversionDetailOffset ?? pageNumber ?? 1,
            modeselectInsideResults: shareResultsModeSelect ?? [],
            caseNumberText: shareResultsCaseNumber ?? "",
            linkedByText: shareResultsLinkedBy ?? "",
          };
          analyticsResponse = await Analytics.postConversionLinkSharing(lsBody);
          break;
        }
        case reportTypes.leadershipGetContentSources: {
          analyticsResponse = await Analytics.postLeadershipGetContentSources({});
          break;
        }
        case reportTypes.leadershipUnassistedSelfSolveVolume: {
          const ussvBody = leadershipUidEcoBody(args, credsForRequest);
          if (directlyViewSetting !== undefined) {
            ussvBody.directlyViewSetting = Boolean(directlyViewSetting);
          }
          analyticsResponse = await Analytics.postLeadershipUnassistedSelfSolveVolume(ussvBody);
          break;
        }
        case reportTypes.leadershipAssistedSelfSolveVolume: {
          analyticsResponse = await Analytics.postLeadershipAssistedSelfSolveVolume(
            leadershipUidEcoBody(args, credsForRequest)
          );
          break;
        }
        case reportTypes.leadershipAssistedCaseVolume: {
          const acvBody = {
            internalUser: internalUser ?? "all",
            ...leadershipOptionalFromTo(args),
          };
          if (leadershipContentSourceIndexName && String(leadershipContentSourceIndexName).trim() !== "") {
            acvBody.indexName = String(leadershipContentSourceIndexName).trim();
          }
          analyticsResponse = await Analytics.postLeadershipAssistedCaseVolume(acvBody);
          break;
        }
        case reportTypes.leadershipDeflectionCount: {
          analyticsResponse = await Analytics.postLeadershipDeflectionCount(
            leadershipUidEcoBody(args, credsForRequest)
          );
          break;
        }
        case reportTypes.leadershipCostSavingsDeflectionUsd: {
          const rawCounts = await Analytics.postLeadershipDeflectionCount(
            leadershipUidEcoBody(args, credsForRequest)
          );
          if (rawCounts?.status === false) {
            analyticsResponse = rawCounts;
            break;
          }
          const rows = Array.isArray(rawCounts?.data) ? rawCounts.data : [];
          const costUsd =
            leadershipCostPerCaseUsd != null && !Number.isNaN(Number(leadershipCostPerCaseUsd))
              ? Number(leadershipCostPerCaseUsd)
              : 200;
          const enriched = rows.map((row) => {
            const explicitN = Number(row.explicit_deflection_count);
            const implicitN = Number(row.implicit_deflection_count);
            const explicitUsd = leadershipUsdRound2(
              (Number.isFinite(explicitN) ? explicitN : 0) * costUsd
            );
            const implicitUsd = leadershipUsdRound2(
              (Number.isFinite(implicitN) ? implicitN : 0) * costUsd
            );
            return {
              ...row,
              explicit_deflection_cost_savings_usd: explicitUsd,
              implicit_deflection_cost_savings_usd: implicitUsd,
              total_deflection_cost_savings_usd: leadershipUsdRound2(explicitUsd + implicitUsd),
            };
          });
          analyticsResponse = {
            status: true,
            data: {
              cost_per_case_usd_used: costUsd,
              window:
                leadershipUseBackendLastSixQuarters === true
                  ? "analytics_default_last_six_quarters"
                  : { from: `${startDate} 00:00:00`, to: `${endDate} 23:59:59` },
              note:
                "Explicit and implicit USD columns match the admin Leadership cost-savings chart (counts × cost per case). Confirm which quarter(s) the user cares about; underlying rollups are quarterly (typically up to six quarters).",
              rows: enriched,
            },
          };
          break;
        }
        case reportTypes.leadershipDeflectionCostSavingsDownload: {
          const costDl =
            leadershipCostPerCaseUsd != null && !Number.isNaN(Number(leadershipCostPerCaseUsd))
              ? Number(leadershipCostPerCaseUsd)
              : 200;
          analyticsResponse = await Analytics.postLeadershipDeflectionCostSavingsDownload({
            ...leadershipUidEcoBody(args, credsForRequest),
            costPerCase: costDl,
            csv: leadershipCsvVariant ?? 1,
            sendToEmail: 0,
          });
          break;
        }
        default:
          console.error("invalid reportType ", reportType);
      }

      if (analyticsResponse?.status === false) {
        return jsonTextResult({
          error: analyticsResponse.message || "analytics_request_failed",
          reportType,
          details: analyticsResponse,
        });
      }
      if (analyticsResponse?.data === undefined || analyticsResponse?.data === null) {
        return {
          content: [
            {
              type: "text",
              text: "some error occured while searching, response is empty",
            },
          ],
        };
      }
      console.error("analyticsResponse", analyticsResponse.data);
      return formatForClaude(analyticsResponse.data);
    }
  );
};

export { initializeAnalyticsTools };
