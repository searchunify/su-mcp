import { z } from "zod";
import { formatForClaude } from "./../utils.js";

const reportTypes = {
  searchQueryWithNoClicks: "searchQueryWithNoClicks",
  searchQueryWithResult: "searchQueryWithResult",
  searchQueryWithoutResults: "searchQueryWithoutResults",
  getAllSearchQuery: "getAllSearchQuery",
  getAllSearchConversion: "getAllSearchConversion",
  averageClickPosition: "averageClickPosition",
  sessionDetails: "sessionDetails"
};

const initializeAnalyticsTools = async ({ server, creds, getCreds }) => {
  const c = () => (getCreds ? getCreds() : creds);
  server.tool("analytics", "get analytics reports data from searchunify", {
    reportType: z.enum(Object.values(reportTypes)).describe("type of analytics report to fetch data from"),
    startDate: z.string().describe("start date of the report"),
    endDate: z.string().describe("end date of the report"),
    count: z.number().min(1).max(500).describe("number of records to be fetched (1-500)"),
    sessionId: z.string().optional().describe("optional session id filter for sessionDetails report"),
    pageNumber: z.number().min(1).max(10).optional().describe("page number for the 4 search classification reports (max 10 in MCP)"),
    startIndex: z.number().min(1).max(10).optional().describe("pagination page for sessionDetails / session log all (max 10 in MCP); maps to API startIndex"),
    sortByField: z
      .enum(["count", "click", "search", "case", "support", "end_date", "start_date"])
      .optional()
      .describe(
        "Sort field: for search-classification reports use count (query frequency). For sessionDetails the API expects click (conversions), search, case, support, end_date, or start_date — if you pass count here it is sent as click."
      ),
    sortType: z.enum(["asc", "desc"]).optional().describe("sort direction; defaults to desc where applicable"),
  }, async ({ reportType, startDate, endDate, count, sessionId, pageNumber, startIndex, sortByField, sortType }) => {
    const credsForRequest = c();
    const Analytics = credsForRequest.suRestClient.Analytics();
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
        analyticsResponse = await Analytics.getAverageClickPosition({ searchClientId: credsForRequest.config.uid, startDate, endDate, count });
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
