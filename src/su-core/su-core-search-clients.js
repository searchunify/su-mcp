import { formatForClaude } from "./../utils.js";

const initializeSearchClientsTools = async ({ server, creds, getCreds }) => {
  const credsForRequest = () => (getCreds ? getCreds() : creds);

  server.tool(
    "get-search-clients",
    "Get list of all search clients configured in the SearchUnify instance. Returns minimal info: id, name, and uid for each search client.",
    {},
    async () => {
      const c = credsForRequest();
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
