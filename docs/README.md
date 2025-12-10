# Agent Memory Database

A structured memory backend for AI agents exposed via the Model Context Protocol (MCP). Instead of loading entire knowledge bases into context, agents query specific memory segments on-demand.

## What Problem Does This Solve?

AI agents working on codebases face a context dilemma:

1. **Too much context** - Loading entire project knowledge consumes tokens and dilutes focus
2. **Too little context** - Missing critical guidelines, decisions, or tool knowledge leads to errors
3. **Stale context** - Knowledge gets outdated as projects evolve
4. **Isolated context** - Multiple agents can't share learnings

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

## Quick Start

### Installation

```bash
# Clone and install
cd agent-memory
npm install

# Run migrations
npm run db:migrate

# Build
npm run build
```

### Running the Server

```bash
# Start MCP server
node dist/index.js
```

### Adding to Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/path/to/agent-memory/dist/index.js"]
    }
  }
}
```

## Example Usage

### Store a Guideline

```typescript
// Via MCP tool: memory_guideline_add
{
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
// Via MCP tool: memory_guideline_list
{
  "scopeType": "project",
  "scopeId": "my-project-id",
  "category": "code_style"
}
// Returns all code_style guidelines for the project + inherited from org/global
```

### Track a Decision

```typescript
// Via MCP tool: memory_knowledge_add
{
  "scopeType": "project",
  "scopeId": "my-project-id",
  "title": "Database Choice",
  "category": "decision",
  "content": "Using PostgreSQL for production. Rationale: JSONB support, team expertise.",
  "source": "Architecture review 2024-01-15"
}
```

## Documentation

- [Architecture](./architecture.md) - System design and database schema
- [API Reference](./api-reference.md) - Complete MCP tool documentation
- [Getting Started](./getting-started.md) - Detailed setup and usage guide
- [Data Model](./data-model.md) - Entity relationships and scoping

## Project Structure

```
agent-memory/
├── src/
│   ├── db/
│   │   ├── schema.ts           # Drizzle table definitions
│   │   ├── connection.ts       # Database setup
│   │   └── repositories/       # Data access layer
│   ├── mcp/
│   │   ├── server.ts           # MCP server setup
│   │   ├── handlers/           # Tool handlers
│   │   └── types.ts            # Type definitions
│   └── index.ts                # Entry point
├── data/
│   └── memory.db               # SQLite database
├── tests/
│   └── unit/                   # Unit tests
└── docs/                       # Documentation
```

## Technology Stack

- **TypeScript** - Type-safe development
- **MCP SDK** - Model Context Protocol integration
- **SQLite** - Portable, zero-config database
- **Drizzle ORM** - Type-safe queries and migrations
- **Vitest** - Fast testing

## License

MIT
