# SearchUnify MCP Server (`su-mcp`)

The SearchUnify MCP Server (`su-mcp`) enables seamless integration of [SearchUnify](https://www.searchunify.com/) with Claude Desktop.  
By leveraging the [su-sdk-js](https://www.npmjs.com/package/su-sdk), it allows users to perform searches using their SearchUnify index directly within Claude.

## Features

- 🔍 **Search Integration**: Use your SearchUnify index to fetch relevant results within Claude.
- 🔐 **Secure Authentication**: Supports OAuth 2.0 for secure API access.
- ⚙️ **Dockerized Deployment**: Easy setup using Docker.

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

```json
{
  "instance": "<searchunify_instance_url>",
  "timeout": 60000,
  "oauth2": {
    "username": "<your_email>",
    "password": "<your_password>",
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

