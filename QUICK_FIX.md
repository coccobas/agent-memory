# Quick Fix Guide - Antigravity Startup Failure

## The Problem

Agent stops working **immediately** in Antigravity - before you can even try to use tools.

## The Solution: Get the Startup Logs

### 1. Restart Antigravity

Quit completely and reopen to load the new diagnostic version.

### 2. Open the Console/Output Panel

Look for MCP logs in:

- `View` → `Output` → Select "agent-memory" or "MCP"
- `View` → `Debug Console`
- `Help` → `Developer Tools` → Console tab

### 3. Look for [MCP] Lines

You should see a startup sequence like:

```
[MCP] Entry point reached
[MCP] Starting MCP server...
[MCP] Node version: v25.x.x
[MCP] Creating server...
[MCP] Initializing database...
[MCP] Database initialized successfully
...
[MCP] Server is now listening for requests
```

### 4. Find Where It Stops

The **last [MCP] line you see** tells us exactly where it crashes:

| Last Line Seen                          | Problem                   | Solution                             |
| --------------------------------------- | ------------------------- | ------------------------------------ |
| `Entry point reached`                   | Script not executing      | Node.js version issue                |
| `Initializing database...`              | Database can't be created | Permission issue with `data/` folder |
| `FATAL: Database initialization failed` | Database error            | Check the error message              |
| `UNCAUGHT EXCEPTION`                    | Crash during startup      | See the stack trace                  |
| `Server is now listening`               | Server starts fine        | Issue is with agent, not server      |

### 5. Share the Logs

Copy all `[MCP]` lines and share them. This will show:

- Exactly where the crash happens
- The error message (if any)
- The stack trace (if any)

## Most Likely Issues

### Database Permission Error

**Symptom**: Crashes at "Initializing database..."
**Fix**:

```bash
cd /Users/b.cocco/coccobas/Memory
mkdir -p data
chmod 755 data
```

### Node Version Incompatibility

**Symptom**: No [MCP] logs appear at all
**Fix**: Check Antigravity's Node.js version

```bash
node --version
```

Should be v18+ (v25 recommended)

### Path/CWD Issue

**Symptom**: Crashes with "Cannot find module" or file not found
**Fix**: Check the `[MCP] CWD:` line matches your project directory

## What NOT to Do

- ❌ Don't try to use the agent - it will fail before you can
- ❌ Don't look for tool call logs - they won't appear
- ❌ Don't check the MCP configuration - it's correct (tools are detected)

## What TO Do

- ✅ Look for startup logs immediately after restarting
- ✅ Note which [MCP] line is the last one
- ✅ Copy the complete error message if present
- ✅ Share the logs so we can fix the exact issue

## Emergency: Can't Find Logs?

Try running the server manually:

```bash
cd /Users/b.cocco/coccobas/Memory
node dist/index.js
```

You'll see the startup sequence in your terminal. Press Ctrl+C to stop.

---

**Next**: Once you share the logs, we can fix the specific issue causing the crash! 🚀
