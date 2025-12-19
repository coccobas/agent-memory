# Getting Started

Complete guide to Agent Memory concepts and your first workflow.

## Prerequisites

- **Node.js** >= 20.0.0
- **MCP-compatible client** (Claude Desktop, Claude Code, Cursor)

## Setup

```bash
npx agent-memory@latest mcp
```

Then configure your IDE. See [IDE Setup](guides/ide-setup.md) for detailed instructions, or [Quickstart](quickstart.md) for the minimal config.

## Core Concepts

### Hierarchical Scopes

Memory is organized in a hierarchy. Queries inherit from parent scopes:

```
Global            → Universal patterns (security, best practices)
└── Organization  → Team-wide standards
    └── Project   → Project-specific decisions
        └── Session → Working context
```

### Three Memory Types

| Type | Purpose | When to Use |
|:-----|:--------|:------------|
| **Guideline** | Rules that affect behavior | "We always...", "Never..." |
| **Knowledge** | Facts and decisions | "We chose X because...", "The system uses..." |
| **Tool** | Command registry | CLI commands, API endpoints, scripts |

---

## Your First Workflow

### 1. Create a Project

```json
{
  "action": "create",
  "name": "my-api",
  "description": "REST API service",
  "rootPath": "/path/to/project"
}
```

Tool: `memory_project`. Response includes `id` (e.g., `proj-abc123`).

### 2. Start a Session

```json
{
  "action": "start",
  "projectId": "proj-abc123",
  "name": "Add authentication",
  "agentId": "claude-code"
}
```

Tool: `memory_session`. Sessions group related work.

### 3. Store Memory

**Guideline** (rules):

```json
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-abc123",
  "name": "typescript-strict",
  "content": "Always use TypeScript strict mode",
  "category": "code_style",
  "priority": 90
}
```

Tool: `memory_guideline`

**Knowledge** (facts):

```json
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-abc123",
  "title": "API uses REST not GraphQL",
  "content": "Chose REST for simplicity and caching",
  "category": "decision"
}
```

Tool: `memory_knowledge`

### 4. Tag Entries

```json
{
  "action": "attach",
  "entryType": "guideline",
  "entryId": "guideline-xyz",
  "tagName": "typescript"
}
```

Tool: `memory_tag`. Tags enable powerful filtering.

### 5. End Session

```json
{
  "action": "end",
  "id": "sess-xyz",
  "status": "completed"
}
```

---

## Querying Memory

### Get Context

Load all memory for a scope:

```json
{
  "action": "context",
  "scopeType": "project",
  "scopeId": "proj-abc123",
  "inherit": true
}
```

Tool: `memory_query`. Returns guidelines, knowledge, and tools from project and parent scopes.

### Search

```json
{
  "action": "search",
  "search": "typescript",
  "types": ["guidelines", "knowledge"],
  "scope": { "type": "project", "id": "proj-abc123", "inherit": true }
}
```

### Semantic Search

With `AGENT_MEMORY_OPENAI_API_KEY` configured:

```json
{
  "action": "search",
  "search": "how do we handle user login",
  "semanticSearch": true,
  "semanticThreshold": 0.7
}
```

---

## Bulk Operations

Store multiple entries at once:

```json
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "proj-abc123",
  "entries": [
    { "name": "no-any", "content": "Never use 'any' type", "priority": 95 },
    { "name": "error-handling", "content": "Wrap async in try-catch", "priority": 80 }
  ]
}
```

Tool: `memory_guideline`, `memory_knowledge`, or `memory_tool`

---

## Quick Reference

### Essential Tools

| Tool | Actions |
|:-----|:--------|
| `memory_query` | `context`, `search` |
| `memory_project` | `create`, `list`, `get` |
| `memory_session` | `start`, `end`, `list` |
| `memory_guideline` | `add`, `update`, `list`, `bulk_add` |
| `memory_knowledge` | `add`, `update`, `list`, `bulk_add` |
| `memory_tool` | `add`, `update`, `list`, `bulk_add` |
| `memory_tag` | `attach`, `detach`, `list` |

### Common Mistakes

| Wrong | Correct |
|:------|:--------|
| `"scopeType": "project"` (missing scopeId) | `"scopeType": "project", "scopeId": "proj-..."` |
| `"entryType": "guidelines"` | `"entryType": "guideline"` (singular) |
| `memory_project` action `add` | `memory_project` action `create` |
| `memory_guideline` action `create` | `memory_guideline` action `add` |

---

## Next Steps

- [API Reference](api-reference.md) — Complete tool documentation
- [Workflows](guides/workflows.md) — Common usage patterns
- [Hooks](guides/hooks.md) — Runtime enforcement
- [Rules Sync](guides/rules-sync.md) — Sync guidelines to IDE
