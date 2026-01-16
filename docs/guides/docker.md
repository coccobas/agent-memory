# Docker Deployment Guide

Complete guide for deploying Agent Memory with Docker.

## Overview

Agent Memory supports multiple Docker deployment styles:

| Style               | Use Case               | Connection             |
| ------------------- | ---------------------- | ---------------------- |
| **MCP (stdio)**     | Claude Desktop, Cursor | Container stdin/stdout |
| **REST (HTTP)**     | Custom apps, APIs      | HTTP on port 8787      |
| **Multi-container** | Production, scaling    | PostgreSQL + Redis     |

---

## Quick Start

### MCP Mode

Your MCP client launches the container and communicates via stdio:

```bash
docker run --rm -i \
  -v ~/.agent-memory:/data \
  ghcr.io/anthropics/agent-memory:latest mcp
```

### REST Mode

Run as a long-lived HTTP service:

```bash
docker run -d \
  --name agent-memory \
  -p 8787:8787 \
  -v ~/.agent-memory:/data \
  -e AGENT_MEMORY_REST_ENABLED=true \
  -e AGENT_MEMORY_REST_API_KEY=your-secret \
  ghcr.io/anthropics/agent-memory:latest rest
```

Verify:

```bash
curl http://localhost:8787/health
```

---

## IDE Configuration

### Claude Desktop

Config location:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

**Important:** Use absolute paths for volume mounts.

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v",
        "/Users/yourname/.agent-memory:/data",
        "ghcr.io/anthropics/agent-memory:latest",
        "mcp"
      ]
    }
  }
}
```

### With Environment Variables

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v",
        "/Users/yourname/.agent-memory:/data",
        "-e",
        "AGENT_MEMORY_OPENAI_API_KEY=sk-...",
        "ghcr.io/anthropics/agent-memory:latest",
        "mcp"
      ]
    }
  }
}
```

---

## Docker Compose

### Basic Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  agent-memory:
    image: ghcr.io/anthropics/agent-memory:latest
    ports:
      - '8787:8787'
    volumes:
      - ./data:/data
    environment:
      AGENT_MEMORY_REST_ENABLED: 'true'
      AGENT_MEMORY_REST_API_KEY: ${AGENT_MEMORY_REST_API_KEY}
      AGENT_MEMORY_OPENAI_API_KEY: ${AGENT_MEMORY_OPENAI_API_KEY}
    restart: unless-stopped

volumes:
  data:
```

Create `.env`:

```ini
AGENT_MEMORY_REST_API_KEY=your-secret-key
AGENT_MEMORY_OPENAI_API_KEY=sk-...
```

Start:

```bash
docker compose up -d
```

---

## Production Setup

### With PostgreSQL

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: agent_memory
      POSTGRES_USER: agent_memory
      POSTGRES_PASSWORD: ${PG_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U agent_memory']
      interval: 5s
      timeout: 5s
      retries: 5

  agent-memory:
    image: ghcr.io/anthropics/agent-memory:latest
    ports:
      - '8787:8787'
    environment:
      AGENT_MEMORY_DB_TYPE: postgresql
      AGENT_MEMORY_PG_HOST: postgres
      AGENT_MEMORY_PG_DATABASE: agent_memory
      AGENT_MEMORY_PG_USER: agent_memory
      AGENT_MEMORY_PG_PASSWORD: ${PG_PASSWORD}
      AGENT_MEMORY_REST_ENABLED: 'true'
      AGENT_MEMORY_REST_API_KEY: ${REST_API_KEY}
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pgdata:
```

### With PostgreSQL + Redis

```yaml
# docker-compose.distributed.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: agent_memory
      POSTGRES_USER: agent_memory
      POSTGRES_PASSWORD: ${PG_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U agent_memory']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5

  agent-memory:
    image: ghcr.io/anthropics/agent-memory:latest
    ports:
      - '8787:8787'
    environment:
      # Database
      AGENT_MEMORY_DB_TYPE: postgresql
      AGENT_MEMORY_PG_HOST: postgres
      AGENT_MEMORY_PG_DATABASE: agent_memory
      AGENT_MEMORY_PG_USER: agent_memory
      AGENT_MEMORY_PG_PASSWORD: ${PG_PASSWORD}
      # Redis
      AGENT_MEMORY_REDIS_ENABLED: 'true'
      AGENT_MEMORY_REDIS_HOST: redis
      # REST API
      AGENT_MEMORY_REST_ENABLED: 'true'
      AGENT_MEMORY_REST_API_KEY: ${REST_API_KEY}
      # Embeddings
      AGENT_MEMORY_OPENAI_API_KEY: ${OPENAI_API_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
```

---

## Scaling with Replicas

For high availability, run multiple instances:

```yaml
# docker-compose.scale.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: agent_memory
      POSTGRES_USER: agent_memory
      POSTGRES_PASSWORD: ${PG_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data

  agent-memory:
    image: ghcr.io/anthropics/agent-memory:latest
    deploy:
      replicas: 3
    environment:
      AGENT_MEMORY_DB_TYPE: postgresql
      AGENT_MEMORY_PG_HOST: postgres
      AGENT_MEMORY_PG_DATABASE: agent_memory
      AGENT_MEMORY_PG_USER: agent_memory
      AGENT_MEMORY_PG_PASSWORD: ${PG_PASSWORD}
      AGENT_MEMORY_REDIS_ENABLED: 'true'
      AGENT_MEMORY_REDIS_HOST: redis
      AGENT_MEMORY_REST_ENABLED: 'true'
      AGENT_MEMORY_REST_API_KEY: ${REST_API_KEY}
    depends_on:
      - postgres
      - redis

  nginx:
    image: nginx:alpine
    ports:
      - '8787:80'
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - agent-memory

volumes:
  pgdata:
  redisdata:
```

---

## Volume Management

### Data Persistence

Always mount a volume for persistent data:

```bash
# Named volume (managed by Docker)
docker run -v agent-memory-data:/data ...

# Bind mount (host directory)
docker run -v /path/on/host:/data ...
```

### Backup Volumes

```bash
# Backup named volume
docker run --rm \
  -v agent-memory-data:/data:ro \
  -v $(pwd):/backup \
  alpine tar czf /backup/agent-memory-backup.tar.gz -C /data .

# Restore
docker run --rm \
  -v agent-memory-data:/data \
  -v $(pwd):/backup:ro \
  alpine tar xzf /backup/agent-memory-backup.tar.gz -C /data
```

### Permission Issues

If you encounter permission errors:

```bash
# Run with your user ID
docker run --rm -i \
  --user $(id -u):$(id -g) \
  -v ~/.agent-memory:/data \
  ghcr.io/anthropics/agent-memory:latest mcp
```

---

## Building from Source

### Clone and Build

```bash
git clone https://github.com/anthropics/agent-memory.git
cd agent-memory
docker build -t agent-memory:local .
```

### Development Build

```dockerfile
# Dockerfile.dev
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["node", "dist/cli.js", "mcp"]
```

```bash
docker build -f Dockerfile.dev -t agent-memory:dev .
```

---

## Environment Variables

Pass environment variables:

```bash
# Individual variables
docker run -e VAR=value ...

# From file
docker run --env-file .env ...
```

### Recommended Variables

| Variable                      | Description                       |
| ----------------------------- | --------------------------------- |
| `AGENT_MEMORY_DATA_DIR`       | Data directory (default: `/data`) |
| `AGENT_MEMORY_REST_ENABLED`   | Enable REST API                   |
| `AGENT_MEMORY_REST_API_KEY`   | API authentication key            |
| `AGENT_MEMORY_OPENAI_API_KEY` | OpenAI key for embeddings         |
| `AGENT_MEMORY_DB_TYPE`        | `sqlite` or `postgresql`          |

See [Environment Variables](../reference/environment-variables.md) for full list.

---

## Health Checks

### Built-in Health Endpoint

```bash
curl http://localhost:8787/health
```

### Docker Health Check

```yaml
services:
  agent-memory:
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8787/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

---

## Logging

### View Logs

```bash
# Follow logs
docker logs -f agent-memory

# Last 100 lines
docker logs --tail 100 agent-memory
```

### Log Configuration

```bash
docker run \
  -e LOG_LEVEL=debug \
  -e AGENT_MEMORY_DEBUG=true \
  ...
```

### Log Drivers

```yaml
services:
  agent-memory:
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs agent-memory

# Run interactively to see errors
docker run --rm -it ghcr.io/anthropics/agent-memory:latest sh
```

### Database Connection Issues

Ensure database is ready before starting:

```yaml
depends_on:
  postgres:
    condition: service_healthy
```

### Memory Issues

Limit container memory:

```yaml
services:
  agent-memory:
    deploy:
      resources:
        limits:
          memory: 512M
    environment:
      AGENT_MEMORY_CACHE_LIMIT_MB: '256'
```

### Network Issues

For MCP mode, ensure stdin/stdout aren't buffered:

```bash
docker run --rm -i ...  # -i is required for stdin
```

---

## See Also

- [PostgreSQL Setup](postgresql-setup.md) - Database configuration
- [Redis Distributed](redis-distributed.md) - Scaling with Redis
- [Environment Variables](../reference/environment-variables.md) - All options
- [Platform: Linux](platform/linux.md) - Linux-specific setup
- [Platform: Windows](platform/windows.md) - Windows-specific setup
