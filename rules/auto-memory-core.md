---
description: Core Agent Memory workflow - essential operations
globs: ['**/*']
alwaysApply: true
---

# Agent Memory Workflow

<critical>
Use Agent Memory MCP tools automatically. Do NOT wait for user prompts.
ALWAYS query memory BEFORE exploring the filesystem.
</critical>

## Memory-First Principle

**Memory is the primary source of truth.** Before reading files or exploring the codebase:

1. **Search memory** for relevant knowledge
2. **If found** → Use stored knowledge, don't re-explore files
3. **If not found** → Explore filesystem, then store new findings

```
User asks question → Search memory → Found? → Use it
                                   → Not found? → Explore files → Store findings
```

---

## Default Workflow

Use these three tools for all standard operations:

### 1. Session Start (Every Conversation)

```json
{ "sessionName": "Fix auth bug" }
```

Tool: `memory_quickstart` - Loads context + starts session. **Always include sessionName.**

### 2. Query / Search

```json
{ "text": "What do we know about authentication?" }
```

Tool: `memory` - Natural language queries. Use for all searches.

### 3. Store

```json
{ "text": "Remember that we use TypeScript strict mode" }
```

Tool: `memory_remember` - Auto-detects type, category, and tags.

**Key benefits:**

- **Auto-detection**: projectId, agentId, and scopeId are auto-detected from working directory
- **Auto-tagging**: Tags are inferred automatically from content
- **Duplicate checking**: Built-in duplicate detection

---

## Exceptions: When to Use Structured Tools

Use structured tools **only** for these specific scenarios:

| Scenario                             | Tool                                                     | Example                                       |
| ------------------------------------ | -------------------------------------------------------- | --------------------------------------------- |
| Bulk add (3+ entries)                | `memory_guideline`, `memory_knowledge`, or `memory_tool` | `{"action": "bulk_add", "entries": [...]}`    |
| Query by relations                   | `memory_query`                                           | `{"action": "search", "relatedTo": {...}}`    |
| Query by temporal validity           | `memory_query`                                           | `{"action": "search", "atTime": "..."}`       |
| Hierarchical context (token savings) | `memory_query`                                           | `{"action": "context", "hierarchical": true}` |
| Explicit tag management              | `memory_tag`                                             | `{"action": "attach", ...}`                   |
| Update existing entry                | `memory_guideline`, `memory_knowledge`, or `memory_tool` | `{"action": "update", "id": "..."}`           |
| Deactivate entry                     | `memory_guideline`, `memory_knowledge`, or `memory_tool` | `{"action": "deactivate", "id": "..."}`       |
| Permission management                | `memory_permission`                                      | `{"action": "grant", ...}`                    |
| End session explicitly               | `memory_session`                                         | `{"action": "end", "id": "..."}`              |

**If your task is not in this table, use the default workflow.**

---

## Exception Details

### Bulk Add (3+ entries)

```json
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "<id>",
  "entries": [
    { "name": "rule-1", "content": "..." },
    { "name": "rule-2", "content": "..." },
    { "name": "rule-3", "content": "..." }
  ]
}
```

Tool: `memory_guideline`, `memory_knowledge`, or `memory_tool`

### Hierarchical Context (90% Token Savings)

```json
{ "action": "context", "scopeType": "project", "hierarchical": true }
```

Tool: `memory_query` - Returns ~1.5k tokens instead of ~15k.

### Tag Management

```json
{ "action": "attach", "entryType": "guideline", "entryId": "<id>", "tagName": "<tag>" }
```

Tool: `memory_tag` - Use when `memory_remember` auto-tagging is insufficient.

### Permission Setup (One-Time Admin Task)

**Development:** `export AGENT_MEMORY_PERMISSIONS_MODE=permissive`

**Production:**

```json
{
  "action": "grant",
  "agent_id": "<agent-id>",
  "scope_type": "project",
  "scope_id": "<project-id>",
  "entry_type": "knowledge",
  "permission": "write",
  "admin_key": "<admin-key>"
}
```

Tool: `memory_permission`

---

## When to Store What

| Trigger                 | Type      |
| ----------------------- | --------- |
| "We always/never do X"  | Guideline |
| "Our standard is..."    | Guideline |
| "We chose X because..." | Knowledge |
| "The system uses..."    | Knowledge |
| CLI command, script     | Tool      |

**Guideline** = affects how agent works (rules, standards)
**Knowledge** = describes what exists (facts, decisions)

---

## Proactive Storage (In-Flow)

<important>
Proactively suggest storing memories when you observe these patterns in conversation.
Don't wait for explicit "remember" requests - be helpful!
</important>

### When to Suggest Storing

| Pattern Observed                                                           | Suggest Storing As     |
| -------------------------------------------------------------------------- | ---------------------- |
| User explains a rule: "we always...", "never do...", "must..."             | Guideline              |
| User explains a decision: "we decided to...", "we chose X because..."      | Knowledge (decision)   |
| User describes architecture: "the system works by...", "X handles Y"       | Knowledge (fact)       |
| User shares a command: "run this...", "use this script..."                 | Tool                   |
| User corrects you: "actually, we do it this way..."                        | Guideline or Knowledge |
| User explains workaround: "the trick is...", "to fix that, you need to..." | Knowledge (context)    |

### How to Suggest

After recognizing a pattern, respond with:

```
I noticed you described [pattern]. Would you like me to store this as a [type]?

> [summary of what would be stored]

This would help future sessions remember this automatically.
```

Or simply store directly if the user has established they want proactive storage:

```
✓ Stored [type]: "[brief title]"
```

### Quick Storage Command

Users can also store quickly via:

```
!am remember <text to store>
```

Example: `!am remember We use ESLint with the Airbnb config`

---

## Scope Selection

| Scope               | Use When               |
| ------------------- | ---------------------- |
| `project` (default) | Project-specific       |
| `global`            | Universal standards    |
| `session`           | Temporary/experimental |

---

## Common Errors (When Using Structured Tools)

| Error            | Wrong                         | Correct                                       |
| ---------------- | ----------------------------- | --------------------------------------------- |
| Missing scopeId  | `{"scopeType": "project"}`    | `{"scopeType": "project", "scopeId": "<id>"}` |
| Plural entryType | `"entryType": "guidelines"`   | `"entryType": "guideline"`                    |
| Wrong action     | `memory_project` action `add` | `memory_project` action `create`              |

**Note:** `scopeId` is required when scopeType is `project`, `org`, or `session`. Only `global` scope needs no scopeId.

---

**Full parameter reference:** `@auto-memory-reference`
**Examples:** `@auto-memory-examples`
**Advanced features:** `@auto-memory-advanced`

@version "3.2.0"
@last_updated "2026-01-22"
