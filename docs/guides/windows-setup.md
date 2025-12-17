# Windows Setup Guide

This guide provides Windows-specific instructions for setting up and using Agent Memory.

## Prerequisites

- **Node.js 20.x or later** - Download from [nodejs.org](https://nodejs.org/)
- **npm 10.x or later** - Comes with Node.js
- **An MCP-compatible client** (Claude Desktop, Claude Code, etc.)
- **Git for Windows** (optional, for shell scripts) - Download from [git-scm.com](https://git-scm.com/download/win)

## Installation

### 1. Clone or Create Project

Open PowerShell or Command Prompt:

```powershell
# If you have the source
cd agent-memory
npm install
```

### 2. Build the Project

```powershell
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### 3. Database Initialization

**The database is automatically initialized on first run** - no manual setup required!

On first startup, the server will:
- Create the database file at `data\\memory.db` relative to the Agent Memory project root
- Apply all schema migrations automatically
- Track applied migrations in a `_migrations` table

You can verify initialization works:

```powershell
# Run the initialization test
npm run build
node dist/test-init.js
```

For manual control, use the `memory_init` MCP tool (see [Initialization Guide](../reference/initialization.md)).

## Running the Server

### Standalone Mode

```powershell
node dist/index.js
```

The server runs using stdio transport, expecting MCP protocol messages on stdin/stdout.

### With Claude Desktop

**Windows Configuration Path:**

Claude Desktop configuration is located at:
```
%APPDATA%\Claude\claude_desktop_config.json
```

Or in full path format:
```
C:\Users\<YourUsername>\AppData\Roaming\Claude\claude_desktop_config.json
```

**To configure:**

1. Open File Explorer
2. Navigate to `%APPDATA%\Claude\` (or type `%APPDATA%\Claude` in the address bar)
3. Open or create `claude_desktop_config.json`
4. Add the following configuration:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["C:\\path\\to\\agent-memory\\dist\\index.js"]
    }
  }
}
```

**Path Format Notes:**
- You can use forward slashes: `C:/path/to/agent-memory/dist/index.js`
- Or escaped backslashes: `C:\\path\\to\\agent-memory\\dist\\index.js`
- Both formats work with Node.js on Windows

**Example with actual path:**
```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["C:/Users/John/Documents/agent-memory/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop to load the server.

### With Claude Code

```powershell
claude mcp add agent-memory node C:\path\to\agent-memory\dist\index.js
```

Or with forward slashes:
```powershell
claude mcp add agent-memory node C:/path/to/agent-memory/dist/index.js
```

## Database Path Configuration

### Default Location

The database is created at:
```
.\data\memory.db
```

Relative to the Agent Memory project root (repo root when running from source). Both `.\data\memory.db` and `./data/memory.db` work on Windows.

If you install `agent-memory` from npm, the default resolves relative to the module directory. For a stable location, set `AGENT_MEMORY_DB_PATH` to an absolute path.

### Custom Database Path

Set the `AGENT_MEMORY_DB_PATH` environment variable:

**PowerShell:**
```powershell
$env:AGENT_MEMORY_DB_PATH = "C:\Users\John\Documents\my-memory.db"
```

**Command Prompt:**
```cmd
set AGENT_MEMORY_DB_PATH=C:\Users\John\Documents\my-memory.db
```

**Permanent (System Environment Variable):**
1. Open System Properties → Environment Variables
2. Add new variable: `AGENT_MEMORY_DB_PATH`
3. Set value to your desired path

## Scripts and Commands

### TypeScript Scripts (Recommended)

All TypeScript scripts work on Windows without any additional setup:

```powershell
# Sync rules to IDE
npm run sync-rules --auto-detect

# Watch for rule changes
npm run sync-rules:watch

# Run tests
npm test

# Clean build artifacts
npm run clean
```

### Shell Scripts (Optional)

Shell scripts (`.sh` files) require one of the following:

**Option 1: Git Bash** (Recommended)
- Install Git for Windows (includes Git Bash)
- Open Git Bash terminal
- Run scripts as normal: `./scripts/sync-rules.sh`

**Option 2: WSL (Windows Subsystem for Linux)**
- Install WSL from Microsoft Store
- Use Linux commands in WSL terminal

**Option 3: Use TypeScript Alternatives**
- Prefer `npm run sync-rules` over `./scripts/sync-rules.sh`
- All functionality is available via TypeScript scripts

## Environment Variables

### Setting Environment Variables

**PowerShell (Session):**
```powershell
$env:AGENT_MEMORY_DB_PATH = "C:\path\to\db\memory.db"
$env:AGENT_MEMORY_EMBEDDING_PROVIDER = "openai"
$env:AGENT_MEMORY_OPENAI_API_KEY = "your-api-key"
```

**Command Prompt (Session):**
```cmd
set AGENT_MEMORY_DB_PATH=C:\path\to\db\memory.db
set AGENT_MEMORY_EMBEDDING_PROVIDER=openai
set AGENT_MEMORY_OPENAI_API_KEY=your-api-key
```

**Permanent (System-wide):**
1. Open System Properties → Environment Variables
2. Add variables under "User variables" or "System variables"
3. Restart terminal/IDE for changes to take effect

### Available Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DB_PATH` | `data/memory.db` | Database file path |
| `AGENT_MEMORY_VECTOR_DB_PATH` | `data/vectors.lance` | Vector database path |
| `AGENT_MEMORY_EMBEDDING_PROVIDER` | `auto` | `openai`, `local`, or `disabled` (unset = auto) |
| `AGENT_MEMORY_OPENAI_API_KEY` | - | Required for OpenAI provider |
| `AGENT_MEMORY_OPENAI_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `AGENT_MEMORY_SEMANTIC_THRESHOLD` | `0.7` | Minimum similarity score (0-1) |
| `AGENT_MEMORY_PERF` | - | Set to `1` to enable performance logging |
| `AGENT_MEMORY_QUERY_CACHE_SIZE` | `200` | Query cache max entries (set to `0` to disable caching) |
| `AGENT_MEMORY_SKIP_INIT` | - | Set to `1` to skip auto-initialization |

## Path Format Notes

### Forward Slashes vs Backslashes

Node.js and the Agent Memory codebase use the `path` module which handles both formats:

- **Forward slashes work:** `C:/Users/John/Documents/agent-memory/dist/index.js`
- **Backslashes work:** `C:\Users\John\Documents\agent-memory\dist\index.js`
- **In JSON configs:** Use forward slashes or escaped backslashes (`\\`)

**Recommendation:** Use forward slashes in configuration files for consistency across platforms.

### Absolute vs Relative Paths

- **Absolute paths:** `C:\Users\John\Documents\agent-memory\dist\index.js`
- **Relative paths:** `.\dist\index.js` or `./dist/index.js` (relative to current directory)

For Claude Desktop configuration, use **absolute paths** to ensure the server can be found regardless of working directory.

## Git Integration

### Pre-commit Hook (Windows)

**Option 1: Using Git Bash**
```bash
# In Git Bash
ln -s ../../scripts/pre-commit-sync.sh .git/hooks/pre-commit
```

**Option 2: Using PowerShell**
```powershell
# Create symbolic link
New-Item -ItemType SymbolicLink -Path .git\hooks\pre-commit -Target ..\..\scripts\pre-commit-sync.sh
```

**Option 3: Copy Script**
```powershell
# Copy the script
Copy-Item scripts\pre-commit-sync.sh .git\hooks\pre-commit
```

**Option 4: Use TypeScript Alternative**
The pre-commit hook functionality can be replaced with a Node.js script if needed.

## Troubleshooting

### Server Won't Start

1. **Check Node.js version:**
   ```powershell
   node --version
   ```
   Need 20.x or later

2. **Verify build:**
   ```powershell
   npm run build
   ```

3. **Check for TypeScript errors:**
   ```powershell
   npm run typecheck
   ```

### Database Errors

1. **Ensure `data/` directory exists and is writable:**
   ```powershell
   # Create directory if needed
   New-Item -ItemType Directory -Force -Path data
   ```

2. **Check initialization status:**
   Use `memory_init` tool: `{"action": "status"}`

3. **Reset database if needed:**
   Delete `data\memory.db` (server will auto-reinitialize)

### MCP Connection Issues

1. **Verify server path in configuration:**
   - Use absolute path (not relative)
   - Check path uses correct slashes
   - Ensure path points to `dist\index.js` (after build)

2. **Check Claude Desktop logs:**
   - Look for connection errors in Claude Desktop logs
   - Verify Node.js is in PATH

3. **Test server standalone:**
   ```powershell
   node dist\index.js
   ```
   Should start without errors (will wait for MCP messages)

### Path Issues

**Problem:** "Cannot find module" or path errors

**Solutions:**
- Use absolute paths in Claude Desktop config
- Use forward slashes: `C:/path/to/file.js`
- Or escaped backslashes: `C:\\path\\to\\file.js`
- Verify the path exists: `Test-Path C:\path\to\file.js` (PowerShell)

### Permission Issues

**Problem:** "Access denied" or "Permission denied"

**Solutions:**
- Run PowerShell/Command Prompt as Administrator if needed
- Check file permissions on database directory
- Ensure antivirus isn't blocking file access

### Script Execution Issues

**Problem:** Shell scripts (`.sh`) don't work

**Solutions:**
- Use TypeScript alternatives: `npm run sync-rules` instead of `./scripts/sync-rules.sh`
- Install Git Bash for shell script support
- Use WSL for full Linux compatibility

## Common Windows-Specific Issues

### Antivirus Interference

Some antivirus software may interfere with:
- Database file access
- Node.js process execution
- File watching (for sync-rules:watch)

**Solution:** Add project directory to antivirus exclusions if needed.

### Long Path Names

Windows has a 260-character path limit by default (can be extended).

**Solution:** Keep project paths short, or enable long path support in Windows.

### Line Ending Issues

Git may change line endings between Windows (`CRLF`) and Unix (`LF`).

**Solution:** Configure Git:
```powershell
git config core.autocrlf true
```

## Additional Resources

- [Getting Started Guide](../getting-started.md) - General setup (Unix/Windows)
- [Rules Sync Guide](./rules-sync.md) - Syncing rules to IDEs
- [API Reference](../api-reference.md) - Complete MCP tool documentation

## Need Help?

If you encounter Windows-specific issues not covered here:
1. Check the main [Troubleshooting](../getting-started.md#troubleshooting) section
2. Open an issue with the `windows` and `question` labels
3. Include your Windows version and Node.js version in the issue
