# SearchUnify MCP Server (`su-mcp`)

The SearchUnify MCP Server (`su-mcp`) is a lightweight middleware built on the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) that enables secure, seamless integration between [SearchUnify Cognitive Search](https://www.searchunify.com/) and AI assistants such as Claude Desktop, Cursor, and any other MCP-compatible client.  
By leveraging [su-sdk-js](https://www.npmjs.com/package/su-sdk), this server exposes enterprise search and analytics capabilities as MCP tools, allowing LLMs to invoke context-aware search queries, retrieve analytics reports, and power intelligent workflows directly within external environments.

---

## Features

- **LLM-Integrated Enterprise Search** -- Power GenAI tools like Claude with context-aware, enterprise-grade search from SearchUnify, enabling more relevant, trusted, and explainable responses.
- **Search Analytics** -- Retrieve analytics reports (top queries, zero-result queries, conversion data, and more) directly through AI assistants. The MCP server sets `sendMcpConsumptionTrack: true` on the SDK so analytics HTTP calls include `X-SearchUnify-MCP-Track: 1` for daily usage tracking in the analytics service (documented in the analytics repo under `docs/mcp-consumption-tracking.md`).
- **Faceted Filtering** -- Discover and apply facet/filter options to narrow search results by category, source, index, and other dimensions.
- **Multiple Authentication Methods** -- Supports API Key, OAuth 2.0 Password Grant, Client Credentials Grant, and tool-based login (link-in-chat) for flexible, enterprise-grade security.
- **Dual Transport** -- Runs over **stdio** (for local tools like Claude Desktop) or **HTTP** (Streamable HTTP for remote/cloud clients), or both simultaneously.
- **Plug-and-Play Deployment** -- Docker-based setup for rapid configuration, portability, and scalability across environments.

---

## Tools

The MCP server exposes **6 tools** that AI assistants can invoke:

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

### 2. `login`

> **Only available on the `/mcp-connect` endpoint.** Not present on the standard OAuth or header-based endpoints.

Initiates the tool-based login flow for environments where the browser cannot auto-open (e.g. some Claude Desktop setups). Returns a clickable link to the SearchUnify connection form. The user opens the link manually, fills in their instance details, and logs in — after which all other tools become available.

No parameters required.

**Returns:** A markdown link to the connection form, e.g.:

```
Please present this login link to the user so they can connect their SearchUnify instance:

[Connect SearchUnify](https://mcp.searchunify.com/mcp-connect/login?s=<session_id>)

If your client supports clickable links, render the markdown above. Otherwise show the plain URL so the user can copy it: https://mcp.searchunify.com/mcp-connect/login?s=<session_id>

After the user completes login in their browser, let them know you are ready to continue.
```

---

### 3. `get-filter-options`

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

### 4. `analytics`

Retrieves analytics reports from SearchUnify (Overview, Conversions, Content, Sessions, and **Leadership**). Calls go through the SDK to **`POST /api/v2/...`** on your admin instance. MCP sets `X-SearchUnify-MCP-Track: 1` for consumption tracking.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reportType` | `string` (enum) | Yes | Report identifier. See tool schema for the full enum (Overview, Conversions, Leadership, etc.). |
| `startDate` | `string` | Usually | Start date (`YYYY-MM-DD`). **Ignored** for Leadership volume charts — they always use last six quarters. |
| `endDate` | `string` | Usually | End date (`YYYY-MM-DD`). **Ignored** for Leadership volume charts. |
| `count` | `number` | Usually | Row limit where the underlying API supports it. |
| `uid` / `ecoSystemId` | `string` | Varies | Search client or ecosystem scope (mutually exclusive where required). |
| `internalUser` | `string` | No | `all`, `internal`, `external`, or `externalOnly` (Leadership / Conversions). |
| `directlyViewSetting` | `boolean` | No | **USSV only** (`leadershipUnassistedSelfSolveVolume`). Resolved from deflection settings when omitted. |

**Leadership `reportType` values** (Admin Leadership tab parity; MCP does not send custom `from`/`to`):

| `reportType` | Admin chart | Backend route |
|--------------|-------------|----------------|
| `leadershipAssistedSelfSolveVolume` | Assisted Self Solve Volume (Explicit Deflection) | `POST /api/v2/leadership/assisted-self-solve-volume` |
| `leadershipUnassistedSelfSolveVolume` | Unassisted Self Solve Volume (Implicit Deflection) | `POST /api/v2/leadership/unassisted-self-solve-volume` |
| `leadershipAssistedCaseVolume` | Assisted Case Volume | `POST /api/v2/leadership/assisted-case-volume` |
| `leadershipCostSavingsExplicitDeflection` | Cost Savings due to Explicit Deflection ($) — **counts only** | `POST /api/v2/leadership/deflection-count` |
| `leadershipGetContentSources` | Content source list for facets | `POST /api/v2/leadership/get-content-sources` |

**Cost savings:** `leadershipCostPerCaseUsd` in the tool schema is for documentation only; the Admin UI multiplies deflection counts by cost-per-case locally. MCP returns quarterly `explicit_deflection_count` / `implicit_deflection_count`, not USD, unless a download API is added later.

**Do not substitute** `conversionCaseDeflectionStage1` for Leadership ASSV/USSV — that is the Conversions session funnel (`global_searches`), not quarterly Leadership rollups.

**Common legacy / search query `reportType` values:**

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

### 5. `get-search-clients`

Lists all search clients configured in the SearchUnify instance. Returns minimal information for each search client. No parameters required -- the tenant is derived from the authentication credentials.

**Returns:** An array of search clients, each containing:

| Field | Description |
|-------|-------------|
| `id` | Search client ID. |
| `name` | Search client name. |
| `uid` | Search client unique identifier (UUID). |
| `search_client_type` | Type of search client (e.g. Web App, Salesforce, etc.). Available on instances running admin v25-nov or later. |

---

### 6. `executive_business_query`

Runs **Phase 1 executive** analytics recipes (Q11 traffic, Q12 search-without-click %, Q5 relevance, Q13 content gap, Q4 self-solve) by composing existing analytics HTTP APIs. Responses are JSON with **per-subcall** status so partial failures stay visible (for example **401** on auth or upstream errors).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `recipeId` | enum | Yes | `Q11_traffic`, `Q12_search_no_click_pct`, `Q5_relevance_rate`, `Q13_content_gap`, `Q4_self_solve_rate`. |
| `tenantId`, `from`, `to` | strings | Yes | Tenant UUID and date range (`YYYY-MM-DD`). |
| `uid` / `ecoId` | UUID | No | Search client or ecosystem scope (same rules as analytics APIs). |
| `includeLeadershipQuarterly` | boolean | No | Q4 only: also call **`/api/v2/leadership/*`** USSV + ASSV (same **`/api/v2/*`** auth as other analytics mirrors). |

**Docs:** [`analytics/docs/business-queries/README.md`](../analytics/docs/business-queries/README.md) (formulas, rollup checklist, orchestration).

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

The server supports two ways to authenticate, depending on the integration type:

### Direct credential auth (Integrations 2, 3, 5)

Credentials are supplied via HTTP headers or `creds.json`. Three credential types are supported:

| Method | Required fields | Best for |
|--------|----------------|----------|
| **API Key** | `apiKey` | Simplest setup; single API key from your SearchUnify instance |
| **OAuth 2.0 Password Grant** | username, password, client ID, client secret | User-specific access |
| **OAuth 2.0 Client Credentials** | client ID, client secret | Service-to-service access with no user context |

### Browser-based OAuth proxy (Integrations 1, 4)

No credentials are stored in the MCP server or Claude. The server acts as an OAuth 2.0 proxy — it opens a connection form in the user's browser, collects the SearchUnify instance details and OAuth client credentials, then delegates the actual login to the SearchUnify login page. After successful login, a short-lived Bearer token is issued to Claude for the duration of the session.

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

### Integration 1: `/mcp` — Claude Public Directory (OAuth, UI-based)

The simplest way to get started. When you add the MCP server from Claude's directory, a browser-based form opens automatically to collect your credentials. Authentication is handled via OAuth 2.0 using a proxy flow — the MCP server delegates login to your SearchUnify instance. No API keys or passwords are stored in Claude.

> **Ecosystem UID support:** The connection form accepts both search client UIDs and ecosystem UIDs in the UID field. The server automatically detects which type it is and routes API calls accordingly. If the UID is not found in your SearchUnify instance, a clear error page is shown during login.

> **Self-hosting:** If you are running your own instance of su-mcp (not using `mcp.searchunify.com`), you must also set `OAUTH_ENCRYPTION_KEY` (64-char hex, generate with `openssl rand -hex 32`), `MCP_ISSUER_URL` (public HTTPS URL of your server), and optionally `REDIS_URL` for persistent token storage before starting the server.

**OAuth proxy flow:**
```
Claude → MCP /authorize (form) → SU login page → MCP /su-callback → Bearer token issued
```

#### Step 1 — Register an OAuth Client in SearchUnify Admin

Before connecting, an OAuth client must be registered in your SearchUnify instance with the MCP server's callback URL as the `redirect_uri`.

1. Log in to your SearchUnify Admin panel
2. Navigate to **OAuth Clients** (usually under Settings or Developer)
3. Create a new OAuth client with:
   - **Name:** e.g. `Claude MCP Connector`
   - **Redirect URI:** `<MCP_ISSUER_URL>/su-callback`  
     e.g. `https://mcp.searchunify.com/su-callback`
   - **Grant Types:** `authorization_code`
   - **Scope:** `All` (or the scopes required for search and analytics)
4. Note the generated **Client ID** and **Client Secret** — users will need these when connecting

---

#### Step 2 — Add the connector in Claude

> **MCP server URL**
> ```
> https://mcp.searchunify.com/mcp
> ```
> Use this exact URL when adding the connector. The `/mcp` path is the OAuth-protected endpoint — entering just the base domain will not trigger the login flow.

**Via Claude.ai (web)**

1. Open [claude.ai](https://claude.ai) in your browser
2. Click your profile icon → **Settings**
3. Click **Connectors** in the left sidebar
4. Click **+ Add custom connector**
5. Enter the MCP server URL: `https://mcp.searchunify.com/mcp`
6. Click **Add** — a browser window opens with the SearchUnify connection form

**Via Claude Desktop**

Claude Desktop does not have a native UI for adding remote HTTP MCP servers. Use [Integration 2](#integration-2-mcp-remote--remote-http-with-header-auth) (mcp-remote via config file) or [Integration 4](#integration-4-mcp-connect--tool-based-login-link-in-chat) (mcp-connect) instead.

#### Step 3 — Complete the connection form

Once the connection form opens in your browser:

1. Enter your **SearchUnify Instance URL** — e.g. `https://your-instance.searchunify.com`
2. Enter your **Search Client UID** — found in SearchUnify Admin → Search Clients
3. Enter the **OAuth Client ID** and **OAuth Client Secret** from Step 1
4. Submit the form — you will be redirected to your SearchUnify login page
5. After login, an MCP Bearer token is issued and all tools become available in Claude

---

### Integration 2: `mcp-remote` — Remote HTTP with Header Auth

Connect to the hosted MCP server over HTTP using [`mcp-remote`](https://www.npmjs.com/package/mcp-remote). Credentials are passed as HTTP headers on every request directly in the Claude Desktop config — no browser form, no separate credentials file.

**Requires Node.js 24** on the machine running Claude Desktop.

> **Endpoint note:** Use the root URL (`https://mcp.searchunify.com/`) — not `/mcp`. On OAuth-enabled servers the `/mcp` endpoint requires a Bearer token; the root endpoint (`/`) always accepts header-based credentials for backward compatibility.

#### Claude Desktop Configuration

Locate the Claude Desktop configuration file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the following entry to the `mcpServers` section:

```json
{
  "mcpServers": {
    "su-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.searchunify.com/",
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
| `searchunify-uid` | Yes | Search Client UID. Also used for tenancy routing when `searchunify-ecosystem-id` is set. |
| `searchunify-ecosystem-id` | No | Ecosystem UUID. When set, analytics and search calls scope to the ecosystem instead of the search client. Pass alongside `searchunify-uid` (both are used). |
| `searchunify-auth-type` | Yes | Authentication method: `apiKey`, `password`, or `clientCredentials`. |
| `searchunify-timeout` | No | Per-request SDK timeout in milliseconds. Defaults to `60000`. Use **120000** or higher for `leadershipCostSavingsExplicitDeflection` on large tenants if you see Axios timeout errors. Also set in `creds.json` as `"timeout": 120000` or `SU_TIMEOUT` for OAuth flows. |

**Additional headers by auth type:**

| Auth Type | Additional Headers |
|-----------|-------------------|
| `apiKey` | `searchunify-api-key` — Your API key. |
| `password` | `searchunify-oauth-username`, `searchunify-oauth-password`, `searchunify-oauth-client-id`, `searchunify-oauth-client-secret` |
| `clientCredentials` | `searchunify-oauth-client-id`, `searchunify-oauth-client-secret` |

> **Note:** When HTTP headers are present and valid, they take priority over any `creds.json` file on the server. If headers are missing or incomplete, the server falls back to `creds.json`.

#### Example: API Key Authentication

```json
{
  "mcpServers": {
    "su-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.searchunify.com/",
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

#### Example: Password Authentication

```json
{
  "mcpServers": {
    "su-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.searchunify.com/",
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

#### Example: Client Credentials Authentication

```json
{
  "mcpServers": {
    "su-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.searchunify.com/",
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

#### Restart Claude Desktop

Fully quit (**Cmd+Q** on macOS) and reopen Claude Desktop to apply the updated configuration.

---

### Integration 3: Docker (stdio with `creds.json`)

Run the MCP server locally via Docker. The MCP config goes in the Claude Desktop config file; authentication credentials go in a separate `creds.json` file that is volume-mounted into the container.

#### Step 1 — Create `creds.json`

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

**Ecosystem UID configuration** (use when your UID is an ecosystem UUID):

```json
{
  "instance": "<searchunify_instance_url>",
  "timeout": 60000,
  "authType": "apiKey",
  "apiKey": "<your_api_key>",
  "uid": "<search_client_or_ecosystem_uid>",
  "ecoSystemId": "<ecosystem_uid>"
}
```

When `ecoSystemId` is present, analytics and search calls automatically scope to the ecosystem. `uid` is still required for tenancy routing. To find the correct UIDs, go to your SearchUnify admin panel → **Search Clients** or **Ecosystems**.

#### Step 2 — Configure Claude Desktop

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

> **Docker Image Tags:** Use `searchunifyutils/su-mcp` (defaults to `latest`) or pin a specific version with `searchunifyutils/su-mcp:2.0.0`. Available tags are published on [Docker Hub](https://hub.docker.com/r/searchunifyutils/su-mcp).

#### Step 3 — Restart Claude Desktop

Fully quit (**Cmd+Q** on macOS) and reopen Claude Desktop to apply the updated configuration.

---

### Integration 4: `/mcp-connect` — Tool-Based Login (Link in Chat)

Use this integration when you want Claude to handle authentication entirely inside the chat — no browser auto-redirect, no headers to configure. On first use, Claude surfaces a clickable login link in the conversation. You click it, fill in the connection form in your browser, log in, and return to Claude. All tools are then available.

**How it works:**
```
Claude Desktop → connects to /mcp-connect
→ Claude calls login() tool automatically
→ Chat shows: [Connect your knowledge base](https://mcp.searchunify.com/mcp-connect/login?s=...)
→ User clicks the link → browser opens the connection form
→ User fills in: Instance URL, Search Client UID, OAuth Client ID, OAuth Client Secret
→ User is redirected to their login page (SSO supported)
→ After login → "Login Successful" page in browser
→ User returns to Claude → all tools are now available
```

#### Prerequisites

- An OAuth client must be registered in your SearchUnify Admin with `https://mcp.searchunify.com/su-callback` as an allowed redirect URI (same as Integration 1, Step 1).

> **Note:** If the OAuth client does not have the `/su-callback` URL registered, the login page will redirect to the SearchUnify dashboard instead of completing the connection.

#### Claude Desktop Configuration

Locate the Claude Desktop configuration file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "su-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.searchunify.com/mcp-connect"
      ]
    }
  }
}
```

#### Restart Claude Desktop

Fully quit (**Cmd+Q** on macOS) and reopen Claude Desktop to apply the updated configuration.

#### Usage

On first use, Claude will automatically call the `login` tool and display the connection link. Click it, complete the form in your browser, log in, and return to Claude. All tools are then available for the duration of the session (1 hour).

If the session expires, call the `login` tool again to reconnect.

---

### Integration 5: Local Clone (Node.js, stdio)

Run the MCP server directly from source with Node.js — no Docker required. Useful for development or customization.

**Requires Node.js 18+** (Node 20+ recommended).

#### Step 1 — Clone and install

```bash
git clone https://github.com/searchunify/su-mcp.git
cd su-mcp
npm install
```

#### Step 2 — Create credentials file

Create `src/input/creds.json` with your credentials (see Integration 3, Step 1 for format options).

#### Step 3 — Configure Claude Desktop

Locate the Claude Desktop configuration file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

#### Step 4 — Restart Claude Desktop

Fully quit (**Cmd+Q** on macOS) and reopen Claude Desktop to apply the updated configuration.

---

## Usage Examples

Here are some example prompts you can use with Claude after connecting SearchUnify:

**Search for content:**
> "Search for 'how to configure SSO' in SearchUnify"

Claude will use the `search` tool to query your SearchUnify instance and return relevant results with titles, summaries, and links.

**Explore filters before searching:**
> "What filter options are available for the query 'API documentation'?"

Claude will use `get-filter-options` to discover available facets (e.g., by source, category, content type), then you can refine your search.

**Get analytics reports:**
> "Show me the top 10 search queries with no clicks from the last 30 days"

Claude will use the `analytics` tool with `reportType: searchQueryWithNoClicks` to retrieve queries that returned results but received no user clicks.

**List search clients:**
> "List all search clients configured in my SearchUnify instance"

Claude will use `get-search-clients` to show all available search clients with their names and UIDs.

**Leadership cost savings / deflection:**
> "Show Leadership explicit and implicit deflection counts for the last six quarters"

Claude will use `analytics` with `reportType: leadershipCostSavingsExplicitDeflection` (omit `startDate`/`endDate`). If the call times out at 60s, increase `searchunify-timeout` — deflection-count runs two rollup queries and is slower than ASSV or USSV alone.

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

**Test OAuth flow** (server must be running with `OAUTH_ENCRYPTION_KEY` and `MCP_ISSUER_URL` set):

```bash
# Opens browser — fill the form and log in to complete the flow
npm run test:oauth:visual

# With pre-filled credentials (set env vars to skip manual entry):
SU_INSTANCE=https://your-instance.searchunify.com \
SU_UID=<search_client_uid> \
SU_AUTH_TYPE=clientCredentials \
SU_CLIENT_ID=<oauth_client_id> \
SU_CLIENT_SECRET=<oauth_client_secret> \
npm run test:oauth:visual
```

**Unit tests** (no credentials needed):

```bash
npm test
```

Runs validation and module import tests for all tools.

### Integration 6: `/mcp-api` — Shared Credentials (No Per-User Login)

Use this integration when **all users should share the same identity** — for example, a Microsoft Copilot / Power Platform connector where an admin configures credentials once and every user benefits automatically with no login prompt.

```
Admin configures connector once with searchunify-* headers
        ↓
All users connect via the Copilot agent
        ↓
MCP works immediately — no form, no browser redirect, no per-user auth
```

**When to use vs `/mcp` (OAuth):**

| | `/mcp` OAuth | `/mcp-api` Header Auth |
|--|-------------|------------------------|
| Per-user identity | Yes — each user has their own SU token | No — all users share one identity |
| Personalized results | Yes (if SU supports it) | No |
| Setup | Each user logs in once | Admin configures once |
| Best for | Claude, Claude Desktop | Copilot, Power Platform, server-to-server |

#### Microsoft Copilot / Power Platform Setup

In your custom connector definition, add these static headers (configured once by the admin):

| Header | Value |
|--------|-------|
| `searchunify-instance` | `https://your-instance.searchunify.com` |
| `searchunify-uid` | Your Search Client UID |
| `searchunify-auth-type` | `apiKey` |
| `searchunify-api-key` | Your API key |

MCP endpoint URL: `https://mcp.searchunify.com/mcp-api`

#### Claude Desktop / mcp-remote Setup

```json
{
  "mcpServers": {
    "su-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.searchunify.com/mcp-api",
        "--header", "searchunify-instance:https://your-instance.searchunify.com",
        "--header", "searchunify-uid:<search_client_uid>",
        "--header", "searchunify-auth-type:apiKey",
        "--header", "searchunify-api-key:<your_api_key>"
      ]
    }
  }
}
```

> The same header reference from [Integration 2](#integration-2-mcp-remote--remote-http-with-header-auth) applies — all `searchunify-*` headers are supported including `searchunify-ecosystem-id` and `searchunify-timeout`.

---

## Project Structure

```
su-mcp/
├── Dockerfile                  # Docker image definition (Node 24 Alpine, default transport: http)
├── docker-compose.yml          # Compose file for Docker-based deployment
├── .env.example                # Environment variable template (copy to .env and fill in values)
├── package.json                # Dependencies and scripts
├── test/
│   ├── test-new-tools.js                 # Unit tests for tools
│   ├── store.test.js                     # MemoryStore / RedisStore unit tests
│   ├── store-fallback.test.js            # Store factory fallback tests
│   ├── oauth-provider.test.js            # OAuth provider unit tests
│   └── validate-authorize-body.test.js   # Form validation tests
├── scripts/
│   ├── test-mcp-client.js      # Test client for stdio and HTTP
│   └── test-oauth-flow.js      # OAuth flow test script
└── src/
    ├── index.js                # Entry point -- transport setup (stdio/HTTP/OAuth)
    ├── tools.js                # Tool initialization orchestrator
    ├── utils.js                # Response formatting utilities
    ├── validations.js          # Credential validation, header parsing, OAuth token extraction
    ├── input/
    │   └── creds.json          # Credentials file (user-provided, not in repo)
    ├── auth/
    │   ├── oauth-provider.js   # MCP OAuth proxy provider (PKCE, SU delegation, token management)
    │   ├── store.js            # Redis/MemoryStore with AES-256 encrypted token storage
    │   └── config-form.js      # HTML configuration form (instance URL, UID, SU OAuth credentials)
    └── su-core/
        ├── index.js                  # Core tools initializer
        ├── su-core-search.js         # search and get-filter-options tools
        ├── su-core-analytics.js          # analytics tool (incl. Leadership reportTypes)
        ├── su-core-business-queries.js   # executive_business_query recipes
        ├── leadership-direct-view.js     # USSV directlyViewSetting resolver
        └── su-core-search-clients.js     # get-search-clients tool
```

---

## Leadership reports and timeouts

MCP uses the same SDK path as other `/api/v2` analytics mirrors: admin **`POST /api/v2/leadership/*`** → analytics service. The Admin UI uses **`POST /analytics/leadership/*`** (browser session + `analytics-secret` on the admin proxy). Both should return the same data when mirrors are deployed; the UI has no fixed 60s client timeout, so a chart can load while MCP aborts if the backend is slow.

| Report | Why timing differs |
|--------|---------------------|
| `leadershipAssistedSelfSolveVolume` / `leadershipUnassistedSelfSolveVolume` | One rollup query each (USSV may add one extra call to resolve `directlyViewSetting`) |
| `leadershipCostSavingsExplicitDeflection` | **Two** rollup queries in parallel (`deflection-count`) — most likely to exceed the default **60s** SDK timeout |

**Fix timeout errors:** Set `"timeout": 120000` in `creds.json`, `searchunify-timeout:120000` in mcp-remote headers, or `SU_TIMEOUT=120000` for OAuth. For persistent slowness, treat it as an analytics/DB performance issue on the tenant, not an MCP routing bug.

See also: [su-sdk-js README](../su-sdk-js/README.md#leadership-dashboard) (Leadership methods and timeout table).

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Docker Not Found** | Ensure Docker is installed and added to your system's PATH. |
| **Invalid Credentials** | Double-check values in `creds.json` or HTTP headers. |
| **Missing API Scopes** | Ensure the client and user have the required search and analytics scopes enabled in your SearchUnify instance. |
| **`timeout of 60000ms exceeded` on `leadershipCostSavingsExplicitDeflection`** | Increase `timeout` / `searchunify-timeout` (e.g. 120000). Other Leadership reportTypes use the same auth path — if they work, this is usually slow `deflection-count` SQL, not missing credentials. |
| **Leadership works in Admin but times out in MCP** | Admin browser waits longer; MCP uses SDK default 60s. Raise timeout and/or optimize analytics rollup queries for the tenant. |
| **Wrong chart / funnel metrics for ASSV** | Use `leadershipAssistedSelfSolveVolume`, not `conversionCaseDeflectionStage1`. |
| **Connection Refused (HTTP)** | Verify the server is running with `MCP_TRANSPORT=http` and the port matches. |
| **mcp-remote not found** | Run `npx mcp-remote` (it will be fetched automatically) or install it globally with `npm install -g mcp-remote`. |
| **Rate limited (HTTP 429)** | Too many requests from your IP. Wait 15 minutes for the window to reset, then retry. |
| **Session expired (`/mcp-connect`)** | The 1-hour session has elapsed. Ask Claude to call the `login` tool again to get a new connection link. |
| **OAuth login redirects to dashboard instead of completing** | The `/su-callback` URL is not registered as a redirect URI in your SearchUnify OAuth client. Add `https://mcp.searchunify.com/su-callback` (or your server's URL) to the allowed redirect URIs in SearchUnify Admin. |

---

## Changelog

### v2.0.0
- Full OAuth 2.0 proxy flow with PKCE for Claude public directory listing (`/mcp` endpoint)
- Tool-based login flow (`/mcp-connect`) — user clicks a link in chat to authenticate via browser
- AES-256-GCM encrypted token storage with Redis (optional) or in-memory fallback
- Dynamic client registration and auto-re-registration on unknown clients
- Refresh token rotation with 24-day TTL
- Rate limiting on auth and MCP endpoints
- Security hardening: HSTS, PKCE validation, bearer token verification, security response headers
- OAuth configuration form with inline validation, SearchUnify branding, and setup docs link
- Tool call logging with caller IP, endpoint, SU instance URL, and OAuth client ID
- Multi-platform Docker image (`linux/amd64`, `linux/arm64`)
- Server version now read from `package.json` (shows correctly in all transport modes)

### v1.3.0
- Added `/mcp-connect` endpoint — tool-based login for environments where Claude Desktop cannot auto-open a browser
- Added `login` MCP tool (only on `/mcp-connect`): returns a link to the connection form in chat; user opens it manually, logs in via SU (SSO supported), and receives a "Login Successful" page
- SU tokens stored by MCP session ID after tool-based login; all other tools work normally post-auth
- Sessions persist for 1 hour; expired sessions prompt the user to call `login` again
- Existing OAuth flow and all other integrations are unchanged

### v1.2.0
- Added OAuth 2.0 proxy flow for Claude public directory listing (PKCE, Dynamic Client Registration)
- OAuth delegates authentication to the SU instance login page — no passwords stored in MCP server
- Added `uid` (Search Client UID) to OAuth form and token chain so all tools work post-auth
- Added Redis/MemoryStore with AES-256-GCM encryption for tokens; falls back to in-memory if no `REDIS_URL`
- Added `setTimeout` overflow fix for 30-day refresh token TTL in MemoryStore
- Added configuration form (instance URL, UID, SU OAuth Client ID/Secret)
- Fixed SDK 1.28.0 compatibility: `requireBearerAuth` uses `{ verifier }`, `handleRequest` takes `(req, res, req.body)`, fresh `McpServer`+`StreamableHTTPServerTransport` per request
- Upgraded `@modelcontextprotocol/sdk` to `1.28.0`
- Added `express` and `ioredis` dependencies
- OAuth is optional — existing stdio and HTTP header auth continue to work unchanged
- Added OAuth full-flow test script: `npm run test:oauth:visual`

### v1.1.0
- Added `get-search-clients` tool — list all search clients configured in the instance
- Added `averageClickPosition` report type to analytics tool
- Added `sessionDetails` and `sessionList` report types to analytics tool (SDK route unchanged: session list table API)
- Added `tileDataContent`; Overview KPI strips use `overviewSessionCount` and `overviewTileDataCount` (`reportType` names; SDK still calls `tileDataMetrics1` / `tileDataMetrics2` routes)
- Added `sessionId`, `pageNumber`, `startIndex`, `sortByField`, `sortType` parameters to analytics tool
- Added local Node.js integration guide (Integration 5)
- Updated `su-sdk` dependency to `2.1.0`
- Improved `formatForClaude` to handle object and nested data responses

### v1.0.0
- Initial release
- `search` tool with pagination, sorting, and facet filtering
- `get-filter-options` tool for discovering available filters
- `analytics` tool with 5 report types (getAllSearchQuery, searchQueryWithResult, searchQueryWithNoClicks, searchQueryWithoutResults, getAllSearchConversion)
- Docker and mcp-remote integration support
- API Key, OAuth 2.0 Password Grant, and Client Credentials authentication
- Dual transport: stdio and Streamable HTTP

---

## Privacy Policy

This project is subject to the [SearchUnify Privacy Policy](https://www.searchunify.com/privacy-policy/).

## Support

- **Issues:** [GitHub Issues](https://github.com/searchunify/su-mcp/issues)
- **Documentation:** [SearchUnify Docs](https://docs.searchunify.com/)
- **Website:** [searchunify.com](https://www.searchunify.com/)

## License

This project is licensed under the BSD 2-Clause License.
See the [LICENSE](LICENSE) file for details.

For more information, visit [SearchUnify](https://www.searchunify.com/) or check out the [su-sdk-js](https://www.npmjs.com/package/su-sdk) documentation.
