# Getting Started

This guide walks you through installing Agent Memory, connecting it to your AI tools, and storing your first memories.

## Prerequisites

- **Node.js** >= 20.0.0
- **MCP-compatible client** (Claude Desktop, Claude Code, Cursor, etc.)

## Installation

### Option A: npx (No Install Required)

```bash
npx agent-memory@latest mcp
```

### Option B: Global Install

```bash
npm install -g agent-memory
agent-memory mcp
```

### Option C: From Source

```bash
git clone https://github.com/anthropics/agent-memory.git
cd agent-memory
npm install
npm run build
node dist/cli.js mcp
```

See [Installation](installation.md) for Docker and other options.

## Server Modes

Agent Memory supports three modes:

| Mode | Command | Use Case |
|------|---------|----------|
| MCP | `agent-memory mcp` | Claude Desktop, Claude Code, Cursor |
| REST | `agent-memory rest` | Custom integrations, web apps |
| Both | `agent-memory both` | Mixed environments |

### MCP Mode (Default)

```bash
agent-memory mcp
```

### REST Mode

```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret \
agent-memory rest
```

### Both Modes

```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret \
agent-memory both
```

## Connect Your MCP Client

### Claude Desktop

**macOS:** `~/.claude.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

### From Source (Any Client)

Point to the built CLI:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/absolute/path/to/agent-memory/dist/cli.js", "mcp"]
    }
  }
}
```

After updating configuration, restart your MCP client.

## Verify Installation

### MCP Health Check

Ask your AI agent:

```
Check the agent memory health status
```

The agent will call `memory_health` and report database status.

### REST Health Check

```bash
curl http://127.0.0.1:8787/health
```

Response:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database": { "connected": true, "path": "..." }
}
```

## Your First Workflow

Agent Memory uses a hierarchical scope system:

```
Global            → Universal patterns
└── Organization  → Team-wide standards
    └── Project   → Project-specific decisions
        └── Session → Working context
```

### Step 1: Create an Organization

Organizations group related projects:

```json
// Tool: memory_org
{
  "action": "create",
  "name": "My Team"
}
```

Response includes `id` (e.g., `org-abc123`).

### Step 2: Create a Project

Projects contain your memories:

```json
// Tool: memory_project
{
  "action": "create",
  "orgId": "org-abc123",
  "name": "my-api",
  "description": "REST API service",
  "rootPath": "/Users/me/projects/my-api"
}
```

Response includes `id` (e.g., `proj-def456`).

### Step 3: Start a Session

Sessions group related work:

```json
// Tool: memory_session
{
  "action": "start",
  "projectId": "proj-def456",
  "name": "Add authentication",
  "agentId": "claude-code"
}
```

Response includes `id` (e.g., `sess-ghi789`).

### Step 4: Store Memories

Now store your project knowledge:

**Guidelines** (rules and standards):

```json
// Tool: memory_guideline
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "name": "typescript-strict",
  "content": "Always use TypeScript strict mode with noImplicitAny enabled",
  "category": "code_style",
  "priority": 90
}
```

**Knowledge** (facts and decisions):

```json
// Tool: memory_knowledge
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "title": "API uses REST not GraphQL",
  "content": "We chose REST over GraphQL for simplicity and caching. Decision made 2024-01.",
  "category": "decision"
}
```

**Tools** (commands and scripts):

```json
// Tool: memory_tool
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "name": "run-tests",
  "description": "Run test suite with coverage",
  "category": "cli",
  "examples": ["npm run test:coverage"]
}
```

### Step 5: Tag Your Entries

Tags enable powerful filtering:

```json
// Tool: memory_tag
{
  "action": "attach",
  "entryType": "guideline",
  "entryId": "guideline-xyz",
  "tagName": "typescript"
}
```

### Step 6: End the Session

```json
// Tool: memory_session
{
  "action": "end",
  "id": "sess-ghi789",
  "status": "completed"
}
```

## Querying Memory

### Get Project Context

Load all relevant memory for a scope:

```json
// Tool: memory_query
{
  "action": "context",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "inherit": true
}
```

Returns guidelines, knowledge, and tools from project and parent scopes.

### Search Across Memory

Find specific entries:

```json
// Tool: memory_query
{
  "action": "search",
  "search": "typescript",
  "types": ["guidelines", "knowledge"],
  "scope": {
    "type": "project",
    "id": "proj-def456",
    "inherit": true
  }
}
```

### Full-Text Search

Enable FTS5 for advanced text search:

```json
// Tool: memory_query
{
  "action": "search",
  "search": "authentication JWT",
  "useFts5": true,
  "fuzzy": true
}
```

### Semantic Search

With OpenAI API key configured:

```json
// Tool: memory_query
{
  "action": "search",
  "search": "how do we handle user login",
  "semanticSearch": true,
  "semanticThreshold": 0.7
}
```

## Bulk Operations

Store multiple entries efficiently:

```json
// Tool: memory_guideline
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-def456",
  "entries": [
    {
      "name": "no-any-types",
      "content": "Never use 'any' type in TypeScript",
      "priority": 95
    },
    {
      "name": "error-handling",
      "content": "Always wrap async operations in try-catch",
      "priority": 80
    }
  ]
}
```

## Memory Types Reference

| Type | Purpose | Examples |
|------|---------|----------|
| **Guideline** | Rules that affect behavior | Code style, security policies, workflow standards |
| **Knowledge** | Facts and decisions | Architecture choices, domain info, historical context |
| **Tool** | Command registry | CLI commands, API endpoints, scripts |

### When to Use Each Type

| Trigger | Type | Category |
|---------|------|----------|
| "We always do X" | Guideline | `code_style` |
| "Never do Y" | Guideline | `security` |
| "We chose X because..." | Knowledge | `decision` |
| "The system uses..." | Knowledge | `fact` |
| CLI command | Tool | `cli` |
| API endpoint | Tool | `api` |

## Data Storage

| Installation | Default Path |
|--------------|--------------|
| npm package | `~/.agent-memory/data` |
| From source | `<project>/data` |
| Docker | `/data` (mount a volume) |

Override with environment variable:

```bash
AGENT_MEMORY_DATA_DIR=/custom/path agent-memory mcp
```

## Enable Semantic Search

For vector-based semantic search, configure OpenAI:

```bash
AGENT_MEMORY_OPENAI_API_KEY=sk-... agent-memory mcp
```

Or in your MCP client config:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"],
      "env": {
        "AGENT_MEMORY_OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

## Permissions Mode

By default, Agent Memory is secure (denies access without explicit permissions).

For single-agent setups, enable permissive mode:

```bash
AGENT_MEMORY_PERMISSIONS_MODE=permissive agent-memory mcp
```

## Next Steps

- [API Reference](api-reference.md) - Complete tool documentation
- [Environment Variables](reference/environment-variables.md) - All configuration options
- [Workflows Guide](guides/workflows.md) - Common usage patterns
- [Docker Setup](guides/docker-setup.md) - Container deployment
- [Architecture](architecture.md) - System design

## Quick Reference

### Essential Tools

| Tool | Primary Actions |
|------|-----------------|
| `memory_query` | `context`, `search` |
| `memory_project` | `create`, `list`, `get` |
| `memory_session` | `start`, `end`, `list` |
| `memory_guideline` | `add`, `update`, `list`, `bulk_add` |
| `memory_knowledge` | `add`, `update`, `list`, `bulk_add` |
| `memory_tool` | `add`, `update`, `list`, `bulk_add` |
| `memory_tag` | `attach`, `detach`, `list` |

### Common Mistakes to Avoid

| Wrong | Correct |
|-------|---------|
| `"scopeType": "project"` (no scopeId) | `"scopeType": "project", "scopeId": "proj-..."` |
| `"entryType": "guidelines"` | `"entryType": "guideline"` |
| `memory_project` action `add` | `memory_project` action `create` |
| `memory_guideline` action `create` | `memory_guideline` action `add` |
