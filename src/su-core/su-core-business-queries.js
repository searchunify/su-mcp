import { z } from "zod";
import {
  computeSearchNoClickRatio,
  normalizeSdkResult,
  sumTopLevelContentSourceClicks,
  sumTopLevelClicksForHints,
  sumTopLevelClicksExcludingHints,
} from "./business-query-helpers.js";
import { ENABLE_EXECUTIVE_RECIPE_REPORTS } from "./executive-recipes-config.js";

/** Stable `recipeId` values (no internal question codes in the API surface). */
const RECIPES = {
  traffic: "traffic",
  search_no_click_pct: "search_no_click_pct",
  relevance_rate: "relevance_rate",
  content_gap: "content_gap",
  self_solve_rate: "self_solve_rate",
  /** Phase 2 — Q1: leadership deflection counts (+ optional cost-savings CSV). */
  roi_case_deflection: "roi_case_deflection",
  /** Phase 2 — Q2: tileDataMetrics2 + conversionSummary; optional leadership deflection-count for alignment. */
  savings_from_conversion: "savings_from_conversion",
  /** Phase 2 — Q6: session list filtered for “no self-service” (default: no search, with case). */
  cases_without_self_service: "cases_without_self_service",
  /** Phase 2 — Q8: caseDeflectionStage1 + caseDeflectionTrends (filterValue stage1). */
  direct_views_case_creation: "direct_views_case_creation",
  /** Phase 2 — Q15: caseDeflectionStage2 + trends (stage2); optional articlesCreatedCases. */
  stage2_deflection: "stage2_deflection",
  /** Phase 3 — Q9: articles linked to cases created vs articles linked to deflected cases (same window and searchType). */
  article_deflection_contrast: "article_deflection_contrast",
  /** Phase 3 — Q14: attached-to-case articles plus optional case journey by case UID. */
  attach_article_case_journey: "attach_article_case_journey",
  /** Phase 3 — Q10: content-source facet discovery + clicks by facet (community vs baseline slice). */
  community_content_ctr: "community_content_ctr",
  /** Phase 3 — Q7: top N rows from articles-created-cases (proxy until a grouped case-topic API exists). */
  top_article_driven_cases_month: "top_article_driven_cases_month",
  /** Phase 3 — Q3: explicit deferral until PM defines SU-GPT KPI (no fabricated %). */
  su_gpt_attribution_deferred: "su_gpt_attribution_deferred",
};

const internalUserZ = z
  .enum(["all", "internal", "external", "externalOnly"])
  .optional()
  .describe("Maps to analytics `internalUser` (default all).");

const baseContext = z.object({
  from: z
    .string()
    .describe("Range start YYYY-MM-DD (inclusive for most APIs)."),
  to: z.string().describe("Range end YYYY-MM-DD."),
  uid: z
    .string()
    .uuid()
    .optional()
    .describe("Search client uid; defaults to MCP creds uid when omitted."),
  ecoId: z
    .string()
    .uuid()
    .optional()
    .describe("Ecosystem id; mutually exclusive with uid for some APIs."),
  internalUser: internalUserZ,
  userMetricsFlag: z.boolean().optional(),
  userMetricsFilters: z.array(z.string()).optional(),
  userMetricsLimit: z.number().optional(),
  userMetricsOffset: z.number().optional(),
});

const businessQueryInput = baseContext.extend({
  recipeId: z.enum(Object.values(RECIPES)),
  classificationCount: z
    .number()
    .min(1)
    .max(500)
    .optional()
    .describe("`search_no_click_pct` only: `count` for both classification APIs (default 500)."),
  pageNumber: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("search_no_click_pct: pageNumber (default 1)."),
  sortByField: z.enum(["count"]).optional().describe("search_no_click_pct: default count."),
  sortType: z.enum(["asc", "desc"]).optional().describe("search_no_click_pct: default desc."),
  includeRelevanceDrilldown: z
    .boolean()
    .optional()
    .describe("relevance_rate: also call POST /api/v2/conversion/relevance-index."),
  relevanceFrom: z
    .string()
    .optional()
    .describe("relevance_rate drilldown: optional from (server uses quarters if omitted)."),
  relevanceTo: z
    .string()
    .optional()
    .describe("relevance_rate drilldown: optional to."),
  includeLeadershipQuarterly: z
    .boolean()
    .optional()
    .describe(
      "self_solve_rate: also call leadership USSV + ASSV (requires `instance` to route through admin or another proxy that adds `analytics-secret` upstream to analytics)."
    ),
  leadershipFrom: z
    .string()
    .optional()
    .describe(
      "self_solve_rate leadership: optional explicit from (else server default quarters)."
    ),
  leadershipTo: z
    .string()
    .optional()
    .describe("self_solve_rate leadership: optional explicit to."),
  directlyViewSetting: z
    .boolean()
    .optional()
    .describe("self_solve_rate USSV: maps to `directlyViewSetting` on leadership API."),
  includeLeadershipCostSavingsCsv: z
    .boolean()
    .optional()
    .describe("roi_case_deflection: also call POST /api/v2/leadership/deflection-cost-savings-download (returns CSV text in subcall data when ok)."),
  costPerCase: z
    .number()
    .positive()
    .optional()
    .describe("roi_case_deflection: dollars per deflected case for leadership cost-savings CSV (finance-owned)."),
  leadershipCsvExportFormat: z
    .union([z.literal(0), z.literal(1), z.literal(4)])
    .optional()
    .describe("roi_case_deflection: `csv` parameter for deflection-cost-savings-download (default 4)."),
  includeLeadershipDeflectionCountInSavings: z
    .boolean()
    .optional()
    .describe("savings_from_conversion: also POST /api/v2/leadership/deflection-count with the same from/to as the conversion tile window."),
  conversionSummaryLimit: z.number().min(1).max(500).optional(),
  conversionSummaryOffset: z.number().min(1).optional(),
  sessionListCount: z
    .number()
    .min(1)
    .max(500)
    .optional()
    .describe("cases_without_self_service: page size for GET /api/v2/session/list/table (default 100)."),
  sessionListStartIndex: z.number().min(1).optional(),
  casesWithoutSelfServiceSearchDefinition: z
    .enum(["no_search_with_case", "no_search_no_article_with_case"])
    .optional()
    .describe(
      "cases_without_self_service: default no_search_with_case = sessions with cases but zero searches. no_search_no_article_with_case also requires zero direct article views (stricter)."
    ),
  includeStage1TrueDeflectionTrend: z
    .boolean()
    .optional()
    .describe(
      "direct_views_case_creation: when true, caseDeflectionTrends uses filterValue stage1 with trueDeflection=true (explicit-only trend branch per analytics routes)."
    ),
  includeWorstActorsArticles: z
    .boolean()
    .optional()
    .describe("stage2_deflection: also fetch articlesCreatedCases for remediation lists."),
  searchTypeArticle: z
    .enum(["all", "global", "support"])
    .optional()
    .describe("article_deflection_contrast / top_article_driven_cases_month: conversion searchType (default all)."),
  articlePageLimit: z
    .number()
    .min(1)
    .max(500)
    .optional()
    .describe("article_* recipes: page size for articlesCreatedCases / articlesDeflectedCase / attachedArticles (default 100; top_article uses 5)."),
  articleOffset: z
    .number()
    .min(1)
    .optional()
    .describe("article_* recipes: offset for conversion article tables (default 1)."),
  caseUid: z
    .string()
    .uuid()
    .optional()
    .describe("attach_article_case_journey: case UID for POST /api/v2/searchSession/byCaseUid."),
  includeCaseJourney: z
    .boolean()
    .optional()
    .describe("attach_article_case_journey: when true with caseUid, also fetch search session journey."),
  journeySessionCount: z
    .number()
    .min(1)
    .max(500)
    .optional()
    .describe("attach_article_case_journey: `count` for byCaseUid (default 100)."),
  communityNameHints: z
    .array(z.string())
    .optional()
    .describe(
      "community_content_ctr: case-insensitive substrings matched against top-level `Name__1` in clicksCountContentSource rows (e.g. community, stackoverflow)."
    ),
  baselineNameHints: z
    .array(z.string())
    .optional()
    .describe(
      "community_content_ctr: optional slice for KB baseline using the same substring rules; if omitted, baseline = all top-level rows not matching communityNameHints."
    ),
  leadershipCsTypes: z
    .array(z.string())
    .optional()
    .describe("community_content_ctr: optional `csTypes` array for leadership get-content-sources."),
});

/** Optional fields for the `analytics` tool (uses startDate/endDate + count; no recipeId / from / to in tool args). */
export const executiveOptionsForAnalyticsTool = businessQueryInput
  .omit({ recipeId: true, from: true, to: true })
  .partial();

function tileOverviewParams(input, creds) {
  return {
    startDate: input.from,
    endDate: input.to,
    searchClientId: input.uid ?? creds.config.uid,
    ecoSystemId: input.ecoId,
    internalUser: input.internalUser ?? "all",
    userMetricsFlag: input.userMetricsFlag,
    userMetricsFilters: input.userMetricsFilters,
    userMetricsLimit: input.userMetricsLimit,
    userMetricsOffset: input.userMetricsOffset,
  };
}

function conversionSessionBody(input, creds) {
  const body = {
    from: `${input.from} 00:00:00`,
    to: `${input.to} 23:59:59`,
    internalUser: input.internalUser ?? "all",
    userMetricsFlag: input.userMetricsFlag,
    userMetricsFilters: input.userMetricsFilters,
    userMetricsLimit: input.userMetricsLimit,
    userMetricsOffset: input.userMetricsOffset,
  };
  if (input.ecoId) {
    body.ecoId = input.ecoId;
    body.uid = null;
  } else {
    body.uid = input.uid ?? creds.config.uid;
  }
  return body;
}

function leadershipVolumeBody(input, creds) {
  const base = {
    internalUser: input.internalUser ?? "all",
    from: input.leadershipFrom,
    to: input.leadershipTo,
  };
  if (input.ecoId) {
    return { ...base, ecoId: input.ecoId };
  }
  return { ...base, uid: input.uid ?? creds.config.uid };
}

function articleTableParams(input, creds) {
  const limit = input.articlePageLimit ?? 100;
  const offset = input.articleOffset ?? 1;
  const base = {
    startDate: input.from,
    endDate: input.to,
    searchType: input.searchTypeArticle ?? "all",
    count: limit,
    offset,
    userMetricsFlag: input.userMetricsFlag,
    userMetricsFilters: input.userMetricsFilters,
    userMetricsLimit: input.userMetricsLimit,
    userMetricsOffset: input.userMetricsOffset,
  };
  if (input.ecoId) {
    return { ...base, ecoSystemId: input.ecoId };
  }
  return { ...base, searchClientId: input.uid ?? creds.config.uid };
}

function attachedArticlesParams(input, creds) {
  const limit = input.articlePageLimit ?? 100;
  const offset = input.articleOffset ?? 1;
  const base = {
    startDate: input.from,
    endDate: input.to,
    count: limit,
    offset,
    userMetricsFlag: input.userMetricsFlag,
    userMetricsFilters: input.userMetricsFilters,
    userMetricsLimit: input.userMetricsLimit,
    userMetricsOffset: input.userMetricsOffset,
  };
  if (input.ecoId) {
    return { ...base, ecoSystemId: input.ecoId };
  }
  return { ...base, searchClientId: input.uid ?? creds.config.uid };
}

function jsonResult(obj) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(obj, null, 2),
      },
    ],
  };
}

async function runTrafficRecipe(input, creds) {
  const A = creds.suRestClient.Analytics();
  const t = tileOverviewParams(input, creds);
  const [tiles, m1, m2] = await Promise.all([
    A.getTilesData(t),
    A.getTileDataMetrics1(t),
    A.getTileDataMetrics2(t),
  ]);
  const rTiles = normalizeSdkResult(tiles);
  const rM1 = normalizeSdkResult(m1);
  const rM2 = normalizeSdkResult(m2);
  return {
    recipeId: RECIPES.traffic,
    summary:
      "Traffic overview: tiles plus tileDataMetrics1 (visitors/sessions) and tileDataMetrics2 (searches, clicks, cases). Prefer metrics2 for search and click volumes.",
    subcalls: [
      { id: "getTileData", ...rTiles, data: rTiles.ok ? rTiles.data : undefined },
      { id: "tileDataMetrics1", ...rM1, data: rM1.ok ? rM1.data : undefined },
      { id: "tileDataMetrics2", ...rM2, data: rM2.ok ? rM2.data : undefined },
    ],
  };
}

async function runSearchNoClickPctRecipe(input, creds) {
  const A = creds.suRestClient.Analytics();
  const searchClientId = input.uid ?? creds.config.uid;
  const count = input.classificationCount ?? 500;
  const pageNumber = input.pageNumber ?? 1;
  const sortByField = input.sortByField ?? "count";
  const sortType = input.sortType ?? "desc";
  const q = {
    searchClientId,
    ecoSystemId: input.ecoId,
    startDate: input.from,
    endDate: input.to,
    count,
    pageNumber,
    sortByField,
    sortType,
  };
  const [noClicks, withResults] = await Promise.all([
    A.searchQueryWithNoClicks(q),
    A.searchQueryWithResult(q),
  ]);
  const rN = normalizeSdkResult(noClicks);
  const rW = normalizeSdkResult(withResults);
  const ratio =
    rN.ok && rW.ok
      ? computeSearchNoClickRatio(rN.data, rW.data)
      : null;
  return {
    recipeId: RECIPES.search_no_click_pct,
    summary:
      "Search-without-click ratio from summed `count` on the returned pages of withNoClicks vs withResults (same filters). Not a guaranteed global total unless `classificationCount` covers all rows.",
    classificationQuery: q,
    subcalls: [
      { id: "withNoClicks", ...rN, data: rN.ok ? rN.data : undefined },
      { id: "withResults", ...rW, data: rW.ok ? rW.data : undefined },
    ],
    computed: ratio,
  };
}

async function runRelevanceRateRecipe(input, creds) {
  const A = creds.suRestClient.Analytics();
  const body = {
    uid: input.uid ?? creds.config.uid,
    internalUser: input.internalUser ?? "all",
  };
  const current = await A.postCurrentRelevanceIndex(body);
  const r = normalizeSdkResult(current);
  const out = {
    recipeId: RECIPES.relevance_rate,
    summary:
      "Relevance: current index from POST /api/v2/conversion/current-relevance-index (rolling window on server). Optional drill-down: set includeRelevanceDrilldown true for POST /api/v2/conversion/relevance-index.",
    subcalls: [{ id: "currentRelevanceIndex", ...r, data: r.ok ? r.data : undefined }],
  };
  if (input.includeRelevanceDrilldown) {
    const drill = await A.postRelevanceIndex({
      ...body,
      from: input.relevanceFrom,
      to: input.relevanceTo,
    });
    const rd = normalizeSdkResult(drill);
    out.subcalls.push({
      id: "relevanceIndexQuarterly",
      ...rd,
      data: rd.ok ? rd.data : undefined,
    });
  }
  return out;
}

async function runContentGapRecipe(input, creds) {
  const A = creds.suRestClient.Analytics();
  const t = tileOverviewParams(input, creds);
  const res = await A.getTileDataContent(t);
  const r = normalizeSdkResult(res);
  return {
    recipeId: RECIPES.content_gap,
    summary:
      "Content gap metrics from POST /api/v2/content/tileDataContent (failed searches, no-click, no-result, and related aggregates as returned by the API).",
    subcalls: [{ id: "tileDataContent", ...r, data: r.ok ? r.data : undefined }],
  };
}

async function runSelfSolveRateRecipe(input, creds) {
  const A = creds.suRestClient.Analytics();
  const stageBody = conversionSessionBody(input, creds);
  const stage1 = await A.postCaseDeflectionStage1(stageBody);
  const r1 = normalizeSdkResult(stage1);
  const out = {
    recipeId: RECIPES.self_solve_rate,
    summary:
      "Self-solve: primary signal from POST /api/v2/conversion/caseDeflectionStage1 (stage 1). Optional quarterly USSV/ASSV from `/api/v2/leadership/*` when includeLeadershipQuarterly is true (requires traffic through admin or another BFF that injects `analytics-secret` on upstream analytics calls).",
    definitions: {
      primary: "Stage-1 session analytics (conversion.caseDeflectionStage1).",
      secondary:
        "Quarterly USSV/ASSV from leadership rollups — can disagree with stage-1; treat as separate product definitions.",
    },
    subcalls: [
      { id: "caseDeflectionStage1", ...r1, data: r1.ok ? r1.data : undefined },
    ],
  };
  if (input.includeLeadershipQuarterly) {
    const lb = leadershipVolumeBody(input, creds);
    const [ussv, assv] = await Promise.all([
      A.postLeadershipUnassistedSelfSolveVolume({
        ...lb,
        directlyViewSetting: input.directlyViewSetting,
      }),
      A.postLeadershipAssistedSelfSolveVolume(lb),
    ]);
    const ru = normalizeSdkResult(ussv);
    const ra = normalizeSdkResult(assv);
    out.subcalls.push(
      {
        id: "leadershipUnassistedSelfSolveVolume",
        ...ru,
        data: ru.ok ? ru.data : undefined,
      },
      {
        id: "leadershipAssistedSelfSolveVolume",
        ...ra,
        data: ra.ok ? ra.data : undefined,
      }
    );
  }
  return out;
}

async function runRoiCaseDeflectionRecipe(input, creds) {
  const A = creds.suRestClient.Analytics();
  const uid = input.uid ?? creds.config.uid;
  const leadershipBase = {
    internalUser: input.internalUser ?? "all",
    from: `${input.from} 00:00:00`,
    to: `${input.to} 23:59:59`,
  };
  if (input.ecoId) {
    leadershipBase.ecoId = input.ecoId;
  } else {
    leadershipBase.uid = uid;
  }
  const countRes = await A.postLeadershipDeflectionCount(leadershipBase);
  const rCount = normalizeSdkResult(countRes);
  const subcalls = [
    {
      id: "leadershipDeflectionCount",
      ...rCount,
      data: rCount.ok ? rCount.data : undefined,
    },
  ];
  if (input.includeLeadershipCostSavingsCsv) {
    if (input.costPerCase === undefined || input.costPerCase === null) {
      subcalls.push({
        id: "leadershipDeflectionCostSavingsDownload",
        ok: false,
        statusCode: 0,
        error:
          "costPerCase is required when includeLeadershipCostSavingsCsv is true (finance-owned dollars per case).",
      });
    } else {
      const dl = await A.postLeadershipDeflectionCostSavingsDownload({
        ...leadershipBase,
        costPerCase: input.costPerCase,
        csv: input.leadershipCsvExportFormat ?? 4,
        sendToEmail: 0,
      });
      const rDl = normalizeSdkResult(dl);
      subcalls.push({
        id: "leadershipDeflectionCostSavingsDownload",
        ...rDl,
        data: rDl.ok ? rDl.data : undefined,
      });
    }
  }
  return {
    recipeId: RECIPES.roi_case_deflection,
    summary:
      "Leadership implicit/explicit deflection counts for ROI narratives. Optional CSV from deflection-cost-savings-download when costPerCase is supplied. Net ROI denominators (platform cost, staffing) are outside analytics — align with finance.",
    definitions: {
      financeBoundary:
        "Analytics exposes deflection volumes and optional cost lines; executives combine with finance models for net ROI.",
    },
    leadershipQuery: leadershipBase,
    subcalls,
  };
}

async function runSavingsFromConversionRecipe(input, creds) {
  const A = creds.suRestClient.Analytics();
  const t = tileOverviewParams(input, creds);
  const convBody = {
    from: input.from,
    to: input.to,
    internalUser: input.internalUser ?? "all",
    limit: input.conversionSummaryLimit ?? 50,
    offset: input.conversionSummaryOffset ?? 1,
    userMetricsFlag: input.userMetricsFlag,
    userMetricsFilters: input.userMetricsFilters,
    userMetricsLimit: input.userMetricsLimit,
    userMetricsOffset: input.userMetricsOffset,
  };
  if (input.ecoId) {
    convBody.ecoId = input.ecoId;
  } else {
    convBody.uid = input.uid ?? creds.config.uid;
  }
  const promises = [
    A.getTileDataMetrics2(t),
    A.postConversionSummary(convBody),
  ];
  if (input.includeLeadershipDeflectionCountInSavings) {
    const lb = {
      internalUser: input.internalUser ?? "all",
      from: `${input.from} 00:00:00`,
      to: `${input.to} 23:59:59`,
    };
    if (input.ecoId) lb.ecoId = input.ecoId;
    else lb.uid = input.uid ?? creds.config.uid;
    promises.push(A.postLeadershipDeflectionCount(lb));
  }
  const results = await Promise.all(promises);
  const rM2 = normalizeSdkResult(results[0]);
  const rSum = normalizeSdkResult(results[1]);
  const subcalls = [
    { id: "tileDataMetrics2", ...rM2, data: rM2.ok ? rM2.data : undefined },
    { id: "conversionSummary", ...rSum, data: rSum.ok ? rSum.data : undefined },
  ];
  if (input.includeLeadershipDeflectionCountInSavings && results[2] !== undefined) {
    const rLc = normalizeSdkResult(results[2]);
    subcalls.push({
      id: "leadershipDeflectionCount",
      ...rLc,
      data: rLc.ok ? rLc.data : undefined,
    });
  }
  return {
    recipeId: RECIPES.savings_from_conversion,
    summary:
      "Aligns overview tile searches/clicks/cases (tileDataMetrics2) with conversion summary rows for the same calendar from/to. Optional leadership deflection-count subcall uses the same window for executive alignment (leadership rollups remain quarterly-oriented server-side).",
    conversionSummaryBody: convBody,
    subcalls,
  };
}

async function runCasesWithoutSelfServiceRecipe(input, creds) {
  const def =
    input.casesWithoutSelfServiceSearchDefinition ?? "no_search_with_case";
  const A = creds.suRestClient.Analytics();
  const sessionParams = {
    startDate: input.from,
    endDate: input.to,
    count: input.sessionListCount ?? 100,
    startIndex: input.sessionListStartIndex,
    internalUser: input.internalUser ?? "all",
    searchFilter: "no",
    caseFilter: "yes",
  };
  if (input.ecoId) {
    sessionParams.ecoSystemId = input.ecoId;
  } else {
    sessionParams.searchClientId = input.uid ?? creds.config.uid;
  }
  if (def === "no_search_no_article_with_case") {
    sessionParams.articleFilter = "no";
  }
  const res = await A.getSessionListTable(sessionParams);
  const r = normalizeSdkResult(res);
  return {
    recipeId: RECIPES.cases_without_self_service,
    summary:
      "Sessions that logged a case with zero searches in-range (searchFilter=no, caseFilter=yes). Stricter “no self-service” (also no direct article views) uses casesWithoutSelfServiceSearchDefinition=no_search_no_article_with_case. PM may refine further (e.g. SU-GPT-only paths).",
    definitions: {
      defaultPreset: "no_search_with_case",
    },
    sessionQuery: sessionParams,
    subcalls: [{ id: "sessionListTable", ...r, data: r.ok ? r.data : undefined }],
  };
}

async function runDirectViewsCaseCreationRecipe(input, creds) {
  const A = creds.suRestClient.Analytics();
  const body = conversionSessionBody(input, creds);
  const stage1 = await A.postCaseDeflectionStage1(body);
  const r1 = normalizeSdkResult(stage1);
  const trendBody = {
    ...body,
    filterValue: "stage1",
  };
  if (input.includeStage1TrueDeflectionTrend === true) {
    trendBody.trueDeflection = true;
  }
  const trends = await A.postCaseDeflectionTrends(trendBody);
  const rT = normalizeSdkResult(trends);
  return {
    recipeId: RECIPES.direct_views_case_creation,
    summary:
      "Stage-1 case deflection overview plus trend chart with filterValue stage1 (direct page view / stage-1 diagnostics per analytics routing). Set includeStage1TrueDeflectionTrend for the trueDeflection branch.",
    subcalls: [
      { id: "caseDeflectionStage1", ...r1, data: r1.ok ? r1.data : undefined },
      { id: "caseDeflectionTrendsStage1", ...rT, data: rT.ok ? rT.data : undefined },
    ],
  };
}

async function runStage2DeflectionRecipe(input, creds) {
  const A = creds.suRestClient.Analytics();
  const body = conversionSessionBody(input, creds);
  const stage2 = await A.postCaseDeflectionStage2(body);
  const r2 = normalizeSdkResult(stage2);
  const trendBody = { ...body, filterValue: "stage2" };
  const trends = await A.postCaseDeflectionTrends(trendBody);
  const rT = normalizeSdkResult(trends);
  const subcalls = [
    { id: "caseDeflectionStage2", ...r2, data: r2.ok ? r2.data : undefined },
    { id: "caseDeflectionTrendsStage2", ...rT, data: rT.ok ? rT.data : undefined },
  ];
  if (input.includeWorstActorsArticles) {
    const p = articleTableParams(input, creds);
    const art = await A.getCaseCreatedArticles(p);
    const rA = normalizeSdkResult(art);
    subcalls.push({
      id: "articlesCreatedCases",
      ...rA,
      data: rA.ok ? rA.data : undefined,
    });
  }
  return {
    recipeId: RECIPES.stage2_deflection,
    summary:
      "Stage-2 deflection overview and trends (filterValue stage2). Optional articlesCreatedCases when includeWorstActorsArticles is true for content remediation lists.",
    subcalls,
  };
}

async function runArticleDeflectionContrastRecipe(input, creds) {
  const A = creds.suRestClient.Analytics();
  const p = articleTableParams(input, creds);
  const [created, deflected] = await Promise.all([
    A.getCaseCreatedArticles(p),
    A.getCaseDeflectedArticles(p),
  ]);
  const rC = normalizeSdkResult(created);
  const rD = normalizeSdkResult(deflected);
  return {
    recipeId: RECIPES.article_deflection_contrast,
    summary:
      "Contrasts articles associated with new cases (articlesCreatedCases) vs articles associated with deflected cases (articlesDeflectedCase) for the same date range and searchType. Use downloads from the analytics UI for deeper CSV analysis. Rows are API paginated — raise articlePageLimit or page with articleOffset as needed.",
    articleQuery: p,
    subcalls: [
      { id: "articlesCreatedCases", ...rC, data: rC.ok ? rC.data : undefined },
      { id: "articlesDeflectedCase", ...rD, data: rD.ok ? rD.data : undefined },
    ],
  };
}

async function runAttachArticleCaseJourneyRecipe(input, creds) {
  const A = creds.suRestClient.Analytics();
  const p = attachedArticlesParams(input, creds);
  const attached = await A.getAttachedArticles(p);
  const rA = normalizeSdkResult(attached);
  const subcalls = [
    { id: "attachedArticles", ...rA, data: rA.ok ? rA.data : undefined },
  ];
  if (input.includeCaseJourney && input.caseUid) {
    const count = input.journeySessionCount ?? 100;
    const journey = await A.getSearchSessionByCaseUid({
      startDate: input.from,
      endDate: input.to,
      count,
      caseUid: input.caseUid,
      ecoSystemId: input.ecoId,
    });
    const rJ = normalizeSdkResult(journey);
    subcalls.push({
      id: "searchSessionByCaseUid",
      ...rJ,
      data: rJ.ok ? rJ.data : undefined,
    });
  } else if (input.includeCaseJourney && !input.caseUid) {
    subcalls.push({
      id: "searchSessionByCaseUid",
      ok: false,
      statusCode: 0,
      error:
        "includeCaseJourney is true but caseUid is missing — provide caseUid to load POST /api/v2/searchSession/byCaseUid.",
    });
  }
  return {
    recipeId: RECIPES.attach_article_case_journey,
    summary:
      "Lists articles attached when users log cases (attachedArticles). Optionally chains POST /api/v2/searchSession/byCaseUid for journey activity when includeCaseJourney and caseUid are set. PM should define whether “user” means session id, cookie, or account when interpreting rows.",
    definitions: {
      userGrain:
        "Not fixed in analytics — align with PM (session vs unique device vs email) before executive reporting.",
    },
    subcalls,
  };
}

async function runCommunityContentCtrRecipe(input, creds) {
  const A = creds.suRestClient.Analytics();
  const uid = input.uid ?? creds.config.uid;
  const leadershipBody = {};
  if (input.leadershipCsTypes?.length) {
    leadershipBody.csTypes = input.leadershipCsTypes;
  }
  const clicksBody = {
    from: input.from,
    to: input.to,
    uid,
    internalUser: input.internalUser ?? "all",
    userMetricsFlag: input.userMetricsFlag,
    userMetricsFilters: input.userMetricsFilters,
    userMetricsLimit: input.userMetricsLimit,
    userMetricsOffset: input.userMetricsOffset,
  };
  const [sources, clicks] = await Promise.all([
    A.postLeadershipGetContentSources(leadershipBody),
    A.postClicksCountContentSource(clicksBody),
  ]);
  const rS = normalizeSdkResult(sources);
  const rK = normalizeSdkResult(clicks);
  const rows = rK.ok && Array.isArray(rK.data) ? rK.data : [];
  const communityHints = input.communityNameHints ?? [];
  const baselineHints = input.baselineNameHints ?? [];
  const communitySum =
    communityHints.length > 0 ? sumTopLevelClicksForHints(rows, communityHints) : null;
  let baselineSum = null;
  if (baselineHints.length > 0) {
    baselineSum = sumTopLevelClicksForHints(rows, baselineHints);
  } else if (communityHints.length > 0) {
    baselineSum = sumTopLevelClicksExcludingHints(rows, communityHints);
  }
  const totalTop = sumTopLevelContentSourceClicks(rows);
  const computed =
    rK.ok && rows.length > 0
      ? {
          methodology:
            "Sums top-level Data__1 per Name__1 row from clicksCountContentSource only — nested facet nodes are not added again to match typical branch totals. Community vs baseline splits use case-insensitive substring hints on Name__1; wrong hints produce wrong conclusions. Full CTR (clicks/impressions) may require impression numerators from other endpoints.",
          totalTopLevelClicks: totalTop,
          communityClicks: communitySum,
          baselineClicks: baselineSum,
          communityShareOfTopLevelPct:
            communitySum != null && totalTop > 0
              ? (communitySum / totalTop) * 100
              : null,
        }
      : null;
  return {
    recipeId: RECIPES.community_content_ctr,
    summary:
      "Facet discovery via POST /api/v2/leadership/get-content-sources plus POST /api/v2/conversion/clicksCountContentSource. Map community content sources to Name__1 labels using tenant metadata; then pass communityNameHints (and optional baselineNameHints) for segmented click totals.",
    leadershipQuery: leadershipBody,
    clicksQuery: clicksBody,
    subcalls: [
      { id: "leadershipGetContentSources", ...rS, data: rS.ok ? rS.data : undefined },
      { id: "clicksCountContentSource", ...rK, data: rK.ok ? rK.data : undefined },
    ],
    computed,
  };
}

async function runTopArticleDrivenCasesMonthRecipe(input, creds) {
  const A = creds.suRestClient.Analytics();
  const p = articleTableParams(
    {
      ...input,
      articlePageLimit: input.articlePageLimit ?? 5,
      articleOffset: input.articleOffset ?? 1,
    },
    creds
  );
  const res = await A.getCaseCreatedArticles(p);
  const r = normalizeSdkResult(res);
  return {
    recipeId: RECIPES.top_article_driven_cases_month,
    summary:
      "Proxy for “top cases this month”: returns the first page of POST /api/v2/conversion/articlesCreatedCases (articles tied to non-deflected case flows), not a native group-by case category. If product needs true top-5 case topics, spec a grouped read API and track as analytics backlog.",
    backlog: "Grouped case category / topic ranking may require a new aggregation endpoint — confirm with data model.",
    articleQuery: p,
    subcalls: [{ id: "articlesCreatedCases", ...r, data: r.ok ? r.data : undefined }],
  };
}

function runSuGptAttributionDeferredRecipe() {
  return {
    recipeId: RECIPES.su_gpt_attribution_deferred,
    deferred: true,
    summary:
      "SU-GPT contribution to deflection is not shipped as a single KPI: conversion analytics do not expose an agreed rollup. Options are session-level filters, exports, or a future rollup job — all require PM definition before engineering publishes a percentage.",
    definitions: {
      policy: "Do not fabricate or imply a % deflection attributed to SU-GPT until METRIC_DEFINITIONS / PM sign-off.",
    },
    subcalls: [],
  };
}

export {
  RECIPES,
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
};

export const initializeExecutiveBusinessQueryTools = async ({
  server,
  creds,
  getCreds,
}) => {
  if (!ENABLE_EXECUTIVE_RECIPE_REPORTS) {
    return;
  }
  const c = () => (getCreds ? getCreds() : creds);

  server.tool(
    "executive_business_query",
    "Executive analytics recipes: Phase 1 (traffic, search-no-click, relevance, content gap, self-solve), Phase 2 (ROI deflection count + optional savings CSV, savings vs conversion summary, sessions without self-service, stage1 direct-view trends, stage2 deflection + optional worst-article list), Phase 3 (article contrast, attach+journey, community CTR slice, top-case proxy, SU-GPT deferral). Per-subcall ok/statusCode in JSON. `/api/v2/leadership/*` (and legacy `/leadership/*`) need `analytics-secret` on the analytics service; admin’s `/api/v2/*` proxy injects it when the path contains `leadership`. MCP does not send `tenantId` on any request (same as raw `analytics` session/tile routes). See analytics/docs/business-queries/.",
    businessQueryInput.shape,
    async (args) => {
      const credsForRequest = await Promise.resolve(c());
      const { recipeId, ...input } = args;
      try {
        let payload;
        switch (recipeId) {
          case RECIPES.traffic:
            payload = await runTrafficRecipe(input, credsForRequest);
            break;
          case RECIPES.search_no_click_pct:
            payload = await runSearchNoClickPctRecipe(input, credsForRequest);
            break;
          case RECIPES.relevance_rate:
            payload = await runRelevanceRateRecipe(input, credsForRequest);
            break;
          case RECIPES.content_gap:
            payload = await runContentGapRecipe(input, credsForRequest);
            break;
          case RECIPES.self_solve_rate:
            payload = await runSelfSolveRateRecipe(input, credsForRequest);
            break;
          case RECIPES.roi_case_deflection:
            payload = await runRoiCaseDeflectionRecipe(input, credsForRequest);
            break;
          case RECIPES.savings_from_conversion:
            payload = await runSavingsFromConversionRecipe(input, credsForRequest);
            break;
          case RECIPES.cases_without_self_service:
            payload = await runCasesWithoutSelfServiceRecipe(input, credsForRequest);
            break;
          case RECIPES.direct_views_case_creation:
            payload = await runDirectViewsCaseCreationRecipe(input, credsForRequest);
            break;
          case RECIPES.stage2_deflection:
            payload = await runStage2DeflectionRecipe(input, credsForRequest);
            break;
          case RECIPES.article_deflection_contrast:
            payload = await runArticleDeflectionContrastRecipe(input, credsForRequest);
            break;
          case RECIPES.attach_article_case_journey:
            payload = await runAttachArticleCaseJourneyRecipe(input, credsForRequest);
            break;
          case RECIPES.community_content_ctr:
            payload = await runCommunityContentCtrRecipe(input, credsForRequest);
            break;
          case RECIPES.top_article_driven_cases_month:
            payload = await runTopArticleDrivenCasesMonthRecipe(input, credsForRequest);
            break;
          case RECIPES.su_gpt_attribution_deferred:
            payload = runSuGptAttributionDeferredRecipe();
            break;
          default:
            return jsonResult({ error: "unknown recipeId", recipeId });
        }
        return jsonResult(payload);
      } catch (e) {
        return jsonResult({
          error: e?.message ?? String(e),
          recipeId,
        });
      }
    }
  );
};
