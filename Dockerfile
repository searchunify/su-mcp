FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev

COPY . .

# Default port — override with MCP_HTTP_PORT env var
ENV MCP_HTTP_PORT=3000
EXPOSE 3000

ENV MCP_TRANSPORT=http
ENV NODE_ENV=production

# OAuth configuration (set these to enable OAuth)
# ENV OAUTH_ENCRYPTION_KEY=<64-char-hex-string>
# ENV MCP_ISSUER_URL=https://mcp.searchunify.com
# ENV REDIS_URL=redis://redis:6379  (optional, falls back to in-memory)

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${MCP_HTTP_PORT}/.well-known/oauth-authorization-server || wget -qO- http://localhost:${MCP_HTTP_PORT}/mcp || exit 1

CMD ["node", "src/index.js"]
