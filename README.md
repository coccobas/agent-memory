# Agent Memory

[![npm version](https://img.shields.io/npm/v/agent-memory.svg)](https://www.npmjs.com/package/agent-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-1200%2B%20passing-brightgreen.svg)](.)

**High-performance MCP server providing structured memory for AI agents.**

Agent Memory gives AI agents persistent, queryable memory across conversations.
Instead of loading entire knowledge bases into context, agents query specific memory
segments on-demand with sub-millisecond latency.

## Quick Start

```bash
npx agent-memory@latest mcp
```

Add to Claude Desktop config (`~/.claude.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

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

Restart Claude. Done.

See [QUICKSTART.md](QUICKSTART.md) for Docker and more options.

## Key Features

### Hierarchical Scoping

Memory entries exist at four levels with automatic inheritance:

```
Global            → Universal patterns (security, best practices)
└── Organization  → Team-wide standards
    └── Project   → Project-specific decisions
        └── Session → Working context
```

Queries at any level can inherit from parent scopes, enabling layered memory.

### Three Memory Types

| Type | Purpose | Examples |
|------|---------|----------|
| **Tools** | Command registry | CLI tools, APIs, MCP tools |
| **Guidelines** | Rules & standards | Code style, security policies |
| **Knowledge** | Facts & decisions | Architecture choices, domain info |

### Production-Ready Features

- **Semantic Search** - Vector embeddings with OpenAI or local models
- **Full-Text Search** - SQLite FTS5 with fuzzy matching
- **Multi-Agent Safe** - File locks, conflict detection, permissions
- **Version History** - Append-only with full audit trail
- **Query Caching** - LRU cache with memory pressure management
- **Rate Limiting** - Per-agent and global limits
- **20+ Bundled Tools** - Action-based API reduces LLM decision fatigue

### Performance

Built for speed with SQLite WAL mode and intelligent caching:

| Operation | Throughput | Latency (p99) |
|-----------|------------|---------------|
| Simple query | 4.5M ops/sec | < 0.3ms |
| Scoped query with inheritance | 3.6M ops/sec | < 0.4ms |
| Full-text search (FTS5) | 3.5M ops/sec | < 0.4ms |
| Semantic search | 3.1M ops/sec | < 0.5ms |

## Server Modes

Agent Memory supports multiple server modes:

```bash
# MCP server (default) - for Claude Desktop, Claude Code, Cursor
npx agent-memory mcp

# REST API server - for custom integrations
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret \
npx agent-memory rest

# Both servers simultaneously
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret \
npx agent-memory both
```

### REST API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `POST /v1/query` | Search memory entries |
| `POST /v1/context` | Get aggregated context |

## Configuration

Key environment variables (see [full reference](docs/reference/environment-variables.md)):

```bash
# Data storage location
AGENT_MEMORY_DATA_DIR=~/.agent-memory

# Semantic search (optional)
AGENT_MEMORY_OPENAI_API_KEY=sk-...

# REST API (disabled by default for security)
AGENT_MEMORY_REST_ENABLED=true
AGENT_MEMORY_REST_API_KEY=your-secret-key
AGENT_MEMORY_REST_HOST=127.0.0.1
AGENT_MEMORY_REST_PORT=8787

# Permissions (secure by default)
AGENT_MEMORY_PERMISSIONS_MODE=permissive  # for single-agent setups
```

## Requirements

- Node.js >= 20.0.0
- MCP-compatible client (Claude Desktop, Claude Code, Cursor, etc.)

## Documentation

| Document | Description |
|----------|-------------|
| [QUICKSTART.md](QUICKSTART.md) | Get running in 2 minutes |
| [INSTALLATION.md](INSTALLATION.md) | Detailed installation options |
| [Getting Started](docs/getting-started.md) | Full setup guide |
| [API Reference](docs/api-reference.md) | Complete tool documentation |
| [Architecture](docs/architecture.md) | System design |
| [Environment Variables](docs/reference/environment-variables.md) | Configuration |

## Development

```bash
git clone https://github.com/anthropics/agent-memory.git
cd agent-memory
npm install
npm run build
npm run validate  # lint + typecheck + tests
```

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Need help?** Check [Troubleshooting](docs/guides/troubleshooting.md) or open an [issue](https://github.com/anthropics/agent-memory/issues).
