import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { validateCreds } from "./validations.js";
import { formatForClaude, formatArraysToString } from "./utils.js";

// Create server instance
const server = new McpServer({
    name: "searchunify",
    version: "1.0.0",
    capabilities: {
        resources: {},
          tools: {},
    },
});

let creds;

server.tool("search", "Get relevant search results for a search query using SearchUnify", {
    searchString: z.string().min(3).max(100).describe("search query, its a string can be a single word or a sentence"),
}, async ({ searchString }) => {
    
    const Search = creds.suRestClient.Search();
    const searchResponse = await Search.getSearchResults({ uid: creds.config.uid, searchString});

    if(!searchResponse?.data){
      return {
        type: 'text',
        json: 'some error occured while searching, response is empty'
      }
    }
    const gptActive = searchResponse?.data?.searchClientSettings?.gptConfig?.gptActive;
    console.error('gptActive',gptActive);
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


async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  creds = validateCreds();
  console.error("SearchUnify MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});