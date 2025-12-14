FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ sqlite-dev

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache sqlite-libs

# Copy built files and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create data directory with proper permissions
RUN mkdir -p /app/data && chown -R node:node /app/data

# Create migrations directory
RUN mkdir -p /app/src/db/migrations
COPY --from=builder /app/src/db/migrations ./src/db/migrations

# Switch to non-root user
USER node

# Set environment variables
ENV NODE_ENV=production
ENV AGENT_MEMORY_DB_PATH=/app/data/memory.db

# The MCP server uses stdio, no port exposure needed
# Run with: docker run -i agent-memory

CMD ["node", "dist/index.js"]
