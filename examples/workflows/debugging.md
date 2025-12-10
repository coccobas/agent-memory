# Debugging Workflows

Guides for troubleshooting and debugging Agent Memory issues.

## Enable Debugging

### Performance Logging

Enable performance logging to see query times and cache hits:

```bash
export AGENT_MEMORY_PERF=1
node dist/index.js
```

Output example:
```
[agent-memory] memory_query scope=project types=tools,guidelines results=15/42 durationMs=8 cached=false
[agent-memory] memory_query scope=global types=guidelines results=5/5 durationMs=2 cached=true
```

### Disable Query Caching

If you suspect caching issues:

```bash
export AGENT_MEMORY_CACHE=0
node dist/index.js
```

### Custom Database Location

Use a test database for debugging:

```bash
export AGENT_MEMORY_DB_PATH=/tmp/test-memory.db
node dist/index.js
```

## Common Issues and Solutions

### Issue: Database Locked Error

**Symptoms:**
```
Error: database is locked
```

**Solutions:**

1. **Check for other processes:**
   ```bash
   ps aux | grep node | grep agent-memory
   ```

2. **Kill zombie processes:**
   ```bash
   pkill -f agent-memory
   ```

3. **Remove lock files:**
   ```bash
   rm data/*.db-shm data/*.db-wal
   ```

4. **Verify file permissions:**
   ```bash
   ls -la data/
   # Ensure memory.db is writable
   ```

### Issue: Conflicts Not Detected

**Symptoms:**
- Multiple rapid updates don't create conflict log entries

**Debug Steps:**

1. **Check conflict window timing:**
   ```json
   {
     "tool": "memory_tool",
     "arguments": {
       "action": "update",
       "id": "tool_abc",
       "description": "First update"
     }
   }
   // Wait < 5 seconds
   {
     "tool": "memory_tool",
     "arguments": {
       "action": "update",
       "id": "tool_abc",
       "description": "Second update (should conflict)"
     }
   }
   ```

2. **List conflicts:**
   ```json
   {
     "tool": "memory_conflict",
     "arguments": {
       "action": "list",
       "resolved": false
     }
   }
   ```

3. **Check version history:**
   ```json
   {
     "tool": "memory_tool",
     "arguments": {
       "action": "history",
       "id": "tool_abc"
     }
   }
   ```

### Issue: Slow Queries

**Symptoms:**
- Queries taking > 100ms

**Debug Steps:**

1. **Enable performance logging:**
   ```bash
   export AGENT_MEMORY_PERF=1
   ```

2. **Check scope size:**
   ```json
   {
     "tool": "memory_health",
     "arguments": {}
   }
   ```
   Look at table counts - large tables slow down queries.

3. **Use specific filters:**
   ```json
   {
     "tool": "memory_query",
     "arguments": {
       "action": "search",
       "types": ["tools"],
       "scope": {
         "type": "project",
         "id": "specific-project",
         "inherit": false
       },
       "tags": {
         "require": ["python"]
       },
       "limit": 20
     }
   }
   ```

4. **Use compact mode:**
   ```json
   {
     "tool": "memory_query",
     "arguments": {
       "action": "search",
       "compact": true,
       "limit": 20
     }
   }
   ```

### Issue: Entry Not Found

**Symptoms:**
- Query returns empty results when entry should exist

**Debug Steps:**

1. **Check if entry is active:**
   ```json
   {
     "tool": "memory_tool",
     "arguments": {
       "action": "list",
       "scopeType": "project",
       "scopeId": "proj_xyz",
       "includeInactive": true
     }
   }
   ```

2. **Verify scope hierarchy:**
   ```json
   {
     "tool": "memory_query",
     "arguments": {
       "action": "search",
       "scope": {
         "type": "session",
         "id": "sess_abc",
         "inherit": true
       }
     }
   }
   ```

3. **Check exact scope:**
   ```json
   {
     "tool": "memory_tool",
     "arguments": {
       "action": "get",
       "name": "my-tool",
       "scopeType": "project",
       "scopeId": "proj_xyz",
       "inherit": false
     }
   }
   ```

### Issue: File Lock Timeout

**Symptoms:**
- Lock expires before work is complete

**Solutions:**

1. **Increase lock timeout:**
   ```json
   {
     "tool": "memory_file_lock",
     "arguments": {
       "action": "checkout",
       "file_path": "/path/to/file",
       "agent_id": "agent-123",
       "expires_in": 7200
     }
   }
   ```

2. **List active locks:**
   ```json
   {
     "tool": "memory_file_lock",
     "arguments": {
       "action": "list"
     }
   }
   ```

3. **Force unlock if stuck:**
   ```json
   {
     "tool": "memory_file_lock",
     "arguments": {
       "action": "force_unlock",
       "file_path": "/path/to/file",
       "reason": "Previous agent crashed, lock is stale"
     }
   }
   ```

### Issue: Migration Errors

**Symptoms:**
```
Error: Migration failed
```

**Debug Steps:**

1. **Check migration status:**
   ```json
   {
     "tool": "memory_init",
     "arguments": {
       "action": "status"
     }
   }
   ```

2. **Backup current database:**
   ```bash
   npm run db:backup
   ```

3. **Reset database (WARNING: deletes all data):**
   ```json
   {
     "tool": "memory_init",
     "arguments": {
       "action": "reset",
       "confirm": true,
       "verbose": true
     }
   }
   ```

4. **Re-initialize:**
   ```json
   {
     "tool": "memory_init",
     "arguments": {
       "action": "init",
       "force": true,
       "verbose": true
     }
   }
   ```

## Debugging with SQLite

### Inspect Database Directly

```bash
# Open SQLite shell
sqlite3 data/memory.db

# List all tables
.tables

# Check table schema
.schema tools

# Count entries
SELECT COUNT(*) FROM tools WHERE is_active = 1;

# View recent entries
SELECT * FROM tools ORDER BY created_at DESC LIMIT 10;

# Check for conflicts
SELECT * FROM conflict_log WHERE resolved = 0;

# Exit
.exit
```

### Using Drizzle Studio

```bash
npm run db:studio
```

Opens a web interface to browse and query the database visually.

## Test Environment

### Run with Test Database

```bash
# Use a temporary database
export AGENT_MEMORY_DB_PATH=/tmp/test-$(date +%s).db
npm run dev
```

### Reset Test Database

```bash
rm -f /tmp/test-*.db
```

## Logging

### Add Custom Logging (Development)

Edit `src/db/connection.ts` to add SQL logging:

```typescript
const sqlite = new Database(dbPath, {
  verbose: console.log // Logs all SQL statements
});
```

### Query Performance Analysis

```typescript
// In src/services/query.service.ts
const startTime = Date.now();
const results = /* your query */;
const duration = Date.now() - startTime;
console.log(`Query took ${duration}ms, returned ${results.length} results`);
```

## Debugging MCP Communication

### Log MCP Tool Calls

Edit `src/mcp/server.ts`:

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.log('[MCP] Tool called:', name, 'with args:', JSON.stringify(args));
  // ... rest of handler
});
```

### Test MCP Server Directly

```bash
# Start server with stdio
node dist/index.js

# In another terminal, send JSON-RPC requests
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

## Getting Help

If you can't resolve the issue:

1. **Check the logs** with `AGENT_MEMORY_PERF=1`
2. **Review recent changes** - what did you change before the issue started?
3. **Test with fresh database** - does it work with a new database?
4. **Check GitHub issues** - has someone else encountered this?
5. **Open an issue** with:
   - Exact error message
   - Steps to reproduce
   - Environment (Node version, OS)
   - Database state (`memory_health` output)
   - Relevant logs

## Useful Commands

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run typecheck

# Lint
npm run lint

# Format code
npm run format

# Run all checks
npm run validate

# Build
npm run build

# Clean build artifacts
npm run clean

# Check health
node -e "console.log(JSON.stringify(require('./dist/mcp/server.js')))"
```
