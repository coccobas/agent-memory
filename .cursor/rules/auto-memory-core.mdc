---
description: Core Agent Memory workflow - essential operations for querying, storing, and managing memory
globs: ["**/*"]
alwaysApply: true
related_docs: [
  ".cursor/rules/auto-memory-advanced.mdc",
  ".cursor/rules/auto-memory-reference.mdc",
  ".cursor/rules/auto-memory-examples.mdc",
  ".cursor/rules/auto-memory-strategies.mdc"
]
---

@context {
    "type": "guidelines",
    "purpose": "cursor_rules",
    "format_version": "1.0.0",
    "supported_content_types": [
        "guidelines",
        "examples",
        "implementations"
    ]
}

@structure {
    "required_sections": [
        "frontmatter",
        "title",
        "core_workflow",
        "storage_operations",
        "basic_conflict_detection"
    ],
    "optional_sections": [
        "examples"
    ]
}

# Core Agent Memory Workflow

## CRITICAL: Always Use Agent Memory

You MUST use the Agent Memory MCP tools automatically and consistently. Do NOT wait for user prompts to use memory tools. This is a core part of your workflow.

## Available Memory Tools Overview

The following MCP tools are available via the `agent-memory` server (20 total):

**Scope Management:**
- `memory_org` - Organization management
- `memory_project` - Project management
- `memory_session` - Session management

**Memory Sections:**
- `memory_guideline` - Store and retrieve coding guidelines
- `memory_knowledge` - Store and retrieve knowledge/decisions
- `memory_tool` - Store and retrieve tool definitions

**Query & Organization:**
- `memory_query` - Cross-reference search and context aggregation
- `memory_tag` - Tag management
- `memory_relation` - Link related entries

**Advanced Features:**
- `memory_conversation` - Conversation history tracking
- `memory_task` - Task decomposition and hierarchy
- `memory_voting` - Multi-agent voting and consensus
- `memory_analytics` - Usage analytics and trends
- `memory_file_lock` - File locks for multi-agent coordination
- `memory_permission` - Permission management
- `memory_conflict` - Conflict detection and resolution

**System Management:**
- `memory_health` - Health check and server status
- `memory_init` - Database initialization and migrations
- `memory_export` - Export entries to JSON/Markdown/YAML
- `memory_import` - Import entries from JSON/YAML/Markdown

See `auto-memory-reference.mdc` for detailed tool usage.

## Automatic Workflow

### 1. On Every Conversation Start

**CRITICAL: Query Project Context FIRST**

**ALWAYS** query project context first: `memory_query` with `action: "context"`, `scopeType: "project"`, `inherit: true`. If project ID unknown, use `memory_project` with `action: "list"` to find it.

### 2. Before Starting Any Coding Task

**ALWAYS** query relevant guidelines with context-aware tags. Infer tags from file paths, features, modules. Use `memory_query` with `action: "search"`, `types: ["guidelines"]`, inferred tags, `conversationId`, `autoLinkContext: true`.

**ALWAYS** check file locks before editing: `memory_file_lock` with `action: "status"`. If locked, wait or use `force_unlock` if appropriate.

### 3. Start a Session for Each Task

**ALWAYS** start a session when beginning work:

```json
{
  "tool": "memory_session",
  "arguments": {
    "action": "start",
    "projectId": "<project-id>",
    "name": "<descriptive-task-name>",
    "purpose": "<what-you-are-doing>",
    "agentId": "cursor-ai",
    "metadata": {
      "autoPopulate": true  // Enable automatic population (default: true)
    }
  }
}
```

**To enable/disable auto-population:**

- **Enable auto-population** (default): Set `metadata.autoPopulate: true` when starting session
- **Disable auto-population**: Set `metadata.autoPopulate: false` when starting session

When auto-population is enabled, the agent will automatically extract and store findings from conversations. When disabled, the agent will only store entries when explicitly instructed.

**ALWAYS** start a conversation for the session:

```json
{
  "tool": "memory_conversation",
  "arguments": {
    "action": "start",
    "projectId": "<project-id>",
    "sessionId": "<session-id>",
    "title": "<conversation-title>",
    "agentId": "cursor-ai"
  }
}
```

Use the session ID for all session-scoped entries. Use conversation ID to link all memory queries.

### 3.1. Scope Selection Strategy

**Default:** Start at project scope, promote to global only if truly universal.

**Scopes:** Project (default, project-specific), Global (universal standards), Session (temporary/experimental).

**Rules:** Check higher scopes first to avoid duplication. When promoting, update scope rather than duplicating.

### 4. Automatically Store Guidelines

**CRITICAL: Check for existing guidelines before storing new ones**

Before storing a guideline, **ALWAYS** check if a similar one exists:

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "types": ["guidelines"],
    "search": "<guideline-topic>",
    "scope": {
      "type": "project",
      "id": "<project-id>",
      "inherit": true
    },
    "limit": 10
  }
}
```

**Conflict Detection:** If similar exists → compare semantically. Complementary → update. Contradictory → ask user to update or create new. Exact duplicate → skip. No conflict → store new.

**When storing:** Use `memory_guideline` with `action: "add"` (or `"update"`), `scopeType`, `scopeId`, `name`, `category`, `priority`, `content`, `rationale`, `examples`, `changeReason` (required for updates).

**Store when:** User mentions standards, you notice patterns, you create conventions, code review reveals standards.

### 5. Automatically Store Knowledge

**CRITICAL: Check for existing knowledge before storing**

Before storing knowledge, **ALWAYS** check if similar knowledge exists:

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "types": ["knowledge"],
    "search": "<knowledge-topic>",
    "scope": {
      "type": "project",
      "id": "<project-id>",
      "inherit": true
    },
    "limit": 10
  }
}
```

**Conflict Detection:** If similar exists → compare semantically. Supplementary → update. Contradictory → ask user. Exact duplicate → skip. No conflict → store new.

**When storing knowledge:**

```json
{
  "tool": "memory_knowledge",
  "arguments": {
    "action": "add",  // or "update" if updating existing
    "scopeType": "project",
    "scopeId": "<project-id>",
    "title": "<descriptive-title>",
    "category": "<decision|fact|context|reference>",
    "content": "<the knowledge content>",
    "source": "<where this came from>",
    "confidence": 1.0,
    "changeReason": "<reason if updating>"  // Required for updates
  }
}
```

**Knowledge Categories:** `decision` (choices made), `context` (current state), `fact` (objective facts), `reference` (external links).

**Store knowledge when:**
- User explains architecture decisions
- You discover why something was done a certain way
- Important context about the codebase
- API contracts or conventions
- Known issues and workarounds
- Domain-specific information

### 5.1. Classification: Knowledge vs Guidelines

**Rule:** Affects how agent works → Guideline. Describes what exists/was decided → Knowledge.

**Guidelines:** Rules, standards, behaviors ("Don't create CAD files", "Always query project context").

**Knowledge:** Facts, decisions, context ("System uses 9733 blower", "PostgreSQL chosen for JSONB").

**Decision:** How should I work? → Guideline. What exists/was decided? → Knowledge.

### 6. Automatically Store Tools

**CRITICAL: Check for existing tools before storing**

Before storing a tool, **ALWAYS** check if a tool with the same name exists in the scope:

```json
{
  "tool": "memory_tool",
  "arguments": {
    "action": "list",
    "scopeType": "project",
    "scopeId": "<project-id>",
    "inherit": true
  }
}
```

**Conflict Detection:** If tool with same name exists → compare functionality. Same → skip. Different → ask user to update or use different name. No conflict → store new.

**When storing tools:**

```json
{
  "tool": "memory_tool",
  "arguments": {
    "action": "add",  // or "update" if updating existing
    "scopeType": "project",
    "scopeId": "<project-id>",
    "name": "<tool-name>",
    "category": "<mcp|cli|function|api>",
    "description": "<what this tool does>",
    "parameters": {
      "<param>": "<description>"
    },
    "examples": ["<usage example>"],
    "constraints": "<any constraints>",
    "changeReason": "<reason if updating>"  // Required for updates
  }
}
```

### 7. Tag Everything (REQUIRED)

**REQUIRED**: All entries MUST be tagged. Entries without tags are incomplete and harder to discover.

**ALWAYS** tag entries immediately after storing: Use `memory_tag` with `action: "attach"`, `entryType`, `entryId`, `tagName`.

**Tag categories:** Languages (`typescript`, `python`, etc.), Domains (`frontend`, `backend`, `api`, etc.), Categories (`code_style`, `workflow`, etc.), Task-specific (`authentication`, `plenum`, etc.)

**Infer tags from:** File paths, task descriptions, user mentions, module context. Use 2-3 tags minimum from multiple categories.

### 7.1. Link Related Entries

**ALWAYS** create relations between related entries using `memory_relation`. Link guidelines that reference each other, knowledge entries that build on each other, and entries discovered during queries.

**Relation types:** `related_to` (general), `depends_on` (dependency), `applies_to` (guideline applies to context), `conflicts_with` (rare).

**Workflow:** Store entry → Tag → Query for related entries → Create relations.

### 8. Query Before Making Decisions

Before implementing, **ALWAYS** query for related knowledge: Use `memory_query` with `action: "search"`, `types: ["knowledge", "guidelines"]`, `search`, `scope` with `inherit: true`.

### 9. Start and Track Conversations

**ALWAYS** start a conversation when starting a session:

```json
{
  "tool": "memory_conversation",
  "arguments": {
    "action": "start",
    "projectId": "<project-id>",
    "sessionId": "<session-id>",
    "title": "<conversation-title>",
    "agentId": "cursor-ai",
    "metadata": {
      "purpose": "<conversation-purpose>"
    }
  }
}
```

**Link queries to conversations:** Use `conversationId` and `autoLinkContext: true` in queries. When `autoLinkContext: true`, automatically extract findings → Store → Link to conversation → Tag.

**Track context:** Use `add_message` to log agent actions. Use `link_context` to link entries. Use `get_context` to retrieve conversation context. Use `search` to find conversations. Use `end` with `generateSummary: true` when done. Use `archive` for old conversations.

### 9.1. Continuous Extraction During Active Sessions

**Auto-population:** Controlled by `metadata.autoPopulate` (default: true). When active: Extract findings from user messages and code changes immediately. Check for duplicates (semantic search), update if similar, store if new. Tag and link to conversation.

### 10. End Sessions Properly

When completing a task, **ALWAYS** end the session: Use `memory_session` with `action: "end"`, `id`, `status: "completed"`.

## Important Rules

1. **NEVER skip memory queries** - Always check memory before coding
2. **ALWAYS check for existing entries** - Query before storing to avoid duplicates/conflicts
3. **ALWAYS store new information** - Don't let knowledge slip away
4. **ALWAYS use sessions** - Track your work properly
5. **ALWAYS use conversations** - Link all queries to conversations for tracking
6. **ALWAYS tag entries** - Makes querying easier
7. **ALWAYS query before decisions** - Check if similar decisions exist
8. **ALWAYS inherit scope** - Use `inherit: true` to get full context
9. **ALWAYS end sessions** - Clean up when done
10. **ALWAYS resolve conflicts** - Check for and resolve conflicts periodically

For advanced conflict resolution, see `auto-memory-advanced.mdc`.

@version "1.1.0"
@last_updated "2025-01-13"
