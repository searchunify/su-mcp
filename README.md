# SearchUnify MCP Server (`su-mcp`)

The SearchUnify MCP Server (`su-mcp`) is a lightweight middleware that enables secure, seamless integration between [SearchUnify Cognitive Search](https://www.searchunify.com/) and third-party applications like Claude Desktop.  
By leveraging [su-sdk-js](https://www.npmjs.com/package/su-sdk), this library allows developers to invoke context-aware search queries, access enterprise knowledge, and power intelligent workflows directly within external environments

## Features

- 🔍 **LLM-Integrated Enterprise Search**: Power GenAI tools like Claude with **context-aware, enterprise-grade search** from SearchUnify—enabling more relevant, trusted, and explainable responses.
- 🔐 **Enterprise-Grade Security**: Built-in **OAuth 2.0** support ensures **secure token-based access**, protecting sensitive data and enforcing organizational compliance.
- ⚙️ **Plug-and-Play Deployment**: Get started quickly with a **Docker-based setup**, enabling rapid configuration, portability, and scalability across environments.

## Prerequisites

- A [SearchUnify](https://www.searchunify.com/) account with:
  - A valid instance URL
  - OAuth 2.0 credentials (username, password, client ID, client secret)
  - A Search Client UID
  - API scopes enabled for search operations
- [Docker](https://www.docker.com/) installed
- Claude Desktop installed

## Installation

### 1. Obtain OAuth 2.0 Credentials

You will need:

- Instance URL  
- Username  
- Password  
- Client ID  
- Client Secret  
- Search Client UID  

Ensure both the client credentials and the user have the necessary API scopes enabled for **search**.

### 2. Create Credentials File

Create a file named `creds.json` with the following structure:

with password 
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

with apiKey 
```json
{
  "instance": "<searchunify_instance_url>",
  "timeout": 60000,
  "authType": "apiKey",
  "apiKey": "apiKey",
  "uid": "<search_client_uid>"
}
```

with client credentials 
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

Replace placeholders with your actual values.

 ### 3. Configure Claude Desktop

Locate the Claude Desktop configuration file:

macOS: ~/Library/Application Support/Claude/claude_desktop_config.json

Windows: %APPDATA%\Claude\claude_desktop_config.json

Add the following entry to the `mcpServers` section:

```json
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
```

Make sure `<path_to_creds.json>` is the full path to your `creds.json` file.

### 4. Restart Claude Desktop
Restart Claude to apply the updated configuration.

### 5. Usage
Once configured, Claude Desktop will be able to fetch search results using your SearchUnify instance via su-mcp.

### 6. Troubleshooting
**Docker Not Found**: Ensure Docker is installed and added to your system's path.

**Invalid Credentials**: Double-check values in creds.json.

**Missing API Scopes**: Make sure the client and user have the required search scopes enabled in your SearchUnify instance.

### 7. License
This project is licensed under the BSD 2-Clause License.
See the LICENSE file for details.

For more information, visit [SearchUnify](https://www.searchunify.com/) or check out the [su-sdk-js](https://www.npmjs.com/package/su-sdk) documentation.

