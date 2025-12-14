---
description: Advanced Agent Memory strategies - context-aware querying, semantic similarity, proactive loading, and optimization techniques
globs: []
alwaysApply: false
related_docs: [
  "auto-memory-core.md",
  "auto-memory-advanced.md",
  "auto-memory-examples.md",
  "auto-memory-reference.md"
]
---

@context {
    "type": "guidelines",
    "purpose": "cursor_rules",
    "format_version": "1.0.0",
    "supported_content_types": [
        "guidelines",
        "strategies",
        "optimization"
    ]
}

@structure {
    "required_sections": [
        "frontmatter",
        "title",
        "context_aware_querying",
        "confidence_based_resolution",
        "analytics_learning",
        "relation_creation",
        "refresh_strategies",
        "batch_operations",
        "feedback_loops",
        "semantic_similarity",
        "proactive_loading"
    ]
}

# Advanced Agent Memory Strategies

Advanced strategies for optimizing memory usage, improving query effectiveness, and building knowledge graphs. See `@auto-memory-core` for essential operations.

## Context-Aware Querying

**Query based on current file being edited:**

When working on a file, automatically infer relevant tags from file path:
- `/src/api/auth.ts` → tags: `["typescript", "api", "authentication"]`
- `/tests/unit/services.test.ts` → tags: `["typescript", "testing", "unit"]`
- `/docs/architecture.md` → tags: `["documentation", "architecture"]`

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "types": ["guidelines", "knowledge"],
    "tags": {
      "include": ["<inferred-from-file-path>"]
    },
    "scope": {
      "type": "project",
      "id": "<project-id>",
      "inherit": true
    }
  }
}
```

**Query based on feature/module:**

When working on a feature, query related context:

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "search": "<feature-name>",
    "types": ["knowledge", "guidelines", "tools"],
    "scope": {
      "type": "project",
      "id": "<project-id>",
      "inherit": true
    }
  }
}
```

## Confidence-Based Conflict Resolution

**Use confidence scores when resolving conflicts:**

- **High confidence (0.9-1.0)**: User-confirmed, well-tested information
- **Medium confidence (0.7-0.9)**: Generally reliable, from trusted sources
- **Low confidence (0.5-0.7)**: Uncertain, needs verification
- **Very low confidence (<0.5)**: Speculative, should be flagged

**When storing knowledge, set appropriate confidence:**

```json
{
  "tool": "memory_knowledge",
  "arguments": {
    "action": "add",
    "confidence": 0.95,  // High confidence for user-confirmed info
    // ... other params
  }
}
```

**When resolving conflicts, prefer higher confidence:**

- If version A confidence > version B confidence → Prefer A
- If both similar confidence → Prefer recency
- If confidence difference > 0.3 → Prefer higher confidence

**Confidence decay over time:**

- Check `validUntil` field for knowledge entries
- Reduce confidence for stale information
- Re-verify high-importance low-confidence entries

## Learning from Analytics

**Use `memory_analytics` to improve memory quality:**

**1. Identify frequently accessed entries:**

```json
{
  "tool": "memory_analytics",
  "arguments": {
    "action": "get_stats",
    "scopeType": "project",
    "scopeId": "<project-id>"
  }
}
```

**Actions based on analytics:**
- Promote frequently accessed guidelines to higher priority
- Tag frequently used entries for easier access
- Cache popular queries

**2. Find unused/outdated entries:**

- Identify entries never accessed → Consider cleanup
- Find entries with low access → Review relevance
- Detect stale knowledge → Update or archive

**3. Learn from error patterns:**

```json
{
  "tool": "memory_analytics",
  "arguments": {
    "action": "get_error_correlation",
    "agentA": "agent-1",
    "agentB": "agent-2"
  }
}
```

- Identify common error patterns
- Update guidelines to prevent errors
- Store error resolutions as knowledge

## Automatic Relation Creation

**ALWAYS create relations when storing related entries:**

**When storing a guideline that applies to a tool:**

```json
{
  "tool": "memory_relation",
  "arguments": {
    "action": "create",
    "sourceType": "guideline",
    "sourceId": "<guideline-id>",
    "targetType": "tool",
    "targetId": "<tool-id>",
    "relationType": "applies_to",
    "createdBy": "cursor-ai"
  }
}
```

**When storing knowledge that references another entry:**

```json
{
  "tool": "memory_relation",
  "arguments": {
    "action": "create",
    "sourceType": "knowledge",
    "sourceId": "<knowledge-id>",
    "targetType": "knowledge",
    "targetId": "<related-knowledge-id>",
    "relationType": "related_to",
    "createdBy": "cursor-ai"
  }
}
```

**Relation types:**
- `applies_to` - Guideline/tool applies to target
- `depends_on` - Source depends on target
- `conflicts_with` - Mutually exclusive
- `related_to` - General association
- `parent_task` - For task decomposition
- `subtask_of` - Inverse of parent_task

## Memory Refresh Strategies

**Refresh context during long sessions:**

After working for extended period, refresh context:

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "context",
    "scopeType": "session",
    "scopeId": "<session-id>",
    "inherit": true
  }
}
```

**Re-query when switching features:**

When switching from one feature to another:
1. End current session context
2. Query new feature context
3. Start new session or update current

**Update stale knowledge:**

Check for knowledge with `validUntil` dates:

```json
{
  "tool": "memory_knowledge",
  "arguments": {
    "action": "list",
    "scopeType": "project",
    "scopeId": "<project-id>"
  }
}
```

If `validUntil` is past, either:
- Update with new information
- Archive if no longer relevant
- Extend validity if still accurate

## Batch Operations

**Use bulk operations when storing multiple related entries:**

**Bulk add guidelines:**

```json
{
  "tool": "memory_guideline",
  "arguments": {
    "action": "bulk_add",
    "scopeType": "project",
    "scopeId": "<project-id>",
    "entries": [
      {
        "name": "guideline-1",
        "content": "...",
        // ... other fields
      },
      {
        "name": "guideline-2",
        "content": "...",
        // ... other fields
      }
    ]
  }
}
```

**Batch tag attachments:**

When tagging multiple entries, do them in sequence but efficiently:

```json
// Tag multiple entries at once
{
  "tool": "memory_tag",
  "arguments": {
    "action": "attach",
    "entryType": "guideline",
    "entryId": "<entry-1-id>",
    "tagName": "typescript"
  }
}
// Repeat for each entry
```

## Feedback Loops

**Track successful outcomes:**

When a task completes successfully:
1. Query which memory entries were used
2. Store success as knowledge
3. Link successful entries to the outcome

**Learn from user corrections:**

When user corrects you:
1. Store the correction as knowledge
2. Update related guidelines if needed
3. Link correction to original entry

**Improve conflict resolution:**

After resolving conflicts:
1. Store resolution as knowledge
2. Note which resolution strategy worked
3. Use similar strategy for future conflicts

**Adapt query strategies:**

Track which queries return useful results:
- If semantic search works well → Use more often
- If tag-based queries are effective → Emphasize tagging
- If scope inheritance helps → Always use `inherit: true`

## Semantic Similarity for Conflicts

**Use semantic search to detect similar entries:**

Before storing, **ALWAYS** use semantic search with similarity threshold:

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "types": ["guidelines"],
    "search": "<new-guideline-content>",
    "semanticSearch": true,
    "semanticThreshold": 0.85,  // High threshold for duplicates
    "scope": {
      "type": "project",
      "id": "<project-id>",
      "inherit": true
    }
  }
}
```

**Similarity thresholds for conflict detection:**
- **>0.90**: Likely duplicate → Skip storing, inform user
- **0.85-0.90**: Very similar → Ask user if update or create new
- **0.70-0.85**: Related → Consider creating relation, store as new
- **<0.70**: Different → Safe to store as new

**Automatic duplicate detection:**

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "types": ["guidelines", "knowledge"],
    "search": "<content-to-store>",
    "semanticSearch": true,
    "semanticThreshold": 0.90,  // Very high for duplicates
    "scope": {
      "type": "project",
      "id": "<project-id>",
      "inherit": true
    }
  }
}
```

If results with similarity > 0.90 found:
- Skip storing
- Inform user: "Similar entry already exists: [entry name]"

**Merge similar entries automatically:**

If similarity 0.85-0.90 and user confirms merge:
1. Merge content from both versions
2. Update existing entry with merged content
3. Store merge decision as knowledge entry
4. Create relation between merged entries if needed

## Proactive Context Loading

**Load context when opening files:**

When a file is opened in the editor:
1. Infer tags from file path
2. Query relevant guidelines/knowledge
3. Pre-load context silently

**Pre-load context for common workflows:**

For common operations (e.g., "add API endpoint"):
1. Pre-query API-related guidelines
2. Pre-query authentication patterns
3. Pre-query error handling standards

**Cache frequently accessed memory:**

- Global scope queries are cached automatically (5-minute TTL)
- Frequently accessed project entries → Consider promoting to global
- Session-scoped entries → Keep in session, don't cache

**Pre-query based on project structure:**

Infer project structure from file paths:
- `/src/api/` → Query API-related memory
- `/src/db/` → Query database-related memory
- `/tests/` → Query testing-related memory

## Remember

- **Memory is persistent** - What you store today helps tomorrow
- **Query first, code second** - Always check memory before coding
- **Check before storing** - Avoid duplicates and conflicts
- **Resolve conflicts promptly** - Don't leave conflicts unresolved
- **Document resolutions** - Store conflict resolutions as knowledge
- **Store proactively** - Don't wait for explicit instructions
- **Be consistent** - Use memory tools in every conversation
- **Tag everything** - Makes future queries more effective
- **Use all tools** - Don't ignore advanced features like analytics, voting, tasks
- **Learn from patterns** - Use analytics to improve memory quality
- **Create relations** - Build knowledge graph automatically
- **Refresh context** - Don't let context get stale during long sessions

@version "1.0.0"
@last_updated "2024-12-19"
