import { z } from "zod";
import { formatForClaude } from "./../utils.js";

const reportTypes = {
  searchQueryWithNoClicks: "searchQueryWithNoClicks",
  searchQueryWithResult: "searchQueryWithResult",
  searchQueryWithoutResults: "searchQueryWithoutResults",
  getAllSearchQuery: "getAllSearchQuery",
  getAllSearchConversion: "getAllSearchConversion"
};

const initializeAnalyticsTools = async ({ server, creds }) => {
  server.tool("analytics", "get analytics reports data from searchunify", {
    reportType: z.enum(Object.values(reportTypes)).describe("type of analytics report to fetch data from"),
    startDate: z.string().describe("start date of the report"),
    endDate: z.string().describe("end date of the report"),
    count: z.number().describe("number of records to be fetched"),

  }, async ({ reportType, startDate, endDate, count }) => {
    const Analytics = creds.suRestClient.Analytics();
    let analyticsResponse = {};
    switch(reportType){
      case reportTypes.searchQueryWithNoClicks:
        console.error('searchQueryWithNoClicks triggered');
        analyticsResponse = await Analytics.searchQueryWithNoClicks({ searchClientId: creds.config.uid, startDate, endDate, count });
        break;
      case reportTypes.searchQueryWithResult:
        console.error('searchQueryWithResult triggered');
        analyticsResponse = await Analytics.searchQueryWithResult({ searchClientId: creds.config.uid, startDate, endDate, count });
        break;
      case reportTypes.searchQueryWithoutResults:
        console.error('searchQueryWithoutResults triggered');
        analyticsResponse = await Analytics.searchQueryWithoutResults({ searchClientId: creds.config.uid, startDate, endDate, count });
        break;
      case reportTypes.getAllSearchQuery:
        console.error('getAllSearchQuery triggered');
        analyticsResponse = await Analytics.getAllSearchQuery({ searchClientId: creds.config.uid, startDate, endDate, count });
        break;
      case reportTypes.getAllSearchConversion:
        console.error('getAllSearchConversion triggered');
        analyticsResponse = await Analytics.getAllSearchConversion({ searchClientId: creds.config.uid, startDate, endDate, count });
        break;
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
