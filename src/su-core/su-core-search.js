import { z } from "zod";
import { formatForClaude, formatArraysToString } from "./../utils.js";
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
    uid: z.string().uuid().optional().describe("Optional search client UUID override. Omit to use the uid from MCP auth."),
    // sortOrder: z.enum(["asc", "desc"]).optional().describe("sort order for results, asc or desc"),
  }, searchToolAnnotations, async ({ searchString, aggregations, page, pageSize, sortBy, versionResults, uid }) => {
    const c = await credsForRequest();
    if (!c) return { content: [{ type: "text", text: "Not authenticated. Please call the login tool first." }] };
    const Search = c.suRestClient.Search();
    //const requestParams = { uid: c.config.uid, searchString };
    
    const effectivePage = page ?? 1;
    const effectivePageSize = pageSize ?? 10;
    const from = (effectivePage - 1) * effectivePageSize;


    const requestParams = {
      uid: (uid?.trim()) || c.config.uid,
      searchString,
      from,
      resultsPerPage: effectivePageSize,
      versionResults: !!versionResults,
      ...(sortBy ? { sortby: sortBy } : {}),
      orderBy: 'desc'
   };
    
    if (aggregations?.length) {
      requestParams.aggregations = aggregations.map((a) => ({ type: a.type, filter: [a.filter] }));
    }

    const searchResponse = await Search.getSearchResults(requestParams);

    if(!searchResponse?.data){
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
      uid: z.string().uuid().optional().describe("Optional search client UUID override. Omit to use the uid from MCP auth."),
    },
    getFilterOptionsToolAnnotations,
    async ({ searchString, aggregations, uid }) => {
      const c = await credsForRequest();
      if (!c) return { content: [{ type: "text", text: "IMPORTANT: Not authenticated. You MUST call the 'login' tool first to get a login link for the user. Do not ask the user to go to settings — use the login tool." }] };
      const Search = c.suRestClient.Search();
      const requestParams = { uid: (uid?.trim()) || c.config.uid, searchString };
      if (aggregations?.length) {
        requestParams.aggregations = aggregations.map((a) => ({ type: a.type, filter: [a.filter] }));
      }
      const searchResponse = await Search.getSearchResults(requestParams);

      if (!searchResponse?.data) {
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

