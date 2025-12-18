# Agent Memory

[![npm version](https://img.shields.io/npm/v/agent-memory.svg)](https://www.npmjs.com/package/agent-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-1216%20passing-brightgreen.svg)](.)
[![Coverage](https://img.shields.io/badge/coverage-80%25-brightgreen.svg)](.)

**High-performance MCP server providing structured memory for AI agents.**

Agent Memory gives AI agents persistent, queryable memory across conversations. Instead of loading entire knowledge bases into context, agents query specific memory segments on-demand with sub-millisecond latency.

## Performance

Built for speed with SQLite WAL mode and intelligent caching:

| Operation | Throughput | Latency (p99) |
|-----------|------------|---------------|
| Simple query | **4.5M ops/sec** | < 0.3ms |
| Scoped query with inheritance | **3.6M ops/sec** | < 0.4ms |
| Full-text search (FTS5) | **3.5M ops/sec** | < 0.4ms |
| Complex multi-filter query | **4.1M ops/sec** | < 0.3ms |
| Semantic search | **3.1M ops/sec** | < 0.5ms |

## Quick Start

```bash
npx agent-memory@latest mcp
```

Add to Claude config (`~/.claude.json`):

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

See [QUICKSTART.md](QUICKSTART.md) for Docker and source installation options.

## Key Features

### Hierarchical Scoping
Memory entries exist at four levels with automatic inheritance:
```
Global          → Universal patterns (security, best practices)
└── Organization → Team-wide standards
    └── Project    → Project-specific decisions
        └── Session   → Working context
```

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
- **20 Bundled Tools** - Action-based API reduces LLM decision fatigue

### Research-Validated Architecture

Designed for large-scale agentic workflows based on [arXiv:2511.09030](https://arxiv.org/abs/2511.09030):
- Maximal task decomposition via hierarchical scoping
- Multi-agent coordination with conflict detection
- Reliable context through version-controlled memory
- Scales to million-step workflows (MDAP-ready)

## Server Modes

Agent Memory supports multiple server modes:

```bash
# MCP server (default) - for Claude Desktop, Claude Code
npx agent-memory mcp

# REST API server - for custom integrations
npx agent-memory rest

# Both servers simultaneously
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

# REST API (optional)
AGENT_MEMORY_REST_PORT=8787
AGENT_MEMORY_REST_HOST=127.0.0.1
```

## Test Coverage

- **1216 tests** across 70 test files
- **80% coverage threshold** enforced
- Unit, integration, and benchmark suites

```bash
npm test              # Run all tests
npm run bench:run     # Run performance benchmarks
npm run validate      # Full validation suite
```

## Documentation

| Document | Description |
|----------|-------------|
| [QUICKSTART.md](QUICKSTART.md) | Get running in 2 minutes |
| [Getting Started](docs/getting-started.md) | Detailed setup guide |
| [API Reference](docs/api-reference.md) | Complete tool documentation |
| [Architecture](docs/architecture.md) | System design |
| [Environment Variables](docs/reference/environment-variables.md) | Configuration |

## Roadmap

Current focus areas for upcoming releases:

- **Extended REST API** - Full CRUD operations via HTTP
- **Webhook Notifications** - Real-time memory change events
- **PostgreSQL Support** - For high-concurrency deployments
- **Memory Extraction** - LLM-powered auto-capture from conversations
- **IDE Plugins** - Native VS Code and JetBrains integrations
- **Distributed Mode** - Multi-node deployment for enterprise scale
- **Memory Analytics Dashboard** - Visualize agent memory patterns
- *...and much more on the way*

## Requirements

- Node.js >= 20.0.0
- MCP-compatible client (Claude Desktop, Claude Code, Cursor, etc.)

## Development

```bash
git clone https://github.com/coccobas/agent-memory.git
cd agent-memory
npm install
npm run build
npm run validate
```

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Need help?** Check [Troubleshooting](docs/README.md#-troubleshooting) or open an [issue](https://github.com/coccobas/agent-memory/issues).
