# First Workflow Tutorial

Learn the complete Agent Memory workflow: create a project, start a session, store memories, and query them.

**What you'll learn:**

- How to create and manage projects
- How to use sessions to group work
- The three memory types: guidelines, knowledge, tools
- How to query and search your memories

**Prerequisites:**

- Completed [Quickstart](quickstart.md)
- Agent Memory running and connected to your IDE

**Time:** ~10 minutes

---

## Understanding Memory Types

Before we start, let's understand what we're storing:

| Type          | Purpose                    | When to Use                                   |
| :------------ | :------------------------- | :-------------------------------------------- |
| **Guideline** | Rules that affect behavior | "We always...", "Never..."                    |
| **Knowledge** | Facts and decisions        | "We chose X because...", "The system uses..." |
| **Tool**      | Command registry           | CLI commands, API endpoints, scripts          |

---

## Step 1: Create a Project

Projects are containers for your memories. Let's create one:

```json
{
  "action": "create",
  "name": "my-api",
  "description": "REST API service",
  "rootPath": "/path/to/project"
}
```

**Tool:** `memory_project`

The response includes an `id` (e.g., `proj-abc123`). Save this for the next steps.

---

## Step 2: Start a Session

Sessions group related work together. Think of them like a work log:

```json
{
  "action": "start",
  "projectId": "proj-abc123",
  "name": "Add authentication",
  "agentId": "claude-code"
}
```

**Tool:** `memory_session`

---

## Step 3: Store Your First Guideline

Guidelines are rules your agent should follow. Let's add one:

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

**Tool:** `memory_guideline`

**Tip:** Higher priority (0-100) means more important. Use 90+ for critical rules.

---

## Step 4: Store Knowledge

Knowledge entries capture facts and decisions:

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

**Tool:** `memory_knowledge`

---

## Step 5: Tag Your Entries

Tags enable powerful filtering:

```json
{
  "action": "attach",
  "entryType": "guideline",
  "entryId": "guideline-xyz",
  "tagName": "typescript"
}
```

**Tool:** `memory_tag`

---

## Step 6: Query Your Memories

### Get All Context

Load everything for your project:

```json
{
  "action": "context",
  "scopeType": "project",
  "scopeId": "proj-abc123",
  "inherit": true
}
```

**Tool:** `memory_query`

The `inherit: true` flag includes memories from parent scopes (global, org).

### Search Specific Topics

```json
{
  "action": "search",
  "search": "typescript",
  "types": ["guidelines", "knowledge"],
  "scope": { "type": "project", "id": "proj-abc123", "inherit": true }
}
```

---

## Step 7: End the Session

When you're done working:

```json
{
  "action": "end",
  "id": "sess-xyz",
  "status": "completed"
}
```

**Tool:** `memory_session`

---

## Understanding Scope Inheritance

Memory is organized in a hierarchy. Queries inherit from parent scopes:

```
Global            → Universal patterns (security, best practices)
└── Organization  → Team-wide standards
    └── Project   → Project-specific decisions
        └── Session → Working context
```

When you query with `inherit: true`, you get memories from all parent scopes.

---

## Common Mistakes to Avoid

| Wrong                                      | Correct                                         |
| :----------------------------------------- | :---------------------------------------------- |
| `"scopeType": "project"` (missing scopeId) | `"scopeType": "project", "scopeId": "proj-..."` |
| `"entryType": "guidelines"`                | `"entryType": "guideline"` (singular)           |
| `memory_project` action `add`              | `memory_project` action `create`                |
| `memory_guideline` action `create`         | `memory_guideline` action `add`                 |

---

## Quick Reference

| Tool               | Actions                             |
| :----------------- | :---------------------------------- |
| `memory_query`     | `context`, `search`                 |
| `memory_project`   | `create`, `list`, `get`             |
| `memory_session`   | `start`, `end`, `list`              |
| `memory_guideline` | `add`, `update`, `list`, `bulk_add` |
| `memory_knowledge` | `add`, `update`, `list`, `bulk_add` |
| `memory_tool`      | `add`, `update`, `list`, `bulk_add` |
| `memory_tag`       | `attach`, `detach`, `list`          |

---

## Next Steps

- [Semantic Search Setup](semantic-search-setup.md) - Enable AI-powered search
- [First Hook](first-hook.md) - Add runtime enforcement
- [Workflows](../guides/workflows.md) - Common usage patterns
- [IDE Setup](../guides/ide-setup.md) - Detailed IDE configuration
