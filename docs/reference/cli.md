# CLI Reference

Complete command-line interface reference for Agent Memory.

## Global Options

All commands support these global options:

| Option              | Description                                |
| ------------------- | ------------------------------------------ |
| `--format <format>` | Output format: `json` (default), `compact` |
| `--agent-id <id>`   | Agent identifier for audit trails          |
| `--help`, `-h`      | Show help for command                      |

---

## Server Commands

### mcp

Start the MCP server over stdio (default mode).

```bash
agent-memory mcp
```

### rest

Start the REST API server.

```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret \
agent-memory rest
```

### both

Run MCP and REST servers simultaneously.

```bash
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=your-secret \
agent-memory both
```

---

## Memory Commands

### query

Query and search memory entries.

```bash
# Get aggregated context
agent-memory query context --scope-type project --scope-id proj-123

# Search entries
agent-memory query search --search "authentication" --types guidelines,knowledge
```

**Subcommands:**

| Command   | Description                        |
| --------- | ---------------------------------- |
| `context` | Get aggregated context for a scope |
| `search`  | Search memory entries              |

**Options for `context`:**
| Option | Description |
|--------|-------------|
| `--scope-type` | Scope type: `global`, `org`, `project`, `session` |
| `--scope-id` | Scope ID |
| `--inherit` | Include parent scopes |
| `--compact` | Return compact results |
| `--limit-per-type` | Max entries per type |

**Options for `search`:**
| Option | Description |
|--------|-------------|
| `--search` | Search query |
| `--types` | Entry types (comma-separated) |
| `--scope-type` | Scope type |
| `--scope-id` | Scope ID |
| `--semantic-search` | Enable semantic search |
| `--semantic-threshold` | Similarity threshold (0-1) |

---

### guideline

Manage coding/behavioral guidelines.

```bash
# Add a guideline
agent-memory guideline add --scope-type project --scope-id proj-123 \
  --name "no-console-log" --content "Never use console.log in production"

# List guidelines
agent-memory guideline list --scope-type project --scope-id proj-123

# Get a specific guideline
agent-memory guideline get --id guid-abc123
```

**Subcommands:**

| Command      | Description                  |
| ------------ | ---------------------------- |
| `add`        | Add a new guideline          |
| `update`     | Update an existing guideline |
| `get`        | Get a guideline by ID        |
| `list`       | List guidelines              |
| `deactivate` | Deactivate a guideline       |
| `history`    | View version history         |
| `bulk-add`   | Add multiple guidelines      |

**Options for `add`:**
| Option | Description |
|--------|-------------|
| `--scope-type` | Scope type (required) |
| `--scope-id` | Scope ID |
| `--name` | Guideline name (required) |
| `--content` | Guideline text (required) |
| `--category` | Category (e.g., `security`, `code_style`) |
| `--priority` | Priority 0-100 |
| `--rationale` | Why this guideline exists |

---

### knowledge

Manage knowledge entries (facts, decisions, context).

```bash
# Add knowledge
agent-memory knowledge add --scope-type project --scope-id proj-123 \
  --title "API uses REST" --content "This project uses REST API, not GraphQL"

# List knowledge
agent-memory knowledge list --scope-type project --scope-id proj-123
```

**Subcommands:** Same as `guideline` command.

**Options for `add`:**
| Option | Description |
|--------|-------------|
| `--scope-type` | Scope type (required) |
| `--scope-id` | Scope ID |
| `--title` | Knowledge title (required) |
| `--content` | Knowledge content (required) |
| `--category` | Category: `decision`, `fact`, `context`, `reference` |
| `--confidence` | Confidence level 0-1 |
| `--source` | Where this knowledge came from |

---

### tool

Manage tool definitions.

```bash
# Add a tool
agent-memory tool add --scope-type project --scope-id proj-123 \
  --name "docker-build" --description "Build Docker image" --category cli

# List tools
agent-memory tool list --scope-type project --scope-id proj-123
```

**Subcommands:** Same as `guideline` command.

---

## Scope Commands

### project

Manage projects.

```bash
# Create a project
agent-memory project create --name "my-api" --root-path /path/to/project

# List projects
agent-memory project list

# Get project details
agent-memory project get --id proj-123
```

**Subcommands:**

| Command  | Description          |
| -------- | -------------------- |
| `create` | Create a new project |
| `list`   | List all projects    |
| `get`    | Get project by ID    |
| `update` | Update a project     |
| `delete` | Delete a project     |

---

### org

Manage organizations.

```bash
# Create an organization
agent-memory org create --name "my-company"

# List organizations
agent-memory org list
```

---

### session

Manage working sessions.

```bash
# Start a session
agent-memory session start --project-id proj-123 --name "Add auth feature"

# List sessions
agent-memory session list --status active

# End a session
agent-memory session end --id sess-abc123 --status completed
```

**Subcommands:**

| Command | Description         |
| ------- | ------------------- |
| `start` | Start a new session |
| `list`  | List sessions       |
| `end`   | End a session       |

---

## Organization Commands

### tag

Manage tags.

```bash
# Attach a tag
agent-memory tag attach --entry-type guideline --entry-id guid-123 --tag-name security

# List tags for an entry
agent-memory tag for-entry --entry-type guideline --entry-id guid-123

# List all tags
agent-memory tag list
```

**Subcommands:**

| Command     | Description            |
| ----------- | ---------------------- |
| `create`    | Create a new tag       |
| `list`      | List all tags          |
| `attach`    | Attach tag to entry    |
| `detach`    | Detach tag from entry  |
| `for-entry` | List tags for an entry |

---

### relation

Manage entry relations.

```bash
# Create a relation
agent-memory relation create \
  --source-type guideline --source-id guid-123 \
  --target-type knowledge --target-id know-456 \
  --relation-type related_to

# List relations
agent-memory relation list --source-type guideline --source-id guid-123
```

---

## Maintenance Commands

### consolidate

Consolidate similar memory entries.

```bash
# Find similar entries (dry run)
agent-memory consolidate find-similar --scope-type project --scope-id proj-123

# Deduplicate entries
agent-memory consolidate dedupe --scope-type project --scope-id proj-123 --dry-run

# Archive stale entries
agent-memory consolidate archive-stale --scope-type project --scope-id proj-123 \
  --stale-days 90 --dry-run
```

**Subcommands:**

| Command         | Description                        |
| --------------- | ---------------------------------- |
| `find-similar`  | Find groups of similar entries     |
| `dedupe`        | Remove near-duplicates             |
| `merge`         | Combine similar entries            |
| `abstract`      | Create relations without modifying |
| `archive-stale` | Archive old entries                |

**Common Options:**
| Option | Description |
|--------|-------------|
| `--scope-type` | Scope type (required) |
| `--scope-id` | Scope ID |
| `--entry-types` | Entry types (comma-separated) |
| `--threshold` | Similarity threshold 0-1 (default: 0.85) |
| `--dry-run` | Report without making changes |

---

### reindex

Regenerate embeddings for memory entries.

```bash
# Reindex all missing embeddings
agent-memory reindex

# Reindex only guidelines
agent-memory reindex --type guidelines

# Force regenerate all
agent-memory reindex --force

# Show stats only
agent-memory reindex --stats
```

**Options:**
| Option | Short | Description |
|--------|-------|-------------|
| `--type` | `-t` | Entry type: `tools`, `guidelines`, `knowledge`, `all` |
| `--batch-size` | `-b` | Batch size (default: 50) |
| `--delay` | `-d` | Delay between batches in ms (default: 1000) |
| `--force` | `-f` | Force regeneration |
| `--retry-failed` | `-r` | Retry failed jobs |
| `--stats` | `-s` | Show statistics only |

---

### review

Interactive TUI for reviewing candidate entries.

```bash
# Auto-detect active session
agent-memory review

# Review specific session
agent-memory review --session sess-123 --project proj-456
```

**Interactive Keys:**
| Key | Action |
|-----|--------|
| ↑/↓ | Navigate entries |
| Space | Toggle selection |
| a | Approve selected |
| r | Reject selected |
| s | Skip selected |
| q | Quit |

---

## Analytics Commands

### analytics

Get usage analytics and trends.

```bash
# Get usage stats
agent-memory analytics get-stats --scope-type project --scope-id proj-123

# Get trends
agent-memory analytics get-trends --start-date 2024-01-01 --end-date 2024-12-31

# Get error correlation
agent-memory analytics get-error-correlation --agent-a cursor --agent-b claude
```

**Subcommands:**

| Command                 | Description                          |
| ----------------------- | ------------------------------------ |
| `get-stats`             | Get usage statistics                 |
| `get-trends`            | Get usage trends over time           |
| `get-subtask-stats`     | Get subtask statistics               |
| `get-error-correlation` | Get error correlation between agents |
| `get-low-diversity`     | Find low diversity entries           |

---

## Conversation Commands

### conversation

Manage conversation history.

```bash
# Start a conversation
agent-memory conversation start --project-id proj-123 --title "Debug session"

# Add a message
agent-memory conversation add-message \
  --conversation-id conv-123 --role user --content "How do I fix this?"

# List conversations
agent-memory conversation list --status active

# End a conversation
agent-memory conversation end --id conv-123 --generate-summary
```

**Subcommands:**

| Command        | Description                       |
| -------------- | --------------------------------- |
| `start`        | Start a new conversation          |
| `add-message`  | Add message to conversation       |
| `get`          | Get conversation by ID            |
| `list`         | List conversations                |
| `update`       | Update conversation               |
| `search`       | Search conversations              |
| `link-context` | Link memory entry to conversation |
| `get-context`  | Get context links                 |
| `end`          | End a conversation                |
| `archive`      | Archive a conversation            |

---

## Admin Commands

### backup

Manage database backups.

```bash
# Create a backup
agent-memory backup create --admin-key your-admin-key

# List backups
agent-memory backup list --admin-key your-admin-key

# Restore from backup
agent-memory backup restore --filename backup-2024-01-01.db --admin-key your-key

# Cleanup old backups
agent-memory backup cleanup --keep-count 5 --admin-key your-key
```

---

### init

Manage database initialization.

```bash
# Check migration status
agent-memory init status

# Initialize database
agent-memory init --admin-key your-key

# Reset database (WARNING: deletes all data)
agent-memory init reset --confirm --admin-key your-key
```

---

### permission

Manage permissions.

```bash
# Grant permission
agent-memory permission grant \
  --agent-id cursor-ai --scope-type project --scope-id proj-123 \
  --entry-type guideline --permission write --admin-key your-key

# Check permission
agent-memory permission check \
  --agent-id cursor-ai --scope-type project --scope-id proj-123 \
  --entry-type guideline

# List permissions
agent-memory permission list --admin-key your-key
```

---

### import / export

Import and export memory entries.

```bash
# Export to JSON
agent-memory export --scope-type project --scope-id proj-123 --format json

# Export to file
agent-memory export --scope-type project --scope-id proj-123 \
  --filename export.json --admin-key your-key

# Import from JSON
agent-memory import --content '{"guidelines": [...]}' --admin-key your-key
```

---

## Hook Commands

### hook

Manage IDE hooks for runtime enforcement.

```bash
# Install hooks
agent-memory hook install --ide claude --project-path /path/to/project

# Check status
agent-memory hook status --ide claude --project-path /path/to/project

# Uninstall hooks
agent-memory hook uninstall --ide claude --project-path /path/to/project
```

**Hook execution commands** (called by IDE, not typically manual):

```bash
agent-memory hook pretooluse --project-id proj-123
agent-memory hook stop --project-id proj-123
agent-memory hook userpromptsubmit --project-id proj-123
agent-memory hook session-end --project-id proj-123
```

---

### verify-response

Verify content against guidelines.

```bash
echo "console.log('test')" | agent-memory verify-response --type code_generate
```

---

## Utility Commands

### health

Check server health.

```bash
agent-memory health
```

---

### observe

Extract memory entries from context.

```bash
# Extract from context
agent-memory observe extract \
  --context "User said we should always use TypeScript strict mode" \
  --scope-type project --scope-id proj-123

# Check extraction status
agent-memory observe status
```

---

### voting

Manage multi-agent voting.

```bash
# Record a vote
agent-memory voting record \
  --task-id task-123 --vote-value '{"choice": "optionA"}' --reasoning "Better performance"

# Get consensus
agent-memory voting consensus --task-id task-123

# List votes
agent-memory voting list --task-id task-123
```

---

## Environment Variables

| Variable                      | Description                           |
| ----------------------------- | ------------------------------------- |
| `AGENT_MEMORY_MODE`           | Server mode: `mcp`, `rest`, `both`    |
| `AGENT_MEMORY_DATA_DIR`       | Base data directory                   |
| `AGENT_MEMORY_DB_PATH`        | SQLite database path                  |
| `AGENT_MEMORY_DB_TYPE`        | Database type: `sqlite`, `postgresql` |
| `AGENT_MEMORY_REST_ENABLED`   | Enable REST API                       |
| `AGENT_MEMORY_REST_API_KEY`   | REST API key                          |
| `AGENT_MEMORY_OPENAI_API_KEY` | OpenAI API key (embeddings)           |

See [Environment Variables](environment-variables.md) for complete reference.

---

## Exit Codes

| Code | Meaning           |
| ---- | ----------------- |
| 0    | Success           |
| 1    | General error     |
| 2    | Invalid arguments |

---

## See Also

- [MCP Tools](mcp-tools.md) - MCP tool reference
- [REST API](rest-api.md) - HTTP API reference
- [Hooks Guide](../guides/hooks.md) - Hook configuration
