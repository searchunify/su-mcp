import { formatForClaude } from "./../utils.js";

const initializeSearchClientsTools = async ({ server, creds, getCreds }) => {
  const credsForRequest = async () => (getCreds ? await getCreds() : creds);

  server.tool(
    "get-search-clients",
    "Get list of all search clients configured in the SearchUnify instance. Returns minimal info: id, name, and uid for each search client.",
    {},
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async () => {
      const c = await credsForRequest();
      if (!c) return { content: [{ type: "text", text: "Not authenticated. Please call the login tool first." }] };
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
