# Agent Memory Installation Guide

This guide covers installation and configuration of Agent Memory MCP server for various IDEs and AI tools.

## Prerequisites

Before configuring any IDE, ensure Agent Memory is built:

```bash
cd /path/to/Memory
npm install
npm run build
```

---

## Cursor

Add to your Cursor MCP settings (`~/.cursor/mcp.json` or project-level `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/absolute/path/to/Memory/dist/index.js"]
    }
  }
}
```

### With Environment Variables

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/absolute/path/to/Memory/dist/index.js"],
      "env": {
        "AGENT_MEMORY_DB_PATH": "/custom/path/memory.db",
        "AGENT_MEMORY_EMBEDDING_PROVIDER": "local"
      }
    }
  }
}
```

---

## Claude Code

### Using CLI Command

```bash
claude mcp add agent-memory node /absolute/path/to/Memory/dist/index.js
```

If your `claude` CLI requires `--` to separate arguments, use:
```bash
claude mcp add agent-memory -- node /absolute/path/to/Memory/dist/index.js
```

### Manual Configuration

Claude Desktop uses a JSON config file with an `mcpServers` section. Depending on your install, the location may be:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json` or `~/.config/claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**macOS/Linux:**
```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/absolute/path/to/Memory/dist/index.js"]
    }
  }
}
```

**Windows:**
```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["C:/path/to/Memory/dist/index.js"]
    }
  }
}
```

---

## Claude Desktop

Add to Claude Desktop configuration:

**macOS:** `~/.config/claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/absolute/path/to/Memory/dist/index.js"]
    }
  }
}
```

---

## VS Code

### Using MCP Extension

If using an MCP-compatible extension, add to your VS Code settings (`settings.json`):

```json
{
  "mcp": {
    "servers": {
      "agent-memory": {
        "command": "node",
        "args": ["/absolute/path/to/Memory/dist/index.js"]
      }
    }
  }
}
```

### Workspace Settings

For project-specific configuration, add to `.vscode/settings.json`:

```json
{
  "mcp": {
    "servers": {
      "agent-memory": {
        "command": "node",
        "args": ["${workspaceFolder}/dist/index.js"]
      }
    }
  }
}
```

---

## Windsurf

Add to Windsurf MCP configuration:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/absolute/path/to/Memory/dist/index.js"]
    }
  }
}
```

---

## Zed

Add to Zed settings (`~/.config/zed/settings.json`):

```json
{
  "language_models": {
    "mcp_servers": {
      "agent-memory": {
        "command": "node",
        "args": ["/absolute/path/to/Memory/dist/index.js"]
      }
    }
  }
}
```

---

## Generic MCP Client

For any MCP-compatible client, use:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/Memory/dist/index.js"],
  "env": {
    "AGENT_MEMORY_DB_PATH": "data/memory.db",
    "AGENT_MEMORY_EMBEDDING_PROVIDER": "local"
  }
}
```

---

## Environment Variables

All IDEs support passing environment variables. Common options:

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DB_PATH` | `data/memory.db` | SQLite database path |
| `AGENT_MEMORY_EMBEDDING_PROVIDER` | `auto` | `openai`, `local`, or `disabled` (unset = auto) |
| `AGENT_MEMORY_OPENAI_API_KEY` | - | OpenAI API key (if using OpenAI embeddings) |
| `AGENT_MEMORY_PERF` | `0` | Set to `1` for performance logging |
| `AGENT_MEMORY_DEBUG` | `0` | Set to `1` for debug logging |

**Example with environment variables:**

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/absolute/path/to/Memory/dist/index.js"],
      "env": {
        "AGENT_MEMORY_DB_PATH": "/var/data/memory.db",
        "AGENT_MEMORY_EMBEDDING_PROVIDER": "local",
        "AGENT_MEMORY_PERF": "1"
      }
    }
  }
}
```

---

## Verification

After configuration, verify the server is working:

1. Restart your IDE/tool
2. Check that the 19 Agent Memory tools appear:
   - `memory_query`
   - `memory_guideline`
   - `memory_knowledge`
   - `memory_tool`
   - `memory_session`
   - `memory_conversation`
   - `memory_tag`
   - `memory_relation`
   - `memory_org`
   - `memory_project`
   - `memory_task`
   - `memory_voting`
   - `memory_analytics`
   - `memory_file_lock`
   - `memory_permission`
   - `memory_conflict`
   - `memory_health`
   - `memory_init`
   - `memory_export`
   - `memory_import`

3. Test with a simple query:
   ```json
   {
     "tool": "memory_health",
     "arguments": {}
   }
   ```

---

## Troubleshooting

### Server Won't Start

- Verify Node.js 20.x or later: `node --version`
- Ensure project is built: `npm run build`
- Check path is absolute and correct

### Database Errors

- Ensure write permissions for database directory
- Check disk space
- Remove lock files if needed: `rm data/*.db-shm data/*.db-wal`

### No Tools Appearing

- Restart the IDE completely
- Check MCP configuration syntax (valid JSON)
- Look for errors in IDE's MCP logs

---

## Platform-Specific Notes

### Windows

- Use forward slashes (`/`) or escaped backslashes (`\\`) in paths
- PowerShell may need different quoting for env vars
- See [Windows Setup Guide](docs/guides/windows-setup.md)

### macOS

- If using Homebrew Node.js, use full path: `/opt/homebrew/bin/node`
- Grant necessary permissions for database directory

### Linux

- Ensure Node.js is in PATH or use absolute path
- Check file permissions on database directory

---

For more details, see the [Getting Started Guide](docs/getting-started.md) and [Environment Variables Reference](docs/reference/environment-variables.md).
