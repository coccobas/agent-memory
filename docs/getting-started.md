# Getting Started

This guide gets Agent Memory running locally and connected to an MCP client.

## 1) Install

### Option A: From source (recommended for development)

```bash
git clone <repo-url>
cd Memory
npm install
npm run build
```

### Option B: From npm (recommended for consumers)

```bash
npm install -g agent-memory
```

## 2) Run the server

Agent Memory supports three modes:

- **MCP** (stdio JSON-RPC)
- **REST** (HTTP API)
- **Both** (start REST, then MCP)

### MCP mode (default)

```bash
agent-memory mcp
```

### REST mode

```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret \
agent-memory rest
```

### Both

```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret \
agent-memory both
```

## 3) Connect a client (MCP)

Example for Claude Desktop (macOS):

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/absolute/path/to/Memory/dist/cli.js", "mcp"]
    }
  }
}
```

Windows example:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["C:/path/to/Memory/dist/cli.js", "mcp"]
    }
  }
}
```

## 4) Verify

Run a health check (MCP tool):

```json
{ "action": "status" }
```

Or for REST:

```bash
curl http://127.0.0.1:8787/health
```

## Data Paths

- When installed as an npm package, data defaults to `~/.agent-memory/data`.
- When running from source, data defaults to `<repo>/data`.
- Override with `AGENT_MEMORY_DATA_DIR` or specific path env vars.

## Next Steps

- API Reference: `docs/api-reference.md`
- Environment Variables: `docs/reference/environment-variables.md`
- Docker Setup: `docs/guides/docker-setup.md`
