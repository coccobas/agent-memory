# Quickstart

Get Agent Memory running in under 2 minutes.

## Option 1: npx (Fastest)

```bash
npx agent-memory@latest mcp
```

## Option 2: Global Install

```bash
npm install -g agent-memory
agent-memory mcp
```

## Option 3: Docker

```bash
docker run -v ~/.agent-memory:/data ghcr.io/anthropics/agent-memory:latest mcp
```

## Configure Your MCP Client

### Claude Desktop

Add to `~/.claude.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"]
    }
  }
}
```

### Claude Code

Add to `~/.claude/claude_code_config.json`:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"]
    }
  }
}
```

### Cursor

Create `.cursor/mcp.json` in your project or home directory:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"]
    }
  }
}
```

## Verify It Works

After configuring your client, restart it and try:

1. Ask the agent to check memory health:
   ```
   Check the agent memory health status
   ```

2. Store your first memory:
   ```
   Remember that this project uses TypeScript with strict mode enabled
   ```

3. Query memory:
   ```
   What do you remember about this project?
   ```

## Enable REST API (Optional)

For custom integrations via HTTP:

```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret-key \
npx agent-memory rest
```

Test it:

```bash
# Health check (no auth required)
curl http://127.0.0.1:8787/health

# Query (auth required)
curl -X POST http://127.0.0.1:8787/v1/context \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"scopeType": "global", "agentId": "test"}'
```

## Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DATA_DIR` | `~/.agent-memory` | Data storage location |
| `AGENT_MEMORY_OPENAI_API_KEY` | - | Enable semantic search |
| `AGENT_MEMORY_REST_ENABLED` | `false` | Enable REST API |
| `AGENT_MEMORY_REST_API_KEY` | - | REST API authentication |
| `AGENT_MEMORY_PERMISSIONS_MODE` | `strict` | Set to `permissive` for single-agent |

## Next Steps

- [Installation](installation.md) - Detailed installation options
- [Getting Started](getting-started.md) - Full setup guide
- [API Reference](api-reference.md) - Complete API documentation
- [Workflows](guides/workflows.md) - Common usage patterns
