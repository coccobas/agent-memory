# Testing Guide

This guide walks you through testing the Agent Memory MCP server from the command line, including using the MCP Inspector for interactive testing.

## Prerequisites

- Node.js 20.x or later
- npm 10.x or later
- Project built and database initialized

## Quick Start

### 1. Build the Project

```bash
cd /Users/b.cocco/coccobas/Memory
npm install
npm run build
```

### 2. Initialize the Database

```bash
# Run migrations to create the database schema
npm run db:migrate

# Optional: Load sample data for testing
sqlite3 data/memory.db < examples/bootstrap-data.sql
```

### 3. Verify Build

```bash
# Check that dist/ directory exists
ls -la dist/

# Run unit tests
npm test
```

## Testing with MCP Inspector

The MCP Inspector provides a web-based UI for testing MCP servers interactively.

### Installation

```bash
# Install MCP Inspector globally (optional)
npm install -g @modelcontextprotocol/inspector

# Or use npx (no installation needed)
npx @modelcontextprotocol/inspector
```

### Running the Inspector

```bash
# From the project root
npx @modelcontextprotocol/inspector node dist/index.js
```

This will:

1. Start the MCP Inspector web server
2. Launch your browser to the inspector UI (typically `http://localhost:3000`)
3. Connect to your Agent Memory server

### Using the Inspector UI

Once the inspector opens:

1. **View Available Tools**: The left sidebar shows all registered MCP tools
   - Look for `memory_query`, `memory_conflict` (with `action: "list"`), `memory_conflict` (with `action: "resolve"`)
   - Plus all other tools (scope management, CRUD operations, etc.)

2. **Call Tools**: Click on any tool to:
   - See its input schema
   - Fill in parameters
   - Execute the tool
   - View the JSON response

3. **Test Query Features**:
   - Use `memory_query` to test cross-reference search
   - Try different scope inheritance scenarios
   - Test tag filtering, text search, and relation-based queries

4. **Test Conflict Management**:
   - Use `memory_conflict` with `action: "list"` to list conflicts
   - Use `memory_conflict` with `action: "resolve"` to mark conflicts as resolved

## Manual Testing Scenarios

### Scenario 1: Test Basic Query

**Goal**: Verify `memory_query` returns results from global scope.

**Steps in Inspector**:

Call `memory_query` with:

```json
{
  "types": ["guidelines"],
  "scope": {
    "type": "global",
    "inherit": true
  },
  "limit": 10
}
```

**Expected**: Returns guidelines from the bootstrap data (if loaded).

---

### Scenario 2: Test Scope Inheritance

**Goal**: Verify that querying a session scope includes parent scopes.

**Steps**:

1. **Create a project**:

```json
{
  "name": "memory_project",
  "arguments": {
    "action": "create",
    "name": "test-project",
    "description": "Test project for scope inheritance"
  }
}
```

Save the returned `project.id`.

2. **Create a session**:

```json
{
  "name": "memory_session",
  "arguments": {
    "action": "start",
    "projectId": "<project-id-from-step-1>",
    "name": "test-session",
    "purpose": "Testing scope inheritance"
  }
}
```

Save the returned `session.id`.

3. **Add a project-level guideline**:

```json
{
  "name": "memory_guideline",
  "arguments": {
    "action": "add",
    "scopeType": "project",
    "scopeId": "<project-id>",
    "name": "project_guideline",
    "content": "This is a project-level guideline",
    "priority": 80,
    "category": "testing"
  }
}
```

4. **Query from session scope with inheritance**:

```json
{
  "name": "memory_query",
  "arguments": {
    "types": ["guidelines"],
    "scope": {
      "type": "session",
      "id": "<session-id>",
      "inherit": true
    }
  }
}
```

**Expected**: Returns the project-level guideline even though querying from session scope.

---

### Scenario 3: Test Tag Filtering

**Goal**: Verify tag-based filtering in queries.

**Steps**:

1. **Add a guideline with a tag**:

```json
{
  "name": "memory_guideline",
  "arguments": {
    "action": "add",
    "scopeType": "global",
    "name": "security_rule",
    "content": "Always use parameterized queries",
    "priority": 95,
    "category": "security"
  }
}
```

Save the `guideline.id`.

2. **Attach a tag**:

```json
{
  "name": "memory_tag",
  "arguments": {
    "action": "attach",
    "entryType": "guideline",
    "entryId": "<guideline-id>",
    "tagName": "security"
  }
}
```

3. **Query by tag**:

```json
{
  "name": "memory_query",
  "arguments": {
    "types": ["guidelines"],
    "tags": {
      "require": ["security"]
    },
    "scope": {
      "type": "global",
      "inherit": true
    }
  }
}
```

**Expected**: Returns only guidelines tagged with `"security"`.

---

### Scenario 6: Test `memory_query` with `action: "context"` (Aggregated Context)

**Goal**: Verify that `memory_query` with `action: "context"` returns aggregated context for a scope, with scope inheritance.

**Steps**:

1. **Create a project and session** (as in Scenario 2).
2. **Add entries at different scopes**:

```json
{
  "name": "memory_tool",
  "arguments": {
    "action": "add",
    "scopeType": "global",
    "name": "global_tool",
    "category": "cli"
  }
}
```

```json
{
  "name": "memory_guideline",
  "arguments": {
    "action": "add",
    "scopeType": "project",
    "scopeId": "<project-id>",
    "name": "project_guideline",
    "content": "Project-level rule",
    "priority": 80
  }
}
```

```json
{
  "name": "memory_knowledge",
  "arguments": {
    "action": "add",
    "scopeType": "session",
    "scopeId": "<session-id>",
    "title": "session_note",
    "content": "Session-specific note"
  }
}
```

3. **Call `memory_query` with `action: "context"` for the session**:

```json
{
  "name": "memory_query",
  "arguments": {
    "action": "context",
    "scopeType": "session",
    "scopeId": "<session-id>",
    "inherit": true,
    "compact": false
  }
}
```

**Expected**:
- `scope.type` is `"session"` and `scope.id` matches `<session-id>`.
- `tools` includes `global_tool`.
- `guidelines` includes `project_guideline`.
- `knowledge` includes `session_note`.

---

## End-to-End Workflows

### Onboard a New Project

This workflow demonstrates creating a new project, adding initial memory, and querying it.

1. **Create organization and project** using `memory_org` with `action: "create"` and `memory_project` with `action: "create"`.
2. **Start a session** with `memory_session` with `action: "start"`.
3. **Add tools, guidelines, and knowledge** at project scope (`memory_tool` with `action: "add"`, `memory_guideline` with `action: "add"`, `memory_knowledge` with `action: "add"`).
4. **Query relevant context** with:

```json
{
  "name": "memory_query",
  "arguments": {
    "types": ["tools", "guidelines", "knowledge"],
    "scope": { "type": "project", "id": "<project-id>", "inherit": true },
    "limit": 50
  }
}
```

5. **Summarize session context** using:

```json
{
  "name": "memory_query",
  "arguments": {
    "action": "context",
    "scopeType": "session",
    "scopeId": "<session-id>",
    "inherit": true,
    "compact": true
  }
}
```

You can see a full JSON example in `examples/workflows/onboard-project.json`.

---

### Handle a Conflict

This workflow demonstrates creating a conflict via rapid updates and resolving it.

1. **Create a global tool** with `memory_tool` and `action: "add"`.
2. **Perform two rapid updates** with `memory_tool` and `action: "update"` on the same tool ID.
3. **List unresolved conflicts**:

```json
{
  "name": "memory_conflict",
  "arguments": {
    "action": "list",
    "entryType": "tool",
    "resolved": false,
    "limit": 10
  }
}
```

4. **Resolve a conflict** using the returned conflict ID:

```json
{
  "name": "memory_conflict",
  "arguments": {
    "action": "resolve",
    "id": "<conflict-id>",
    "resolution": "Kept latest version as canonical",
    "resolvedBy": "test-user"
  }
}
```

5. **Verify resolution** by calling `memory_conflict` with `action: "list"` again with `resolved: true`.

See `examples/workflows/handle-conflict.json` for a full payload sequence.

---

### Scenario 4: Test Relation-Based Query

**Goal**: Verify finding entries related to another entry.

**Steps**:

1. **Create a tool and guideline** (or use existing ones from bootstrap data).

2. **Create a relation**:

```json
{
  "name": "memory_relation",
  "arguments": {
    "action": "create",
    "sourceType": "guideline",
    "sourceId": "<guideline-id>",
    "targetType": "tool",
    "targetId": "<tool-id>",
    "relationType": "applies_to"
  }
}
```

3. **Query related entries**:

```json
{
  "name": "memory_query",
  "arguments": {
    "types": ["guidelines"],
    "relatedTo": {
      "type": "tool",
      "id": "<tool-id>",
      "relation": "applies_to"
    }
  }
}
```

**Expected**: Returns guidelines that have an `"applies_to"` relation to the specified tool.

---

### Scenario 5: Test Conflict Detection and Resolution

**Goal**: Verify conflict detection and resolution workflow.

**Steps**:

1. **Create a tool**:

```json
{
  "name": "memory_tool",
  "arguments": {
    "action": "add",
    "scopeType": "global",
    "name": "test_tool",
    "description": "A test tool",
    "category": "cli"
  }
}
```

Save the `tool.id`.

2. **Update the tool quickly** (simulate concurrent write):

```json
{
  "name": "memory_tool",
  "arguments": {
    "action": "update",
    "id": "<tool-id>",
    "description": "Updated description",
    "changeReason": "First update"
  }
}
```

3. **Update again within 5 seconds** (triggers conflict):

```json
{
  "name": "memory_tool",
  "arguments": {
    "action": "update",
    "id": "<tool-id>",
    "description": "Another update",
    "changeReason": "Second update (conflict)"
  }
}
```

4. **List conflicts**:

```json
{
  "name": "memory_conflict",
  "arguments": {
    "action": "list",
    "entryType": "tool",
    "resolved": false,
    "limit": 20
  }
}
```

**Expected**: Shows at least one unresolved conflict for the tool.

5. **Resolve the conflict**:

```json
{
  "name": "memory_conflict",
  "arguments": {
    "action": "resolve",
    "id": "<conflict-id>",
    "resolution": "Kept the second version as canonical",
    "resolvedBy": "test-user"
  }
}
```

6. **Verify resolution**:

```json
{
  "name": "memory_conflict",
  "arguments": {
    "action": "list",
    "resolved": true
  }
}
```

**Expected**: The conflict now appears in resolved conflicts list.

---

## Testing Text Search

**Goal**: Verify full-text search across entry content.

**Steps**:

```json
{
  "name": "memory_query",
  "arguments": {
    "types": ["guidelines", "knowledge"],
    "search": "security",
    "scope": {
      "type": "global",
      "inherit": true
    },
    "limit": 10
  }
}
```

**Expected**: Returns entries where `"security"` appears in name, description, or content.

---

## Testing Compact Mode

**Goal**: Verify compact responses for token efficiency.

**Steps**:

```json
{
  "name": "memory_query",
  "arguments": {
    "types": ["tools"],
    "compact": true,
    "limit": 20
  }
}
```

**Expected**: Returns minimal data (IDs, names, basic metadata) without full content.

---

## Testing Version History

**Goal**: Verify version history inclusion in query results.

**Steps**:

```json
{
  "name": "memory_query",
  "arguments": {
    "types": ["tools"],
    "includeVersions": true,
    "limit": 5
  }
}
```

**Expected**: Each result includes a `versions` array with full version history.

---

## Direct Database Verification

You can also verify data directly in SQLite:

```bash
# Open the database
sqlite3 data/memory.db

# Check tools
SELECT name, scope_type, scope_id FROM tools LIMIT 10;

# Check guidelines
SELECT name, scope_type, scope_id, priority FROM guidelines LIMIT 10;

# Check conflicts
SELECT entry_type, entry_id, resolved, detected_at FROM conflict_log;

# Check tags
SELECT name, category FROM tags WHERE is_predefined = 1;

# Check relations
SELECT source_type, source_id, target_type, target_id, relation_type 
FROM entry_relations LIMIT 10;

# Check entry tags
SELECT et.entry_type, et.entry_id, t.name as tag_name
FROM entry_tags et
JOIN tags t ON et.tag_id = t.id
LIMIT 10;
```

---

## Troubleshooting

### Server Won't Start

- **Check build**: Ensure `npm run build` completed successfully.
- **Check database**: Ensure `data/memory.db` exists or run `npm run db:migrate`.
- **Check Node version**: Ensure Node.js 20.x or later (`node --version`).

### No Tools Appearing in Inspector

- **Check server logs**: Look for errors in the terminal where inspector is running.
- **Verify imports**: Ensure all handlers are properly imported in `src/mcp/server.ts`.
- **Check tool definitions**: Verify `TOOLS` array includes all expected tools.

### Query Returns Empty Results

- **Load sample data**: Run `sqlite3 data/memory.db < examples/bootstrap-data.sql`.
- **Check scope**: Verify you're querying the correct scope (use `global` for bootstrap data).
- **Check filters**: Remove tag/search filters to see all results first.

### Conflicts Not Detected

- **Timing**: Conflicts are detected when writes occur within 5 seconds.
- **Check conflict_log**: Query the database directly to see if conflicts were logged.
- **Verify version creation**: Ensure tool updates are creating new versions.

---

## Running Automated Tests

The project includes unit and integration tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage

# Run specific test files
npm test -- tests/unit/query.service.test.ts
npm test -- tests/unit/conflicts.repo.test.ts
npm test -- tests/integration/memory_query.test.ts
```

---

## Next Steps

After testing:

- Integrate with Claude Desktop (see `docs/getting-started.md`).
- Explore all tools in `docs/api-reference.md`.
- Review architecture in `docs/architecture.md`.
- Check schema details in `docs/data-model.md`.


