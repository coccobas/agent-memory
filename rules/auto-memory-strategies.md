---
description: Agent Memory optimization strategies - consult for performance tuning
globs: []
alwaysApply: false
---

# Agent Memory Strategies

## Context-Aware Querying

### Infer Tags from File Path

| Path Pattern  | Inferred Tags         |
| ------------- | --------------------- |
| `/src/api/**` | `api`, `backend`      |
| `/src/db/**`  | `database`, `backend` |
| `/tests/**`   | `testing`             |
| `/docs/**`    | `documentation`       |
| `*.ts`        | `typescript`          |
| `*.py`        | `python`              |

When editing a file, query with inferred tags for relevant context.

### Query by Feature

When starting work on a feature, search for related entries:

```json
{
  "action": "search",
  "search": "<feature-name>",
  "types": ["guidelines", "knowledge"],
  "scope": { "type": "project", "inherit": true }
}
```

---

## Confidence Scoring

| Level    | Range   | When to Use                   |
| -------- | ------- | ----------------------------- |
| High     | 0.9-1.0 | User-confirmed, tested        |
| Medium   | 0.7-0.9 | Generally reliable            |
| Low      | 0.5-0.7 | Uncertain, needs verification |
| Very Low | <0.5    | Speculative                   |

When resolving conflicts, prefer higher confidence. If similar confidence, prefer recency.

---

## Semantic Search

### Duplicate Detection

Before storing, search with high threshold:

```json
{ "action": "search", "search": "<content>", "semanticSearch": true, "semanticThreshold": 0.9 }
```

| Similarity | Action                           |
| ---------- | -------------------------------- |
| >0.90      | Likely duplicate - skip          |
| 0.85-0.90  | Very similar - ask user          |
| 0.70-0.85  | Related - store, create relation |
| <0.70      | Different - safe to store        |

---

## Relation Building

After storing related entries, always create relations:

- Guideline applies to tool → `applies_to`
- Knowledge depends on another → `depends_on`
- Two entries contradict → `conflicts_with`
- General association → `related_to`

---

## Session Context Refresh

During long sessions, periodically refresh:

```json
{ "action": "context", "scopeType": "session", "scopeId": "<id>", "inherit": true }
```

When switching features:

1. Query new feature context
2. Update session metadata if needed

---

## Batch Operations

For multiple related entries, use `bulk_add` with top-level scope defaults:

```json
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "<id>",
  "entries": [
    { "name": "...", "content": "..." },
    { "name": "...", "content": "..." }
  ]
}
```

Top-level `scopeType` and `scopeId` apply to all entries (entries can override if needed).

---

## Proactive Loading

### Pre-load for Common Operations

| Operation        | Pre-query                                     |
| ---------------- | --------------------------------------------- |
| Add API endpoint | API guidelines, auth patterns, error handling |
| Database change  | Schema conventions, migration patterns        |
| New component    | Component patterns, naming conventions        |

### Cache Behavior

- Global scope: 5-minute TTL cache
- Frequently accessed entries: consider promoting to global
- Session scope: not cached

---

## Performance Tips

1. **Use `inherit: true`** - always get full context
2. **Limit results** - use `limit` parameter when exploring
3. **Use semantic search** - for natural language queries
4. **Tag everything** - improves query precision
5. **Query before storing** - prevent duplicates

@version "1.0.0"
@last_updated "2025-12-18"
