# Use Node18 Alpine base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source files
COPY . .

# Default command (adjust path if needed)
ENTRYPOINT ["node", "src/index.js"]
