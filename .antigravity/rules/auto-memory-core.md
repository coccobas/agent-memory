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

**ALWAYS** query project context first:

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "context",
    "scopeType": "project",
    "scopeId": "<project-id-if-known>",
    "inherit": true,
    "limit": 20
  }
}
```

If project ID is unknown, try to find it:
```json
{
  "tool": "memory_project",
  "arguments": {
    "action": "list",
    "limit": 10
  }
}
```

### 2. Before Starting Any Coding Task

**ALWAYS** query relevant guidelines with context-aware tags:

**Infer tags from current file/context:**
- File path: `/src/api/auth.ts` → tags: `["typescript", "api", "authentication"]`
- Feature: "user authentication" → tags: `["authentication", "security"]`
- Module: "database layer" → tags: `["database", "backend"]`

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "types": ["guidelines"],
    "scope": {
      "type": "project",
      "id": "<project-id>",
      "inherit": true
    },
    "tags": {
      "include": ["<inferred-from-context>", "<relevant-language>", "<relevant-domain>"]
    },
    "conversationId": "<conversation-id>",
    "autoLinkContext": true,
    "limit": 20
  }
}
```

**ALWAYS** check file locks if editing files:

```json
{
  "tool": "memory_file_lock",
  "arguments": {
    "action": "status",
    "file_path": "/absolute/path/to/file.ts"
  }
}
```

If file is locked, wait or use `force_unlock` if appropriate.

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

**Conflict Detection Rules:**

1. **If similar guideline exists:**
   - Compare the content semantically
   - If **complementary** (adds detail): Update existing with additional info
   - If **contradictory** (conflicts): 
     - Query user: "I found an existing guideline that conflicts. Old: [X]. New: [Y]. Should I update or create a new one?"
     - If user confirms update: Use `action: "update"` with `changeReason: "Resolving conflict with new standard"`
     - If user wants new: Create new with different name/scope

2. **If exact duplicate:**
   - Skip storing (already exists)
   - Inform user: "This guideline already exists in memory"

3. **If no conflict:**
   - Store as new guideline

**When storing guidelines:**

```json
{
  "tool": "memory_guideline",
  "arguments": {
    "action": "add",  // or "update" if updating existing
    "scopeType": "project",
    "scopeId": "<project-id>",
    "name": "<descriptive-name>",
    "category": "<code_style|security|error_handling|etc>",
    "priority": 80,
    "content": "<the guideline text>",
    "rationale": "<why this guideline exists>",
    "examples": {
      "good": ["<good example>"],
      "bad": ["<bad example>"]
    },
    "changeReason": "<reason if updating>"  // Required for updates
  }
}
```

**Store guidelines when:**
- User mentions a coding standard
- You notice a pattern in the codebase
- You create a new pattern or convention
- Code review feedback reveals a standard

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

**Conflict Detection Rules:**

1. **If similar knowledge exists:**
   - Compare content semantically
   - If **supplementary** (adds context): Update existing with additional info
   - If **contradictory** (conflicts):
     - Query user: "I found existing knowledge that conflicts. Old: [X]. New: [Y]. Should I update or create a new entry?"
     - If updating: Use `action: "update"` with `changeReason: "Resolving conflict with new information"`
     - If new entry: Create with different title/scope

2. **If exact duplicate:**
   - Skip storing
   - Inform user: "This knowledge already exists"

3. **If no conflict:**
   - Store as new knowledge

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

**Store knowledge when:**
- User explains architecture decisions
- You discover why something was done a certain way
- Important context about the codebase
- API contracts or conventions
- Known issues and workarounds
- Domain-specific information

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

**Conflict Detection Rules:**

1. **If tool with same name exists:**
   - Compare parameters and description
   - If **same functionality**: Skip storing (already exists)
   - If **different functionality**: 
     - Query user: "Tool '[name]' already exists with different functionality. Should I update it or use a different name?"
     - If updating: Use `action: "update"` with `changeReason: "Updated tool definition"`
     - If different name: Create with new name

2. **If no conflict:**
   - Store as new tool

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

### 7. Tag Everything

**ALWAYS** tag entries appropriately:

```json
{
  "tool": "memory_tag",
  "arguments": {
    "action": "attach",
    "entryType": "<tool|guideline|knowledge>",
    "entryId": "<entry-id>",
    "tagName": "<tag-name>"
  }
}
```

**Common tags:**
- Languages: `typescript`, `python`, `javascript`, `rust`, `go`
- Domains: `frontend`, `backend`, `api`, `database`, `security`, `testing`
- Categories: `code_style`, `architecture`, `error_handling`

### 8. Query Before Making Decisions

Before implementing something, **ALWAYS** query for related knowledge:

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "types": ["knowledge", "guidelines"],
    "search": "<what-you-are-about-to-do>",
    "scope": {
      "type": "project",
      "id": "<project-id>",
      "inherit": true
    },
    "limit": 10
  }
}
```

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

**ALWAYS** link memory queries to conversations:

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "conversationId": "<conversation-id>",
    "messageId": "<message-id>",
    "autoLinkContext": true,
    // ... other query params
  }
}
```

**When `autoLinkContext: true` is used, automatically extract findings:**

1. Extract findings from linked conversation messages
2. Store as appropriate entry type (guideline/knowledge/tool)
3. Link back to conversation for traceability
4. Tag with conversation context automatically

**ALWAYS** add messages to track context:

```json
{
  "tool": "memory_conversation",
  "arguments": {
    "action": "add_message",
    "conversationId": "<conversation-id>",
    "role": "agent",
    "content": "<message-content>",
    "contextEntries": [/* memory entries used */],
    "toolsUsed": ["memory_query", "memory_guideline"],
    "metadata": {
      "file": "<file-being-edited>"
    }
  }
}
```

**Link context entries to conversation:**

```json
{
  "tool": "memory_conversation",
  "arguments": {
    "action": "link_context",
    "conversationId": "<conversation-id>",
    "entryType": "guideline",
    "entryId": "<entry-id>",
    "relevance": 0.9
  }
}
```

**Get conversation context:**

```json
{
  "tool": "memory_conversation",
  "arguments": {
    "action": "get_context",
    "conversationId": "<conversation-id>",
    "limit": 20
  }
}
```

**Search conversations:**

```json
{
  "tool": "memory_conversation",
  "arguments": {
    "action": "search",
    "projectId": "<project-id>",
    "search": "<search-query>",
    "limit": 10
  }
}
```

**When ending conversation:**

```json
{
  "tool": "memory_conversation",
  "arguments": {
    "action": "end",
    "conversationId": "<conversation-id>",
    "generateSummary": true
  }
}
```

**Archive old conversations:**

```json
{
  "tool": "memory_conversation",
  "arguments": {
    "action": "archive",
    "conversationId": "<conversation-id>"
  }
}
```

### 9.1. Continuous Extraction During Active Sessions

**Auto-population is controlled by session metadata:**

- Check session metadata: `metadata.autoPopulate === true` (default: true)
- If `autoPopulate` is `false` or not set, skip automatic extraction
- Only extract when explicitly instructed by user

**When auto-population is active in a session (`metadata.autoPopulate === true`):**

1. **After each user message:**
   - Analyze message for extractable findings
   - Check for guidelines, knowledge, tools, patterns
   - Extract immediately without prompting

2. **After code changes:**
   - Analyze code patterns introduced
   - Extract new conventions, patterns, utilities
   - Store as appropriate entry type

3. **During conversation:**
   - Link extracted entries to conversation automatically
   - Tag entries with conversation context
   - Create relations between related findings

4. **Extraction workflow:**
   ```
   For each finding:
   1. Check if similar entry exists (semantic search)
   2. If duplicate (>0.90 similarity): Skip, link to existing
   3. If similar (0.85-0.90): Update existing or create relation
   4. If new (<0.85): Store as new entry
   5. Tag with conversation context
   6. Link to conversation
   ```

5. **What to extract comprehensively:**
   - All explicit statements about standards/conventions
   - All architecture decisions and rationale
   - All tool/command mentions
   - All patterns visible in code
   - All important context about why/how
   - All domain-specific knowledge

**ALWAYS analyze conversation messages for extraction:**

When `autoLinkContext: true` is used in queries, automatically:
1. Extract findings from linked conversation messages
2. Store as appropriate entry type (guideline/knowledge/tool)
3. Link back to conversation for traceability

**Extraction patterns:**
- User statements → Extract as guidelines/knowledge
- Code examples → Extract patterns as guidelines
- Tool mentions → Extract as tools
- Decisions → Extract as knowledge (decision category)

### 10. End Sessions Properly

When completing a task, **ALWAYS** end the session:

```json
{
  "tool": "memory_session",
  "arguments": {
    "action": "end",
    "id": "<session-id>",
    "status": "completed"
  }
}
```

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

@version "1.0.0"
@last_updated "2024-12-19"
