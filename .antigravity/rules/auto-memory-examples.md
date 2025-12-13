---
description: Agent Memory usage examples and common workflows
globs: ["**/*"]
alwaysApply: false
related_docs: [
  ".cursor/rules/auto-memory-core.mdc",
  ".cursor/rules/auto-memory-advanced.mdc",
  ".cursor/rules/auto-memory-reference.mdc"
]
---

@context {
    "type": "examples",
    "purpose": "cursor_rules",
    "format_version": "1.0.0",
    "supported_content_types": [
        "examples",
        "workflows"
    ]
}

@structure {
    "required_sections": [
        "frontmatter",
        "title",
        "examples",
        "triggers",
        "setup"
    ]
}

# Agent Memory Examples

Practical examples of using Agent Memory tools. See `auto-memory-core.mdc` for the core workflow.

## Memory Population Triggers

Automatically populate memory in these situations:

### Comprehensive Extraction Patterns

**Extract Guidelines when user says:**
- "We always/never do X"
- "Our standard is..."
- "The convention is..."
- "We follow this pattern..."
- "This is how we handle..."
- Mentions code style, architecture patterns, error handling approaches
- "We prefer X over Y"
- "We avoid doing X"
- "The pattern we use is..."

**Extract Knowledge when user says:**
- "We chose X because..."
- "The reason we..."
- "We decided to..."
- "This was done because..."
- "We use X for Y because..."
- Explains architecture, decisions, trade-offs, context
- "We considered X but chose Y because..."
- "The trade-off we made was..."
- "This is important because..."

**Extract Tools when user says:**
- "We have a script/command for..."
- "Use this tool/command..."
- "Run X to do Y"
- Mentions CLI commands, build scripts, deployment tools
- "To do X, run..."
- "We use this tool for..."
- "The command is..."

**Extract from code patterns:**
- Repeated patterns in code → Store as guideline
- Architecture decisions visible in code → Store as knowledge
- Custom utilities/functions → Store as tool
- Consistent error handling → Store as guideline
- Repeated data structures → Store as knowledge
- Common helper functions → Store as tool

### When User Says:
- "We always do X" → Store as guideline
- "We use Y because..." → Store as knowledge (decision)
- "The reason we..." → Store as knowledge
- "Our standard is..." → Store as guideline
- "We have a tool/script for..." → Store as tool

### When You Discover:
- A coding pattern → Store as guideline
- An architecture decision → Store as knowledge
- A project-specific command → Store as tool
- Important context → Store as knowledge
- A convention → Store as guideline

### When You Create:
- A new pattern → Store as guideline
- A new convention → Store as guideline
- A new script/command → Store as tool
- A new decision → Store as knowledge

## Project Setup (First Time)

### Step 1: Check Initialization

**ALWAYS** check if database is initialized:

```json
{
  "tool": "memory_init",
  "arguments": {
    "action": "status"
  }
}
```

If not initialized, initialize:

```json
{
  "tool": "memory_init",
  "arguments": {
    "action": "init",
    "verbose": true
  }
}
```

### Step 2: Create Organization (Optional)

For team scenarios, create organization first:

```json
{
  "tool": "memory_org",
  "arguments": {
    "action": "create",
    "name": "<organization-name>",
    "metadata": {
      "description": "<org-description>"
    }
  }
}
```

### Step 3: Smart Project Detection and Creation

**ALWAYS check for existing project first:**

1. Query existing projects matching workspace:
```json
{
  "tool": "memory_project",
  "arguments": {
    "action": "list",
    "limit": 10
  }
}
```

2. Check workspace path against project rootPath
3. Check project name against workspace directory name

**Auto-create project when:**
- No matching project exists AND
- Clear project context detected (package.json, git repo, workspace structure) AND
- Project name can be inferred from workspace directory or package.json

**Prompt user when:**
- Project context is ambiguous
- Multiple potential project names detected
- User explicitly asks about project setup

**Extract project metadata from context:**
- Name: from package.json "name" or workspace directory
- Description: from package.json "description" or README.md
- Root path: current workspace path
- Language: from package.json dependencies or file extensions
- Framework: from package.json dependencies or config files

**If no project exists and context is clear, create automatically:**

```json
{
  "tool": "memory_project",
  "arguments": {
    "action": "create",
    "name": "<inferred-project-name>",
    "description": "<extracted-description>",
    "rootPath": "<absolute-path-to-project>",
    "orgId": "<org-id-if-created>",
    "metadata": {
      "language": "<detected-language>",
      "framework": "<detected-framework>",
      "detectedFrom": "workspace-context"
    }
  }
}
```

**If context is ambiguous, prompt user:**

"I detected a project but need confirmation. Name: [inferred], Path: [workspace]. Should I create this project?"

Save the project ID and use it for all subsequent operations.

### Step 4: Verify Setup

Check health to verify everything is working:

```json
{
  "tool": "memory_health",
  "arguments": {}
}
```

## Examples

### Example 1: Starting a New Feature

1. Query project context
2. Start session: "feature-user-authentication"
3. Query authentication-related guidelines/knowledge
4. Begin implementation
5. Store any new patterns as guidelines
6. Store decisions as knowledge
7. End session when complete

### Example 2: User Explains a Pattern

User: "We always use try-catch for async operations"

You should:
1. Store as guideline immediately
2. Tag with relevant tags (e.g., "error_handling", "async")
3. Acknowledge and use this pattern going forward

### Example 3: Discovering Architecture

You: "I notice this codebase uses PostgreSQL"

You should:
1. Query if this is already documented
2. If not, store as knowledge (decision category)
3. Include context about why (if known)

### Example 4: Handling Conflict

User: "We always use async/await"
You: [Queries memory, finds existing guideline: "Use .then() for promises"]
Conflict detected!

You should:
1. Present both to user: "I found conflicting guidelines. Old: 'Use .then()'. New: 'Use async/await'. Which should I keep?"
2. If user says "async/await":
   - Update existing guideline with new content
   - Set changeReason: "Updated to use async/await per user preference"
3. Store resolution as knowledge:
   - Title: "Conflict Resolution: Promise handling pattern"
   - Content: "Resolved conflict between .then() and async/await. Chose async/await for better readability."

### Example 5: Semantic Conflict Detection

User: "We use TypeScript strict mode"
You: [Queries memory, finds: "TypeScript strict mode is optional"]

You should:
1. Detect semantic conflict (optional vs required)
2. Ask user: "I found existing knowledge that TypeScript strict mode is optional, but you're saying it's required. Should I update the existing entry?"
3. If yes: Update with changeReason
4. If no: Create new entry with different scope/name

### Example 6: Using Analytics to Learn

You: [After working for a while, check analytics]

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

Results show: "error_handling" guideline accessed 50 times, "logging" guideline accessed 5 times

You should:
1. Promote "error_handling" to higher priority (e.g., 90)
2. Review "logging" guideline - maybe it needs updating or better tagging
3. Store this insight as knowledge

### Example 7: Automatic Relation Creation

User: "This guideline applies to all API endpoints"

You should:
1. Store the guideline
2. Query for all API-related tools/guidelines
3. Create `applies_to` relations automatically:

```json
{
  "tool": "memory_relation",
  "arguments": {
    "action": "create",
    "sourceType": "guideline",
    "sourceId": "<new-guideline-id>",
    "targetType": "tool",
    "targetId": "<api-tool-id>",
    "relationType": "applies_to"
  }
}
```

### Example 8: Context-Aware Querying

You: [Working on file `/src/api/users.ts`]

You should:
1. Infer tags: `["typescript", "api", "users"]`
2. Query automatically:

```json
{
  "tool": "memory_query",
  "arguments": {
    "action": "search",
    "types": ["guidelines", "knowledge"],
    "tags": {
      "include": ["typescript", "api"]
    },
    "scope": {
      "type": "project",
      "id": "<project-id>",
      "inherit": true
    }
  }
}
```

3. Use results to guide implementation

### Example 9: Confidence-Based Storage

User: "I think we might use Redis for caching"

You should:
1. Store with lower confidence (0.6):

```json
{
  "tool": "memory_knowledge",
  "arguments": {
    "action": "add",
    "title": "Potential Redis usage",
    "content": "Considering Redis for caching",
    "confidence": 0.6,  // Lower confidence - uncertain
    "category": "context"
  }
}
```

2. Later, if user confirms: Update with higher confidence (0.95)

### Example 10: Task Decomposition

User: "Implement user authentication system"

You should:
1. Decompose into subtasks:

```json
{
  "tool": "memory_task",
  "arguments": {
    "action": "add",
    "subtasks": [
      "Design authentication flow",
      "Implement JWT generation",
      "Create login endpoint",
      "Add password hashing",
      "Write authentication tests"
    ],
    "decompositionStrategy": "maximal",
    "scopeType": "project",
    "scopeId": "<project-id>"
  }
}
```

2. Track each subtask as it's completed
3. Link subtasks with dependencies using relations

### Example 11: Complete Workflow with All Tools

**Scenario: Adding a new API endpoint**

1. **Check health:**
```json
{"tool": "memory_health", "arguments": {}}
```

2. **Query project context:**
```json
{"tool": "memory_query", "arguments": {"action": "context", "scopeType": "project", "scopeId": "<project-id>"}}
```

3. **Start session:**
```json
{"tool": "memory_session", "arguments": {"action": "start", "projectId": "<project-id>", "name": "add-user-endpoint"}}
```

4. **Start conversation:**
```json
{"tool": "memory_conversation", "arguments": {"action": "start", "projectId": "<project-id>", "sessionId": "<session-id>"}}
```

5. **Check file lock:**
```json
{"tool": "memory_file_lock", "arguments": {"action": "status", "file_path": "/path/to/api.ts"}}
```

6. **Checkout lock:**
```json
{"tool": "memory_file_lock", "arguments": {"action": "checkout", "file_path": "/path/to/api.ts", "agent_id": "cursor-ai"}}
```

7. **Query relevant guidelines (with conversation linking):**
```json
{"tool": "memory_query", "arguments": {"action": "search", "types": ["guidelines"], "tags": {"include": ["api", "typescript"]}, "conversationId": "<conversation-id>", "autoLinkContext": true}}
```

8. **Implement endpoint following guidelines**

9. **Store new patterns as guidelines:**
```json
{"tool": "memory_guideline", "arguments": {"action": "add", "scopeType": "project", "scopeId": "<project-id>", "name": "api-endpoint-pattern", "content": "..."}}
```

10. **Create relations:**
```json
{"tool": "memory_relation", "arguments": {"action": "create", "sourceType": "guideline", "sourceId": "<guideline-id>", "targetType": "tool", "targetId": "<api-tool-id>", "relationType": "applies_to"}}
```

11. **Add message to conversation:**
```json
{"tool": "memory_conversation", "arguments": {"action": "add_message", "conversationId": "<conversation-id>", "role": "agent", "content": "Implemented endpoint", "contextEntries": [...], "toolsUsed": ["memory_query", "memory_guideline"]}}
```

12. **Checkin file lock:**
```json
{"tool": "memory_file_lock", "arguments": {"action": "checkin", "file_path": "/path/to/api.ts", "agent_id": "cursor-ai"}}
```

13. **End conversation:**
```json
{"tool": "memory_conversation", "arguments": {"action": "end", "conversationId": "<conversation-id>", "generateSummary": true}}
```

14. **End session:**
```json
{"tool": "memory_session", "arguments": {"action": "end", "id": "<session-id>", "status": "completed"}}
```

### Example 12: Automatic Project Creation with Smart Detection

**Scenario:** Starting work in a new workspace

1. **Detect workspace context:**
   - Read package.json for project name/description
   - Check git remote for project identifier
   - Infer from workspace directory name

2. **Check for existing project:**
   ```json
   {"tool": "memory_project", "arguments": {"action": "list"}}
   ```

3. **If no match found and context is clear:**
   - Auto-create project with extracted metadata:
   ```json
   {
     "tool": "memory_project",
     "arguments": {
       "action": "create",
       "name": "my-web-app",
       "description": "Web application built with React and TypeScript",
       "rootPath": "/Users/dev/my-web-app",
       "metadata": {
         "language": "typescript",
         "framework": "react",
         "detectedFrom": "workspace-context"
       }
     }
   }
   ```
   - Store project ID for session

4. **If context is ambiguous:**
   - Prompt user: "I detected a project but need confirmation. Name: [inferred], Path: [workspace]. Should I create this project?"

### Example 13: Comprehensive Extraction During Session

**Scenario:** User explains architecture during conversation

User: "We use PostgreSQL because it has better JSONB support and we need that for our flexible schema"

You should automatically:
1. Extract as knowledge (decision category):
   ```json
   {
     "tool": "memory_knowledge",
     "arguments": {
       "action": "add",
       "scopeType": "project",
       "scopeId": "<project-id>",
       "title": "Database choice: PostgreSQL",
       "content": "PostgreSQL chosen for JSONB support and flexible schema requirements",
       "category": "decision",
       "confidence": 0.95,
       "source": "user-conversation"
     }
   }
   ```

2. Extract as guideline if pattern emerges:
   ```json
   {
     "tool": "memory_guideline",
     "arguments": {
       "action": "add",
       "scopeType": "project",
       "scopeId": "<project-id>",
       "name": "Use PostgreSQL JSONB for flexible schemas",
       "content": "When flexible schema is required, use PostgreSQL JSONB columns",
       "category": "architecture",
       "priority": 80
     }
   }
   ```

3. Link both to conversation:
   ```json
   {
     "tool": "memory_conversation",
     "arguments": {
       "action": "link_context",
       "conversationId": "<conversation-id>",
       "entryType": "knowledge",
       "entryId": "<knowledge-id>",
       "relevanceScore": 0.95
     }
   }
   ```

4. Tag appropriately (database, architecture, decision)

### Example 14: Pattern Extraction from Code

**Scenario:** User shows code pattern repeatedly

You notice: All API endpoints follow same error handling pattern

You should:
1. Extract pattern as guideline:
   ```json
   {
     "tool": "memory_guideline",
     "arguments": {
       "action": "add",
       "scopeType": "project",
       "scopeId": "<project-id>",
       "name": "API error handling pattern",
       "content": "All API endpoints must use try-catch blocks and return standardized error responses with status codes",
       "category": "error_handling",
       "priority": 85,
       "examples": {
         "good": [
           "try { const result = await service.call(); return res.status(200).json(result); } catch (error) { return res.status(500).json({ error: error.message }); }"
         ],
         "bad": [
           "const result = await service.call(); return res.json(result);"
         ]
       }
     }
   }
   ```

2. Create relations to all related API tools/guidelines:
   ```json
   {
     "tool": "memory_relation",
     "arguments": {
       "action": "create",
       "sourceType": "guideline",
       "sourceId": "<guideline-id>",
       "targetType": "tool",
       "targetId": "<api-tool-id>",
       "relationType": "applies_to"
     }
   }
   ```

3. Tag with "api", "error_handling", "pattern"

@version "1.0.0"
@last_updated "2024-12-19"
