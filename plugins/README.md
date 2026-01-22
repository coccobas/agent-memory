# Agent Memory IDE Plugins

Native plugins for integrating Agent Memory with various IDEs and coding assistants.

## Available Plugins

| Plugin                  | IDE            | Status     |
| ----------------------- | -------------- | ---------- |
| [opencode](./opencode/) | OpenCode       | ✅ Ready   |
| cursor                  | Cursor         | 📋 Planned |
| vscode                  | VS Code        | 📋 Planned |
| claude-desktop          | Claude Desktop | 📋 Planned |

## Plugin Architecture

Each plugin connects to the Agent Memory MCP server using the native `@modelcontextprotocol/sdk`. This provides:

- **Single connection** - One long-lived MCP connection per session
- **Fast calls** - No subprocess spawn overhead (~5x faster)
- **Native streaming** - Full MCP streaming support
- **Type safety** - TypeScript with full type definitions

## Adding a New Plugin

1. Create a directory: `plugins/<ide-name>/`
2. Implement the plugin following your IDE's plugin API
3. Use `@modelcontextprotocol/sdk` for MCP communication
4. Include `package.json`, `README.md`, and the plugin source

## Common Features

All plugins should implement:

- **Session lifecycle** - Start/end tracking with episodes
- **Context injection** - Load relevant memory into tool calls
- **Error tracking** - Capture and learn from failures
- **Quick commands** - `!am` or equivalent for manual memory ops
