# Troubleshooting Antigravity IDE Integration

## Current Status
- ✅ MCP server connects successfully to Antigravity
- ✅ All 20 tools are detected and shown
- ❌ Agent execution fails with "Agent execution terminated due to error"
- ✅ Server works perfectly when tested directly (via test-mcp.js)

## What We've Done So Far

### 1. Removed Debug Logging (commit d870bf5)
Removed HTTP fetch() calls to localhost:7242 that were interfering with MCP communication.

### 2. Added Comprehensive Logging (commit 58bba00)
Added stderr logging with `[MCP]` prefix to diagnose exactly what's happening:
- Tool calls and arguments
- Success/failure status
- JSON serialization errors
- Full stack traces

## Next Steps: Finding the Root Cause

### Step 1: Restart Antigravity IDE
The IDE needs to reload the updated MCP server:
1. Quit Antigravity completely
2. Restart it
3. Verify MCP connection still shows as "Enabled"

### Step 2: Try a Simple Command
Ask the agent to do something simple:
```
Check the health of the memory server
```

or

```
List all organizations
```

### Step 3: Check the Logs

Antigravity should have a console/output panel where stderr logs appear. Look for lines like:
```
[MCP] Tool call: memory_health
[MCP] Args: {}
[MCP] SUCCESS: memory_health
```

Or if there's an error:
```
[MCP] Tool call: memory_org
[MCP] Args: { "action": "list" }
[MCP] ERROR in memory_org: <error message here>
[MCP] Stack: <stack trace here>
```

### Where to Find Logs in Antigravity

Common locations for MCP server logs:
1. **Output Panel**: Usually `View` → `Output` → Select "MCP" or "agent-memory" from dropdown
2. **Debug Console**: `View` → `Debug Console`
3. **Terminal**: Look for a terminal tab showing MCP server output
4. **Developer Tools**: Some IDEs have `Help` → `Developer Tools` with a Console tab

### Step 4: Share the Logs

Once you find the logs, look for:
1. **Any `[MCP]` prefixed lines** - these are from our diagnostic logging
2. **The exact error message** - what happens when a tool is called
3. **Any stack traces** - these show where the error originates

## Possible Root Causes (We'll Narrow Down)

Based on what we know:

### Theory 1: JSON Serialization Issue
**Evidence**: Server works in tests but fails in Antigravity
**Fix Added**: Safe JSON serialization with error catching
**Check**: Look for `[MCP] JSON serialization error` in logs

### Theory 2: Async/Promise Handling
**Evidence**: MCP protocol timing differences between IDEs
**Possibility**: Antigravity might timeout or handle promises differently
**Check**: Look for timeout errors or "Promise rejection" messages

### Theory 3: Database Lock/Permission Issue
**Evidence**: Database operations work in tests
**Possibility**: Antigravity process doesn't have write access to `data/memory.db`
**Check**: Look for "SQLITE_" errors or "database is locked" messages

### Theory 4: MCP Protocol Version Mismatch
**Evidence**: Tools load but execution fails
**Possibility**: Antigravity uses different MCP protocol version
**Check**: Look at the initialize handshake in logs

### Theory 5: Content-Type or Encoding Issue
**Evidence**: Response structure works in tests
**Possibility**: Antigravity expects different content encoding
**Check**: Look for parsing or encoding errors

## Testing Checklist

- [ ] Restarted Antigravity IDE
- [ ] MCP server reconnected successfully
- [ ] Tried a simple command
- [ ] Found the log output location
- [ ] Saw `[MCP]` log lines
- [ ] Captured the exact error message
- [ ] Noted which tool was being called
- [ ] Checked for database/permission errors
- [ ] Looked for JSON serialization errors

## Quick Diagnostic Commands

Try these commands in order and note which one fails:

1. **Health Check** (no database writes):
   ```
   Check the memory server health
   ```

2. **List Organizations** (database read):
   ```
   List all organizations
   ```

3. **Create Organization** (database write):
   ```
   Create a new organization called "Test Org"
   ```

## Manual Server Test

You can also run the server manually to see all output:

```bash
cd /Users/b.cocco/coccobas/Memory
node dist/index.js
```

Then in another terminal, use the test script:
```bash
node test-mcp.js
```

This will show exactly what the server does when tools are called.

## What to Share

Once you have the logs, please share:

1. **The `[MCP]` log lines** - shows what tool was called and what happened
2. **Any error messages** - full text including stack traces
3. **Which command you tried** - what you asked the agent to do
4. **Antigravity version** - helps identify protocol differences

## Expected Behavior

When working correctly, you should see:
```
[MCP] Tool call: memory_health
[MCP] Args: {}
[MCP] SUCCESS: memory_health
```

And the agent should respond with server health information.

## Contact

If the logs reveal a specific error, we can:
1. Fix the exact issue causing the failure
2. Add workarounds for Antigravity-specific behaviors
3. Improve error handling for better compatibility

The diagnostic logging is now in place - we just need to see what Antigravity is actually experiencing!
