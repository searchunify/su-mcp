# Use Node24 Alpine base image
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source files
COPY . .

# Default command (adjust path if needed)
ENTRYPOINT ["node", "src/index.js"]
