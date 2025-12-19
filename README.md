# Agent Memory

[![npm version](https://img.shields.io/npm/v/agent-memory.svg)](https://www.npmjs.com/package/agent-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)

Agent Memory is a structured memory backend for AI agents. It exposes MCP tools for
querying and writing memory (tools, guidelines, knowledge) with scoped inheritance.

## Quick Start

```bash
npx agent-memory@latest mcp
```

Example Claude Desktop config:

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

## REST API (optional)

REST is disabled by default and requires an API key unless explicitly disabled:

```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret \
npx agent-memory@latest rest
```

## Documentation

- `docs/README.md` (documentation index)
- `docs/getting-started.md`
- `docs/api-reference.md`
- `docs/reference/environment-variables.md`

## License

MIT. See `LICENSE`.
