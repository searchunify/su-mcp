FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

EXPOSE 3099

ENV MCP_TRANSPORT=both
# OAuth configuration (optional — set these to enable OAuth for Claude public directory)
# ENV REDIS_URL=redis://localhost:6379
# ENV OAUTH_ENCRYPTION_KEY=<64-char-hex-string>
# ENV MCP_ISSUER_URL=https://mcp.searchunify.com

CMD ["node", "src/index.js"]
