import { z } from "zod";
import { formatForClaude } from "./../utils.js";
import {
  runTrafficRecipe,
  runSearchNoClickPctRecipe,
  runRelevanceRateRecipe,
  runContentGapRecipe,
  runSelfSolveRateRecipe,
} from "./su-core-business-queries.js";

const reportTypes = {
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
  /** Same orchestration as `executive_business_query` recipe `traffic` */
  traffic: "traffic",
  /** Same as `executive_business_query` recipe `search_no_click_pct` */
  search_no_click_pct: "search_no_click_pct",
  /** Same as `executive_business_query` recipe `relevance_rate` */
  relevance_rate: "relevance_rate",
  /** Same as `executive_business_query` recipe `content_gap` */
  content_gap: "content_gap",
  /** Same as `executive_business_query` recipe `self_solve_rate` */
  self_solve_rate: "self_solve_rate",
};

/** Map flat `analytics` tool args to executive runner input (dates + pagination only; tenant comes from creds inside runners). */
function liteExecutiveInput(args) {
  return {
    from: args.startDate,
    to: args.endDate,
    classificationCount: args.count,
    pageNumber: args.pageNumber,
    sortByField: args.sortByField,
    sortType: args.sortType,
  };
}

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

const initializeAnalyticsTools = async ({ server, creds, getCreds }) => {
  const c = async () => (getCreds ? await getCreds() : creds);
  server.tool(
    "analytics",
    "Analytics reports from SearchUnify. For headline/count questions: tileDataContent = content-gap metrics (failed searches, no-click, no-result, sessions, daily averages). tileDataMetrics1 = session/visitor tile: the API field `visitors` is the session count (also exposed as `sessionCount` in MCP output); plus searchUsers, uniqueUsersByDevice, emptyEmailSessionCount, uniqueUsersByEmail. Ignore undefined placeholders for click/search/case fields on this endpoint. tileDataMetrics2 = search/click/conversion metrics (searches, withResult, withoutResult, uniqueSearches, clicks, clickedSessions, caseCount). Do not use tileDataMetrics1 for searches, clicks, cases, or with/without result — use tileDataMetrics2. Executive-style orchestrations (same payloads as `executive_business_query`): reportType `traffic`, `search_no_click_pct`, `relevance_rate`, `content_gap`, `self_solve_rate` — use startDate/endDate; creds supply search-client uid only. Tenant is resolved by the host (e.g. admin `tenant-id` from the access token), not in tool args or analytics JSON bodies.",
    {
    reportType: z
      .enum(Object.values(reportTypes))
      .describe(
        "Which report to fetch. Tile: tileDataContent, tileDataMetrics1, tileDataMetrics2. Classification: searchQueryWith* / getAllSearchQuery. Conversion: getAllSearchConversion, averageClickPosition. Sessions: sessionDetails, sessionListTable. Executive orchestrations (JSON body same shape as executive_business_query): traffic, search_no_click_pct, relevance_rate, content_gap, self_solve_rate."
      ),
    startDate: z.string().describe("Start date of the report in YYYY-MM-DD format"),
    endDate: z.string().describe("End date of the report in YYYY-MM-DD format"),
    count: z.number().min(1).max(500).describe("number of records to be fetched (1-500)"),
    sessionId: z.string().optional().describe("optional session cookie filter for sessionDetails (GET /api/v2/session/log/all) and sessionListTable (GET /api/v2/session/list/table)"),
    pageNumber: z.number().min(1).max(10).optional().describe("page number for the 4 search classification reports (max 10 in MCP)"),
    startIndex: z.number().min(1).max(10).optional().describe("pagination page for sessionDetails and sessionListTable (same as session log / list table APIs); max 10 in MCP; maps to API startIndex"),
    sortByField: z
      .enum(["count", "click", "search", "case", "page_view", "support", "end_date", "start_date"])
      .optional()
      .describe(
        "Sort field: for search-classification reports use count (query frequency). For sessionListTable use click, search, case, page_view, support, end_date, or start_date. For sessionDetails (session log) use the same except page_view when not applicable — if you pass count here it is sent as click for classification reports only."
      ),
    sortType: z.enum(["asc", "desc"]).optional().describe("sort direction; defaults to desc where applicable"),
  }, {
    title: "Analytics",
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  }, async (args) => {
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
    } = args;
    const credsForRequest = await c();
    if (!credsForRequest) return { content: [{ type: "text", text: "IMPORTANT: Not authenticated. You MUST call the 'login' tool first to get a login link for the user. Do not ask the user to go to settings — use the login tool." }] };
    const Analytics = credsForRequest.suRestClient.Analytics();

    const executiveReportTypes = new Set([
      reportTypes.traffic,
      reportTypes.search_no_click_pct,
      reportTypes.relevance_rate,
      reportTypes.content_gap,
      reportTypes.self_solve_rate,
    ]);
    if (executiveReportTypes.has(reportType)) {
      try {
        const input = liteExecutiveInput(args);
        let payload;
        switch (reportType) {
          case reportTypes.traffic:
            payload = await runTrafficRecipe(input, credsForRequest);
            break;
          case reportTypes.search_no_click_pct:
            payload = await runSearchNoClickPctRecipe(input, credsForRequest);
            break;
          case reportTypes.relevance_rate:
            payload = await runRelevanceRateRecipe(input, credsForRequest);
            break;
          case reportTypes.content_gap:
            payload = await runContentGapRecipe(input, credsForRequest);
            break;
          case reportTypes.self_solve_rate:
            payload = await runSelfSolveRateRecipe(input, credsForRequest);
            break;
          default:
            payload = { error: "unreachable", reportType };
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
    switch(reportType){
      case reportTypes.searchQueryWithNoClicks:
        console.error('searchQueryWithNoClicks triggered');
        analyticsResponse = await Analytics.searchQueryWithNoClicks({
          searchClientId: credsForRequest.config.uid,
          startDate,
          endDate,
          count,
          pageNumber,
          sortByField,
          sortType
        });
        break;
      case reportTypes.searchQueryWithResult:
        console.error('searchQueryWithResult triggered');
        analyticsResponse = await Analytics.searchQueryWithResult({
          searchClientId: credsForRequest.config.uid,
          startDate,
          endDate,
          count,
          pageNumber,
          sortByField,
          sortType
        });
        break;
      case reportTypes.searchQueryWithoutResults:
        console.error('searchQueryWithoutResults triggered');
        analyticsResponse = await Analytics.searchQueryWithoutResults({
          searchClientId: credsForRequest.config.uid,
          startDate,
          endDate,
          count,
          pageNumber,
          sortByField,
          sortType
        });
        break;
      case reportTypes.getAllSearchQuery:
        console.error('getAllSearchQuery triggered');
        analyticsResponse = await Analytics.getAllSearchQuery({
          searchClientId: credsForRequest.config.uid,
          startDate,
          endDate,
          count,
          pageNumber,
          sortByField,
          sortType
        });
        break;
      case reportTypes.getAllSearchConversion:
        console.error('getAllSearchConversion triggered');
        analyticsResponse = await Analytics.getAllSearchConversion({ searchClientId: credsForRequest.config.uid, startDate, endDate, count });
        break;
      case reportTypes.averageClickPosition:
        console.error('averageClickPosition triggered');
        analyticsResponse = await Analytics.getAverageClickPosition({
          searchClientId: credsForRequest.config.uid,
          startDate,
          endDate,
          internalUser: 'all',
        });
        break;
      case reportTypes.sessionDetails: {
        console.error('sessionDetails triggered');
        const sessionParams = {
          searchClientId: credsForRequest.config.uid,
          startDate,
          endDate,
          count,
          sessionId,
          startIndex,
        };
        if (sortByField !== undefined) {
          sessionParams.sortByField =
            sortByField === "count" ? "click" : sortByField;
        }
        if (sortType !== undefined) {
          sessionParams.sortType = sortType;
        }
        analyticsResponse = await Analytics.getSessionDetails(sessionParams);
        break;
      }
      case reportTypes.sessionListTable: {
        console.error('sessionListTable triggered');
        const sessionParams = {
          searchClientId: credsForRequest.config.uid,
          startDate,
          endDate,
          count,
          sessionId,
          startIndex,
        };
        if (sortByField !== undefined) {
          sessionParams.sortByField =
            sortByField === "count" ? "click" : sortByField;
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
        // API `visitors` is session count; duplicate as sessionCount for model-facing clarity
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
        console.error('invalid reportType ', reportType);
    }

    if (!analyticsResponse?.data){
      return {
        type: 'text',
        json: 'some error occured while searching, response is empty'
      }
    }
    console.error('analyticsResponse',analyticsResponse.data);
    return formatForClaude(analyticsResponse.data);

  });
}

export { initializeAnalyticsTools };
