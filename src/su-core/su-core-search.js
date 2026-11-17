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

// Server-injected end-user identity (NOT an LLM argument). The agentic-suite
// connector forwards this from tool-executor, which derives it from a validated
// JWT (Salesforce community user → profileId/contactId/accountId) or zid/zemail
// (Zendesk → email). Used to scope results to that user (document-level security)
// instead of the connection's static identity.
//
// Open passthrough on purpose: whatever identity fields tool-executor sends are
// spread straight into the search payload, so adding a new field there never
// requires a su-mcp schema change / redeploy. The SearchUnify search REST API
// ignores keys it doesn't recognize.
const endUserSchema = z.object({}).passthrough();

// Exact filters (su-search 26-aug, pre-filter selections). Server-injected like `userInfo`:
// the LLM must not author them, so the description tells it not to. Shape is validated by
// su-search (400 with a per-entry reason), so it is passed through unchanged here:
//   { field, op: in|not_in|range|preset|path|exists, values|value|gte|gt|lte|lt, objects? }
//   { any: [...] } / { all: [...] }  (nestable 3 deep, 50 conditions max)
// createContext / contextConfig (su-search 26-aug, context-on-request). su-search sanitizes
// contextConfig and drops bad values (never a 400), so it is passed through as-is.
const contextConfigSchema = z.object({}).passthrough();

// Drop undefined/empty-string values so unset optional params never reach the API.
const definedOnly = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));

const filtersSchema = z.array(z.object({}).passthrough());

// Failures come back as an SDK `Response(false, axiosError)` (e.g. 400 InvalidFiltersError) or as
// a 200 envelope carrying `statusCode >= 400`. Surface the reason instead of an empty result.
const searchFailureText = (res) => {
  const http = res?.message?.response;
  const body = http?.data;
  // su-search answers an invalid `filters` with a 200 envelope whose SDK-unwrapped `data` is
  // `{ filters: [{ index, reason }] }`; an HTTP 400 carries the same under `response.data.data`.
  const entries = body?.data?.filters ?? (res?.data?.result ? undefined : res?.data?.filters);
  if (Array.isArray(entries) && entries.length) {
    return `Search rejected the filters: ${entries.map((e) => (e.index === null || e.index === undefined ? e.reason : `[${e.index}] ${e.reason}`)).join("; ")}`;
  }
  if (http) return `Search failed (HTTP ${http.status}): ${body?.message || body?.error || "no details"}`;
  const code = res?.data?.statusCode;
  if (typeof code === "number" && code >= 400) {
    return `Search failed (statusCode ${code}): ${typeof res.message === "string" ? res.message : "no details"}`;
  }
  return null;
};

// Spread the end-user identity into the search REST params. Falls back to the
// connection's config email only when the end user didn't supply one (guest/
// unauth), so search keeps working. End-user fields win over config.
const buildEndUserParams = (userInfo, configEmail) => {
  const u = userInfo && typeof userInfo === "object" ? userInfo : {};
  const params = { ...u };
  if (!params.email && configEmail) params.email = configEmail;

  return params;
};

const initializeSearchTools = async ({ server, creds, getCreds }) => {
  const credsForRequest = async () => (getCreds ? await getCreds() : creds);
  server.tool("search", "Get relevant search results for a search query using SearchUnify. Optionally pass aggregations (facets) from get-filter-options to filter results.", {
    searchString: z.string().min(3).max(100).optional().describe("Search query (3–100 characters). Required unless exactPhrase, withOneOrMore or withoutTheWords is used; SearchUnify rejects those combined with a search query, so it is ignored when they are set."),
    aggregations: z.array(aggregationSchema).optional().describe("optional list of facet filters (e.g. from get-filter-options) to narrow results by category, source, etc."),
    page: z.number().int().min(1).max(100).optional().describe("page number for pagination, starts from 1"),
    pageSize: z.number().int().min(1).max(100).optional().describe("number of results per page, default is 10"),
    sortBy: z.enum(["_score", "post_time"]).optional().describe("field to sort results by, e.g. _score or post_time"),
    versionResults: z.boolean().default(false).optional().describe("Whether to use versioning for results. Defaults to false."),
    facets: z.boolean().optional().describe("Set to false to skip facet counts for a faster response; results are identical. Defaults to true."),
    filters: filtersSchema.optional().describe("Server-injected exact filters applied before ranking; do not populate from user input."),
    exactPhrase: z.string().optional().describe("Advanced search: results must contain this exact phrase. Use instead of searchString."),
    withOneOrMore: z.string().optional().describe("Advanced search: results must contain at least one of these words. Use instead of searchString."),
    withAllTheWords: z.string().optional().describe("Advanced search: results must contain all of these words."),
    allWordsSearchs: z.string().optional().describe("Advanced search: all-words query string (same semantics as the SearchUnify API field)."),
    withoutTheWords: z.string().optional().describe("Advanced search: results must not contain these words. Use instead of searchString."),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD").optional().describe("Only results from this date onward (YYYY-MM-DD)."),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD").optional().describe("Only results up to this date (YYYY-MM-DD)."),
    language: z.string().optional().describe("Search language code, e.g. en. Defaults to the search client's default."),
    mergeSources: z.boolean().optional().describe("Merge results from multiple content sources into one list."),
    createContext: z.boolean().optional().describe("Ask SearchUnify to build the LLM context for this request even if GPT is not enabled on the search client. Does not change the MCP output."),
    contextConfig: contextConfigSchema.optional().describe("Per-request context build settings: contextCreationType, type, order, fragmentSize, numberOfFragments, resultsToConsider, llmContextWordLimit, wordLimitPerDocument, wordLimitPerField. Invalid or out-of-range values are dropped by SearchUnify, never rejected."),
    uid: z.string().uuid().optional().describe("Optional search client UUID override. Required for ecosystem-only configs."),
    userInfo: endUserSchema.optional().describe("Server-injected end-user identity for document-level security; do not populate from user input."),
    // sortOrder: z.enum(["asc", "desc"]).optional().describe("sort order for results, asc or desc"),
  }, searchToolAnnotations, async ({ searchString, aggregations, page, pageSize, sortBy, versionResults, facets, filters, exactPhrase, withOneOrMore, withAllTheWords, allWordsSearchs, withoutTheWords, startDate, endDate, language, mergeSources, createContext, contextConfig, uid, userInfo }) => {
    const c = await credsForRequest();
    if (!c) {
      log(`[Search] unauthenticated — query: "${searchString}"`);
      return { content: [{ type: "text", text: "Not authenticated. Please call the login tool first." }] };
    }
    const effectiveUid = uid?.trim() || c.config.uid;
    if (!effectiveUid) {
      return { content: [{ type: "text", text: "Search requires a search client UUID. Your MCP auth is configured with an ecosystem UUID. Pass the 'uid' parameter with a search client UUID (use 'get-search-clients' to find available ones)." }] };
    }
    // su-search answers 400 when exactPhrase / withOneOrMore / withoutTheWords come with a
    // non-empty searchString (advanced search is clause-only), so blank it in that case.
    const advanced = [exactPhrase, withOneOrMore, withoutTheWords].some((v) => typeof v === "string" && v.trim() !== "");
    if (!advanced && !searchString) {
      return { content: [{ type: "text", text: "searchString is required (3–100 characters) unless exactPhrase, withOneOrMore or withoutTheWords is provided." }], isError: true };
    }
    if (advanced) searchString = "";
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
      // Omitted unless set, so requests without them are byte-identical to before.
      ...(facets === false ? { facets: false } : {}),
      ...(filters?.length ? { filters } : {}),
      ...(createContext ? { createContext: true } : {}),
      ...(contextConfig && Object.keys(contextConfig).length ? { contextConfig } : {}),
      ...(mergeSources ? { mergeSources: true } : {}),
      ...definedOnly({ exactPhrase, withOneOrMore, withAllTheWords, allWordsSearchs, withoutTheWords, startDate, endDate, language }),
      ...buildEndUserParams(userInfo, c.config.email),
   };

    if (aggregations?.length) {
      requestParams.aggregations = aggregations.map((a) => ({ type: a.type, filter: [a.filter] }));
    }

    const effectiveEmail = requestParams.email;
    const maskedEmail = effectiveEmail ? `${effectiveEmail[0]}****@${effectiveEmail.split('@')[1]}` : '(none)';
    log(`[Search] query: ${JSON.stringify(searchString)} aggregations: ${JSON.stringify(aggregations ?? [])} uid: ${effectiveUid} email: ${maskedEmail} endUser: ${userInfo?.email ? 'yes' : 'no'}`);
    const searchResponse = await Search.getSearchResults(requestParams);

    const failure = searchFailureText(searchResponse);
    if (failure) {
      log(`[Search] ${failure} — query: "${searchString}"`);
      return { content: [{ type: "text", text: failure }], isError: true };
    }
    if(!searchResponse?.data){
      log(`[Search] API error — query: "${searchString}", response: ${JSON.stringify(searchResponse)}`);
      return { content: [{ type: "text", text: "some error occured while searching, response is empty" }], isError: true };
    }
    const gptActive = searchResponse?.data?.searchClientSettings?.gptConfig?.gptActive;
    log(`[Search] gptActive: ${gptActive}`);
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
    "Get available filter/facet options for a search query using SearchUnify. Uses the same search API; returns aggregationsArray (e.g. Index, Sources, Categories) with their values and counts. Omit searchString (or pass \"\") to list all available filter options unscoped. Optionally pass current aggregations to get options for a filtered search.",
    {
      searchString: z.string().max(100).optional().default("").describe("optional search query to scope the returned filter options; omit or pass \"\" to list all available filters"),
      aggregations: z.array(aggregationSchema).optional().describe("optional list of current filters to get filter options in context of filtered results"),
      uid: z.string().uuid().optional().describe("Optional search client UUID override. Required for ecosystem-only configs."),
      filters: filtersSchema.optional().describe("Server-injected exact filters applied before ranking; do not populate from user input."),
      userInfo: endUserSchema.optional().describe("Server-injected end-user identity for document-level security; do not populate from user input."),
    },
    getFilterOptionsToolAnnotations,
    async ({ searchString = "", aggregations, filters, uid, userInfo }) => {
      const c = await credsForRequest();
      if (!c) {
        log(`[FilterOptions] unauthenticated — query: "${searchString}"`);
        return { content: [{ type: "text", text: "IMPORTANT: Not authenticated. You MUST call the 'login' tool first to get a login link for the user. Do not ask the user to go to settings — use the login tool." }] };
      }
      const effectiveUid = uid?.trim() || c.config.uid;
      if (!effectiveUid) {
        return { content: [{ type: "text", text: "Search requires a search client UUID. Your MCP auth is configured with an ecosystem UUID. Pass the 'uid' parameter with a search client UUID (use 'get-search-clients' to find available ones)." }] };
      }
      log(`[FilterOptions] query: "${searchString}" uid: ${effectiveUid} endUser: ${userInfo?.email ? 'yes' : 'no'}`);
      const Search = c.suRestClient.Search();
      const requestParams = { uid: effectiveUid, searchString, ...(filters?.length ? { filters } : {}), ...buildEndUserParams(userInfo, c.config.email) };
      if (aggregations?.length) {
        requestParams.aggregations = aggregations.map((a) => ({ type: a.type, filter: [a.filter] }));
      }
      const searchResponse = await Search.getSearchResults(requestParams);

      const failure = searchFailureText(searchResponse);
      if (failure) {
        log(`[FilterOptions] ${failure}`);
        return { content: [{ type: "text", text: failure }], isError: true };
      }
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

export { initializeSearchTools, searchFailureText };