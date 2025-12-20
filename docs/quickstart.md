# Quickstart

Get Agent Memory running in 2 minutes.

## 1. Start the Server

**Option A: npx (no install)**

```bash
npx agent-memory@latest mcp
```

**Option B: Docker**

```bash
docker pull ghcr.io/anthropics/agent-memory:latest
docker run --rm -i -v ~/.agent-memory:/data ghcr.io/anthropics/agent-memory:latest mcp
```

## 2. Configure Your IDE

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

| Client | Config File |
|:-------|:------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Linux) | `~/.config/claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Code | `~/.claude/claude_code_config.json` |
| Cursor (project) | `.cursor/mcp.json` |
| Cursor (user) | `~/.cursor/mcp.json` |
| VS Code (workspace) | `.vscode/settings.json` |

See [IDE Setup](guides/ide-setup.md) for detailed configuration per IDE.

## 3. Verify

Restart your IDE and ask the agent:

```
Check the agent memory health status
```

## 4. First Memory

```
Remember that this project uses TypeScript with strict mode enabled
```

Then query:

```
What do you remember about this project?
```

---

## Next Steps

- [Getting Started](getting-started.md) — Full setup and first workflow
- [IDE Setup](guides/ide-setup.md) — Detailed IDE configuration
- [Installation](installation.md) — Docker, global install, from source
