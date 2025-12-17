FROM node:25-slim AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:25-slim

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json for runtime reference
COPY --from=builder /app/package.json ./

# Copy built files and node_modules from builder
# (better-sqlite3 has no prebuilt binaries for Node 25, so we use the compiled version)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Create data directory at /data (will be bind-mounted from host)
RUN mkdir -p /data && chown -R node:node /data

# Create migrations directory
RUN mkdir -p /app/src/db/migrations
COPY --from=builder /app/src/db/migrations ./src/db/migrations

# Copy health check script and set permissions
COPY healthcheck.js ./
RUN chown node:node healthcheck.js

# Switch to non-root user
USER node

# Set environment variables
ENV NODE_ENV=production
ENV AGENT_MEMORY_DB_PATH=/data/memory.db
ENV AGENT_MEMORY_VECTOR_DB_PATH=/data/vectors.lance

# Health check - verifies database is accessible
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD ["node", "/app/healthcheck.js"]

# The MCP server uses stdio, no port exposure needed
# Run with: docker run -i agent-memory

CMD ["node", "dist/index.js"]
