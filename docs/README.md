# Agent Memory Database

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)

A structured memory backend for AI agents exposed via the Model Context Protocol (MCP). Instead of loading entire knowledge bases into context, agents query specific memory segments on-demand.

## 🚀 Quick Start

```bash
# Clone and install
git clone <repository-url>
cd Memory
npm install

# Build
npm run build

# Start the MCP server
npm start
```

**Unix/Linux/macOS:**
Add to Claude Desktop (`~/.config/claude/claude_desktop_config.json`; some macOS installs use `~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/absolute/path/to/Memory/dist/index.js"]
    }
  }
}
```

**Windows:**
Add to Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["C:/path/to/Memory/dist/index.js"]
    }
  }
}
```

That's it! The database initializes automatically on first run. See [Getting Started](./getting-started.md) for detailed setup. **Windows users:** See [Windows Setup Guide](./guides/windows-setup.md) for Windows-specific instructions.

## What Problem Does This Solve?

AI agents working on codebases face a context dilemma:

1. **Too much context** - Loading entire project knowledge consumes tokens and dilutes focus
2. **Too little context** - Missing critical guidelines, decisions, or tool knowledge leads to errors
3. **Stale context** - Knowledge gets outdated as projects evolve
4. **Isolated context** - Multiple agents can't share learnings
5. **Million-step tasks** - Large-scale agentic workflows need reliable memory (validated by [recent research](https://arxiv.org/abs/2511.09030))

Agent Memory solves this by providing a **queryable memory layer**:

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent                                │
│  "What guidelines apply to Python files in this project?"   │
└─────────────────────────┬───────────────────────────────────┘
                          │ MCP Query
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Agent Memory Server                        │
│  ┌─────────┐  ┌────────────┐  ┌───────────┐                │
│  │  Tools  │  │ Guidelines │  │ Knowledge │                │
│  └─────────┘  └────────────┘  └───────────┘                │
│                                                              │
│  Scoped: Global → Org → Project → Session                   │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### Hierarchical Scoping
Memory entries exist at different levels, with automatic inheritance:
- **Global** - Applies everywhere (e.g., security best practices)
- **Organization** - Team-wide standards
- **Project** - Project-specific decisions and patterns
- **Session** - Temporary working context

### Three Memory Sections

| Section | Purpose | Example |
|---------|---------|---------|
| **Tools** | Registry of available tools/commands | MCP tools, CLI commands, APIs |
| **Guidelines** | Rules and best practices | Code style, security policies |
| **Knowledge** | Facts, decisions, context | Architecture decisions, domain knowledge |

### Version History
All changes are tracked with append-only versioning:
- Full history of every entry
- Conflict detection for concurrent writes
- Change reasons documented

### Cross-Reference System
- **Tags** - Categorize entries (predefined + custom)
- **Relations** - Link related entries
- **Queries** - Find relevant context across all sections

## Syncing Rules to IDEs

Sync guidelines to IDE-specific formats for easy setup:

```bash
# Auto-detect IDE and sync
npm run sync-rules --auto-detect

# Sync to specific IDE
npm run sync-rules --ide cursor --scope project --scope-id <project-id>
```

**Supported IDEs:** Cursor, VS Code, IntelliJ, Sublime, Neovim, Emacs, Antigravity, Generic

**Watch Mode:** `npm run sync-rules:watch` - Auto-sync as you work

See [Rules Sync Guide](./guides/rules-sync.md) for detailed documentation.

## Example Usage

### Store a Guideline

```typescript
// Via MCP tool: memory_guideline
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "my-project-id",
  "name": "python-imports",
  "category": "code_style",
  "priority": 80,
  "content": "Use absolute imports. Group imports: stdlib, third-party, local.",
  "rationale": "Consistency and clarity in import organization"
}
```

### Query Relevant Context

```typescript
// Via MCP tool: memory_guideline
{
  "action": "list",
  "scopeType": "project",
  "scopeId": "my-project-id",
  "category": "code_style"
}
// Returns all code_style guidelines for the project + inherited from org/global
```

### Track a Decision

```typescript
// Via MCP tool: memory_knowledge
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "my-project-id",
  "title": "Database Choice",
  "category": "decision",
  "content": "Using PostgreSQL for production. Rationale: JSONB support, team expertise.",
  "source": "Architecture review 2024-01-15"
}
```

## 📚 Documentation

### Core Documentation
- [Getting Started Guide](./getting-started.md) - Detailed setup and usage
- [API Reference](./api-reference.md) - Complete MCP tool documentation
- [Architecture](./architecture.md) - System design and database schema
- [Data Model](./data-model.md) - Entity relationships and scoping
- [Contributing](./contributing.md) - How to contribute

### Guides
- [Development Guide](./guides/development.md) - Local development setup
- [Testing Guide](./guides/testing.md) - Testing guidelines and examples
- [Windows Setup](./guides/windows-setup.md) - Windows-specific setup
- [Rules Sync](./guides/rules-sync.md) - Syncing rules to IDEs

### Reference
- [Database Initialization](./reference/initialization.md) - Database setup and migrations
- [MDAP Support](./reference/mdap-support.md) - Large-scale agentic workflows
- [Environment Variables](./reference/environment-variables.md) - Common configuration options
- [Advanced Environment Variables](./reference/environment-variables-advanced.md) - Full tuning reference
- [Error Codes](./reference/error-codes.md) - Error reference

### Security
- [Security Guide](./security.md) - Security features and best practices

### Examples
- [Example Workflows](../examples/workflows/) - Practical usage examples
- [Common Tasks](../examples/workflows/common-tasks.md) - Recipe book
- [Debugging](../examples/workflows/debugging.md) - Troubleshooting guide

## Project Structure

```
agent-memory/
├── src/
│   ├── db/
│   │   ├── schema.ts           # Drizzle table definitions (21 tables)
│   │   ├── connection.ts       # Database connection with health checks
│   │   └── repositories/       # Data access layer (12 repos)
│   ├── mcp/
│   │   ├── server.ts           # MCP server with 19 bundled tools
│   │   ├── handlers/           # Tool handlers (20 handlers)
│   │   └── types.ts            # Type definitions
│   ├── services/               # Business logic (20+ services)
│   │   ├── query.service.ts    # Advanced search with caching
│   │   ├── vector.service.ts   # Semantic search
│   │   └── ...                 # Analytics, permissions, etc.
│   ├── utils/
│   │   ├── lru-cache.ts        # LRU cache with partial eviction
│   │   ├── rate-limiter.ts     # Sliding window rate limiting
│   │   ├── memory-coordinator.ts # Global cache management
│   │   └── sanitize.ts         # Sensitive data redaction
│   └── index.ts                # Entry point
├── data/
│   └── memory.db               # SQLite database
├── tests/
│   ├── unit/                   # Unit tests (59 files)
│   └── integration/            # Integration tests
└── docs/                       # Documentation
```

## 🛠️ Technology Stack

- **TypeScript** - Type-safe development
- **MCP SDK** - Model Context Protocol integration
- **SQLite** - Portable, zero-config database (WAL mode for concurrency)
- **Drizzle ORM** - Type-safe queries and migrations
- **LanceDB** - Vector database for semantic search
- **Vitest** - Fast testing with 80% coverage threshold (1079 tests)

## 🔧 Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint and format
npm run lint
npm run format

# Type check
npm run typecheck

# Run all checks
npm run validate

# Database studio
npm run db:studio
```

See [Development Guide](./guides/development.md) for more details.

## 🐛 Troubleshooting

### Database Locked Error

```bash
# Kill zombie processes
pkill -f agent-memory

# Remove lock files
rm data/*.db-shm data/*.db-wal
```

### Slow Queries

Enable performance logging:
```bash
export AGENT_MEMORY_PERF=1
npm start
```

### Database Issues

```bash
# Backup database
npm run db:backup

# Check health
# Use memory_health tool via MCP

# Reset (WARNING: deletes all data)
# Use memory_init tool with action: 'reset', confirm: true
```

See [Debugging Guide](../examples/workflows/debugging.md) for more solutions.

## 🤝 Contributing

We welcome contributions! Please read:

1. [Contributing Guide](./contributing.md) - Guidelines and process
2. [Development Guide](./guides/development.md) - Setup and workflow
3. Run `npm run validate` before submitting PRs
4. Add tests for new features

Quick setup:
```bash
./scripts/dev-setup.sh
```

## 📊 Project Status

**Current Version: 0.8.5**

- ✅ Core CRUD operations
- ✅ MCP server with 19 bundled tools
- ✅ Query and context aggregation
- ✅ Export/Import (JSON, Markdown, YAML)
- ✅ File locks for multi-agent coordination
- ✅ Conflict detection and resolution
- ✅ Query caching with LRU and partial eviction
- ✅ Rate limiting (per-agent and global)
- ✅ Semantic search with vector embeddings
- ✅ Advanced filtering (fuzzy, regex, date ranges, priority)
- ✅ Fine-grained permissions system
- ✅ Comprehensive audit logging
- ✅ 1079 passing tests with 80% coverage threshold
- 🔄 In active development

## 🌟 Features

- **Hierarchical Scoping** - Global → Org → Project → Session
- **Version History** - Full append-only versioning with conflict detection
- **Multi-Agent Safe** - File locks and concurrent write handling
- **Query Caching** - LRU cache with partial eviction and memory coordination
- **Rate Limiting** - Per-agent and global rate limits with sliding window
- **Semantic Search** - Vector embeddings with hybrid scoring (semantic + traditional)
- **Advanced Filtering** - Fuzzy search, regex, date ranges, priority filtering
- **Tag System** - Predefined + custom tags for organization
- **Relations** - Link related entries across memory sections
- **Permissions** - Fine-grained access control (read/write/admin)
- **Audit Logging** - Complete audit trail of all operations
- **Security** - API key detection and sensitive data redaction in logs
- **Type-Safe** - Full TypeScript with strict mode
- **MDAP-Ready** - Supports Massively Decomposed Agentic Processes for million-step tasks

## 🔬 Research-Validated Architecture

Agent Memory's design aligns with cutting-edge research on large-scale agentic systems:

**[arXiv:2511.09030](https://arxiv.org/abs/2511.09030)** - "Solving a Million-Step LLM Task with Zero Errors"

This research demonstrates that solving million-step LLM tasks requires:
- ✅ **Maximal decomposition** → Supported via hierarchical scoping
- ✅ **Multi-agent coordination** → File locks and conflict detection
- ✅ **Error tracking** → Append-only versioning with conflict flags
- ✅ **Reliable context** → Queryable, version-controlled memory

Agent Memory provides the memory infrastructure that enables **Massively Decomposed Agentic Processes (MDAPs)**, making it suitable for:
- Long-running multi-agent workflows
- Complex task decomposition hierarchies
- Million-step reasoning tasks
- Production-scale agentic systems

See [Architecture: MDAP Support](./architecture.md#support-for-large-scale-agentic-workflows-mdap) for details.

## 📝 License

MIT - see [LICENSE](../LICENSE) for details

## 🔗 Links

- [Documentation](./README.md)
- [Example Workflows](../examples/workflows/)
- [Architecture Deep Dive](./architecture.md)
- [API Reference](./api-reference.md)

---

**Need help?** Open an issue with the `question` label or check the [Debugging Guide](../examples/workflows/debugging.md).
