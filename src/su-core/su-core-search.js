import { z } from "zod";
import { formatForClaude, formatArraysToString } from "./../utils.js";
import { log } from "../logger.js";
import {
  searchToolAnnotations,
  getFilterOptionsToolAnnotations,
} from "../tool-annotations-meta.js";

const aggregationSchema = z.object({
  type: z.string().describe("aggregation/facet type (e.g. documentation_category, _index)"),
  filter: z.string().describe("selected filter value (e.g. Search Clients)"),
});

const initializeSearchTools = async ({ server, creds, getCreds }) => {
  const credsForRequest = async () => (getCreds ? await getCreds() : creds);
  server.tool("search", "Get relevant search results for a search query using SearchUnify. Optionally pass aggregations (facets) from get-filter-options to filter results.", {
    searchString: z.string().min(3).max(100).describe("Search query (3–100 characters)"),
    aggregations: z.array(aggregationSchema).optional().describe("optional list of facet filters (e.g. from get-filter-options) to narrow results by category, source, etc."),
    page: z.number().int().min(1).max(100).optional().describe("page number for pagination, starts from 1"),
    pageSize: z.number().int().min(1).max(100).optional().describe("number of results per page, default is 10"),
    sortBy: z.enum(["_score", "post_time"]).optional().describe("field to sort results by, e.g. _score or post_time"),
    versionResults: z.boolean().default(false).optional().describe("Whether to use versioning for results. Defaults to false."),
    uid: z.string().uuid().optional().describe("Optional search client UUID override. Required for ecosystem-only configs."),
    // sortOrder: z.enum(["asc", "desc"]).optional().describe("sort order for results, asc or desc"),
  }, searchToolAnnotations, async ({ searchString, aggregations, page, pageSize, sortBy, versionResults, uid }) => {
    const c = await credsForRequest();
    if (!c) {
      log(`[Search] unauthenticated — query: "${searchString}"`);
      return { content: [{ type: "text", text: "Not authenticated. Please call the login tool first." }] };
    }
    const effectiveUid = uid?.trim() || c.config.uid;
    if (!effectiveUid) {
      return { content: [{ type: "text", text: "Search requires a search client UUID. Your MCP auth is configured with an ecosystem UUID. Pass the 'uid' parameter with a search client UUID (use 'get-search-clients' to find available ones)." }] };
    }
    const Search = c.suRestClient.Search();
    const effectivePage = page ?? 1;
    const effectivePageSize = pageSize ?? 10;
    const from = (effectivePage - 1) * effectivePageSize;

    const requestParams = {
      uid: effectiveUid,
      searchString,
      from,
      resultsPerPage: effectivePageSize,
      versionResults: !!versionResults,
      ...(sortBy ? { sortby: sortBy } : {}),
      orderBy: 'desc',
      ...(c.config.email ? { email: c.config.email } : {}),
   };
    
    if (aggregations?.length) {
      requestParams.aggregations = aggregations.map((a) => ({ type: a.type, filter: [a.filter] }));
    }

    const maskedEmail = c.config.email ? `${c.config.email[0]}****@${c.config.email.split('@')[1]}` : '(none)';
    log(`[Search] query: "${searchString}" uid: ${effectiveUid} email: ${maskedEmail}`);
    const searchResponse = await Search.getSearchResults(requestParams);

    if (searchResponse?.data && c.config.instance) {
      const resultCount = searchResponse.data?.result?.hits?.length ?? 0;
      const trackParams = new URLSearchParams({
        e: 'mcp_search',
        uid: effectiveUid,
        searchString,
        result_count: String(resultCount),
        r: String(Math.floor(Math.random() * 100000))
      });
      fetch(`${c.config.instance.replace(/\/$/, '')}/suanlytics?${trackParams.toString()}`, { method: 'GET' }).catch(() => {});
    }

    if(!searchResponse?.data){
      log(`[Search] API error — query: "${searchString}", response: ${JSON.stringify(searchResponse)}`);
      return {
        type: 'text',
        json: 'some error occured while searching, response is empty'
      }
    }
    const gptActive = searchResponse?.data?.searchClientSettings?.gptConfig?.gptActive;
    if(gptActive){
      const contexts = searchResponse.data.searchClientSettings.gptConfig.gptContext.split("_SULLM_");

      for(let i = 0; i < contexts.length; i++) {
        if(searchResponse.data.searchClientSettings.gptConfig.gptLinks[i - 1]){
          searchResponse.data.searchClientSettings.gptConfig.gptLinks[i - 1].description = contexts[i];
        }
      }
      return formatForClaude(searchResponse.data.searchClientSettings.gptConfig.gptLinks); 
    } else {
      const contexts = [];
      
      for(let i = 0; i < searchResponse.data?.result?.hits?.length; i++){
        contexts.push({
        title: formatArraysToString(searchResponse.data.result.hits[i].highlight.TitleToDisplayString),
        summary: formatArraysToString(searchResponse.data.result.hits[i].highlight.SummaryToDisplay),
        url: searchResponse.data.result.hits[i].href
        });
      }
      return formatForClaude(contexts); 

    }
    
  });

  server.tool(
    "get-filter-options",
    "Get available filter/facet options for a search query using SearchUnify. Uses the same search API; returns aggregationsArray (e.g. Index, Sources, Categories) with their values and counts. Optionally pass current aggregations to get options for a filtered search.",
    {
      searchString: z.string().min(3).max(100).describe("search query, a single word or sentence"),
      aggregations: z.array(aggregationSchema).optional().describe("optional list of current filters to get filter options in context of filtered results"),
      uid: z.string().uuid().optional().describe("Optional search client UUID override. Required for ecosystem-only configs."),
    },
    getFilterOptionsToolAnnotations,
    async ({ searchString, aggregations, uid }) => {
      const c = await credsForRequest();
      if (!c) {
        log(`[FilterOptions] unauthenticated — query: "${searchString}"`);
        return { content: [{ type: "text", text: "IMPORTANT: Not authenticated. You MUST call the 'login' tool first to get a login link for the user. Do not ask the user to go to settings — use the login tool." }] };
      }
      const effectiveUid = uid?.trim() || c.config.uid;
      if (!effectiveUid) {
        return { content: [{ type: "text", text: "Search requires a search client UUID. Your MCP auth is configured with an ecosystem UUID. Pass the 'uid' parameter with a search client UUID (use 'get-search-clients' to find available ones)." }] };
      }
      log(`[FilterOptions] query: "${searchString}" uid: ${effectiveUid}`);
      const Search = c.suRestClient.Search();
      const requestParams = { uid: effectiveUid, searchString, ...(c.config.email ? { email: c.config.email } : {}) };
      if (aggregations?.length) {
        requestParams.aggregations = aggregations.map((a) => ({ type: a.type, filter: [a.filter] }));
      }
      const searchResponse = await Search.getSearchResults(requestParams);

      if (!searchResponse?.data) {
        log(`[FilterOptions] API error — empty response for query: "${searchString}"`);
        return { type: "text", text: "Error: no data in search response." };
      }

      const raw = searchResponse.data?.result?.aggregationsArray ?? searchResponse.data?.aggregationsArray;
      if (!Array.isArray(raw)) {
        return { type: "text", text: "No filter options (aggregationsArray) in response." };
      }

      const summary = raw.map((agg) => ({
        key: agg.key,
        label: agg.label,
        order: agg.order,
        values: (agg.values || []).map((v) => ({
          displayName: v.displayName ?? v.Contentname,
          value: v.value,
          contentName: v.Contentname,
        })),
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    }
  );

}

export { initializeSearchTools };

