# CLI Reference

Command-line interface for Agent Memory.

## Server Commands

### Start MCP Server (Default)

```bash
agent-memory mcp
```

Starts the MCP server over stdio. This is the default mode.

### Start REST Server

```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret \
agent-memory rest
```

Starts the REST API server.

### Start Both Servers

```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret \
agent-memory both
```

Runs MCP and REST servers simultaneously.

---

## Utility Commands

### Version

```bash
agent-memory --version
```

### Help

```bash
agent-memory --help
```

---

## Hook Commands

Manage IDE hooks for runtime enforcement.

### Install Hooks

```bash
agent-memory hook install --ide <ide> --project-path <path> [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `--ide` | Target IDE: `claude`, `cursor`, `vscode` |
| `--project-path` | Absolute path to project directory |
| `--project-id` | Optional project ID for loading guidelines |
| `--session-id` | Optional session ID |

**Example:**
```bash
agent-memory hook install --ide claude --project-path /path/to/project
```

### Check Hook Status

```bash
agent-memory hook status --ide <ide> --project-path <path>
```

**Example:**
```bash
agent-memory hook status --ide claude --project-path /path/to/project
```

### Uninstall Hooks

```bash
agent-memory hook uninstall --ide <ide> --project-path <path>
```

### Hook Execution Commands

These commands are called by IDE hooks (not typically run manually):

```bash
# Pre-tool-use check (expects JSON on stdin)
agent-memory hook pretooluse --project-id <id>

# Stop hook
agent-memory hook stop --project-id <id>

# User prompt submit
agent-memory hook userpromptsubmit --project-id <id>

# Session end
agent-memory hook session-end --project-id <id>
```

---

## Verify Response Command

Verify content against guidelines.

```bash
echo "<content>" | agent-memory verify-response --type <type>
```

**Options:**
| Option | Description |
|--------|-------------|
| `--type` | Content type: `code_generate`, `file_write`, `other` |

**Example:**
```bash
echo "console.log('test')" | agent-memory verify-response --type code_generate
```

---

## Reindex Command

Regenerate embeddings for memory entries.

```bash
agent-memory reindex [options]
```

**Options:**
| Option | Short | Description |
|--------|-------|-------------|
| `--type <type>` | `-t` | Entry type: `tools`, `guidelines`, `knowledge`, `all` |
| `--batch-size <n>` | `-b` | Batch size for processing (default: 50) |
| `--delay <ms>` | `-d` | Delay between batches in ms (default: 1000) |
| `--force` | `-f` | Force regeneration even if embeddings exist |
| `--retry-failed` | `-r` | Retry failed embedding jobs from queue |
| `--stats` | `-s` | Show embedding statistics only |
| `--help` | `-h` | Show help message |

**Examples:**

```bash
# Reindex all missing embeddings
agent-memory reindex

# Reindex only guidelines
agent-memory reindex --type guidelines

# Force regenerate all embeddings
agent-memory reindex --force

# Retry failed jobs
agent-memory reindex --retry-failed

# Show current stats
agent-memory reindex --stats

# Custom batch size and delay
agent-memory reindex --batch-size 100 --delay 2000
```

**Output:**
```
Embedding provider: openai

Reindexing all entry types...
  Batch size: 50
  Delay: 1000ms
  Force: false

  Progress: 150/200 (75%) - 148 succeeded, 2 failed

Completed in 45.2s:
  Total:     200
  Processed: 200
  Succeeded: 198
  Failed:    2
```

---

## Review Command

Interactive TUI for reviewing candidate memory entries.

```bash
agent-memory review [options]
```

**Options:**
| Option | Short | Description |
|--------|-------|-------------|
| `--session <id>` | `-s` | Session ID to review candidates from |
| `--project <id>` | `-p` | Project ID for promoting approved entries |
| `--help` | `-h` | Show help message |

**Examples:**

```bash
# Auto-detect active session
agent-memory review

# Review specific session
agent-memory review --session abc123

# Specify both session and project
agent-memory review -s abc123 -p proj456
```

**Interactive Actions:**
| Key | Action |
|-----|--------|
| ↑/↓ | Navigate between entries |
| Space | Toggle selection |
| Enter | Confirm action on selected entries |
| a | Approve selected (promote to project scope) |
| r | Reject selected (deactivate entries) |
| s | Skip (leave for later review) |
| q | Quit review |

---

## Environment Variables

Key environment variables for CLI:

| Variable | Description |
|----------|-------------|
| `AGENT_MEMORY_MODE` | Server mode: `mcp`, `rest`, `both` |
| `AGENT_MEMORY_DATA_DIR` | Base data directory |
| `AGENT_MEMORY_DB_PATH` | SQLite database path |
| `AGENT_MEMORY_REST_ENABLED` | Enable REST API |
| `AGENT_MEMORY_REST_API_KEY` | REST API key |
| `AGENT_MEMORY_OPENAI_API_KEY` | OpenAI API key (embeddings) |

See [Environment Variables](environment-variables.md) for complete reference.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |

---

## See Also

- [MCP Tools](mcp-tools.md) - MCP tool reference
- [REST API](rest-api.md) - HTTP API reference
- [Hooks Guide](../guides/hooks-enforcement.md) - Hook configuration
