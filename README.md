<div align="center">

# Agent Memory

**Give Your AI Agents Persistent, Queryable Memory**

[![npm version](https://img.shields.io/npm/v/agent-memory.svg?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/agent-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-green.svg?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-1200%2B%20passing-success.svg?style=for-the-badge)](.)

<br />

Stop cramming entire knowledge bases into context.<br/>
Query specific memory on-demand with **sub-millisecond latency**.

<br />

[Get Started](#-quick-start) · [Documentation](docs/README.md) · [API Reference](docs/api-reference.md)

---

</div>

## The Problem

Every conversation, your AI agent starts from scratch. You copy-paste context, repeat instructions, and watch tokens burn. Knowledge gets lost between sessions.

## The Solution

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Before: Load everything → 🔥 Token explosion                  │
│                                                                 │
│   After:  Query what you need → ⚡ Sub-ms response              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Agent Memory is an **MCP server** that gives AI agents persistent, structured memory. Instead of stuffing context, agents query specific knowledge on-demand.

---

## ⚡ Quick Start

**One command. That's it.**

```bash
npx agent-memory@latest mcp
```

Add to your MCP client config:

<details>
<summary><b>Claude Desktop</b> — <code>~/.claude.json</code></summary>

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

</details>

<details>
<summary><b>Cursor</b> — <code>.cursor/mcp.json</code></summary>

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

</details>

<details>
<summary><b>VS Code</b> — <code>settings.json</code></summary>

```json
{
  "mcp.servers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"]
    }
  }
}
```

</details>

**Restart your client. Done.**

---

## 🏗️ Architecture

```
                    ┌─────────────────────────────────────┐
                    │           HIERARCHICAL SCOPES       │
                    └─────────────────────────────────────┘

     ┌──────────────────────────────────────────────────────────────┐
     │  GLOBAL                                                      │
     │  └── Security best practices, universal patterns             │
     │      │                                                       │
     │      ├── ORGANIZATION                                        │
     │      │   └── Team standards, shared tooling                  │
     │      │       │                                               │
     │      │       ├── PROJECT                                     │
     │      │       │   └── Architecture decisions, code style      │
     │      │       │       │                                       │
     │      │       │       └── SESSION                             │
     │      │       │           └── Current working context         │
     │      │       │                                               │
     └──────┴───────┴───────────────────────────────────────────────┘

                         Queries inherit up the chain
```

---

## 🎯 Three Memory Types

| Type | Purpose | Example |
|:-----|:--------|:--------|
| 🔧 **Tools** | Command registry — CLI, APIs, scripts | `{"name": "test-coverage", "command": "npm run test:cov"}` |
| 📏 **Guidelines** | Rules & standards — code style, security | `{"name": "no-any", "content": "Never use 'any' type"}` |
| 💡 **Knowledge** | Facts & decisions — architecture, gotchas | `{"title": "Auth", "content": "Using JWT with RS256"}` |

---

## 🚀 Performance

Built for speed. SQLite WAL mode + intelligent caching.

| Operation | Throughput | p99 Latency |
|:----------|:----------:|:-----------:|
| Simple query | **4.5M ops/sec** | < 0.3ms |
| Scoped + inheritance | **3.6M ops/sec** | < 0.4ms |
| Full-text search | **3.5M ops/sec** | < 0.4ms |
| Semantic search | **3.1M ops/sec** | < 0.5ms |

---

## ✨ Features

| Smart Search | Multi-Agent Ready | Production Grade |
|:-------------|:------------------|:-----------------|
| Semantic search (OpenAI/local) | File locking | Version history |
| Full-text search (FTS5) | Conflict detection | Query caching |
| Hybrid search | Per-agent permissions | Rate limiting |

---

## 🔌 Server Modes

```bash
# MCP Server (default) — Claude Desktop, Cursor, etc.
npx agent-memory mcp

# REST API — Custom integrations
AGENT_MEMORY_REST_API_KEY=secret npx agent-memory rest

# Both simultaneously
AGENT_MEMORY_REST_API_KEY=secret npx agent-memory both
```

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `POST /v1/query` | Search memory |
| `POST /v1/context` | Get aggregated context |

---

## ⚙️ Configuration

```bash
# Where to store data
AGENT_MEMORY_DATA_DIR=~/.agent-memory

# Enable semantic search (optional)
AGENT_MEMORY_OPENAI_API_KEY=sk-...

# REST API (disabled by default)
AGENT_MEMORY_REST_ENABLED=true
AGENT_MEMORY_REST_API_KEY=your-secret

# Single-agent mode (skip permissions)
AGENT_MEMORY_PERMISSIONS_MODE=permissive
```

[→ Full configuration reference](docs/reference/environment-variables.md)

---

## 📚 Documentation

| Resource | Description |
|:---------|:------------|
| [Quickstart](docs/quickstart.md) | Get running in 2 minutes |
| [Installation](docs/installation.md) | npm, Docker, source |
| [Getting Started](docs/getting-started.md) | Full setup guide |
| [API Reference](docs/api-reference.md) | All 20+ tools documented |
| [IDE Setup](docs/guides/ide-setup.md) | Claude, Cursor, VS Code |
| [Troubleshooting](docs/guides/troubleshooting.md) | Common issues |

---

## 🛠️ Development

```bash
git clone https://github.com/anthropics/agent-memory.git
cd agent-memory
npm install
npm run build
npm run validate  # lint + typecheck + tests
```

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

<div align="center">

**Built for the AI-native era**

[Get Started](#-quick-start) · [Report Bug](https://github.com/anthropics/agent-memory/issues) · [Request Feature](https://github.com/anthropics/agent-memory/issues)

</div>
