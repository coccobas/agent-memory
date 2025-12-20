# Docker Setup

Agent Memory supports two Docker deployment styles:

- **MCP (stdio)**: your MCP client launches the container (recommended for Claude Desktop/Cursor).
- **REST (HTTP)**: run a long-lived service (recommended for custom integrations).

## MCP via Docker (client-launched)

Your MCP client runs `docker run ... mcp` and talks to the container over stdio.

Important: use an **absolute host path** for the volume mount (many MCP clients do not expand `~`).

```bash
docker run --rm -i \
  -v /absolute/host/path/agent-memory:/data \
  ghcr.io/anthropics/agent-memory:latest mcp
```

Example Claude Desktop config:

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
        "/absolute/host/path/agent-memory:/data",
        "ghcr.io/anthropics/agent-memory:latest",
        "mcp"
      ]
    }
  }
}
```

## REST via Docker Compose (service)

`docker-compose.yml` runs the REST API and exposes port `8787`.

1. Create a `.env` file:

```bash
AGENT_MEMORY_REST_API_KEY=your-secret
# Optional: override where memory is stored on the host
# AGENT_MEMORY_DATA_DIR=/absolute/host/path/agent-memory
```

2. Start the service:

```bash
docker compose up --build -d
```

3. Verify:

```bash
curl http://127.0.0.1:8787/health
```
