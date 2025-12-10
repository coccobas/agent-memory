# Getting Started

This guide walks you through setting up and using Agent Memory.

## Prerequisites

- Node.js 20.x or later
- npm 10.x or later
- An MCP-compatible client (Claude Desktop, Claude Code, etc.)

## Installation

### 1. Clone or Create Project

```bash
# If you have the source
cd agent-memory
npm install
```

### 2. Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### 3. Initialize the Database

The database is automatically created on first run at `./data/memory.db`.

```bash
# Optional: Run migrations explicitly
npm run db:migrate
```

### 4. Verify Installation

```bash
# Run tests
npm test

# Type check
npm run typecheck
```

## Running the Server

### Standalone Mode

```bash
node dist/index.js
```

The server runs using stdio transport, expecting MCP protocol messages on stdin/stdout.

### With Claude Desktop

Add to your Claude Desktop configuration (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/absolute/path/to/agent-memory/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop to load the server.

### With Claude Code

```bash
claude mcp add agent-memory node /absolute/path/to/agent-memory/dist/index.js
```

## First Steps

Once the server is running, you can interact with it through your MCP client.

### 1. Create an Organization (Optional)

Organizations group projects for team scenarios.

```
Use tool: memory_org_create
Parameters: { "name": "My Team" }
```

### 2. Create a Project

```
Use tool: memory_project_create
Parameters: {
  "name": "my-web-app",
  "description": "React web application",
  "rootPath": "/Users/me/projects/my-web-app"
}
```

Save the returned `project.id` - you'll need it for scoped entries.

### 3. Add Your First Guideline

```
Use tool: memory_guideline_add
Parameters: {
  "scopeType": "project",
  "scopeId": "<your-project-id>",
  "name": "typescript-strict",
  "category": "code_style",
  "priority": 90,
  "content": "All TypeScript files must use strict mode. Enable 'strict: true' in tsconfig.json.",
  "rationale": "Catches more errors at compile time"
}
```

### 4. Query Guidelines

```
Use tool: memory_guideline_list
Parameters: {
  "scopeType": "project",
  "scopeId": "<your-project-id>"
}
```

This returns your project guidelines plus any inherited from parent scopes.

### 5. Add Knowledge

```
Use tool: memory_knowledge_add
Parameters: {
  "scopeType": "project",
  "scopeId": "<your-project-id>",
  "title": "Tech Stack Decision",
  "category": "decision",
  "content": "Using React 18 with TypeScript. State management: Zustand. Styling: Tailwind CSS.",
  "source": "Architecture meeting 2024-12-10"
}
```

### 6. Tag Entries

```
Use tool: memory_tag_attach
Parameters: {
  "entryType": "guideline",
  "entryId": "<guideline-id>",
  "tagName": "typescript"
}
```

## Working with Sessions

Sessions track temporary working context.

### Start a Session

```
Use tool: memory_session_start
Parameters: {
  "projectId": "<your-project-id>",
  "name": "Feature: User Auth",
  "purpose": "Implementing user authentication flow"
}
```

### Add Session-Scoped Knowledge

```
Use tool: memory_knowledge_add
Parameters: {
  "scopeType": "session",
  "scopeId": "<session-id>",
  "title": "Auth Implementation Notes",
  "category": "context",
  "content": "Using JWT tokens. Refresh token rotation enabled. 15 minute access token expiry."
}
```

### End the Session

```
Use tool: memory_session_end
Parameters: {
  "id": "<session-id>",
  "status": "completed"
}
```

## Common Workflows

### Finding Relevant Context

When starting work on a file or feature, query for relevant guidelines:

```
Use tool: memory_guideline_list
Parameters: {
  "scopeType": "project",
  "scopeId": "<project-id>",
  "category": "code_style"
}
```

### Recording Decisions

When you make an architectural or design decision:

```
Use tool: memory_knowledge_add
Parameters: {
  "scopeType": "project",
  "scopeId": "<project-id>",
  "title": "Database Choice",
  "category": "decision",
  "content": "Selected PostgreSQL over MySQL for JSONB support and better concurrent write handling.",
  "source": "Team discussion"
}
```

### Documenting Tools

When you discover or create a useful tool:

```
Use tool: memory_tool_add
Parameters: {
  "scopeType": "project",
  "scopeId": "<project-id>",
  "name": "npm run dev",
  "category": "cli",
  "description": "Start development server with hot reload",
  "parameters": {
    "port": { "type": "number", "default": 3000 }
  }
}
```

### Linking Related Entries

Connect related guidelines and knowledge:

```
Use tool: memory_relation_create
Parameters: {
  "sourceType": "guideline",
  "sourceId": "<guideline-id>",
  "targetType": "knowledge",
  "targetId": "<knowledge-id>",
  "relationType": "related_to"
}
```

## Scope Hierarchy

Understanding scope is key to effective use:

```
Global (applies everywhere)
   │
   └── Organization (team-wide)
          │
          └── Project (project-specific)
                 │
                 └── Session (temporary)
```

### Inheritance Rules

- When querying with `inherit: true` (default), results include all parent scopes
- More specific scopes override general ones (session > project > org > global)
- Use `inherit: false` to get only exact scope matches

### Choosing the Right Scope

| Scope | Use For |
|-------|---------|
| Global | Universal best practices, security guidelines |
| Organization | Team standards, shared tooling |
| Project | Project-specific patterns, decisions |
| Session | Temporary context, experimental ideas |

## Updating Entries

All updates create new versions:

```
Use tool: memory_guideline_update
Parameters: {
  "id": "<guideline-id>",
  "content": "Updated guideline text...",
  "changeReason": "Clarified edge case handling"
}
```

View history:

```
Use tool: memory_guideline_history
Parameters: {
  "id": "<guideline-id>"
}
```

## Best Practices

### 1. Use Meaningful Names

Entry names should be descriptive and searchable:
- Good: `typescript-strict-mode`, `error-handling-async`
- Bad: `rule1`, `guideline-new`

### 2. Provide Rationale

Always explain *why* a guideline exists:

```json
{
  "content": "Use async/await instead of .then() chains",
  "rationale": "Improves readability and makes error handling with try/catch cleaner"
}
```

### 3. Use Categories Consistently

Stick to a defined set of categories:
- Guidelines: `code_style`, `behavior`, `security`, `performance`, `error_handling`
- Knowledge: `decision`, `fact`, `context`, `reference`
- Tools: `mcp`, `cli`, `function`, `api`

### 4. Tag Liberally

Tags enable cross-cutting queries:

```
Use tool: memory_tag_attach
Parameters: {
  "entryType": "guideline",
  "entryId": "<id>",
  "tagName": "python"
}
```

### 5. Record Decisions Immediately

Don't wait - capture decisions when they're made:

```
Use tool: memory_knowledge_add
Parameters: {
  "scopeType": "project",
  "scopeId": "<id>",
  "title": "API Versioning Strategy",
  "category": "decision",
  "content": "Using URL path versioning (/v1/, /v2/) rather than headers.",
  "source": "RFC discussion"
}
```

## Troubleshooting

### Server Won't Start

1. Check Node.js version: `node --version` (need 20.x+)
2. Verify build: `npm run build`
3. Check for TypeScript errors: `npm run typecheck`

### Database Errors

1. Ensure `data/` directory exists and is writable
2. Delete `data/memory.db` to reset (loses all data)
3. Run migrations: `npm run db:migrate`

### MCP Connection Issues

1. Verify server path in configuration is absolute
2. Check Claude Desktop/Code logs for connection errors
3. Try running server standalone to verify it starts

### Missing Entries

1. Check scope: entries are scoped and may not appear in wrong context
2. Verify `inherit: true` to include parent scopes
3. Check `includeInactive` if entry was deactivated
