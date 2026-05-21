import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { createStore, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from "./store.js";
import { getInstanceFormHTML } from "./config-form.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}


/**
 * OAuth clients store backed by Redis.
 * Implements OAuthRegisteredClientsStore from MCP SDK.
 */
class ClientsStore {
  constructor(redisStore) {
    this.store = redisStore;
  }

  async getClient(clientId) {
    return this.store.getClient(clientId);
  }

  async registerClient(client) {
    await this.store.saveClient(client);
    return client;
  }
}

/**
 * MCP OAuth Server Provider — Proxy flow.
 *
 * Instead of collecting credentials via a form, this provider:
 * 1. Shows an instance URL form
 * 2. Redirects user to SU's /authorise_redirect endpoint (SU handles login)
 * 3. SU redirects back to MCP's /su-callback with an SU auth code
 * 4. MCP exchanges SU auth code for SU access token
 * 5. MCP stores the SU token and issues its own MCP auth code
 * 6. Claude exchanges MCP auth code for MCP access token (PKCE validated)
 *
 * No API keys or passwords are ever collected or stored by the MCP server.
 */
class SUMcpOAuthProvider {
  constructor(redisUrl) {
    this.store = createStore(redisUrl);
    this._clientsStore = new ClientsStore(this.store);
    const issuerUrl = process.env.MCP_ISSUER_URL?.replace(/\/$/, "")
      || `http://localhost:${process.env.MCP_HTTP_PORT || 3000}`;
    this.mcpCallbackUrl = `${issuerUrl}/su-callback`;
  }

  get clientsStore() {
    return this._clientsStore;
  }

  /** Connect to Redis. Returns true if successful, false otherwise. */
  async connect() {
    return this.store.connect();
  }

  /** Check if Redis is ready. */
  isReady() {
    return this.store.isReady();
  }

  /**
   * Called by the SDK's authorization handler.
   * Shows the instance URL form. The form submits to /authorize/start
   * which redirects to SU's login.
   */
  async authorize(client, params, res) {
    console.error(`[OAuth] authorize — showing connection form`);
    const sessionId = generateToken();
    await this.store.saveOAuthSession(sessionId, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state || "",
      scopes: params.scopes || [],
    });

    const basePath = new URL(this.mcpCallbackUrl).pathname.replace(/\/su-callback$/, "");
    const nonce = crypto.randomBytes(16).toString("base64");
    const formHTML = getInstanceFormHTML({
      formAction: `${basePath}/authorize/start`,
      sessionId,
      nonce,
    });
    res.set("Content-Security-Policy", `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src data:; form-action 'self'; frame-ancestors 'none'`);
    res.status(200).type("html").send(formHTML);
  }

  async _handleAuthorizeStartInternal(sessionId, instanceUrl, suClientId, suClientSecret, uid, mcpSessionId = null) {
    const session = await this.store.getOAuthSession(sessionId);
    if (!session) throw new Error("Invalid or expired session");
    session.instanceUrl = instanceUrl.replace(/\/$/, "");
    session.suClientId = suClientId;
    session.suClientSecret = suClientSecret;
    session.uid = uid;
    if (mcpSessionId !== null) session.mcpSessionId = mcpSessionId;
    await this.store.saveOAuthSession(sessionId, session);
    return `${session.instanceUrl}/auth/authorise_redirect`
      + `?client_id=${encodeURIComponent(suClientId)}`
      + `&redirect_uri=${encodeURIComponent(this.mcpCallbackUrl)}`
      + `&state=${encodeURIComponent(sessionId)}`;
  }

  /**
   * Handles the instance URL form submission.
   * Redirects user to SU's /authorise_redirect endpoint.
   * @param {string} sessionId - OAuth session ID
   * @param {string} instanceUrl - SU instance URL
   * @param {string} suClientId - SU OAuth client ID (registered on the user's SU instance)
   * @param {string} suClientSecret - SU OAuth client secret
   * @param {string} uid - Search Client UID (used in search/analytics API calls)
   */
  async handleAuthorizeStart(sessionId, instanceUrl, suClientId, suClientSecret, uid) {
    console.error(`[OAuth] authorize/start — redirecting to SU login: ${instanceUrl}`);
    return this._handleAuthorizeStartInternal(sessionId, instanceUrl, suClientId, suClientSecret, uid);
  }

  /**
   * Handles the instance URL form submission for the tool-based login flow (/mcp-connect).
   * Same as handleAuthorizeStart but stores mcpSessionId in the OAuth session so
   * /su-callback can correlate the completed login back to the right MCP session.
   * @param {string} mcpSessionId - The MCP session ID assigned by the /mcp-connect transport
   * @param {string} instanceUrl - SU instance URL
   * @param {string} suClientId - SU OAuth client ID
   * @param {string} suClientSecret - SU OAuth client secret
   * @param {string} uid - SU user ID
   */
  async handleAuthorizeStartForTool(mcpSessionId, instanceUrl, suClientId, suClientSecret, uid) {
    return this._handleAuthorizeStartInternal(mcpSessionId, instanceUrl, suClientId, suClientSecret, uid, mcpSessionId);
  }

  /**
   * Returns SU tokens for a tool-based login session (mcp-connect flow).
   */
  async getSuTokensForToolSession(mcpSessionId) {
    return this.store.getToolSession(mcpSessionId);
  }

  /**
   * Handles the SU callback for the tool-based login flow.
   * Exchanges the SU auth code for SU tokens and stores them by MCP session ID.
   * Returns true if this was a tool-session callback, false otherwise (caller falls
   * through to the standard OAuth flow).
   */
  async handleSuCallbackForTool(suAuthCode, sessionId) {
    const session = await this.store.getOAuthSession(sessionId);
    if (!session?.mcpSessionId) {
      return false; // not a tool-session callback
    }

    const suTokens = await this._exchangeSuCode(
      session.instanceUrl, suAuthCode, session.suClientId, session.suClientSecret
    );

    const rawAccessToken = suTokens.access_token || suTokens.accessToken;
    const uidType = await this._detectUidType(session.instanceUrl, rawAccessToken, session.uid);
    if (uidType === 'unknown') {
      const err = new Error(`"${session.uid}" was not found as a search client or ecosystem in this SearchUnify instance. Please check the UID and try again.`);
      err.code = 'INVALID_UID';
      throw err;
    }
    const isEcosystem = uidType === 'ecosystem';

    await this.store.saveToolSession(session.mcpSessionId, {
      accessToken: rawAccessToken,
      refreshToken: suTokens.refresh_token || suTokens.refreshToken,
      instanceUrl: session.instanceUrl,
      suClientId: session.suClientId,
      suClientSecret: session.suClientSecret,
      uid: session.uid,
      email: suTokens._email ?? null,
      isEcosystem,
    });

    await this.store.deleteOAuthSession(sessionId);
    return true;
  }

  /**
   * Handles the callback from SU's /authorise_redirect.
   * SU redirects here with ?code=SU_AUTH_CODE&state=SESSION_ID
   */
  async handleSuCallback(suAuthCode, sessionId) {
    const session = await this.store.getOAuthSession(sessionId);
    if (!session) {
      throw new Error("Invalid or expired OAuth session");
    }

    let suTokens;
    try {
      suTokens = await this._exchangeSuCode(
        session.instanceUrl, suAuthCode, session.suClientId, session.suClientSecret
      );
    } catch (err) {
      console.error(`[OAuth] su-callback — SU token exchange failed: ${err.message}`);
      throw err;
    }
    console.error(`[OAuth] su-callback — login completed for: ${session.instanceUrl}`);

    const rawAccessToken = suTokens.access_token || suTokens.accessToken;
    const uidType = await this._detectUidType(session.instanceUrl, rawAccessToken, session.uid);
    if (uidType === 'unknown') {
      const err = new Error(`"${session.uid}" was not found as a search client or ecosystem in this SearchUnify instance. Please check the UID and try again.`);
      err.code = 'INVALID_UID';
      throw err;
    }
    const isEcosystem = uidType === 'ecosystem';

    const mcpAuthCode = generateToken();
    await this.store.saveAuthCode(mcpAuthCode, {
      clientId: session.clientId,
      redirectUri: session.redirectUri,
      codeChallenge: session.codeChallenge,
      scopes: session.scopes || [],
      suTokens: {
        accessToken: rawAccessToken,
        refreshToken: suTokens.refresh_token || suTokens.refreshToken,
        instanceUrl: session.instanceUrl,
        suClientId: session.suClientId,
        suClientSecret: session.suClientSecret,
        uid: session.uid,
        email: suTokens._email ?? null,
        isEcosystem,
      },
    });

    // Clean up the OAuth session
    await this.store.deleteOAuthSession(sessionId);

    // Redirect to Claude's callback with MCP auth code
    const redirectUrl = new URL(session.redirectUri);
    redirectUrl.searchParams.set("code", mcpAuthCode);
    if (session.state) {
      redirectUrl.searchParams.set("state", session.state);
    }

    return redirectUrl.href;
  }

  /**
   * Exchange SU authorization code for SU access token via POST /oauth/token/
   */
  async _exchangeSuCode(instanceUrl, code, suClientId, suClientSecret) {
    const tokenUrl = `${instanceUrl}/oauth/token/`;
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: suClientId,
      client_secret: suClientSecret,
      redirect_uri: this.mcpCallbackUrl,
    }).toString();

    return new Promise((resolve, reject) => {
      const u = new URL(tokenUrl);
      const transport = u.protocol === "https:" ? https : http;
      const req = transport.request(
        {
          method: "POST",
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.access_token || parsed.accessToken) {
                parsed._email = parsed.user?.username ?? null;
                resolve(parsed);
              } else {
                reject(new Error(`SU token exchange failed: ${data}`));
              }
            } catch {
              reject(new Error(`Invalid response from SU token endpoint: ${data}`));
            }
          });
        }
      );
      req.on("error", reject);
      req.setTimeout(10000, () => { req.destroy(new Error("SU token exchange timed out")); });
      req.write(body);
      req.end();
    });
  }

  /**
   * Detects whether a uid belongs to a search_client or ecosystem by calling /api/v2/search-clients.
   * Returns 'ecosystem' | 'search_client' | 'unknown' (uid not in list) | 'error' (network/timeout).
   * 'unknown' → fail auth; 'error' → fail-open (treat as search_client).
   */
  async _detectUidType(instanceUrl, accessToken, uid) {
    const url = `${instanceUrl}/api/v2/search-clients`;
    return new Promise((resolve) => {
      try {
        const u = new URL(url);
        const transport = u.protocol === "https:" ? https : http;
        const req = transport.request(
          {
            method: "GET",
            hostname: u.hostname,
            port: u.port,
            path: u.pathname,
            headers: { Authorization: `Bearer ${accessToken}` },
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                const list = JSON.parse(data);
                if (!Array.isArray(list)) { resolve('error'); return; }
                const match = list.find((item) => item.uid === uid);
                if (!match) { resolve('unknown'); return; }
                resolve(match.type === 'ecosystem' ? 'ecosystem' : 'search_client');
              } catch {
                resolve('error');
              }
            });
          }
        );
        req.on("error", () => resolve('error'));
        req.setTimeout(10000, () => { req.destroy(); resolve('error'); });
        req.end();
      } catch {
        resolve('error');
      }
    });
  }

  /**
   * Returns the stored code_challenge for a given authorization code.
   */
  async challengeForAuthorizationCode(client, authorizationCode) {
    const codeData = await this.store.getAuthCode(authorizationCode);
    if (!codeData) {
      throw new Error("Invalid or expired authorization code");
    }
    return codeData.codeChallenge;
  }

  /**
   * Exchanges an MCP authorization code for MCP access + refresh tokens.
   * The SDK handles PKCE validation before calling this.
   */
  async exchangeAuthorizationCode(client, authorizationCode) {
    const codeData = await this.store.getAuthCode(authorizationCode);
    if (!codeData) {
      console.error(`[OAuth] token exchange failed — invalid or expired auth code`);
      throw new Error("Invalid or expired authorization code");
    }
    console.error(`[OAuth] token exchange — access token issued for client: ${client.client_id?.slice(0, 8)}...`);

    await this.store.deleteAuthCode(authorizationCode);

    const accessToken = generateToken();
    const refreshToken = generateToken();
    const now = Math.floor(Date.now() / 1000);

    await this.store.saveAccessToken(accessToken, {
      clientId: client.client_id,
      scopes: codeData.scopes || [],
      expiresAt: now + ACCESS_TOKEN_TTL,
      suTokens: codeData.suTokens,
    });

    await this.store.saveRefreshToken(refreshToken, {
      clientId: client.client_id,
      scopes: codeData.scopes || [],
      suTokens: codeData.suTokens,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL,
      refresh_token: refreshToken,
    };
  }

  /**
   * Exchanges a refresh token for a new access token.
   */
  async exchangeRefreshToken(client, refreshToken, scopes) {
    const refreshData = await this.store.getRefreshToken(refreshToken);
    if (!refreshData) {
      console.error(`[OAuth] token refresh failed — invalid or expired refresh token for client: ${client.client_id?.slice(0, 8)}...`);
      throw new Error("Invalid or expired refresh token");
    }
    console.error(`[OAuth] token refresh — new access token issued for client: ${client.client_id?.slice(0, 8)}...`);

    const accessToken = generateToken();
    const newRefreshToken = generateToken();
    const now = Math.floor(Date.now() / 1000);

    await this.store.saveAccessToken(accessToken, {
      clientId: client.client_id,
      scopes: scopes || refreshData.scopes || [],
      expiresAt: now + ACCESS_TOKEN_TTL,
      suTokens: refreshData.suTokens,
    });

    // Rotate refresh token
    await this.store.deleteRefreshToken(refreshToken);
    await this.store.saveRefreshToken(newRefreshToken, {
      clientId: client.client_id,
      scopes: scopes || refreshData.scopes || [],
      suTokens: refreshData.suTokens,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL,
      refresh_token: newRefreshToken,
    };
  }

  /**
   * Verifies an access token and returns auth info.
   */
  async verifyAccessToken(token) {
    const tokenData = await this.store.getAccessToken(token);
    if (!tokenData) {
      throw new InvalidTokenError("Invalid or expired access token");
    }
    return {
      token,
      clientId: tokenData.clientId,
      scopes: tokenData.scopes || [],
      expiresAt: tokenData.expiresAt,
    };
  }

  /**
   * Revokes an access or refresh token.
   */
  async revokeToken(client, request) {
    const { token, token_type_hint } = request;
    if (token_type_hint === "refresh_token") {
      const data = await this.store.getRefreshToken(token);
      if (data && data.clientId !== client.client_id) return; // RFC 7009: ignore silently
      await this.store.deleteRefreshToken(token);
    } else {
      const data = await this.store.getAccessToken(token);
      if (data && data.clientId !== client.client_id) return; // RFC 7009: ignore silently
      await this.store.deleteAccessToken(token);
    }
  }

  /**
   * Gets SU tokens from a bearer token (for use in MCP tool handlers).
   * Returns { accessToken, refreshToken, instanceUrl }
   */
  async getSuTokensForMcpToken(token) {
    const tokenData = await this.store.getAccessToken(token);
    return tokenData?.suTokens || null;
  }
}

export { SUMcpOAuthProvider };
