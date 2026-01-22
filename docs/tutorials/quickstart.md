# Quickstart

Get Agent Memory running in 2 minutes.

**What you'll learn:** How to start the server and make your first memory.

**Prerequisites:** Node.js >= 20.0.0

---

## Step 1: Start the Server

```bash
npx agent-memory@latest mcp
```

---

## Step 2: Configure Your IDE

Add to your MCP client config:

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

**Config locations:**

| Client                   | Config File                                                       |
| :----------------------- | :---------------------------------------------------------------- |
| Claude Desktop (macOS)   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Linux)   | `~/.config/claude/claude_desktop_config.json`                     |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json`                     |
| Claude Code              | `~/.claude/claude_code_config.json`                               |
| Cursor (project)         | `.cursor/mcp.json`                                                |
| Cursor (user)            | `~/.cursor/mcp.json`                                              |
| VS Code (workspace)      | `.vscode/settings.json`                                           |

---

## Step 3: Verify

Restart your IDE and ask the agent:

```
Check the agent memory health status
```

You should see a response with database stats and version info.

---

## Step 4: First Memory

Ask your agent to store something:

```
Remember that this project uses TypeScript with strict mode enabled
```

Then query it:

```
What do you remember about this project?
```

---

## Next Steps

- [First Workflow](first-workflow.md) - Complete tutorial on projects, sessions, and memory types
- [IDE Setup](../guides/ide-setup.md) - Detailed IDE configuration
