---
description: Core Agent Memory workflow - essential operations
globs: ["**/*"]
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

## Essential Flow

```
1. QUERY CONTEXT → 2. START SESSION → 3. CHECK DUPLICATES → 4. STORE → 5. TAG → 6. END SESSION
```

### 1. Query Context FIRST (Every Conversation)

```json
{"action": "context", "scopeType": "project", "inherit": true}
```
Tool: `memory_query`. If project unknown, use `memory_project` action `list` first.

### 1b. Search Before Exploring (When Answering Questions)

**Before using Grep, Glob, Read, or Task tools**, search memory:
```json
{"action": "search", "search": "<topic>", "types": ["knowledge", "guidelines", "tools"], "scope": {"type": "project", "inherit": true}}
```
Only explore the filesystem if memory doesn't have the answer.

### 2. Start Session

```json
{"action": "start", "projectId": "<id>", "name": "<task>", "agentId": "cursor-ai"}
```
Tool: `memory_session`

### 3. Check Before Storing (CRITICAL)

**ALWAYS query before storing to prevent duplicates:**
```json
{"action": "search", "types": ["guidelines"], "search": "<topic>", "scope": {"type": "project", "inherit": true}}
```
Tool: `memory_query`

- Similar exists → Update existing
- Contradictory → Ask user
- Duplicate → Skip
- New → Store

### 4. Store Entries

**Guideline** (rules, standards): `memory_guideline` action `add`
```json
{"action": "add", "scopeType": "project", "scopeId": "<id>", "name": "<name>", "content": "<text>"}
```

**Knowledge** (facts, decisions): `memory_knowledge` action `add`
```json
{"action": "add", "scopeType": "project", "scopeId": "<id>", "title": "<title>", "content": "<text>"}
```

**Tool** (commands, scripts): `memory_tool` action `add`
```json
{"action": "add", "scopeType": "project", "scopeId": "<id>", "name": "<name>"}
```

#### Bulk Store (Multiple Entries)

For multiple entries, use `bulk_add`. **Top-level `scopeType` and `scopeId` apply to all entries** (entries can override):

**Bulk Guidelines:** `memory_guideline` action `bulk_add`
```json
{"action": "bulk_add", "scopeType": "project", "scopeId": "<id>", "entries": [
  {"name": "rule-1", "content": "...", "priority": 90},
  {"name": "rule-2", "content": "...", "category": "security"}
]}
```

**Bulk Knowledge:** `memory_knowledge` action `bulk_add`
```json
{"action": "bulk_add", "scopeType": "project", "scopeId": "<id>", "entries": [
  {"title": "fact-1", "content": "...", "category": "decision"},
  {"title": "fact-2", "content": "..."}
]}
```

**Bulk Tools:** `memory_tool` action `bulk_add`
```json
{"action": "bulk_add", "scopeType": "project", "scopeId": "<id>", "entries": [
  {"name": "cmd-1", "description": "...", "category": "cli"},
  {"name": "cmd-2", "description": "..."}
]}
```

**Response:** Returns `{entries: [...], count: N}`. Tag each entry by its returned ID.

### 5. Tag Immediately After Storing

```json
{"action": "attach", "entryType": "guideline", "entryId": "<id>", "tagName": "<tag>"}
```
Tool: `memory_tag`. Use 2-3 tags minimum.

### 6. End Session

```json
{"action": "end", "id": "<session-id>", "status": "completed"}
```
Tool: `memory_session`

---

## CRITICAL: Avoid These Errors

| Error | Wrong | Correct |
|-------|-------|---------|
| Missing scopeId | `{"scopeType": "project"}` | `{"scopeType": "project", "scopeId": "<id>"}` |
| Plural entryType | `"entryType": "guidelines"` | `"entryType": "guideline"` |
| Wrong action | `memory_project` action `add` | `memory_project` action `create` |
| Wrong action | `memory_guideline` action `create` | `memory_guideline` action `add` |
| Missing tag params | `{"action": "attach", "entryId": "x"}` | `{"action": "attach", "entryType": "guideline", "entryId": "x", "tagName": "y"}` |

**scopeId is REQUIRED** when scopeType is `project`, `org`, or `session`. Only `global` scope needs no scopeId.

---

## Action Quick Reference

| Tool | Actions |
|------|---------|
| memory_query | `context`, `search` |
| memory_guideline | `add`, `update`, `get`, `list`, `deactivate`, `bulk_add` |
| memory_knowledge | `add`, `update`, `get`, `list`, `deactivate`, `bulk_add` |
| memory_tool | `add`, `update`, `get`, `list`, `deactivate`, `bulk_add` |
| memory_project | `create`, `list`, `get`, `update`, `delete` |
| memory_org | `create`, `list` |
| memory_session | `start`, `end`, `list` |
| memory_tag | `attach`, `detach`, `create`, `list`, `for_entry` |
| memory_relation | `create`, `list`, `delete` |

**For parameters:** See `@auto-memory-reference`

---

## When to Store What

| Trigger | Store As | Category |
|---------|----------|----------|
| "We always/never do X" | Guideline | `code_style`/`workflow` |
| "Our standard is..." | Guideline | `code_style` |
| "We chose X because..." | Knowledge | `decision` |
| "The system uses..." | Knowledge | `fact` |
| CLI command, script | Tool | `cli`/`function` |

**Guideline** = affects how agent works (rules, standards)
**Knowledge** = describes what exists (facts, decisions)

---

## Scope Selection

| Scope | Use When |
|-------|----------|
| `project` (default) | Project-specific |
| `global` | Universal standards |
| `session` | Temporary/experimental |

Always use `inherit: true` in queries.

---

## Rules Summary

1. **Query context FIRST** - Every conversation
2. **Check before storing** - Prevent duplicates
3. **Tag everything** - 2-3 tags minimum
4. **Use correct action** - `add` for entries, `create` for scopes
5. **Include scopeId** - Required for non-global scopes
6. **Use singular entryType** - `guideline` not `guidelines`

---

**Details:** `@auto-memory-reference` | **Examples:** `@auto-memory-examples` | **Advanced:** `@auto-memory-advanced`

@version "1.0.0"
@last_updated "2025-12-18"
