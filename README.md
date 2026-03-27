# SearchUnify MCP Server (`su-mcp`)

The SearchUnify MCP Server (`su-mcp`) is a lightweight middleware built on the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) that enables secure, seamless integration between [SearchUnify Cognitive Search](https://www.searchunify.com/) and AI assistants such as Claude Desktop, Cursor, and any other MCP-compatible client.  
By leveraging [su-sdk-js](https://www.npmjs.com/package/su-sdk), this server exposes enterprise search and analytics capabilities as MCP tools, allowing LLMs to invoke context-aware search queries, retrieve analytics reports, and power intelligent workflows directly within external environments.

---

## Features

- **LLM-Integrated Enterprise Search** -- Power GenAI tools like Claude with context-aware, enterprise-grade search from SearchUnify, enabling more relevant, trusted, and explainable responses.
- **Search Analytics** -- Retrieve analytics reports (top queries, zero-result queries, conversion data, and more) directly through AI assistants.
- **Faceted Filtering** -- Discover and apply facet/filter options to narrow search results by category, source, index, and other dimensions.
- **Multiple Authentication Methods** -- Supports API Key, OAuth 2.0 Password Grant, and Client Credentials Grant for flexible, enterprise-grade security.
- **Dual Transport** -- Runs over **stdio** (for local tools like Claude Desktop) or **HTTP** (Streamable HTTP for remote/cloud clients), or both simultaneously.
- **Plug-and-Play Deployment** -- Docker-based setup for rapid configuration, portability, and scalability across environments.

---

## Tools

The MCP server exposes **4 tools** that AI assistants can invoke:

### 1. `search`

Performs a search query against your SearchUnify instance and returns relevant results.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `searchString` | `string` | Yes | The search query (3-100 characters). Can be a single word or a sentence. |
| `aggregations` | `array` | No | List of facet filters (from `get-filter-options`) to narrow results by category, source, etc. Each item has `type` (string) and `filter` (string). |
| `page` | `integer` | No | Page number for pagination (1-100). Defaults to `1`. |
| `pageSize` | `integer` | No | Number of results per page (1-100). Defaults to `10`. |
| `sortBy` | `string` | No | Field to sort results by. Allowed values: `_score` (relevance) or `post_time` (date). |
| `versionResults` | `boolean` | No | Whether to use versioning. Defaults to `false`. |

**Aggregation object schema:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Aggregation/facet type (e.g. `documentation_category`, `_index`). |
| `filter` | `string` | Selected filter value (e.g. `Search Clients`). |

**Behavior:**
- If the SearchUnify search client has GPT enabled, the tool returns enriched GPT context with links and descriptions.
- Otherwise, it returns standard search hits with title, summary, and URL.
- HTML tags are automatically stripped from results.

---

### 2. `get-filter-options`

Retrieves available filter/facet options for a search query. Use this tool first to discover what filters are available, then pass the desired filters into the `search` tool.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `searchString` | `string` | Yes | The search query (3-100 characters). A single word or sentence. |
| `aggregations` | `array` | No | Optional list of currently applied filters, to get contextual filter options for a filtered search. Same schema as `search`. |

**Returns:** An array of aggregation groups, each containing:

| Field | Description |
|-------|-------------|
| `key` | Internal key for the aggregation (e.g. `_index`, `documentation_category`). |
| `label` | Display label for the aggregation. |
| `order` | Sort order of the aggregation. |
| `values` | Array of filter values, each with `displayName`, `value`, and `contentName`. |

---

### 3. `analytics`

Retrieves analytics reports from SearchUnify.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reportType` | `string` (enum) | Yes | Type of analytics report. See supported values below. |
| `startDate` | `string` | Yes | Start date of the report period. |
| `endDate` | `string` | Yes | End date of the report period. |
| `count` | `number` | Yes | Number of records to fetch. |

**Supported `reportType` values:**

| Value | Description |
|-------|-------------|
| `searchQueryWithNoClicks` | Search queries that returned results but received no clicks. |
| `searchQueryWithResult` | Search queries that returned results. |
| `searchQueryWithoutResults` | Search queries that returned zero results. |
| `getAllSearchQuery` | All search queries. |
| `getAllSearchConversion` | All search conversion data. |
| `averageClickPosition` | Average click position data per search query. Returns ACP, click count, search count, and session count. |
| `sessionDetails` | Session activity logs including page views, searches, conversions, and case events. |

---

### 4. `get-search-clients`

Lists all search clients configured in the SearchUnify instance. Returns minimal information for each search client. No parameters required -- the tenant is derived from the authentication credentials.

**Returns:** An array of search clients, each containing:

| Field | Description |
|-------|-------------|
| `id` | Search client ID. |
| `name` | Search client name. |
| `uid` | Search client unique identifier (UUID). |
| `search_client_type` | Type of search client (e.g. Web App, Salesforce, etc.). Available on instances running admin v25-nov or later. |

---

## Prerequisites

- A [SearchUnify](https://www.searchunify.com/) account with:
  - A valid instance URL
  - Authentication credentials (API Key **or** OAuth 2.0 credentials)
  - A Search Client UID (found in SearchUnify admin panel under Search Clients, or use the `get-search-clients` tool to list all available UIDs)
  - API scopes enabled (set scope to "All" for full access, or enable specific scopes for search, analytics, and content operations)
- [Docker](https://www.docker.com/) installed (for Docker-based deployment)
- An MCP-compatible client (e.g. Claude Desktop, Cursor)

---

## Authentication Methods

The server supports three authentication methods:

### 1. API Key

The simplest method. Requires an API key generated from your SearchUnify instance.

### 2. OAuth 2.0 Password Grant

Requires username, password, client ID, and client secret. Best for user-specific access.

### 3. OAuth 2.0 Client Credentials Grant

Requires client ID and client secret only. Best for service-to-service access without a specific user context.

---

## MCP Transports

The server supports two transport mechanisms and can run them simultaneously.

| Environment Variable | Values | Default | Description |
|----------------------|--------|---------|-------------|
| `MCP_TRANSPORT` | `stdio`, `http`, `both` | `both` | Which transport(s) to start. |
| `MCP_HTTP_PORT` | number | `3000` | Port for the HTTP transport (when mode is `http` or `both`). |

### stdio Transport

- Used by local MCP clients such as Claude Desktop.
- Communicates over stdin/stdout.
- No additional configuration needed.

### HTTP Transport (Streamable HTTP)

- Used by remote or cloud-based MCP clients.
- Exposes a Streamable HTTP endpoint at `http://localhost:<MCP_HTTP_PORT>`.
- Clients send JSON-RPC requests via POST; SSE streaming is supported via GET.
- Runs in stateless mode so multiple clients can connect and initialize concurrently.
- Credentials can be provided per-request via HTTP headers (see below) or fall back to `creds.json`.

### Running Both Transports

Set `MCP_TRANSPORT=both` to serve stdio and HTTP simultaneously on the same process.

```bash
# HTTP only on port 4000
MCP_TRANSPORT=http MCP_HTTP_PORT=4000 node src/index.js

# Both stdio and HTTP on default port 3000
MCP_TRANSPORT=both node src/index.js
```

---

## Integration Types

### Integration 1: Docker with `creds.json` (stdio)

This is the traditional local setup using Docker and a credentials file.

#### Step 1 -- Create `creds.json`

Choose one of the following formats based on your authentication method:

**API Key authentication:**

```json
{
  "instance": "<searchunify_instance_url>",
  "timeout": 60000,
  "authType": "apiKey",
  "apiKey": "<your_api_key>",
  "uid": "<search_client_uid>"
}
```

**Password authentication:**

```json
{
  "instance": "<searchunify_instance_url>",
  "timeout": 60000,
  "authType": "password",
  "oauth2": {
    "username": "<your_email>",
    "password": "<your_password>",
    "clientId": "<your_client_id>",
    "clientSecret": "<your_client_secret>"
  },
  "uid": "<search_client_uid>"
}
```

**Client Credentials authentication:**

```json
{
  "instance": "<searchunify_instance_url>",
  "timeout": 60000,
  "authType": "clientCredentials",
  "oauth2": {
    "clientId": "<your_client_id>",
    "clientSecret": "<your_client_secret>"
  },
  "uid": "<search_client_uid>"
}
```

#### Step 2 -- Configure Claude Desktop

Locate the Claude Desktop configuration file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the following entry to the `mcpServers` section:

```json
{
  "mcpServers": {
    "su-mcp": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "<path_to_creds.json>:/app/src/input/creds.json:ro",
        "searchunifyutils/su-mcp"
      ]
    }
  }
}
```

Replace `<path_to_creds.json>` with the absolute path to your `creds.json` file.

> **Docker Image Tags:** Use `searchunifyutils/su-mcp` (defaults to `latest`) or pin a specific version with `searchunifyutils/su-mcp:1.1.0`. Available tags are published on [Docker Hub](https://hub.docker.com/r/searchunifyutils/su-mcp).

#### Step 3 -- Restart Claude Desktop

Fully quit (**Cmd+Q** on macOS) and reopen Claude Desktop to apply the updated configuration.

---

### Integration 2: Local Node.js (stdio)

Run the MCP server directly with Node.js without Docker. Requires **Node.js 18+** (Node 20+ recommended) and a `creds.json` file.

#### Step 1 -- Clone and install

```bash
git clone https://github.com/searchunify/su-mcp.git
cd su-mcp
npm install
```

#### Step 2 -- Create credentials file

Create `src/input/creds.json` with your credentials (see Integration 1, Step 1 for format options).

#### Step 3 -- Configure Claude Desktop

```json
{
  "mcpServers": {
    "su-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/su-mcp/src/index.js"
      ],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

Replace `/absolute/path/to/su-mcp` with the actual path where you cloned the repository.

> **Note:** Setting `MCP_TRANSPORT` to `stdio` is recommended for local Claude Desktop usage. If omitted, the default is `both`, which also starts an HTTP server on port 3000.

#### Step 4 -- Restart Claude Desktop

Fully quit (Cmd+Q on macOS) and reopen Claude Desktop to apply the updated configuration.

---

### Integration 3: Remote HTTP via `mcp-remote` (Streamable HTTP)

For connecting to a remotely hosted SearchUnify MCP server over HTTP, use [`mcp-remote`](https://www.npmjs.com/package/mcp-remote). Credentials are passed as HTTP headers on every request -- no local `creds.json` is needed. To run su-mcp via mcp-remote **node version 24** is required on the machine.

#### Claude Desktop Configuration

Add the following to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "su-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.searchunify.com/mcp",
        "--header",
        "searchunify-instance:<searchunify_instance_url>",
        "--header",
        "searchunify-timeout:60000",
        "--header",
        "searchunify-auth-type:<apiKey|password|clientCredentials>",
        "--header",
        "searchunify-api-key:<your_api_key>",
        "--header",
        "searchunify-uid:<search_client_uid>"
      ]
    }
  }
}
```

#### HTTP Header Reference

All header names use the `searchunify-` prefix (lowercase):

| Header | Required | Description |
|--------|----------|-------------|
| `searchunify-instance` | Yes | Your SearchUnify instance URL (e.g. `https://your-instance.searchunify.com`). |
| `searchunify-uid` | Yes | Search Client UID. |
| `searchunify-auth-type` | Yes | Authentication method: `apiKey`, `password`, or `clientCredentials`. |
| `searchunify-timeout` | No | Request timeout in milliseconds. Defaults to `60000`. |

**Additional headers by auth type:**

| Auth Type | Additional Headers |
|-----------|-------------------|
| `apiKey` | `searchunify-api-key` -- Your API key. |
| `password` | `searchunify-oauth-username`, `searchunify-oauth-password`, `searchunify-oauth-client-id`, `searchunify-oauth-client-secret` |
| `clientCredentials` | `searchunify-oauth-client-id`, `searchunify-oauth-client-secret` |

> **Note:** When HTTP headers are present and valid, they take priority over any `creds.json` file on the server. If headers are missing or incomplete, the server falls back to `creds.json`.

#### Example: API Key Authentication via `mcp-remote`

```json
{
  "mcpServers": {
    "su-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.searchunify.com/mcp",
        "--header",
        "searchunify-instance:https://your-instance.searchunify.com",
        "--header",
        "searchunify-timeout:60000",
        "--header",
        "searchunify-auth-type:apiKey",
        "--header",
        "searchunify-api-key:<your_api_key>",
        "--header",
        "searchunify-uid:<search_client_uid>"
      ]
    }
  }
}
```

#### Example: Password Authentication via `mcp-remote`

```json
{
  "mcpServers": {
    "su-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.searchunify.com/mcp",
        "--header",
        "searchunify-instance:https://your-instance.searchunify.com",
        "--header",
        "searchunify-timeout:60000",
        "--header",
        "searchunify-auth-type:password",
        "--header",
        "searchunify-oauth-username:<your_email>",
        "--header",
        "searchunify-oauth-password:<your_password>",
        "--header",
        "searchunify-oauth-client-id:<your_client_id>",
        "--header",
        "searchunify-oauth-client-secret:<your_client_secret>",
        "--header",
        "searchunify-uid:<search_client_uid>"
      ]
    }
  }
}
```

#### Example: Client Credentials Authentication via `mcp-remote`

```json
{
  "mcpServers": {
    "su-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.searchunify.com/mcp",
        "--header",
        "searchunify-instance:https://your-instance.searchunify.com",
        "--header",
        "searchunify-timeout:60000",
        "--header",
        "searchunify-auth-type:clientCredentials",
        "--header",
        "searchunify-oauth-client-id:<your_client_id>",
        "--header",
        "searchunify-oauth-client-secret:<your_client_secret>",
        "--header",
        "searchunify-uid:<search_client_uid>"
      ]
    }
  }
}
```

---

## Testing the MCP Server

A test client script is provided at `scripts/test-mcp-client.js` to verify the server works correctly.

**Test stdio** (spawns the server process; requires `src/input/creds.json`):

```bash
npm run test:stdio
# or
node scripts/test-mcp-client.js stdio
```

**Test HTTP** (server must already be running in another terminal):

```bash
# Terminal 1 -- Start the server
MCP_TRANSPORT=http node src/index.js

# Terminal 2 -- Run the test client
npm run test:http
# or
node scripts/test-mcp-client.js http
```

Use `MCP_HTTP_URL` to connect to a different URL:

```bash
MCP_HTTP_URL=http://localhost:4000 node scripts/test-mcp-client.js http
```

The test client connects, lists all available tools, pings the server, and optionally calls the `search` and `get-filter-options` tools with sample queries.

**Unit tests** (no credentials needed):

```bash
npm test
```

Runs validation and module import tests for all tools.

---

## Project Structure

```
su-mcp/
├── Dockerfile                  # Docker image definition (Node 24 Alpine, default transport: both)
├── package.json                # Dependencies and scripts (su-sdk ^2.1.0)
├── test/
│   └── test-new-tools.js       # Unit tests for new tools
├── scripts/
│   └── test-mcp-client.js      # Test client for stdio and HTTP
└── src/
    ├── index.js                # Entry point -- transport setup (stdio/HTTP)
    ├── tools.js                # Tool initialization orchestrator
    ├── utils.js                # Response formatting utilities
    ├── validations.js          # Credential validation and header parsing
    ├── input/
    │   └── creds.json          # Credentials file (user-provided, not in repo)
    └── su-core/
        ├── index.js                  # Core tools initializer
        ├── su-core-search.js         # search and get-filter-options tools
        ├── su-core-analytics.js      # analytics tool
        └── su-core-search-clients.js # get-search-clients tool
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Docker Not Found** | Ensure Docker is installed and added to your system's PATH. |
| **Invalid Credentials** | Double-check values in `creds.json` or HTTP headers. |
| **Missing API Scopes** | Ensure the client and user have the required search and analytics scopes enabled in your SearchUnify instance. |
| **Connection Refused (HTTP)** | Verify the server is running with `MCP_TRANSPORT=http` and the port matches. |
| **mcp-remote not found** | Run `npx mcp-remote` (it will be fetched automatically) or install it globally with `npm install -g mcp-remote`. |

---

## License

This project is licensed under the BSD 2-Clause License.  
See the [LICENSE](LICENSE) file for details.

For more information, visit [SearchUnify](https://www.searchunify.com/) or check out the [su-sdk-js](https://www.npmjs.com/package/su-sdk) documentation.
