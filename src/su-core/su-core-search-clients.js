import { formatForClaude } from "./../utils.js";
import { getSearchClientsToolAnnotations } from "../tool-annotations-meta.js";

const initializeSearchClientsTools = async ({ server, creds, getCreds }) => {
  const credsForRequest = async () => (getCreds ? await getCreds() : creds);

  server.tool(
    "get-search-clients",
    "Get list of all search clients configured in the SearchUnify instance. Returns minimal info: id, name, and uid for each search client.",
    {},
    getSearchClientsToolAnnotations,
    async () => {
      const c = await credsForRequest();
      if (!c) return { content: [{ type: "text", text: "IMPORTANT: Not authenticated. You MUST call the 'login' tool first to get a login link for the user. Do not ask the user to go to settings — use the login tool." }] };
      const SearchClients = c.suRestClient.SearchClients();
      const response = await SearchClients.getSearchClients();

      if (!response?.data) {
        return { type: "text", text: "Error: no data in search clients response." };
      }

      return formatForClaude(response.data);
    }
  );
}

export { initializeSearchClientsTools };
