# Agent Memory

[![npm version](https://img.shields.io/npm/v/agent-memory.svg)](https://www.npmjs.com/package/agent-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)

**MCP server providing structured memory backend for AI agents.**

Agent Memory is a Model Context Protocol (MCP) server that gives AI agents persistent, queryable memory across conversations. Instead of loading entire knowledge bases into context, agents query specific memory segments on-demand.

## Features

- **Hierarchical Scoping** - Global, Organization, Project, and Session scopes with inheritance
- **Versioned Memory** - Append-only history with conflict detection
- **Semantic Search** - Vector embeddings for intelligent retrieval
- **Multi-Agent Coordination** - File locks and permissions for concurrent access
- **Cross-Reference Queries** - Search across tools, guidelines, and knowledge entries
- **19 Bundled Tools** - Action-based API reduces LLM decision fatigue

## Quick Start

### Installation

```bash
npm install agent-memory
```

### Configure Claude Desktop

Add to your Claude Desktop configuration:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json` (some installs use `~/.config/claude/claude_desktop_config.json`)
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/path/to/node_modules/agent-memory/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop to connect.

### Configure Claude Code

Agent Memory can be configured at three different scopes in Claude Code:

#### User-Level (Global)
Available across all projects. Add to `~/.claude.json`:

**NPM Package (Recommended):**
```json
{
  "mcpServers": {
    "agent-memory": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"],
      "env": {}
    }
  }
}
```

**Docker:**
```json
{
  "mcpServers": {
    "agent-memory": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v",
        "~/.agent-memory:/data",
        "-e",
        "AGENT_MEMORY_DATA_DIR=/data",
        "ghcr.io/coccobas/agent-memory:latest"
      ],
      "env": {}
    }
  }
}
```

**Local Development:**
```json
{
  "mcpServers": {
    "agent-memory": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/agent-memory/dist/cli.js"],
      "env": {}
    }
  }
}
```

#### Project-Level (Shared)
Committed to repository for team collaboration. Create `.mcp.json` in project root:

```json
{
  "mcpServers": {
    "agent-memory": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"],
      "env": {}
    }
  }
}
```

#### Local Project (Private)
Project-specific but not shared. Automatically created in `~/.claude.json` when using:

```bash
# CLI method (adds to local project config)
claude mcp add agent-memory node /path/to/agent-memory/dist/cli.js
```

## Core Concepts

### Memory Types

| Type | Purpose | Example |
|------|---------|---------|
| **Tools** | Registry of available commands | CLI tools, MCP tools, APIs |
| **Guidelines** | Rules and best practices | Code style, security policies |
| **Knowledge** | Facts and decisions | Architecture choices, domain info |

### Scope Hierarchy

```
Global          → Universal patterns
└── Organization → Team-wide standards
    └── Project    → Project-specific decisions
        └── Session   → Working context
```

Queries inherit from parent scopes automatically.

### Example Usage

```json
{
  "name": "memory_query",
  "arguments": {
    "action": "context",
    "scopeType": "project",
    "scopeId": "my-project",
    "inherit": true
  }
}
```

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/getting-started.md) | Setup and first steps |
| [API Reference](docs/api-reference.md) | Complete tool documentation |
| [Architecture](docs/architecture.md) | System design and internals |
| [Data Model](docs/data-model.md) | Database schema reference |
| [Contributing](docs/contributing.md) | How to contribute |

### Guides

- [Development Guide](docs/guides/development.md) - Local development setup
- [Testing Guide](docs/guides/testing.md) - Running and writing tests
- [Windows Setup](docs/guides/windows-setup.md) - Windows-specific instructions
- [Rules Sync](docs/guides/rules-sync.md) - Sync rules to IDEs

### Reference

- [Initialization](docs/reference/initialization.md) - Database setup
- [MDAP Support](docs/reference/mdap-support.md) - Large-scale agentic workflows
- [Environment Variables](docs/reference/environment-variables.md) - Common configuration options
- [Advanced Environment Variables](docs/reference/environment-variables-advanced.md) - Full tuning reference
- [Error Codes](docs/reference/error-codes.md) - Error reference
- [Security](docs/security.md) - Security features and best practices

## Requirements

- Node.js >= 20.0.0
- An MCP-compatible client (Claude Desktop, Claude Code, etc.)

## Development

```bash
# Clone and install
git clone <repository-url>
cd agent-memory
npm install

# Build
npm run build

# Test
npm test

# Validate all checks
npm run validate
```

## License

MIT License - see [LICENSE](LICENSE) for details.
