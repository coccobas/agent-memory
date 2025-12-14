# Docker Deployment Guide

This guide covers deploying Agent Memory in Docker containers for development and production environments.

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f agent-memory

# Stop the container
docker-compose down

# Stop and remove volumes (deletes data)
docker-compose down -v
```

### Using Docker Directly

```bash
# Build the image
docker build -t agent-memory:latest .

# Run with volume for data persistence
docker run -i \
  -v agent-memory-data:/app/data \
  --name agent-memory \
  agent-memory:latest

# Run with custom database path
docker run -i \
  -v /path/to/data:/app/data \
  -e AGENT_MEMORY_DB_PATH=/app/data/memory.db \
  --name agent-memory \
  agent-memory:latest
```

## Configuration

### Environment Variables

Configure the container using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENT_MEMORY_DB_PATH` | Path to SQLite database file | `/app/data/memory.db` |
| `LOG_LEVEL` | Logging level (trace, debug, info, warn, error) | `info` |
| `AGENT_MEMORY_PERF` | Enable performance logging (0 or 1) | `0` |
| `AGENT_MEMORY_CACHE` | Enable query caching (0 or 1) | `1` |
| `AGENT_MEMORY_SKIP_INIT` | Skip auto DB initialization (0 or 1) | `0` |
| `AGENT_MEMORY_EMBEDDING_PROVIDER` | Embedding provider (openai, local, disabled) | `openai` |
| `AGENT_MEMORY_OPENAI_API_KEY` | OpenAI API key for embeddings | - |
| `AGENT_MEMORY_VECTOR_DB_PATH` | Path to vector database | `/app/data/vectors.lance` |

### Data Persistence

The container stores data in `/app/data` by default. Mount a volume to persist data:

```yaml
volumes:
  - agent-memory-data:/app/data  # Named volume
  # OR
  - ./data:/app/data             # Host directory
```

**Important**: Always use volumes for production to prevent data loss when containers are recreated.

## Production Deployment

### Resource Limits

Add resource limits in `docker-compose.yml`:

```yaml
services:
  agent-memory:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 512M
```

### Security Best Practices

1. **Non-root user**: The container runs as user `node` (non-root)
2. **Read-only filesystem**: Consider mounting most of the filesystem as read-only:
   ```yaml
   read_only: true
   tmpfs:
     - /tmp
   volumes:
     - agent-memory-data:/app/data:rw
   ```
3. **Secrets management**: Never commit API keys. Use Docker secrets or environment files:
   ```bash
   docker-compose --env-file .env.production up -d
   ```

### Backup and Restore

#### Backup Database

```bash
# Copy database from running container
docker cp agent-memory:/app/data/memory.db ./backup/memory.db

# Or backup the entire volume
docker run --rm \
  -v agent-memory-data:/data \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/agent-memory-backup.tar.gz -C /data .
```

#### Restore Database

```bash
# Copy database to running container
docker cp ./backup/memory.db agent-memory:/app/data/memory.db

# Or restore entire volume
docker run --rm \
  -v agent-memory-data:/data \
  -v $(pwd)/backup:/backup \
  alpine tar xzf /backup/agent-memory-backup.tar.gz -C /data
```

## Monitoring

### Health Checks

The MCP server uses stdio and doesn't expose HTTP endpoints. Monitor using:

```bash
# Check if container is running
docker ps

# View logs
docker logs agent-memory

# Check container resource usage
docker stats agent-memory
```

### Database Inspection

```bash
# Access SQLite database directly
docker exec -it agent-memory sqlite3 /app/data/memory.db

# Check database size
docker exec agent-memory du -h /app/data/memory.db
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs agent-memory

# Check if database is locked
docker exec agent-memory ls -la /app/data/

# Rebuild without cache
docker-compose build --no-cache
```

### Performance Issues

```bash
# Check resource usage
docker stats agent-memory

# Enable performance logging
docker-compose down
# Edit docker-compose.yml: AGENT_MEMORY_PERF=1
docker-compose up -d
docker logs -f agent-memory
```

### Data Not Persisting

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect agent-memory_agent-memory-data

# Verify mount inside container
docker exec agent-memory ls -la /app/data
```

## Development

### Local Development with Docker

```bash
# Mount source code for live development
docker run -i \
  -v $(pwd):/app \
  -v agent-memory-data:/app/data \
  --name agent-memory-dev \
  node:20-alpine sh -c "cd /app && npm install && npm run dev"
```

### Building for Multiple Architectures

```bash
# Build for AMD64 and ARM64
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t agent-memory:latest \
  --push .
```

## Integration with MCP Clients

Since Agent Memory uses stdio for MCP communication, run the container interactively:

```bash
# Start container and attach stdin/stdout
docker run -i agent-memory:latest

# Or with docker-compose
docker-compose run --rm agent-memory
```

For integration with Claude Desktop or other MCP clients, you may need to configure them to use Docker as the command:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-v", "agent-memory-data:/app/data", "agent-memory:latest"]
    }
  }
}
```
