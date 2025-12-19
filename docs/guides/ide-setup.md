# IDE Setup

This guide covers IDE-specific setup. It starts with Claude.

## Claude (Desktop + Claude Code)

### MCP server configuration

Claude Desktop config location:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Example:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/absolute/path/to/agent-memory/dist/cli.js", "mcp"],
      "env": {
        "AGENT_MEMORY_DATA_DIR": "/absolute/path/to/data"
      }
    }
  }
}
```

### Claude Code hooks

Agent Memory includes a hook runner that integrates with Claude Code.

#### Install hooks

```bash
npx agent-memory setup-hook --ide=claude --project=/path/to/project
```

Check status:

```bash
npx agent-memory setup-hook --status --ide=claude --project=/path/to/project
```

Uninstall:

```bash
npx agent-memory setup-hook --uninstall --ide=claude --project=/path/to/project
```

Hook command:

```bash
agent-memory hook <pretooluse|stop|userpromptsubmit|session-end> \
  --project-id <project-id> \
  --agent-id <agent-id>
```

Supported hook events:

- `pretooluse`
- `stop`
- `userpromptsubmit`
- `session-end`

Notes:

- Hooks read JSON from stdin as provided by Claude Code.
- The hook runner validates sessions and can ingest transcripts.
- Use `npx agent-memory setup-hook` to generate/install the hook files.
