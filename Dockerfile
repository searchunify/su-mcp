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

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${MCP_HTTP_PORT}/.well-known/oauth-authorization-server || wget -qO- http://localhost:${MCP_HTTP_PORT}/mcp || exit 1

CMD ["node", "src/index.js"]
