import { z } from "zod";
import { formatForClaude } from "./../utils.js";


const initializeAnalyticsTools = async ({ server, creds }) => {
  server.tool("searches-with-no-clicks", "get analytics report data of searches with no clicks in defined period", {
    startDate: z.string().describe("start date of the report"),
    endDate: z.string().describe("end date of the report"),
    count: z.number().describe("number of searches to be fetched")
  }, async ({ startDate, endDate, count }) => {
    const Analytics = creds.suRestClient.Analytics();
    const analyticsResponse = await Analytics.searchQueryWithNoClicks({ searchClientId: creds.config.uid, startDate, endDate, count: 100 });

    if(!analyticsResponse?.data){
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
