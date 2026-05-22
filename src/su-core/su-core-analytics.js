import { z } from "zod";
import { formatForClaude } from "./../utils.js";
import { analyticsToolAnnotations } from "../tool-annotations-meta.js";
import { log } from "../logger.js";
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
import { resolveDirectlyViewSetting } from "./leadership-direct-view.js";

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
  /** Session list grid (same wire as SDK `getSessionListTable`; MCP `reportType` name is shorter). */
  sessionList: "sessionList",
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
  /**
   * POST /api/v2/conversion/caseDeflectionStage1 — admin **Session Analytics Overview** (Search-page / Stage-1 funnel; same call as Conversions → session-report-graph-new after `caseDeflectionFormulaAndSettings`).
   * Counts are **sessions**, not unique users. Search page: `global_searches` (sessions with ≥1 search), `global_clicks` (sessions with ≥1 click on search/omnibar results), `global_no_clicks`, `global_click_exit`, `global_click_support` (clicks that continued to support). Support transitions from this funnel: `support_session`. Admin’s separate **Support page (Stage-2)** subgraph uses POST `/conversion/caseDeflectionStage2` (`support_search`, `support_clicks`, …)—not an MCP `reportType`; do not treat Stage-1 `support_*` as full Support-page totals.
   * Unique-user questions → **overviewSessionCount** (`uniqueUsersByDevice`, `uniqueUsersByEmail`; `searchUsers` is search-**session** count). Content-source / filter click tree → **conversionClicksCountContentSource**. Not **conversionSessionTrackingDetails** (session grid only).
   * **Not** Leadership dashboard: **not** *Assisted Self Solve Volume* / ASSV / KM effectiveness → use **leadershipAssistedSelfSolveVolume**; **not** *Unassisted Self Solve Volume* / USSV → **leadershipUnassistedSelfSolveVolume**. **Never** substitute this report when the user asked for Leadership ASSV/USSV or quarterly KM metrics — `global_*` session funnel ≠ Leadership rollups.
   */
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
  // /** POST /api/v2/content/splitTileDataContent — ecosystem split rows for tile-data content gap. */
  // contentSplitTileDataContent: "contentSplitTileDataContent",
  /** POST /api/v2/content/unSuccessfulSummaryChart — Unsuccessful Searches chart. */
  contentUnsuccessfulSummaryChart: "contentUnsuccessfulSummaryChart",
  /** POST /api/v2/overview/searchsWithNoClicks — Overview **Search Classifications → Searches With No Clicks** (had results, zero clicks). */
  contentSearchesWithNoClicks: "contentSearchesWithNoClicks",
  /** POST /api/v2/content/succesiveNoClicks — no-click successive searches drill-down for one keyword. */
  contentSuccessiveNoClicks: "contentSuccessiveNoClicks",
  /** POST /api/v2/overview/searchesWithNoResult — Overview **Search Classifications → Searches With No Result** (zero results). */
  contentSearchesWithNoResult: "contentSearchesWithNoResult",
  /** POST /api/v2/content/succesiveNoResults — no-result successive searches drill-down for one keyword. */
  contentSuccessiveNoResults: "contentSuccessiveNoResults",
  /** POST /api/v2/content/unSuccessfulSearchSessionChart — Sessions with unsuccessful searches chart. */
  contentUnsuccessfulSearchSessionChart: "contentUnsuccessfulSearchSessionChart",
  // High Conversion Results Not on Page One — disabled in MCP until UX no longer requires a pre-selected row URL (see product).
  /** POST /api/v2/content/articleUsageByAgents — Articles Usage By Agents main grid. */
  contentArticleUsageByAgents: "contentArticleUsageByAgents",
  /** POST /api/v2/content/successiveArticlesUsage — Articles Usage By Agents drill-down rows. */
  contentSuccessiveArticlesUsage: "contentSuccessiveArticlesUsage",
  /**
   * **Overview — session & user strip** (admin Overview first KPI row; not a single “count” field only).
   * Returns visitors (also copied to `sessionCount` in MCP), `searchUsers`, `uniqueUsersByDevice`, `uniqueUsersByEmail`, etc.
   * HTTP: `POST /api/v2/overview/tileDataMetrics1` (internal; use this `reportType` in MCP, not the path name).
   */
  overviewSessionCount: "overviewSessionCount",
  /**
   * **Overview — search & case activity strip** (admin Overview second KPI row; searches, clicks, cases, with/without result, unique searches).
   * Name is “tile”-oriented to match the UI card group; payload is search/click/case volumes, not a generic “tile list”.
   * HTTP: `POST /api/v2/overview/tileDataMetrics2` (internal; use this `reportType` in MCP).
   */
  overviewTileDataCount: "overviewTileDataCount",
  /** POST /api/v2/overview/topSearches — Overview **Search Classifications → All Searches** (every query; rows: `search_keyword` or `cluster_name`, `users_count`, `session_count`, `count`). */
  overviewTopSearches: "overviewTopSearches",
  /** POST /api/v2/overview/searchSessions — Overview **Search Classifications → Successful Searches** (queries with ≥1 result). */
  overviewSearchSessions: "overviewSearchSessions",
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
  /** POST /api/v2/leadership/get-content-sources — list content sources (`elasticIndexName` and related facets). */
  leadershipGetContentSources: "leadershipGetContentSources",
  /**
   * Admin Leadership chart: **Cost Savings due to Explicit Deflection ($)**.
   * `POST /api/v2/leadership/deflection-count` → quarterly `implicit_deflection_count`, `explicit_deflection_count` (inputs to USD cost-savings math with **leadershipCostPerCaseUsd** in admin only).
   */
  leadershipCostSavingsExplicitDeflection: "leadershipCostSavingsExplicitDeflection",
  /**
   * Admin Leadership chart: **Unassisted Self Solve Volume (Implicit Deflection)**.
   * `POST /api/v2/leadership/unassisted-self-solve-volume` → quarterly rows (MCP always last six quarters; no custom from/to).
   * **Not** `leadershipCostSavingsExplicitDeflection` (`implicit_deflection_count` is a different metric). **Not** `conversionCaseDeflectionStage1`.
   */
  leadershipUnassistedSelfSolveVolume: "leadershipUnassistedSelfSolveVolume",
  /**
   * Admin Leadership chart (4th section): **Assisted Self Solve Volume (Explicit Deflection)** — email report name *Assisted Self Solve Volume*.
   * `POST /api/v2/leadership/assisted-self-solve-volume` (admin: `POST /leadership/assisted-self-solve-volume`). MCP always last six quarters (no custom from/to). Chart series map to API fields:
   * Support Sessions → `total_web_case_sessions`; Total Web Cases Logged → `total_web_case_logged_sessions`; KM Used in Web Cases → `km_web_cases`;
   * Case Volume Deflected → `case_volume_deflected`; KM% Used in Web Cases → `km_web_cases_per`; Case Deflection % → `case_deflection`; KM Effectiveness % → `km_effectiveness`.
   * **Not** **leadershipAssistedCaseVolume** (*Assisted Case Volume* / `case_volume`, `case_resolved_via_kb`). **Not** USSV (`self_solve_rate`, `implicit_deflection_volume`). **Not** cost savings (`leadershipCostSavingsExplicitDeflection`). No `directlyViewSetting` on this chart.
   */
  leadershipAssistedSelfSolveVolume: "leadershipAssistedSelfSolveVolume",
  /**
   * Admin Leadership chart (2nd section): **Assisted Case Volume** — *not* **Assisted Self Solve Volume** (use **leadershipAssistedSelfSolveVolume** for ASSV / KM effectiveness).
   * `POST /api/v2/leadership/assisted-case-volume` → `case_volume`, `case_resolved_via_kb`, `case_resolved_via_kb_percentage` (optional **leadershipContentSourceIndexName**).
   */
  leadershipAssistedCaseVolume: "leadershipAssistedCaseVolume",
};

const reportTypes = {
  ...baseReportTypes,
  ...(ENABLE_EXECUTIVE_RECIPE_REPORTS ? RECIPES : {}),
};

/** Leadership volume charts: admin fixed last-six-quarters rollups — MCP never sends custom from/to. */
const LEADERSHIP_LAST_SIX_QUARTERS_REPORT_TYPES = new Set([
  reportTypes.leadershipCostSavingsExplicitDeflection,
  reportTypes.leadershipUnassistedSelfSolveVolume,
  reportTypes.leadershipAssistedSelfSolveVolume,
  reportTypes.leadershipAssistedCaseVolume,
]);

/**
 * Retired `reportType` strings — not in the tool enum (so agents do not pick them). If passed anyway, return a reroute error.
 * `leadershipDeflectionCount` was wrongly used for ASSV; it only ever mapped to deflection-count (USSV/cost-savings counts), not ASSV.
 */
const RETIRED_REPORT_TYPES = {
  leadershipDeflectionCount: {
    assistedSelfSolveInstead: "leadershipAssistedSelfSolveVolume",
    assistedSelfSolveChart: "Assisted Self Solve Volume (Explicit Deflection)",
    unassistedInstead: "leadershipUnassistedSelfSolveVolume",
    costSavingsInstead: "leadershipCostSavingsExplicitDeflection",
  },
};

function analyticsStartEndDatesSatisfied(data) {
  if (data.reportType === reportTypes.leadershipGetContentSources) {
    return true;
  }
  if (LEADERSHIP_LAST_SIX_QUARTERS_REPORT_TYPES.has(data.reportType)) {
    return true;
  }
  const s = data.startDate;
  const e = data.endDate;
  return typeof s === "string" && s.trim() !== "" && typeof e === "string" && e.trim() !== "";
}

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

/** Search client UUID: optional MCP **uid**, else creds `config.uid`. Conversion bodies with **ecoSystemId** set `uid` to null on the wire (ecosystem scope). */
function resolvedSearchClientUid(args, credsForRequest) {
  const raw = args.uid;
  if (raw != null && String(raw).trim() !== "") return String(raw).trim();
  return credsForRequest.config.uid;
}

function searchClientScope(args, credsForRequest) {
  if (args.ecoSystemId) return { ecoSystemId: args.ecoSystemId };
  if (credsForRequest.config.ecoSystemId) return { ecoSystemId: credsForRequest.config.ecoSystemId };
  return { searchClientId: resolvedSearchClientUid(args, credsForRequest) };
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
  } else if (credsForRequest.config.ecoSystemId) {
    body.ecoId = credsForRequest.config.ecoSystemId;
    body.uid = null;
  } else {
    body.uid = resolvedSearchClientUid(args, credsForRequest);
    body.ecoId = null;
  }
  if (args.userMetricsFlag !== undefined) body.userMetricsFlag = args.userMetricsFlag;
  if (args.userMetricsFilters !== undefined) body.userMetricsFilters = args.userMetricsFilters;
  if (args.userMetricsLimit !== undefined) body.userMetricsLimit = args.userMetricsLimit;
  if (args.userMetricsOffset !== undefined) body.userMetricsOffset = args.userMetricsOffset;
  return body;
}

/** `searchGrouping` only for POST `/overview/topSearches`, `/overview/searchSessions`, `/overview/searchsWithNoClicks`, `/overview/searchesWithNoResult` — strict MCP `true` enables grouping; otherwise `false`. */
function wireContentGapSearchGrouping(contentGapSearchGrouping) {
  return contentGapSearchGrouping === true;
}

/** Leadership volume APIs: omit from/to so analytics uses last six completed quarters (admin Leadership tab parity). */
function leadershipLastSixQuartersWindow() {
  return {};
}

/** uid xor ecoId + internalUser + optional quarter window for `/api/v2/leadership/*` routes that require scope. */
function leadershipUidEcoBody(args, credsForRequest) {
  const internalUser = args.internalUser ?? "all";
  const base = { internalUser, ...leadershipLastSixQuartersWindow() };
  if (args.ecoSystemId) {
    return { ...base, ecoId: args.ecoSystemId };
  }
  if (credsForRequest.config.ecoSystemId) {
    return { ...base, ecoId: credsForRequest.config.ecoSystemId };
  }
  return { ...base, uid: resolvedSearchClientUid(args, credsForRequest) };
}

/** USSV / ASSV body (`leadershipSelfSolveVolume` Joi): uid xor ecoId, optional quarter window. */
function leadershipSelfSolveVolumeBody(args, credsForRequest) {
  return leadershipUidEcoBody(args, credsForRequest);
}

/** Assisted case volume (`leadershipAssistedCaseVolume` Joi): tenant-scoped; optional `indexName` + quarter window. */
function leadershipAssistedCaseVolumeBody(args) {
  const body = {
    internalUser: args.internalUser ?? "all",
    ...leadershipLastSixQuartersWindow(),
  };
  const indexName = args.leadershipContentSourceIndexName?.trim();
  if (indexName) {
    body.indexName = indexName;
  }
  return body;
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
  if (credsForRequest.config.ecoSystemId) {
    return { ...base, ecoSystemId: credsForRequest.config.ecoSystemId };
  }
  return { ...base, searchClientId: resolvedSearchClientUid(args, credsForRequest) };
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
  if (credsForRequest.config.ecoSystemId) {
    return { ...base, ecoSystemId: credsForRequest.config.ecoSystemId };
  }
  return { ...base, searchClientId: resolvedSearchClientUid(args, credsForRequest) };
}

/** Params for `getLlmResponseFeedback` only (`llmResponseFeedbackOverview` Joi — no `ecoSystemId` in SDK yet). */
function paramsForLlmResponseFeedback(args, credsForRequest) {
  const { startDate, endDate, count, pageNumber, searchQuery, reactionFilterType, internalUser } = args;
  return {
    startDate,
    endDate,
    searchClientId: resolvedSearchClientUid(args, credsForRequest),
    count: count ?? 10,
    pageNumber: pageNumber ?? 1,
    internalUser: internalUser ?? "all",
    searchQuery: searchQuery ?? "",
    reactionFilterType: reactionFilterType ?? "all",
  };
}

const allReportTypeEnumValues = Object.values(reportTypes);

const conversionsReportRoutingHint =
  "**Session Analytics Overview** (admin Conversions → session-report-graph-new; mirrors `caseDeflectionStage1` + `caseDeflectionStage2` + `caseDeflectionFormulaAndSettings`): MCP exposes **conversionCaseDeflectionStage1** only (`POST /conversion/caseDeflectionStage1`). All metrics are **session** counts, not unique users. **Search page (Stage 1):** `global_searches` = sessions with searches; `global_clicks` = sessions that clicked search/omnibar results; `global_no_clicks`; `global_click_exit` vs `global_click_support` split clicks. **Support page (Stage 2):** admin loads `POST /conversion/caseDeflectionStage2` (`support_search`, `support_clicks`, `support_no_clicks`, …)—not an MCP `reportType`; Stage-1 `support_session` is support transitions from the Search funnel, not the full Support-page graph. **If the user asks for unique users who searched or clicked:** use **overviewSessionCount** (`uniqueUsersByDevice`, `uniqueUsersByEmail`) or `users_count` on Search Classifications rows—not `searchUsers` (that field is search-session volume). **Omnibar / content-source click breakdown:** **conversionClicksCountContentSource** (`Name__1`, `Data__1`). **Paginated conversion search list:** **conversionSearchSummary**. **Conversions routing (pick `reportType` + fields):** (A) *Most popular documents → what search terms led to clicks on this one doc URL?* → **conversionSearchesOnClick** + **clickedDocumentUrl**. (B) *Top Clicked Searches → documents for one phrase* → **conversionClickedResults** + **clickedResultsSearchQuery** (`text_entered`). (C) **Attached to Case** → **conversionAttachedArticles**. (D) **Unsuccessful case deflection** → **conversionArticlesCreatedCases**; per-article searches → **conversionSearchesCreatedCase** + **caseDeflectionArticleUrl** + **conversionSearchTypeArticle**; sessions → **conversionArticlesCreatedCasesSessions** + **caseDeflectionSessionsSuccessfulDeflection** `false`. (E) **Successful case deflection** → **conversionArticlesDeflectedCase** / **conversionSearchesOnDeflection** / sessions with `true`. **Top clicked keywords (no phrase yet)** → **conversionTopSearchesWithClicks**. **conversionSearchTypeArticle:** `global` = Search page only, `support` = Support page only, `all` = combined—not interchangeable. **Never** use **conversionSessionTrackingDetails** for (A)–(E).";

const contentGapReportRoutingHint =
  "**Content-gap routing:** (1) **Tile Data Content Gap** → **tileDataContent** — aggregated KPI-style payload for the Content Gap tiles (includes **daily averages** such as no-search / no-click / no-result cards; exact numeric fields live under `data`—read the JSON, do not invent field names). For **total** searches with no clicks vs no results use **different** endpoints: **totals with no clicks** → **contentSearchesWithNoClicks** (classification grid + totals in response) or high-level **overviewTileDataCount**; **totals with no results** → **contentSearchesWithNoResult**. “No searches & no click” daily averages are part of **tileDataContent** / **contentUnsuccessfulSummaryChart** depending on whether the user wants raw tile metrics or the unsuccessful chart series—prefer **tileDataContent** first for tile-language questions. (2) **Unsuccessful Searches** time-series chart → **contentUnsuccessfulSummaryChart**. (3) **Overview → Search Classifications** (admin Overview tab; four mutually defined buckets—call **all four** `reportType`s to list “major classifications” or explain volume/ variation): **All Searches** → **overviewTopSearches** (`POST /overview/topSearches`); **Successful Searches** (≥1 result) → **overviewSearchSessions** (`POST /overview/searchSessions`); **Searches With No Clicks** (had results, no click) → **contentSearchesWithNoClicks** (`POST /overview/searchsWithNoClicks`); **Searches With No Result** → **contentSearchesWithNoResult** (`POST /overview/searchesWithNoResult`). Each returns keyword rows with `users_count`, `session_count`, `count` (and `cluster_name` when grouped). Do **not** use legacy `getAllSearchQuery` / `searchQueryWithNoClicks` for admin parity. **Why totals vary between buckets or vs Overview tiles:** definitions differ (successful ⊂ all searches; no-click requires results; no-result is zero hits); **contentGapSearchGrouping** merges similar queries when `true` (admin “clustering”)—keep `false` unless the user wants clusters; compare the same date range and grouping flag. Drill-down for a selected keyword: **contentSuccessiveNoClicks** or **contentSuccessiveNoResults** + **contentGapText**. (4) **Sessions with unsuccessful searches** → **contentUnsuccessfulSearchSessionChart**. (5) **Articles Usage By Agents** → **contentArticleUsageByAgents**; drill-down → **contentSuccessiveArticlesUsage** + **contentGapText** (agent email).";

const leadershipReportRoutingHint =
  "**ASSV / Assisted Self Solve Volume → `leadershipAssistedSelfSolveVolume` ONLY** (admin Leadership chart *Assisted Self Solve Volume (Explicit Deflection)*; POST /leadership/assisted-self-solve-volume). **Do not fall back to `conversionCaseDeflectionStage1`** for ASSV, USSV, or Leadership questions — that is Conversions *Session Analytics Overview* (session funnel `global_searches`, not quarterly `km_effectiveness`). If a call failed or returned `retired_reportType`, retry the correct Leadership reportType with no startDate/endDate (last six quarters) — never substitute conversionCaseDeflectionStage1. | Leadership chart | `reportType` | |---|---| | Assisted Self Solve Volume (Explicit Deflection) | **leadershipAssistedSelfSolveVolume** | | Unassisted Self Solve Volume (Implicit Deflection) | leadershipUnassistedSelfSolveVolume | | Assisted Case Volume | leadershipAssistedCaseVolume | | Cost Savings due to Explicit Deflection ($) | leadershipCostSavingsExplicitDeflection |. ASSV fields per quarter: `total_web_case_sessions`, `total_web_case_logged_sessions`, `km_web_cases`, `case_volume_deflected`, `km_web_cases_per`, `case_deflection`, `km_effectiveness`. Triggers: *Assisted Self Solve Volume*, *ASSV*, *KM effectiveness*, *KM Used in Web Cases*, *Case Volume Deflected* (Leadership ASSV chart). Not leadershipAssistedCaseVolume (`case_resolved_via_kb`). Not leadershipUnassistedSelfSolveVolume (`self_solve_rate`). Not leadershipCostSavingsExplicitDeflection (USD). No **directlyViewSetting** on ASSV. USSV: leadershipUnassistedSelfSolveVolume; MCP auto-sets **directlyViewSetting** when omitted. **Date window:** always last six completed quarters — omit startDate/endDate on Leadership calls (MCP ignores custom ranges).";

const overviewDashboardMetricsHint =
  "**Overview dashboard KPI strips (`reportType`):** **overviewSessionCount** — visitors/sessions, search users, unique users (device/email). **overviewTileDataCount** — searches, clicks, cases, with/without result, unique searches. Prefer **overviewTileDataCount** for search/click/case volumes; use **overviewSessionCount** for audience/session context. (Do not use raw path names `tileDataMetrics1` / `tileDataMetrics2` in MCP — they are not valid `reportType` values.)";

const reportTypeLeadershipPreamble =
  "**Leadership dashboard reports are last-six-quarters only:** omit startDate/endDate (MCP never sends custom from/to). ASSV → leadershipAssistedSelfSolveVolume. Do not use conversionCaseDeflectionStage1. ";

const reportTypeZodDescription = ENABLE_EXECUTIVE_RECIPE_REPORTS
  ? `${reportTypeLeadershipPreamble}Report id: raw API types (tileData*, search*, session*…) or the same \`recipeId\` values as \`executive_business_query\` (all Phase 1–3 orchestrations: traffic … su_gpt_attribution_deferred). ${overviewDashboardMetricsHint} ${conversionsReportRoutingHint} ${contentGapReportRoutingHint} ${leadershipReportRoutingHint}`
  : `${reportTypeLeadershipPreamble}Report id: raw SearchUnify analytics APIs only (tileData*, search*, session*…). Executive recipe IDs are not available on this tool; use \`executive_business_query\` for those orchestrations. ${overviewDashboardMetricsHint} ${conversionsReportRoutingHint} ${contentGapReportRoutingHint} ${leadershipReportRoutingHint}`;

const baseAnalyticsFieldShape = {
  reportType: z
    .enum(allReportTypeEnumValues)
    .describe(reportTypeZodDescription),
  startDate: z
    .string()
    .optional()
    .describe(
      "Start date YYYY-MM-DD (maps to `from`). **Required** for most reportTypes. **Ignored** for Leadership volume charts (leadershipUnassistedSelfSolveVolume, leadershipAssistedSelfSolveVolume, leadershipAssistedCaseVolume, leadershipCostSavingsExplicitDeflection) — those always use last six quarters. Omit for leadershipGetContentSources."
    ),
  endDate: z
    .string()
    .optional()
    .describe(
      "End date YYYY-MM-DD (maps to `to`). **Ignored** for Leadership volume charts (last six quarters). Required with startDate for other reportTypes."
    ),
  count: z
    .number()
    .min(1)
    .max(500)
    .describe(
      "Row/page count (required on this tool for uniformity). Maps to `classificationCount` in executive recipes, LLM `limit`, **overviewPageRating** API `limit`, etc. Ignored on the wire for **overviewSessionCount** / **overviewTileDataCount** (no row pagination) and for **overviewFeaturedSnippet** / **overviewKnowledgeTitle** (fixed backend limits)."
    ),
  sessionId: z
    .string()
    .optional()
    .describe("Session cookie for sessionDetails / sessionList."),
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
  uid: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Optional search client UUID for `searchClientId` / conversion body `uid`. **Omit** to use the uid from MCP auth (same as today). When **ecoSystemId** is set, conversion POST bodies send `ecoId` and null `uid`; overview/content routes that accept **ecoSystemId** use ecosystem scope and ignore this field for `searchClientId`."
    ),
  directlyViewSetting: z
    .boolean()
    .optional()
    .describe(
      "**Unassisted Self Solve Volume (Implicit Deflection)** (`leadershipUnassistedSelfSolveVolume` only): maps to `directlyViewSetting` on POST `/leadership/unassisted-self-solve-volume`. When omitted, MCP resolves from search client deflection settings (admin Leadership chart parity: All Sessions when `directly_viewed_results` is enabled). Set explicitly only to override."
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
    .enum(["all", "global", "support"])
    .optional()
    .describe(
      "**conversionArticlesCreatedCases** / **conversionArticlesDeflectedCase** (and required on **conversionSearchesCreatedCase**, **conversionSearchesOnDeflection**, **conversionArticlesCreatedCasesSessions**): analytics `searchType`. **`global`** = Search page context only; **`support`** = Support page context only; **`all`** = combined rollup (MCP default when omitted). When the user asks for “global” / Search page vs Support, pass **`global`** or **`support`**—**`all`** is **not** interchangeable with **`global`**."
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
    .describe("Content-gap `searchQuery` filter for classification grids and **contentArticleUsageByAgents**."),
  contentGapText: z
    .string()
    .optional()
    .describe("Selected keyword/agent text (`text`) for successive drill-downs: contentSuccessiveNoClicks/NoResults/successiveArticlesUsage."),
  contentGapSortingField: z
    .string()
    .optional()
    .describe("Content-gap sortingField for search classification grids and agents usage."),
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
    .default(false)
    .describe(
      "Maps to `searchGrouping` on all four Overview **Search Classifications** routes (`overviewTopSearches`, `overviewSearchSessions`, `contentSearchesWithNoClicks`, `contentSearchesWithNoResult`). Default **false** (keyword rows). Set **true** only when the user wants admin clustering (`cluster_name` rows)—required for apples-to-apples comparisons when admin clustering is on."
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
    .describe("Reserved (legacy High Conversion drill-down field; no active `reportType` uses this in MCP)."),
  contentGapCookie: z
    .string()
    .optional()
    .describe("Reserved for legacy content-gap session drill-downs."),
  contentGapEmailId: z
    .string()
    .optional()
    .describe("Reserved for legacy content-gap session drill-downs."),
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
      "Deprecated/ignored: Leadership volume charts always use last six quarters without from/to. Do not set this to request a custom month/range — startDate/endDate are not applied to Leadership. Ignored for leadershipGetContentSources."
    ),
  leadershipContentSourceIndexName: z
    .string()
    .optional()
    .describe(
      "**Assisted Case Volume** (`leadershipAssistedCaseVolume` only): `indexName` (elastic index) for one content source; omit for tenant-wide rollup."
    ),
  leadershipCostPerCaseUsd: z
    .number()
    .min(0)
    .max(10000)
    .optional()
    .describe(
      "Admin **Cost Savings due to Explicit Deflection ($)** multiplies **leadershipCostSavingsExplicitDeflection** counts by cost-per-case in the UI only; MCP returns raw quarterly counts (not USD) unless a download API is added later."
    ),
};

/** MCP `server.tool` is registered with `.shape` only; Zod refinements on a full schema are not applied by the SDK. Date-window rules are enforced in the handler via **analyticsStartEndDatesSatisfied**. */
const analyticsInputSchemaBase = ENABLE_EXECUTIVE_RECIPE_REPORTS
  ? z.object(baseAnalyticsFieldShape).merge(executiveOptionsForAnalyticsTool)
  : z.object(baseAnalyticsFieldShape);

const analyticsToolDescription = ENABLE_EXECUTIVE_RECIPE_REPORTS
  ? "Analytics from SearchUnify. Raw APIs: tileDataContent, overviewSessionCount, overviewTileDataCount, **Search Classifications (four buckets—see `reportType` hint):** overviewTopSearches, overviewSearchSessions, contentSearchesWithNoClicks, contentSearchesWithNoResult, sessions (`sessionDetails`, `sessionList`, `sessionTrackingFormattedResult`), **Conversions tab** (`conversionClicksCountContentSource`, `conversionSearchSummary`, `conversionTopClickedDocs`, `conversionSearchesOnClick` + `clickedDocumentUrl`, `conversionTopSearchesWithClicks`, `conversionClickedResults` + `clickedResultsSearchQuery`, `conversionCurrentRelevanceIndex`, `conversionRelevanceIndex`, **Session Analytics Overview** → `conversionCaseDeflectionStage1` (session funnel; Support Stage-2 not a raw `reportType`), `conversionSessionTrackingDetails`, `conversionDiscussions`, `conversionAttachedArticles`, `conversionArticlesCreatedCases`, `conversionSearchesCreatedCase` + `caseDeflectionArticleUrl`, `conversionArticlesDeflectedCase`, `conversionSearchesOnDeflection` + `caseDeflectionArticleUrl`, `conversionArticlesCreatedCasesSessions` + `caseDeflectionSessionsSuccessfulDeflection`, `conversionLinkSharing`). **Content Gap tab** (`contentUnsuccessfulSummaryChart`, `contentSuccessiveNoClicks`, `contentSuccessiveNoResults`, `contentUnsuccessfulSearchSessionChart`, `contentArticleUsageByAgents`, `contentSuccessiveArticlesUsage`) with `contentGap*` helper fields. **Disambiguation:** *User gave a search phrase and wants documents clicked in Top Clicked Searches* → **conversionClickedResults** + **clickedResultsSearchQuery**. *User gave a doc URL from **Most popular documents*** → **conversionSearchesOnClick** + **clickedDocumentUrl**. *User gave an article URL from **Articles failed / deflected** grids* → **conversionSearchesCreatedCase** or **conversionSearchesOnDeflection** or **conversionArticlesCreatedCasesSessions** + **caseDeflectionArticleUrl** + **conversionSearchTypeArticle** (see `reportType` hint). **Session Analytics Overview** (searches/clicks, Search vs Support page): **conversionCaseDeflectionStage1** + `reportType` hint; unique users → **overviewSessionCount**. **Not** **conversionSessionTrackingDetails** for conversion drill-downs. **Overview tab** (overviewSessionCount, overviewTileDataCount, overviewSearchClickPosition, overviewCreatedCases, overviewFeaturedSnippet, overviewKnowledgeTitle, overviewPageRating, overviewSearchFeedback, overviewAdvertisements, llmResponseFeedback). **Leadership dashboard** (see `reportType` hint): *Assisted Self Solve Volume* / KM effectiveness / ASSV → **`leadershipAssistedSelfSolveVolume`** (not Assisted Case Volume, not USSV, not cost savings). *Unassisted* / self solve rate / USSV → `leadershipUnassistedSelfSolveVolume`. *Assisted Case Volume* / resolved via KB → `leadershipAssistedCaseVolume` + `leadershipContentSourceIndexName`. *Cost Savings due to Explicit Deflection ($)* / USD → `leadershipCostSavingsExplicitDeflection` only. **Executive orchestrations (same as `executive_business_query`):** all `reportType` values in Phase 1 (traffic, search_no_click_pct, … self_solve_rate), Phase 2 (roi_case_deflection, savings_from_conversion, cases_without_self_service, direct_views_case_creation, stage2_deflection), Phase 3 (article_deflection_contrast, attach_article_case_journey, community_content_ctr, top_article_driven_cases_month, su_gpt_attribution_deferred) — use startDate/endDate. Extra executive fields (e.g. costPerCase, communityNameHints) match the executive tool. Optional **uid** (UUID) overrides the search client id from MCP auth for `searchClientId` / conversion `uid`; omit **uid** for creds default. **ecoSystemId** still selects ecosystem scope where supported. MCP does not expose `tenantId` as a tool parameter; where analytics requires `tenantId` in the body (same as admin), the platform proxy must inject it."
  : "Analytics from SearchUnify. Raw APIs: tileDataContent, overviewSessionCount, overviewTileDataCount, **Search Classifications (four buckets—see `reportType` hint):** overviewTopSearches, overviewSearchSessions, contentSearchesWithNoClicks, contentSearchesWithNoResult, sessions (`sessionDetails`, `sessionList`, `sessionTrackingFormattedResult`), **Conversions tab** (`conversionClicksCountContentSource`, `conversionSearchSummary`, `conversionTopClickedDocs`, `conversionSearchesOnClick` + `clickedDocumentUrl`, `conversionTopSearchesWithClicks`, `conversionClickedResults` + `clickedResultsSearchQuery`, `conversionCurrentRelevanceIndex`, `conversionRelevanceIndex`, **Session Analytics Overview** → `conversionCaseDeflectionStage1`, `conversionSessionTrackingDetails`, `conversionDiscussions`, `conversionAttachedArticles`, `conversionArticlesCreatedCases`, `conversionSearchesCreatedCase` + `caseDeflectionArticleUrl`, `conversionArticlesDeflectedCase`, `conversionSearchesOnDeflection` + `caseDeflectionArticleUrl`, `conversionArticlesCreatedCasesSessions` + `caseDeflectionSessionsSuccessfulDeflection`, `conversionLinkSharing`). **Content Gap tab** (`contentUnsuccessfulSummaryChart`, `contentSuccessiveNoClicks`, `contentSuccessiveNoResults`, `contentUnsuccessfulSearchSessionChart`, `contentArticleUsageByAgents`, `contentSuccessiveArticlesUsage`) with `contentGap*` helper fields. **Disambiguation:** *Search phrase → documents clicked (Top Clicked Searches)* → **conversionClickedResults** + **clickedResultsSearchQuery**. *Doc URL from **Most popular documents*** → **conversionSearchesOnClick** + **clickedDocumentUrl**. *Article URL from **Articles failed / deflected*** → **conversionSearchesCreatedCase** / **conversionSearchesOnDeflection** / **conversionArticlesCreatedCasesSessions** + **caseDeflectionArticleUrl** + **conversionSearchTypeArticle** (see `reportType` hint). **Session Analytics Overview:** **conversionCaseDeflectionStage1**; unique users → **overviewSessionCount**. **Not** **conversionSessionTrackingDetails** for conversion drill-downs. **Overview tab** (overviewSessionCount, overviewTileDataCount, overviewSearchClickPosition, overviewCreatedCases, overviewFeaturedSnippet, overviewKnowledgeTitle, overviewPageRating, overviewSearchFeedback, overviewAdvertisements, llmResponseFeedback). **Leadership dashboard** (see `reportType` hint): *Assisted Self Solve Volume* / KM effectiveness / ASSV → **`leadershipAssistedSelfSolveVolume`**. *Unassisted* / USSV → `leadershipUnassistedSelfSolveVolume`. *Assisted Case Volume* → `leadershipAssistedCaseVolume`. *Cost Savings ($)* → `leadershipCostSavingsExplicitDeflection`. Executive recipe orchestrations are not available as `reportType` here; use the `executive_business_query` tool for those. Optional **uid** (UUID) overrides the search client id from MCP auth for `searchClientId` / conversion `uid`; omit **uid** for creds default. **ecoSystemId** still selects ecosystem scope where supported. MCP does not expose `tenantId` as a tool parameter; where analytics requires `tenantId` in the body (same as admin), the platform proxy must inject it.";

const initializeAnalyticsTools = async ({ server, creds, getCreds }) => {
  const c = async () => (getCreds ? await getCreds() : creds);
  server.tool(
    "analytics",
    analyticsToolDescription,
    analyticsInputSchemaBase.shape,
    analyticsToolAnnotations,
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
      } = args;
      const credsForRequest = await c();
      const retiredReport = RETIRED_REPORT_TYPES[reportType];
      if (retiredReport) {
        return jsonTextResult({
          error: "retired_reportType",
          message: `reportType "${reportType}" is retired and not valid. For **Assisted Self Solve Volume (ASSV)** use "${retiredReport.assistedSelfSolveInstead}" (no startDate/endDate — last six quarters). For **USSV** use "${retiredReport.unassistedInstead}". For **Cost Savings ($)** use "${retiredReport.costSavingsInstead}". Do NOT use conversionCaseDeflectionStage1 as a fallback.`,
          reportType,
          assistedSelfSolveInstead: retiredReport.assistedSelfSolveInstead,
          unassistedInstead: retiredReport.unassistedInstead,
          costSavingsInstead: retiredReport.costSavingsInstead,
        });
      }
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
      if (!analyticsStartEndDatesSatisfied(args)) {
        return jsonTextResult({
          error: "invalid_analytics_date_window",
          message:
            "startDate and endDate (YYYY-MM-DD) are required unless reportType is leadershipGetContentSources or a Leadership volume chart (last six quarters; dates omitted on the wire).",
          reportType: args.reportType,
        });
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
          log("searchQueryWithNoClicks triggered");
          analyticsResponse = await Analytics.searchQueryWithNoClicks({
            ...searchClientScope(args, credsForRequest),
            startDate, endDate, count, pageNumber, sortByField, sortType,
          });
          break;
        }
        case reportTypes.searchQueryWithResult: {
          log("searchQueryWithResult triggered");
          analyticsResponse = await Analytics.searchQueryWithResult({
            ...searchClientScope(args, credsForRequest),
            startDate, endDate, count, pageNumber, sortByField, sortType,
          });
          break;
        }
        case reportTypes.searchQueryWithoutResults: {
          log("searchQueryWithoutResults triggered");
          analyticsResponse = await Analytics.searchQueryWithoutResults({
            ...searchClientScope(args, credsForRequest),
            startDate, endDate, count, pageNumber, sortByField, sortType,
          });
          break;
        }
        case reportTypes.getAllSearchQuery: {
          log("getAllSearchQuery triggered");
          analyticsResponse = await Analytics.getAllSearchQuery({
            ...searchClientScope(args, credsForRequest),
            startDate, endDate, count, pageNumber, sortByField, sortType,
          });
          break;
        }
        case reportTypes.getAllSearchConversion: {
          log("getAllSearchConversion triggered");
          analyticsResponse = await Analytics.getAllSearchConversion({ ...searchClientScope(args, credsForRequest), startDate, endDate, count });
          break;
        }
        case reportTypes.averageClickPosition: {
          log("averageClickPosition triggered");
          analyticsResponse = await Analytics.getAverageClickPosition({
            ...searchClientScope(args, credsForRequest),
            startDate, endDate, internalUser: "all",
          });
          break;
        }
        case reportTypes.sessionDetails: {
          log("sessionDetails triggered");
          const sessionParams = {
            searchClientId: resolvedSearchClientUid(args, credsForRequest),
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
        case reportTypes.sessionList: {
          log("sessionList triggered");
          const sessionParams = {
            searchClientId: resolvedSearchClientUid(args, credsForRequest),
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
          log("tileDataContent triggered");
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
            tileParams.searchClientId = resolvedSearchClientUid(args, credsForRequest);
          }
          analyticsResponse = await Analytics.getTileDataContent(tileParams);
          break;
        }
        // case reportTypes.contentSplitTileDataContent: {
        //   log("contentSplitTileDataContent triggered");
        //   if (!args.ecoSystemId) {
        //     return jsonTextResult({
        //       error:
        //         "contentSplitTileDataContent requires ecoSystemId (admin /content/splitTileDataContent is ecosystem-only).",
        //     });
        //   }
        //   analyticsResponse = await Analytics.postContentSplitTileDataContent({
        //     ...conversionPostBase(args, credsForRequest),
        //     ecoId: args.ecoSystemId,
        //     uid: null,
        //   });
        //   break;
        // }
        case reportTypes.contentUnsuccessfulSummaryChart: {
          log("contentUnsuccessfulSummaryChart triggered");
          analyticsResponse = await Analytics.postContentUnsuccessfulSummaryChart(
            conversionPostBase(args, credsForRequest)
          );
          break;
        }
        case reportTypes.contentSearchesWithNoClicks: {
          log("contentSearchesWithNoClicks triggered");
          analyticsResponse = await Analytics.postOverviewSearchesWithNoClicks({
            ...conversionPostBase(args, credsForRequest),
            searchQuery: contentGapSearchQuery ?? "",
            sortingField: contentGapSortingField ?? "Searches",
            sortType: String(contentGapSortType ?? "desc").toLowerCase(),
            offset: conversionDetailOffset ?? pageNumber ?? 1,
            limit: conversionDetailLimit ?? count ?? 50,
            searchGrouping: wireContentGapSearchGrouping(contentGapSearchGrouping),
          });
          break;
        }
        case reportTypes.contentSuccessiveNoClicks: {
          log("contentSuccessiveNoClicks triggered");
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
          log("contentSearchesWithNoResult triggered");
          const actionStatusFilters = resolvedContentGapActionStatusFilters(contentGapActionStatusFilters);
          analyticsResponse = await Analytics.postOverviewSearchesWithNoResult({
            ...conversionPostBase(args, credsForRequest),
            searchQuery: contentGapSearchQuery ?? "",
            sortingField: contentGapSortingField ?? "Searches",
            sortType: String(contentGapSortType ?? "desc").toLowerCase(),
            offset: conversionDetailOffset ?? pageNumber ?? 1,
            limit: conversionDetailLimit ?? count ?? 50,
            searchGrouping: wireContentGapSearchGrouping(contentGapSearchGrouping),
            actionStatusFilters,
          });
          break;
        }
        case reportTypes.contentSuccessiveNoResults: {
          log("contentSuccessiveNoResults triggered");
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
          log("contentUnsuccessfulSearchSessionChart triggered");
          analyticsResponse = await Analytics.postContentUnsuccessfulSearchSessionChart(
            conversionPostBase(args, credsForRequest)
          );
          break;
        }
        case reportTypes.contentArticleUsageByAgents: {
          log("contentArticleUsageByAgents triggered");
          analyticsResponse = await Analytics.postContentArticleUsageByAgents({
            ...conversionPostBase(args, credsForRequest),
            orderBy: String(contentGapOrderBy ?? "DESC").toUpperCase(),
            searchQuery: contentGapSearchQuery ?? "",
          });
          break;
        }
        case reportTypes.contentSuccessiveArticlesUsage: {
          log("contentSuccessiveArticlesUsage triggered");
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
        case reportTypes.overviewSessionCount: {
          log("overviewSessionCount triggered");
          const tileParams = { startDate, endDate };
          if (args.ecoSystemId) {
            tileParams.ecoSystemId = args.ecoSystemId;
          } else if (credsForRequest.config.ecoSystemId) {
            tileParams.ecoSystemId = credsForRequest.config.ecoSystemId;
          } else {
            tileParams.searchClientId = resolvedSearchClientUid(args, credsForRequest);
          }
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
        case reportTypes.overviewTileDataCount: {
          log("overviewTileDataCount triggered");
          const tileScope = args.ecoSystemId
            ? { ecoSystemId: args.ecoSystemId }
            : credsForRequest.config.ecoSystemId
              ? { ecoSystemId: credsForRequest.config.ecoSystemId }
              : { searchClientId: resolvedSearchClientUid(args, credsForRequest) };
          analyticsResponse = await Analytics.getTileDataMetrics2({ ...tileScope, startDate, endDate });
          break;
        }
        case reportTypes.overviewTopSearches: {
          log("overviewTopSearches triggered");
          analyticsResponse = await Analytics.postOverviewTopSearches({
            ...conversionPostBase(args, credsForRequest),
            searchQuery: contentGapSearchQuery ?? "",
            sortingField: contentGapSortingField ?? "Searches",
            sortType: String(contentGapSortType ?? "desc").toLowerCase(),
            offset: conversionDetailOffset ?? pageNumber ?? 1,
            limit: conversionDetailLimit ?? count ?? 50,
            searchGrouping: wireContentGapSearchGrouping(contentGapSearchGrouping),
          });
          break;
        }
        case reportTypes.overviewSearchSessions: {
          log("overviewSearchSessions triggered");
          analyticsResponse = await Analytics.postOverviewSearchSessions({
            ...conversionPostBase(args, credsForRequest),
            searchQuery: contentGapSearchQuery ?? "",
            sortingField: contentGapSortingField ?? "Searches",
            sortType: String(contentGapSortType ?? "desc").toLowerCase(),
            offset: conversionDetailOffset ?? pageNumber ?? 1,
            limit: conversionDetailLimit ?? count ?? 50,
            searchGrouping: wireContentGapSearchGrouping(contentGapSearchGrouping),
          });
          break;
        }
        case reportTypes.overviewSearchClickPosition: {
          log("overviewSearchClickPosition triggered");
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
          log("overviewCreatedCases triggered");
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
          log("overviewFeaturedSnippet triggered");
          analyticsResponse = await Analytics.getOverviewFeaturedSnippet(
            scopeParamsForSimilarValidationOverview(args, credsForRequest)
          );
          break;
        }
        case reportTypes.overviewKnowledgeTitle: {
          log("overviewKnowledgeTitle triggered");
          analyticsResponse = await Analytics.getOverviewKnowledgeTitle(
            scopeParamsForSimilarValidationOverview(args, credsForRequest)
          );
          break;
        }
        case reportTypes.overviewPageRating: {
          log("overviewPageRating triggered");
          analyticsResponse = await Analytics.getOverviewPageRating({
            ...scopeParamsForOverview(args, credsForRequest),
            pageNumber: pageNumber ?? 1,
          });
          break;
        }
        case reportTypes.overviewSearchFeedback: {
          log("overviewSearchFeedback triggered");
          analyticsResponse = await Analytics.getOverviewSearchFeedback({
            ...scopeParamsForOverview(args, credsForRequest),
            pageNumber: pageNumber ?? 1,
          });
          break;
        }
        case reportTypes.overviewAdvertisements: {
          log("overviewAdvertisements triggered");
          analyticsResponse = await Analytics.getOverviewAdvertisements({
            ...scopeParamsForOverview(args, credsForRequest),
            pageNumber: pageNumber ?? 1,
            searchKey: searchKey ?? "",
            advertisementSortType: advertisementSortType ?? "",
          });
          break;
        }
        case reportTypes.llmResponseFeedback: {
          log("llmResponseFeedback triggered");
          const llmUid = resolvedSearchClientUid(args, credsForRequest);
          if (!llmUid) return { content: [{ type: "text", text: "This report requires a search client UUID. Your MCP auth is configured with an ecosystem UUID. Pass the 'uid' parameter with a search client UUID (use 'get-search-clients' to find available ones)." }] };
          analyticsResponse = await Analytics.getLlmResponseFeedback(
            paramsForLlmResponseFeedback(args, credsForRequest)
          );
          break;
        }
        case reportTypes.sessionTrackingFormattedResult: {
          log("sessionTrackingFormattedResult triggered");
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
            stf.searchClientId = resolvedSearchClientUid(args, credsForRequest);
          }
          analyticsResponse = await Analytics.getSessionTrackingFormattedResult(stf);
          break;
        }
        case reportTypes.conversionClicksCountContentSource: {
          log("conversionClicksCountContentSource triggered");
          analyticsResponse = await Analytics.postClicksCountContentSource(conversionPostBase(args, credsForRequest));
          break;
        }
        case reportTypes.conversionSearchSummary: {
          log("conversionSearchSummary triggered");
          const sBody = {
            ...conversionPostBase(args, credsForRequest),
            limit: count,
            offset: pageNumber ?? 1,
          };
          analyticsResponse = await Analytics.postConversionSummary(sBody);
          break;
        }
        case reportTypes.conversionTopClickedDocs: {
          log("conversionTopClickedDocs triggered");
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
          log("conversionTopSearchesWithClicks triggered");
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
          log("conversionCurrentRelevanceIndex triggered");
          const criUid = resolvedSearchClientUid(args, credsForRequest);
          if (!criUid) return { content: [{ type: "text", text: "This report requires a search client UUID. Your MCP auth is configured with an ecosystem UUID. Pass the 'uid' parameter with a search client UUID (use 'get-search-clients' to find available ones)." }] };
          analyticsResponse = await Analytics.postCurrentRelevanceIndex({
            uid: criUid,
            internalUser: internalUser ?? "all",
          });
          break;
        }
        case reportTypes.conversionRelevanceIndex: {
          log("conversionRelevanceIndex triggered");
          const riUid = resolvedSearchClientUid(args, credsForRequest);
          if (!riUid) return { content: [{ type: "text", text: "This report requires a search client UUID. Your MCP auth is configured with an ecosystem UUID. Pass the 'uid' parameter with a search client UUID (use 'get-search-clients' to find available ones)." }] };
          analyticsResponse = await Analytics.postRelevanceIndex({
            uid: riUid,
            internalUser: internalUser ?? "all",
            from: startDate,
            to: endDate,
          });
          break;
        }
        case reportTypes.conversionCaseDeflectionStage1: {
          log("conversionCaseDeflectionStage1 triggered");
          analyticsResponse = await Analytics.postCaseDeflectionStage1(conversionPostBase(args, credsForRequest));
          break;
        }
        case reportTypes.conversionSessionTrackingDetails: {
          log("conversionSessionTrackingDetails triggered");
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
          log("conversionDiscussions triggered");
          const dBody = { ...conversionPostBase(args, credsForRequest) };
          if (conversionDetailLimit != null) dBody.limit = conversionDetailLimit;
          if (conversionDetailOffset != null) dBody.offset = conversionDetailOffset;
          analyticsResponse = await Analytics.postConversionDiscussions(dBody);
          break;
        }
        case reportTypes.conversionAttachedArticles: {
          log("conversionAttachedArticles triggered");
          const attachedUid = resolvedSearchClientUid(args, credsForRequest);
          if (!attachedUid) return { content: [{ type: "text", text: "This report requires a search client UUID. Your MCP auth is configured with an ecosystem UUID. Pass the 'uid' parameter with a search client UUID (use 'get-search-clients' to find available ones)." }] };
          analyticsResponse = await Analytics.getAttachedArticles({
            startDate, endDate,
            searchClientId: attachedUid,
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
          log("conversionArticlesCreatedCases triggered");
          const createdUid = resolvedSearchClientUid(args, credsForRequest);
          if (!createdUid) return { content: [{ type: "text", text: "This report requires a search client UUID. Your MCP auth is configured with an ecosystem UUID. Pass the 'uid' parameter with a search client UUID (use 'get-search-clients' to find available ones)." }] };
          analyticsResponse = await Analytics.getCaseCreatedArticles({
            startDate, endDate,
            searchClientId: createdUid,
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
          log("conversionArticlesDeflectedCase triggered");
          const deflectedUid = resolvedSearchClientUid(args, credsForRequest);
          if (!deflectedUid) return { content: [{ type: "text", text: "This report requires a search client UUID. Your MCP auth is configured with an ecosystem UUID. Pass the 'uid' parameter with a search client UUID (use 'get-search-clients' to find available ones)." }] };
          analyticsResponse = await Analytics.getCaseDeflectedArticles({
            startDate, endDate,
            searchClientId: deflectedUid,
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
          log("conversionLinkSharing triggered");
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
        case reportTypes.leadershipCostSavingsExplicitDeflection: {
          analyticsResponse = await Analytics.postLeadershipDeflectionCount(
            leadershipUidEcoBody(args, credsForRequest)
          );
          break;
        }
        case reportTypes.leadershipUnassistedSelfSolveVolume: {
          const ussvBody = leadershipSelfSolveVolumeBody(args, credsForRequest);
          ussvBody.directlyViewSetting =
            args.directlyViewSetting !== undefined
              ? args.directlyViewSetting
              : await resolveDirectlyViewSetting(credsForRequest, args);
          analyticsResponse = await Analytics.postLeadershipUnassistedSelfSolveVolume(ussvBody);
          break;
        }
        // Admin Leadership: Assisted Self Solve Volume (Explicit Deflection) — POST /leadership/assisted-self-solve-volume
        case reportTypes.leadershipAssistedSelfSolveVolume: {
          analyticsResponse = await Analytics.postLeadershipAssistedSelfSolveVolume(
            leadershipSelfSolveVolumeBody(args, credsForRequest)
          );
          break;
        }
        case reportTypes.leadershipAssistedCaseVolume: {
          analyticsResponse = await Analytics.postLeadershipAssistedCaseVolume(
            leadershipAssistedCaseVolumeBody(args)
          );
          break;
        }
        default:
          log("invalid reportType ", reportType);
      }

      if (analyticsResponse?.status === false) {
        const errMsg = analyticsResponse.message?.response?.data?.message
          || analyticsResponse.message?.message
          || JSON.stringify(analyticsResponse.message);
        log(`[Analytics] API error — reportType: ${reportType}, message: ${errMsg}`);
        return jsonTextResult({
          error: errMsg || "analytics_request_failed",
          reportType,
        });
      }
      if (analyticsResponse?.data === undefined || analyticsResponse?.data === null) {
        log(`[Analytics] empty response — reportType: ${reportType}`);
        return {
          content: [
            {
              type: "text",
              text: "some error occured while searching, response is empty",
            },
          ],
        };
      }
      log(`[Analytics] ${reportType} completed successfully`);
      return formatForClaude(analyticsResponse.data);
    }
  );
};

export { initializeAnalyticsTools };
