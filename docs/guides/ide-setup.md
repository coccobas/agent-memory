# IDE Setup Guide

Configure Agent Memory with your IDE and MCP client.

## Table of Contents

- [Claude Desktop](#claude-desktop)
- [Claude Code](#claude-code)
- [Cursor](#cursor)
- [VS Code](#vs-code)
- [Other MCP Clients](#other-mcp-clients)
- [Verification Hooks](#verification-hooks)
- [Troubleshooting](#troubleshooting)

---

## Claude Desktop

### Configuration Location

| OS      | Path                                                              |
| ------- | ----------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux   | `~/.config/claude/claude_desktop_config.json`                     |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json`                     |

### Using npx (Recommended)

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

### Using Global Install

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "agent-memory",
      "args": ["mcp"]
    }
  }
}
```

### Using From Source

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/absolute/path/to/agent-memory/dist/cli.js", "mcp"]
    }
  }
}
```

### With Environment Variables

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"],
      "env": {
        "AGENT_MEMORY_DATA_DIR": "/custom/data/path",
        "AGENT_MEMORY_OPENAI_API_KEY": "sk-...",
        "AGENT_MEMORY_PERMISSIONS_MODE": "permissive"
      }
    }
  }
}
```

### Verify Setup

1. Restart Claude Desktop completely (quit and reopen)
2. Ask: "Check the agent memory health status"
3. Claude should invoke `memory_health` and report status

---

## Claude Code

### Claude Code Configuration Location

`~/.claude/claude_code_config.json`

### Basic Setup

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

### With Project-Specific Data

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"],
      "env": {
        "AGENT_MEMORY_DATA_DIR": "${workspaceFolder}/.agent-memory"
      }
    }
  }
}
```

### Installing Hooks

Claude Code supports hooks for pre-tool verification:

```bash
# Install hooks for a project
npx -y agent-memory@latest hook install --ide=claude --project-path /path/to/project

# Check hook status
npx -y agent-memory@latest hook status --ide=claude --project-path /path/to/project

# Uninstall hooks
npx -y agent-memory@latest hook uninstall --ide=claude --project-path /path/to/project
```

Or via MCP tool:

```json
// Tool: memory_hook
{
  "action": "install",
  "ide": "claude",
  "projectPath": "/path/to/project",
  "projectId": "proj-123"
}
```

### Hook Events

| Event              | Description                      |
| ------------------ | -------------------------------- |
| `pretooluse`       | Before tool execution, can block |
| `stop`             | When session stops               |
| `userpromptsubmit` | When user submits prompt         |
| `session-end`      | When session ends                |

Hooks read JSON from stdin and can validate against memory guidelines.

---

## Cursor

### Cursor Configuration Location

Create `.cursor/mcp.json` in:

- Project root (project-specific)
- Home directory (global)

### Project Configuration

Create `.cursor/mcp.json` in your project:

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

### Global Configuration

Create `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"],
      "env": {
        "AGENT_MEMORY_PERMISSIONS_MODE": "permissive"
      }
    }
  }
}
```

### With Semantic Search

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"],
      "env": {
        "AGENT_MEMORY_OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

### Verify in Cursor

1. Open command palette (Cmd/Ctrl+Shift+P)
2. Search for "MCP" or "Memory"
3. Verify Agent Memory tools are available

---

## VS Code

### With MCP Extension

If using an MCP extension for VS Code:

1. Install the MCP extension
2. Add to VS Code settings (`settings.json`):

```json
{
  "mcp.servers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"]
    }
  }
}
```

### Using REST API

For VS Code extensions that support REST:

```bash
# Start REST server
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret \
agent-memory rest
```

Query via HTTP from your extension:

```typescript
const response = await fetch('http://127.0.0.1:8787/v1/query', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer your-secret',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    agentId: 'vscode-extension',
    types: ['guidelines'],
    scope: { type: 'project', inherit: true },
  }),
});
```

---

## Other MCP Clients

### Generic MCP Configuration

Most MCP clients accept this format:

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

### Required Capabilities

Agent Memory requires MCP protocol version 2024-11-05 or later.

### Transport

Agent Memory uses stdio transport (JSON-RPC over stdin/stdout).

---

## Verification Hooks

### Install Hooks via MCP

```json
// Tool: memory_hook
{
  "action": "install",
  "ide": "claude",
  "projectPath": "/Users/dev/my-project",
  "projectId": "proj-123"
}
```

### Install Hooks via CLI

```bash
npx -y agent-memory@latest hook install \
  --ide=claude \
  --project-path /Users/dev/my-project \
  --project-id proj-123
```

### Check Hook Status

```json
// Tool: memory_hook
{
  "action": "status",
  "ide": "claude",
  "projectPath": "/Users/dev/my-project"
}
```

### Uninstall Hooks

```json
// Tool: memory_hook
{
  "action": "uninstall",
  "ide": "claude",
  "projectPath": "/Users/dev/my-project"
}
```

### Hook Runner

Run hooks manually for testing:

```bash
# Pre-tool use check
echo '{"tool_name":"write","tool_input":{"file_path":"src/file.ts","content":"(test)"}}' | \
  agent-memory hook pretooluse --project-id proj-123

# Session end
agent-memory hook session-end --project-id proj-123
```

---

## Troubleshooting

### Tools Not Showing

1. **Check config file location** - Ensure it's in the correct path
2. **Validate JSON syntax** - Use a JSON validator
3. **Restart client completely** - Quit and reopen, not just reload
4. **Check command path** - Ensure npx/node is in PATH

### Connection Errors

```
Error: Failed to connect to MCP server
```

Test command directly:

```bash
npx -y agent-memory@latest mcp
# Should output nothing and wait for JSON-RPC
```

Check Node.js version:

```bash
node --version  # Must be >= 20
```

Try global install:

```bash
npm install -g agent-memory
```

### Permission Errors

```
Error: EACCES permission denied
```

Don't use sudo with npx. Fix npm permissions:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

### Slow Startup

If startup is slow, use global install instead of npx. Pre-download the package:

```bash
npm install -g agent-memory
```

### Wrong Data Directory

Check where data is stored:

```json
// Tool: memory_health
{}

// Response shows database path
{
  "database": {
    "path": "/Users/dev/.agent-memory/data/memory.db"
  }
}
```

Override with environment variable:

```json
{
  "env": {
    "AGENT_MEMORY_DATA_DIR": "/custom/path"
  }
}
```

### Multiple Instances

If running multiple IDEs:

1. Use same data directory for shared memory
2. Or use separate directories for isolation:

```json
// Claude config
{
  "env": {
    "AGENT_MEMORY_DATA_DIR": "~/.agent-memory/claude"
  }
}

// Cursor config
{
  "env": {
    "AGENT_MEMORY_DATA_DIR": "~/.agent-memory/cursor"
  }
}
```

---

## Configuration Reference

### Environment Variables for MCP Config

| Variable                        | Description                          |
| ------------------------------- | ------------------------------------ |
| `AGENT_MEMORY_DATA_DIR`         | Data storage location                |
| `AGENT_MEMORY_OPENAI_API_KEY`   | Enable semantic search               |
| `AGENT_MEMORY_PERMISSIONS_MODE` | Set to `permissive` for single-agent |
| `AGENT_MEMORY_DEBUG`            | Enable debug logging                 |

### Full Example

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"],
      "env": {
        "AGENT_MEMORY_DATA_DIR": "~/.agent-memory",
        "AGENT_MEMORY_OPENAI_API_KEY": "sk-...",
        "AGENT_MEMORY_PERMISSIONS_MODE": "permissive",
        "AGENT_MEMORY_DEBUG": "0",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

---

## See Also

- [Quickstart](../quickstart.md) - Get running in 2 minutes
- [Installation](../installation.md) - Detailed installation
- [Troubleshooting](troubleshooting.md) - Common issues
- [Getting Started](../getting-started.md) - First workflow
