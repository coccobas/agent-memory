# Agent Memory Plugin for OpenCode

Native MCP plugin for [OpenCode](https://opencode.ai) that provides persistent memory across sessions.

## Installation

1. Copy `agent-memory.ts` to your OpenCode plugins directory:

   ```bash
   cp agent-memory.ts ~/.config/opencode/plugins/
   ```

2. Install dependencies in your plugins directory:

   ```bash
   cd ~/.config/opencode/plugins
   bun add @modelcontextprotocol/sdk
   ```

3. Add to your `~/.config/opencode/opencode.json`:

   ```json
   {
     "plugin": ["./plugins/agent-memory.ts"]
   }
   ```

4. Ensure `agent-memory` CLI is available:
   ```bash
   npm install -g agent-memory
   ```

## Features

- **Session tracking** - Automatic episode creation and completion
- **Context injection** - Guidelines and experiences injected into tool calls
- **Error recovery detection** - Auto-captures learnings when errors are fixed
- **Memory triggers** - Detects phrases like "always/never do X"
- **`!am` commands** - Quick memory operations from chat

## Commands

| Command               | Description                      |
| --------------------- | -------------------------------- |
| `!am status`          | Show session and entry counts    |
| `!am remember <text>` | Store a memory                   |
| `!am search <query>`  | Search memories                  |
| `!am learn <text>`    | Record an experience             |
| `!am experiences`     | List recent experiences          |
| `!am review`          | Review librarian recommendations |
| `!am help`            | Show all commands                |

## Environment Variables

| Variable                   | Default        | Description              |
| -------------------------- | -------------- | ------------------------ |
| `AGENT_MEMORY_BIN`         | `agent-memory` | Path to agent-memory CLI |
| `AGENT_MEMORY_AGENT_ID`    | `opencode`     | Agent identifier         |
| `AGENT_MEMORY_SHOW_TOASTS` | `true`         | Show toast notifications |

## Architecture

Uses native MCP SDK for direct communication with the agent-memory server:

- Single long-lived connection (no subprocess spawn per call)
- ~5x faster per-call performance vs CLI
- Native streaming support
