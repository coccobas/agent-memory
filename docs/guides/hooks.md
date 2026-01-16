# IDE Hooks

Runtime enforcement for Agent Memory. Hooks validate MCP tool calls against critical guidelines before and after execution.

## Overview

Hooks are shell scripts that IDEs execute at specific lifecycle events (pre/post tool calls). Agent Memory generates and installs these hooks to:

- **Block violations** before they happen (PreToolUse)
- **Enforce workflows** like memory review (Stop)
- **Parse commands** for session control (UserPromptSubmit)
- **Capture context** when sessions end (SessionEnd)

```
┌─────────────────────────────────────────────────────────────────┐
│                        HOOK LIFECYCLE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Action          Hook Fires           Agent Memory         │
│  ───────────          ──────────           ────────────         │
│                                                                 │
│  Edit file      →     PreToolUse     →     Check guidelines     │
│                                            ↓                    │
│                                       Violation? Block it       │
│                                                                 │
│  End session    →     Stop           →     Review required?     │
│                                            ↓                    │
│                                       Block until reviewed      │
│                                                                 │
│  Send message   →     UserPromptSubmit →   Parse !am commands   │
│                                                                 │
│  Session ends   →     SessionEnd     →     Ingest transcript    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Install Hooks

Using MCP tool:

```json
// Tool: memory_hook
{
  "action": "install",
  "ide": "claude",
  "projectPath": "/path/to/project"
}
```

Using CLI:

```bash
npx agent-memory hook install --ide claude --project-path /path/to/project
```

### Check Status

Using MCP tool:

```json
// Tool: memory_hook
{
  "action": "status",
  "ide": "claude",
  "projectPath": "/path/to/project"
}
```

Using CLI:

```bash
npx agent-memory hook status --ide claude --project-path /path/to/project
```

### Uninstall

```bash
npx agent-memory hook uninstall --ide claude --project-path /path/to/project
```

---

## Supported IDEs

| IDE         | Hook Support   | Status         |
| :---------- | :------------- | :------------- |
| Claude Code | Full (4 hooks) | Supported      |
| Cursor      | —              | In development |
| VS Code     | —              | In development |
| Other IDEs  | —              | Planned        |

Currently, only **Claude Code** supports native hooks. Hooks are installed to `.claude/hooks/`.

For Cursor, VS Code, and other IDEs, use [Rules Sync](rules-sync.md) to sync guidelines (documentation for agents, not runtime enforcement).

---

## Hook Types

### PreToolUse

**Trigger:** Before Edit, Write, or Bash tools execute

**Purpose:** Block actions that violate critical guidelines

**How it works:**

1. IDE calls `pretooluse.sh` with tool details (JSON on stdin)
2. Hook extracts tool name, file path, and content
3. Calls `agent-memory hook pretooluse` to check guidelines
4. Returns exit code 0 (allow) or 2 (block with message)

**Example violation block:**

```
❌ BLOCKED: This edit violates guideline "no-console-log"

Guideline: Never commit console.log statements to production code.

Suggestion: Remove console.log or use proper logging service.
```

**Critical guidelines** are checked — those with `priority >= 90` or marked as critical.

### Stop

**Trigger:** When user attempts to end a Claude Code session

**Purpose:** Enforce memory review before session ends

**How it works:**

1. User tries to stop session (Ctrl+C, `/stop`, etc.)
2. Hook checks if session has pending memory to review
3. If unreviewd: blocks with message to run `!am review`
4. If reviewed: allows session to end

**Commands:**

```
!am status     # Check if review is pending
!am review     # Start review workflow
!am review off # Skip review for this session
```

### UserPromptSubmit

**Trigger:** When user submits any message

**Purpose:** Parse `!am` commands for session control

**Recognized commands:**

| Command          | Action                                |
| :--------------- | :------------------------------------ |
| `!am status`     | Show current session status           |
| `!am review`     | Start memory review workflow          |
| `!am review off` | Disable review requirement            |
| `!am review on`  | Re-enable review requirement          |
| `!am ingest`     | Manually trigger transcript ingestion |

### SessionEnd

**Trigger:** When Claude Code session terminates

**Purpose:** Auto-ingest session transcript into memory

**How it works:**

1. Session ends (normally or via disconnect)
2. Hook captures conversation transcript
3. Calls `memory_observe` to extract knowledge/guidelines
4. Stores extracted entries in session or project scope

---

## Installation Details

### Claude Code

Hooks are installed to `.claude/hooks/` in your project:

```
.claude/
├── hooks/
│   ├── pretooluse.sh      # Pre-tool validation
│   ├── stop.sh            # Session end control
│   ├── userpromptsubmit.sh # Command parsing
│   └── session-end.sh     # Transcript ingestion
└── settings.json          # Hook configuration
```

The `settings.json` is updated to reference the hooks:

```json
{
  "hooks": {
    "PreToolUse": [".claude/hooks/pretooluse.sh"],
    "Stop": [".claude/hooks/stop.sh"],
    "UserPromptSubmit": [".claude/hooks/userpromptsubmit.sh"]
  }
}
```

### Environment Variables

Hooks respect these environment variables:

| Variable                  | Purpose                       |
| :------------------------ | :---------------------------- |
| `AGENT_MEMORY_DB_PATH`    | Path to SQLite database       |
| `AGENT_MEMORY_PROJECT_ID` | Project ID for scoped queries |
| `AGENT_MEMORY_AGENT_ID`   | Agent identifier for audit    |

---

## MCP Tool Reference

### memory_hook

Manage IDE hooks via MCP.

**Actions:**

| Action      | Description                                         |
| :---------- | :-------------------------------------------------- |
| `generate`  | Generate hooks without installing (returns content) |
| `install`   | Generate and write hooks to filesystem              |
| `status`    | Check if hooks are installed                        |
| `uninstall` | Remove installed hooks                              |

**Parameters:**

| Parameter     | Required | Description                                  |
| :------------ | :------- | :------------------------------------------- |
| `action`      | Yes      | One of: generate, install, status, uninstall |
| `ide`         | Yes      | Target IDE: claude, cursor, vscode           |
| `projectPath` | Yes      | Absolute path to project directory           |
| `projectId`   | No       | Project ID for loading guidelines            |
| `sessionId`   | No       | Session ID for loading guidelines            |

**Example — Install:**

```json
{
  "action": "install",
  "ide": "claude",
  "projectPath": "/Users/me/myproject",
  "projectId": "proj-abc123"
}
```

**Example — Generate (preview):**

```json
{
  "action": "generate",
  "ide": "claude",
  "projectPath": "/Users/me/myproject"
}
```

Returns hook content and installation instructions without writing files.

---

## CLI Reference

### hook install

```bash
agent-memory hook install [options]
```

| Option                  | Description                         |
| :---------------------- | :---------------------------------- |
| `--ide <ide>`           | Target IDE (claude, cursor, vscode) |
| `--project-path <path>` | Project directory path              |
| `--project-id <id>`     | Project ID for guidelines           |

### hook status

```bash
agent-memory hook status [options]
```

### hook uninstall

```bash
agent-memory hook uninstall [options]
```

### Hook Subcommands (internal)

These are called by the hook scripts themselves:

```bash
# Called by pretooluse.sh
agent-memory hook pretooluse --project-id <id> --agent-id <agent>

# Called by stop.sh
agent-memory hook stop --project-id <id> --session-id <id>

# Called by userpromptsubmit.sh
agent-memory hook userpromptsubmit --project-id <id>

# Called by session-end.sh
agent-memory hook session-end --project-id <id> --session-id <id>
```

---

## Critical Guidelines

Hooks enforce **critical guidelines** — those that should never be violated.

### Marking Guidelines as Critical

Set `priority >= 90` when storing:

```json
{
  "action": "add",
  "scopeType": "project",
  "scopeId": "proj-123",
  "name": "no-secrets-in-code",
  "content": "Never hardcode API keys, passwords, or secrets in source code.",
  "category": "security",
  "priority": 100
}
```

### Priority Levels

| Priority | Enforcement                               |
| :------- | :---------------------------------------- |
| 90-100   | **Critical** — Checked by PreToolUse hook |
| 70-89    | High — Shown in context queries           |
| 50-69    | Medium — Available for search             |
| 0-49     | Low — Reference only                      |

---

## Troubleshooting

### Hooks Not Firing

1. Check hooks are installed: `agent-memory hook status --ide claude --project-path .`
2. Verify `.claude/settings.json` references the hooks
3. Ensure hook scripts are executable: `chmod +x .claude/hooks/*.sh`

### Permission Denied

```bash
chmod +x .claude/hooks/*.sh
```

### Hook Blocking Everything

Check your critical guidelines:

```json
{
  "action": "search",
  "types": ["guidelines"],
  "priority": { "min": 90 },
  "scope": { "type": "project", "inherit": true }
}
```

Lower priority of overly broad guidelines or make content more specific.

### Debug Mode

Set `AGENT_MEMORY_LOG_LEVEL=debug` to see hook execution details:

```bash
AGENT_MEMORY_LOG_LEVEL=debug agent-memory hook pretooluse --project-id proj-123
```

---

## See Also

- [Rules Sync](rules-sync.md) — Sync guidelines to IDE rule files
- [IDE Setup](ide-setup.md) — Complete IDE configuration
- [MCP Tools](../reference/mcp-tools.md) — All MCP tools
