# Docker Setup Guide

This guide covers running Agent Memory as a Docker container.

## Prerequisites

- Docker 20.x or later
- An MCP-compatible client (Claude Desktop, Claude Code, etc.)

## Quick Start

### 1. Build the Image

```bash
cd agent-memory
docker build -t agent-memory:latest .
```

Or use docker-compose:

```bash
docker-compose build
```

### 2. Run with Claude Code

```bash
claude mcp add agent-memory docker -- run -i --rm \
  -v ~/.agent-memory:/data \
  agent-memory:latest
```

### 3. Run with Claude Desktop

Add to your Claude Desktop configuration:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux:** `~/.config/claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "/Users/yourname/.agent-memory:/data",
        "agent-memory:latest"
      ]
    }
  }
}
```

**Important:** Replace `/Users/yourname` with your actual home directory path. Tilde (`~`) expansion does not work in JSON config files.

## Data Persistence

### Volume Mount

The container stores data at `/data`. Mount a host directory to persist data:

```bash
# Create the directory first
mkdir -p ~/.agent-memory

# Run with bind mount
docker run -i --rm -v ~/.agent-memory:/data agent-memory:latest
```

### Using docker-compose

The provided `docker-compose.yml` automatically mounts `~/.agent-memory` to `/data`:

```yaml
volumes:
  - ${AGENT_MEMORY_DATA_DIR:-~/.agent-memory}:/data
```

Override the host path with the `AGENT_MEMORY_DATA_DIR` environment variable:

```bash
AGENT_MEMORY_DATA_DIR=/custom/path docker-compose up
```

## Environment Variables and Docker

### Path Variables Are Ignored in Docker

**Important:** The `AGENT_MEMORY_DB_PATH` and `AGENT_MEMORY_VECTOR_DB_PATH` environment variables from your `.env` file are **not used** when running in Docker.

Inside the container, these paths are hardcoded to:
- `AGENT_MEMORY_DB_PATH=/data/memory.db`
- `AGENT_MEMORY_VECTOR_DB_PATH=/data/vectors.lance`

This is intentional. The container always uses `/data` internally, and you control where that maps on the host via the volume mount (`-v`).

### Why This Design?

1. **Consistency** - The container behavior is predictable regardless of host environment
2. **Simplicity** - One volume mount controls all data persistence
3. **Security** - Container cannot access arbitrary host paths

### What You Control

| Setting | How to Configure |
|---------|------------------|
| Host data location | `-v /your/path:/data` volume mount |
| Database file | Always `/data/memory.db` inside container |
| Vector DB | Always `/data/vectors.lance` inside container |

### Non-Path Variables Work Normally

Other environment variables are read from `.env` or can be passed directly:

```bash
docker run -i --rm \
  -v ~/.agent-memory:/data \
  -e LOG_LEVEL=debug \
  -e AGENT_MEMORY_PERF=1 \
  -e AGENT_MEMORY_OPENAI_API_KEY=sk-... \
  agent-memory:latest
```

Or with docker-compose, the `.env` file is loaded automatically:

```yaml
env_file:
  - .env
environment:
  # Path vars are overridden (container uses /data internally)
  - AGENT_MEMORY_DB_PATH=/data/memory.db
  - AGENT_MEMORY_VECTOR_DB_PATH=/data/vectors.lance
  # Non-path vars from .env are used
  - LOG_LEVEL=${LOG_LEVEL:-info}
```

## Sharing Data Between npm and Docker

To share the same database between npm (local) and Docker installations:

### 1. Set npm to Use a Shared Location

```bash
# In your shell profile or .env
export AGENT_MEMORY_DB_PATH=~/.agent-memory/memory.db
export AGENT_MEMORY_VECTOR_DB_PATH=~/.agent-memory/vectors.lance
```

### 2. Mount the Same Location in Docker

```bash
docker run -i --rm -v ~/.agent-memory:/data agent-memory:latest
```

Both will now read/write to the same `~/.agent-memory` directory.

## Using Pre-built Images

If you've pushed the image to a registry:

```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/your-org/agent-memory:latest

# Run
docker run -i --rm -v ~/.agent-memory:/data ghcr.io/your-org/agent-memory:latest
```

## docker-compose Reference

The included `docker-compose.yml` provides a complete configuration:

```yaml
services:
  agent-memory:
    build:
      context: .
      dockerfile: Dockerfile
    image: agent-memory:latest
    container_name: agent-memory
    volumes:
      - ${AGENT_MEMORY_DATA_DIR:-~/.agent-memory}:/data
    env_file:
      - .env
    environment:
      # Container paths are hardcoded - do not read from .env
      - AGENT_MEMORY_DB_PATH=/data/memory.db
      - AGENT_MEMORY_VECTOR_DB_PATH=/data/vectors.lance
      - LOG_LEVEL=${LOG_LEVEL:-info}
    stdin_open: true
    tty: true
    restart: unless-stopped
```

### Common Commands

```bash
# Build and start
docker-compose up --build

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Rebuild after code changes
docker-compose build --no-cache
```

## Troubleshooting

### Container Exits Immediately

MCP servers use stdio transport. The container needs `-i` (interactive) to keep stdin open:

```bash
# Correct
docker run -i --rm -v ~/.agent-memory:/data agent-memory:latest

# Wrong - will exit immediately
docker run --rm -v ~/.agent-memory:/data agent-memory:latest
```

### Permission Denied on Data Directory

The container runs as non-root user `node`. Ensure the host directory is writable:

```bash
mkdir -p ~/.agent-memory
chmod 755 ~/.agent-memory
```

### Database Not Persisting

Verify the volume mount is correct:

```bash
# Check if data exists on host
ls -la ~/.agent-memory/

# Should show:
# memory.db
# vectors.lance/
```

### Health Check Failing

Check container health:

```bash
docker inspect agent-memory --format='{{.State.Health.Status}}'
```

View health check logs:

```bash
docker inspect agent-memory --format='{{range .State.Health.Log}}{{.Output}}{{end}}'
```

### Environment Variables Not Working

Remember:
- Path variables (`AGENT_MEMORY_DB_PATH`, `AGENT_MEMORY_VECTOR_DB_PATH`) are ignored
- Other variables should work - verify with:

```bash
docker run -i --rm -e AGENT_MEMORY_DEBUG=1 -v ~/.agent-memory:/data agent-memory:latest
```

## See Also

- [Getting Started](../getting-started.md) - General setup guide
- [Environment Variables](../reference/environment-variables.md) - Configuration reference
- [Architecture](../architecture.md) - System design details
