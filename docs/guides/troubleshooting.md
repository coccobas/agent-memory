# Troubleshooting Guide

Common issues and their solutions.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Database Issues](#database-issues)
- [MCP Connection Issues](#mcp-connection-issues)
- [REST API Issues](#rest-api-issues)
- [Semantic Search Issues](#semantic-search-issues)
- [Permission Issues](#permission-issues)
- [Performance Issues](#performance-issues)
- [Debug Mode](#debug-mode)
- [Log Analysis](#log-analysis)

---

## Installation Issues

### Node.js Version Error

```
Error: Agent Memory requires Node.js >= 20.0.0
```

**Solution:** Update Node.js to version 20 or later.

```bash
# Using nvm
nvm install 20
nvm use 20

# Verify
node --version  # Should show v20.x.x
```

### Permission Denied (npm)

```
EACCES: permission denied, access '/usr/local/lib/node_modules'
```

**Solution:** Don't use `sudo`. Fix npm permissions:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Native Module Build Errors

```
Error: Cannot find module 'better-sqlite3'
gyp ERR! build error
```

**Solution:** Install build tools:

**macOS:**
```bash
xcode-select --install
```

**Ubuntu/Debian:**
```bash
sudo apt-get install build-essential python3
```

**Windows:**
```bash
npm install --global windows-build-tools
```

### npx Not Found

```
npx: command not found
```

**Solution:** npx comes with npm 5.2+. Update npm:

```bash
npm install -g npm@latest
```

---

## Database Issues

### Database Locked

```
Error: SQLITE_BUSY: database is locked
```

**Causes:**
- Multiple processes accessing the database
- Unfinished transactions

**Solutions:**

1. Check for other processes:
```bash
lsof ~/.agent-memory/data/memory.db
```

2. Kill stuck processes:
```bash
# Find process
ps aux | grep agent-memory
# Kill if needed
kill <PID>
```

3. If using multiple agents, enable WAL mode (should be automatic):
```bash
sqlite3 ~/.agent-memory/data/memory.db "PRAGMA journal_mode=WAL;"
```

### Database Corrupted

```
Error: SQLITE_CORRUPT: database disk image is malformed
```

**Solution:** Restore from backup:

```json
// Tool: memory_backup
{ "action": "list" }

// Find recent backup, then:
{ "action": "restore", "filename": "memory-backup-2024-01-15.db" }
```

If no backup available:

```bash
# Try to recover
sqlite3 ~/.agent-memory/data/memory.db ".recover" | sqlite3 memory-recovered.db
mv memory-recovered.db ~/.agent-memory/data/memory.db
```

### Migration Failed

```
Error: Migration checksum mismatch
```

**Solutions:**

1. Enable dev mode (auto-fixes checksums):
```bash
AGENT_MEMORY_DEV_MODE=1 agent-memory mcp
```

2. Or manually fix:
```bash
AGENT_MEMORY_AUTO_FIX_CHECKSUMS=1 agent-memory mcp
```

3. Reset database (WARNING: deletes all data):
```json
// Tool: memory_init
{ "action": "reset", "confirm": true }
```

### Database Not Initialized

```
Error: Database not initialized
```

**Solution:** Initialize explicitly:

```json
// Tool: memory_init
{ "action": "init" }
```

Or set environment variable:
```bash
AGENT_MEMORY_SKIP_INIT=0 agent-memory mcp
```

---

## MCP Connection Issues

### Client Can't Connect

**Claude Desktop shows no tools available**

**Solutions:**

1. Check config file location:
   - macOS: `~/.claude.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Verify JSON syntax:
```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"]
    }
  }
}
```

3. Restart Claude Desktop completely (quit and reopen)

4. Check if npx is available:
```bash
which npx
npx --version
```

### Server Crashes on Start

**Solution:** Check for port conflicts or existing processes:

```bash
# Check if process is running
ps aux | grep agent-memory

# Kill existing process
pkill -f "agent-memory"
```

### Invalid JSON-RPC

```
Error: Invalid JSON-RPC request
```

**Cause:** Malformed tool call or wrong action name.

**Solution:** Check action names and parameters:

```json
// Wrong
{ "action": "create" }  // for memory_guideline

// Correct
{ "action": "add" }  // for memory_guideline
```

See [API Reference](../api-reference.md) for correct action names.

---

## REST API Issues

### Connection Refused

```
curl: (7) Failed to connect to 127.0.0.1 port 8787
```

**Causes:**
- REST API not enabled
- Server not running
- Wrong port

**Solutions:**

1. Enable REST API:
```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret \
agent-memory rest
```

2. Check if server is running:
```bash
curl http://127.0.0.1:8787/health
```

3. Check port configuration:
```bash
AGENT_MEMORY_REST_PORT=8888 agent-memory rest
```

### 401 Unauthorized

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Invalid or missing API key" } }
```

**Solutions:**

1. Include API key in request:
```bash
curl -H "Authorization: Bearer your-secret-key" http://127.0.0.1:8787/v1/query
# or
curl -H "X-API-Key: your-secret-key" http://127.0.0.1:8787/v1/query
```

2. Verify API key matches:
```bash
# Server started with:
AGENT_MEMORY_REST_API_KEY=my-key agent-memory rest

# Request must use same key:
curl -H "Authorization: Bearer my-key" ...
```

### 403 Forbidden

```json
{ "error": { "code": "FORBIDDEN", "message": "Permission denied" } }
```

**Solutions:**

1. Enable permissive mode:
```bash
AGENT_MEMORY_PERMISSIONS_MODE=permissive agent-memory rest
```

2. Grant permissions to agent:
```json
// Tool: memory_permission
{
  "action": "grant",
  "agent_id": "your-agent-id",
  "scope_type": "project",
  "scope_id": "proj-123",
  "entry_type": "guideline",
  "permission": "write"
}
```

### 429 Too Many Requests

```json
{ "error": { "code": "RATE_LIMITED", "message": "Rate limit exceeded" } }
```

**Solutions:**

1. Wait and retry with exponential backoff

2. Increase rate limits:
```bash
AGENT_MEMORY_RATE_LIMIT_PER_AGENT_MAX=1000 \
AGENT_MEMORY_RATE_LIMIT_GLOBAL_MAX=10000 \
agent-memory rest
```

3. Disable rate limiting (not recommended for production):
```bash
AGENT_MEMORY_RATE_LIMIT=0 agent-memory rest
```

---

## Semantic Search Issues

### No Results from Semantic Search

**Causes:**
- OpenAI API key not configured
- Embeddings not generated
- Threshold too high

**Solutions:**

1. Configure OpenAI key:
```bash
AGENT_MEMORY_OPENAI_API_KEY=sk-... agent-memory mcp
```

2. Check if embeddings exist:
```bash
ls ~/.agent-memory/data/vectors.lance/
```

3. Lower similarity threshold:
```json
{
  "action": "search",
  "search": "query",
  "semanticSearch": true,
  "semanticThreshold": 0.5  // Lower from default 0.7
}
```

### OpenAI API Errors

```
Error: OpenAI API request failed: 401
```

**Solutions:**

1. Verify API key is valid:
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $AGENT_MEMORY_OPENAI_API_KEY"
```

2. Check API key has embeddings access

3. Verify billing is active on OpenAI account

### Embedding Generation Slow

**Solutions:**

1. Use local embeddings:
```bash
AGENT_MEMORY_EMBEDDING_PROVIDER=local agent-memory mcp
```

2. Batch operations:
```json
// Use bulk_add instead of multiple add calls
{
  "action": "bulk_add",
  "entries": [...]
}
```

---

## Permission Issues

### Permission Denied for Entries

```
Error: Agent does not have permission to access this entry
```

**Solutions:**

1. Enable permissive mode (single-agent setups):
```bash
AGENT_MEMORY_PERMISSIONS_MODE=permissive agent-memory mcp
```

2. Grant explicit permissions:
```json
// Tool: memory_permission
{
  "action": "grant",
  "agent_id": "agent-1",
  "scope_type": "project",
  "scope_id": "proj-123",
  "entry_type": "guideline",
  "permission": "write"
}
```

3. Check current permissions:
```json
// Tool: memory_permission
{
  "action": "check",
  "agent_id": "agent-1",
  "scope_type": "project",
  "scope_id": "proj-123",
  "entry_type": "guideline"
}
```

### File Permission Issues

```
EACCES: permission denied, open '/path/to/memory.db'
```

**Solutions:**

1. Check file ownership:
```bash
ls -la ~/.agent-memory/
```

2. Fix permissions:
```bash
chmod -R 755 ~/.agent-memory/
chown -R $(whoami) ~/.agent-memory/
```

3. Use a different data directory:
```bash
AGENT_MEMORY_DATA_DIR=/tmp/agent-memory agent-memory mcp
```

---

## Performance Issues

### Slow Queries

**Solutions:**

1. Enable query caching:
```bash
AGENT_MEMORY_QUERY_CACHE_TTL_MS=300000 agent-memory mcp
```

2. Limit query results:
```json
{
  "action": "search",
  "limit": 20
}
```

3. Use specific scope:
```json
{
  "action": "context",
  "scopeType": "project",
  "scopeId": "proj-123",
  "inherit": false  // Don't inherit from parent scopes
}
```

### High Memory Usage

**Solutions:**

1. Reduce cache size:
```bash
AGENT_MEMORY_CACHE_LIMIT_MB=50 agent-memory mcp
```

2. Lower query cache entries:
```bash
AGENT_MEMORY_QUERY_CACHE_SIZE=100 agent-memory mcp
```

3. Enable memory pressure management:
```bash
AGENT_MEMORY_HEAP_PRESSURE_THRESHOLD=0.7 agent-memory mcp
```

### Database Growing Large

**Solutions:**

1. Consolidate similar entries:
```json
// Tool: memory_consolidate
{
  "action": "dedupe",
  "scopeType": "project",
  "threshold": 0.9,
  "dryRun": true
}
```

2. Archive stale entries:
```json
// Tool: memory_consolidate
{
  "action": "archive_stale",
  "staleDays": 90
}
```

3. Vacuum database:
```bash
sqlite3 ~/.agent-memory/data/memory.db "VACUUM;"
```

---

## Debug Mode

### Enable Debug Logging

```bash
AGENT_MEMORY_DEBUG=1 \
LOG_LEVEL=debug \
agent-memory mcp
```

Logs are written to: `~/.agent-memory/logs/agent-memory-debug.log`

### Enable Performance Logging

```bash
AGENT_MEMORY_PERF=1 agent-memory mcp
```

### View Debug Output

```bash
# Follow log file
tail -f ~/.agent-memory/logs/agent-memory-debug.log

# Search for errors
grep -i error ~/.agent-memory/logs/*.log

# Search for specific tool
grep "memory_guideline" ~/.agent-memory/logs/*.log
```

---

## Log Analysis

### Log Location

| Installation | Log Directory |
|--------------|---------------|
| npm package | `~/.agent-memory/logs/` |
| From source | `<project>/data/logs/` |
| Docker | `/data/logs/` |

### Common Log Patterns

**Successful operation:**
```
[INFO] memory_guideline:add completed in 12ms
```

**Error pattern:**
```
[ERROR] memory_guideline:add failed: ValidationError: name is required
```

**Performance warning:**
```
[WARN] Query took 500ms, consider adding index
```

### Analyzing Slow Operations

```bash
# Find slow operations (>100ms)
grep -E "completed in [0-9]{3,}ms" ~/.agent-memory/logs/*.log

# Count operations by type
grep "completed in" ~/.agent-memory/logs/*.log | \
  sed 's/.*\(memory_[^:]*\).*/\1/' | sort | uniq -c | sort -rn
```

---

## Getting Help

If these solutions don't resolve your issue:

1. **Check existing issues:** [GitHub Issues](https://github.com/anthropics/agent-memory/issues)

2. **Create a new issue** with:
   - Agent Memory version (`agent-memory --version`)
   - Node.js version (`node --version`)
   - Operating system
   - Error message and stack trace
   - Steps to reproduce

3. **Include debug logs** (sanitize any sensitive data first)

---

## See Also

- [Installation](../../INSTALLATION.md) - Detailed installation options
- [Performance Guide](performance.md) - Performance optimization
- [Configuration](../reference/environment-variables.md) - All environment variables
