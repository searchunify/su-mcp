import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { SearchUnifyRestClient, AUTH_TYPES } from "su-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Validates that the provided value is a valid file path, the file exists, and loads the JSON content.
 * @param {string} filePath - The file path to validate.
 * @returns {Object} - The parsed JSON content of the file.
 * @throws {Error} - If the file path is invalid, the file does not exist, or the content is not valid JSON.
 */
function validateAndLoadJSON(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid parameter: filePath must be a non-empty string.');
  }

  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File does not exist at path: ${absolutePath}`);
  }

  const fileContent = fs.readFileSync(absolutePath, 'utf-8');

  try {
    return JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Invalid JSON content in file: ${absolutePath}`);
  }
}

const validateCreds = () => {
  console.error ('Validating creds...');
  const credsPath = path.join(__dirname, 'input', 'creds.json');
  const config = validateAndLoadJSON(credsPath);
  if(!config.uid){
    throw new Error('Invalid parameter: uid is required in the config file.');
  }
  const restClientConfig = { ...config };
  delete restClientConfig.uid;
  const suRestClient = new SearchUnifyRestClient(restClientConfig);
  console.error ('created sdk connection...');
  return {
    suRestClient,
    config
  }
}

const HEADER_PREFIX = 'searchunify-';

/**
 * Build creds from HTTP request headers (for HTTP MCP). Returns null if instance or uid missing.
 * Header names (lowercase): searchunify-instance, searchunify-uid, searchunify-auth-type, searchunify-api-key, etc.
 */
function getCredsFromHeaders(headers) {
  console.log('getCredsFromHeaders headers', headers);
  const get = (k) => headers[HEADER_PREFIX + k];
  const instance = get('instance')?.trim();
  const uid = get('uid')?.trim();
  if (!instance || !uid) return null;

  const authType = (get('auth-type') || 'apiKey').toLowerCase();
  const timeout = parseInt(get('timeout') || '60000', 10);
  const config = {
    instance,
    uid,
    timeout: Number.isFinite(timeout) ? timeout : 60000,
    authType: authType === 'apikey' ? 'apiKey' : authType === 'clientcredentials' ? 'clientCredentials' : authType,
  };

  if (config.authType === 'apiKey') {
    const apiKey = get('api-key');
    if (!apiKey) return null;
    config.apiKey = apiKey;
  } else if (config.authType === 'password') {
    config.oauth2 = {
      username: get('oauth-username'),
      password: get('oauth-password'),
      clientId: get('oauth-client-id'),
      clientSecret: get('oauth-client-secret'),
    };
    if (!config.oauth2.username || !config.oauth2.password || !config.oauth2.clientId || !config.oauth2.clientSecret) return null;
  } else if (config.authType === 'clientCredentials') {
    config.oauth2 = {
      clientId: get('oauth-client-id'),
      clientSecret: get('oauth-client-secret'),
    };
    if (!config.oauth2.clientId || !config.oauth2.clientSecret) return null;
  } else {
    return null;
  }

  const restClientConfig = { ...config };
  delete restClientConfig.uid;
  const suRestClient = new SearchUnifyRestClient(restClientConfig);
  return { suRestClient, config };
}

/**
 * Build creds from SU OAuth tokens (used by OAuth proxy flow).
 * Uses the MCP server's SU OAuth client credentials (SU_MCP_CLIENT_ID/SECRET)
 * to create an SDK client with clientCredentials auth. The SDK will auto-generate
 * tokens using these credentials on each request.
 * @param {Object} suTokens - { accessToken, refreshToken, instanceUrl }
 */
function buildCredsFromSuToken(suTokens) {
  const { instanceUrl, suClientId, suClientSecret } = suTokens;
  const suRestClient = new SearchUnifyRestClient({
    instance: instanceUrl,
    timeout: parseInt(process.env.SU_TIMEOUT || "60000", 10),
    authType: "clientCredentials",
    oauth2: {
      clientId: suClientId,
      clientSecret: suClientSecret,
    },
  });
  return { suRestClient, config: { instance: instanceUrl } };
}

export { validateCreds, getCredsFromHeaders, buildCredsFromSuToken };
