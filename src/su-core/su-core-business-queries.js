import { z } from "zod";
import {
  computeSearchNoClickRatio,
  normalizeSdkResult,
} from "./business-query-helpers.js";

/** Stable `recipeId` values (no internal question codes in the API surface). */
const RECIPES = {
  traffic: "traffic",
  search_no_click_pct: "search_no_click_pct",
  relevance_rate: "relevance_rate",
  content_gap: "content_gap",
  self_solve_rate: "self_solve_rate",
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
});

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
    return { ...base, ecoId: input.ecoId, uid: null };
  }
  return { ...base, uid: input.uid ?? creds.config.uid, ecoId: null };
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
      "Self-solve: primary signal from POST /api/v2/conversion/caseDeflectionStage1 (stage 1). Optional quarterly USSV/ASSV from /leadership/* when includeLeadershipQuarterly is true (requires traffic through admin or another BFF that injects `analytics-secret` on upstream analytics calls).",
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

export {
  RECIPES,
  runTrafficRecipe,
  runSearchNoClickPctRecipe,
  runRelevanceRateRecipe,
  runContentGapRecipe,
  runSelfSolveRateRecipe,
};

export const initializeExecutiveBusinessQueryTools = async ({
  server,
  creds,
  getCreds,
}) => {
  const c = () => (getCreds ? getCreds() : creds);

  server.tool(
    "executive_business_query",
    "Executive analytics recipes: traffic, search-without-click rate, relevance, content gap, self-solve. Composes existing SearchUnify analytics HTTP APIs only — response JSON shapes are unchanged. `/leadership/*` subcalls succeed when `instance` hits a platform path (e.g. admin) that adds `analytics-secret` to analytics; direct analytics URLs may return 401 for leadership. See analytics/docs/business-queries/ for formulas and runbooks.",
    businessQueryInput.shape,
    async (args) => {
      const credsForRequest = c();
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
