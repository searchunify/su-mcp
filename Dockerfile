FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

EXPOSE 3099

ENV MCP_TRANSPORT=http

CMD ["node", "src/index.js"]
