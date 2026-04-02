import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { createStore, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from "./store.js";
import { getInstanceFormHTML } from "./config-form.js";

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
    const baseUrl = process.env.MCP_ISSUER_URL?.replace(/\/$/, "")
      || `http://localhost:${process.env.MCP_HTTP_PORT || 3000}`;
    this.mcpCallbackUrl = `${baseUrl}/su-callback`;
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
    // Store the OAuth session params in Redis so we can retrieve them after SU callback
    const sessionId = generateToken();
    await this.store.saveOAuthSession(sessionId, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state || "",
      scopes: params.scopes || [],
    });

    const formHTML = getInstanceFormHTML({
      formAction: "/authorize/start",
      sessionId,
    });
    res.status(200).type("html").send(formHTML);
  }

  /**
   * Handles the instance URL form submission.
   * Redirects user to SU's /authorise_redirect endpoint.
   * @param {string} sessionId - OAuth session ID
   * @param {string} instanceUrl - SU instance URL
   * @param {string} suClientId - SU OAuth client ID (registered on the user's SU instance)
   * @param {string} suClientSecret - SU OAuth client secret
   */
  async handleAuthorizeStart(sessionId, instanceUrl, suClientId, suClientSecret) {
    const session = await this.store.getOAuthSession(sessionId);
    if (!session) {
      throw new Error("Invalid or expired session");
    }

    // Store instance URL and SU OAuth client creds in the session
    session.instanceUrl = instanceUrl.replace(/\/$/, "");
    session.suClientId = suClientId;
    session.suClientSecret = suClientSecret;
    await this.store.saveOAuthSession(sessionId, session);

    // Build SU authorize URL
    // SU's /authorise_redirect expects: client_id, redirect_uri, state
    // We pass our sessionId as state so we can correlate the callback
    const suAuthorizeUrl = `${session.instanceUrl}/authorise_redirect`
      + `?client_id=${encodeURIComponent(suClientId)}`
      + `&redirect_uri=${encodeURIComponent(this.mcpCallbackUrl)}`
      + `&state=${encodeURIComponent(sessionId)}`;

    return suAuthorizeUrl;
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

    // Exchange SU auth code for SU access token using the per-session SU client creds
    const suTokens = await this._exchangeSuCode(
      session.instanceUrl, suAuthCode, session.suClientId, session.suClientSecret
    );

    // Generate MCP auth code and store it with the SU tokens
    const mcpAuthCode = generateToken();
    await this.store.saveAuthCode(mcpAuthCode, {
      clientId: session.clientId,
      redirectUri: session.redirectUri,
      codeChallenge: session.codeChallenge,
      scopes: session.scopes || [],
      suTokens: {
        accessToken: suTokens.access_token || suTokens.accessToken,
        refreshToken: suTokens.refresh_token || suTokens.refreshToken,
        instanceUrl: session.instanceUrl,
        suClientId: session.suClientId,
        suClientSecret: session.suClientSecret,
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
      req.write(body);
      req.end();
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
      throw new Error("Invalid or expired authorization code");
    }

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
      throw new Error("Invalid or expired refresh token");
    }

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
      throw new Error("Invalid or expired access token");
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
      await this.store.deleteRefreshToken(token);
    } else {
      const key = `su-mcp:access:${token}`;
      const deleted = await this.store.redis.del(key);
      if (!deleted) {
        await this.store.deleteRefreshToken(token);
      }
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
