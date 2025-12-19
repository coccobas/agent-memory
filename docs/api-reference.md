# API Reference

This reference covers the MCP tools, REST API, and CLI commands.

## MCP Tools

All MCP tools follow the same request shape:

```json
{ "action": "...", "scopeType": "project", "scopeId": "..." }
```

Common fields:

- `action`: tool-specific action name.
- `scopeType`: `global | org | project | session`.
- `scopeId`: required for non-global scopes.

### memory_org

Actions: `create`, `list`

### memory_project

Actions: `create`, `list`, `get`, `update`

### memory_session

Actions: `start`, `end`, `list`

### memory_tool

Actions: `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`

### memory_guideline

Actions: `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`

### memory_knowledge

Actions: `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`

### memory_tag

Actions: `create`, `list`, `attach`, `detach`, `for_entry`

### memory_relation

Actions: `create`, `list`, `delete`

### memory_file_lock

Actions: `checkout`, `checkin`, `status`, `list`, `force_unlock`

### memory_query

Actions: `context`, `search`

Example:

```json
{
  "action": "context",
  "scopeType": "project",
  "scopeId": "proj-123",
  "inherit": true
}
```

### memory_task

Actions: `add`, `get`, `list`

### memory_voting

Actions: `record_vote`, `get_consensus`, `list_votes`, `get_stats`

### memory_analytics

Actions: `get_stats`, `get_trends`, `get_subtask_stats`, `get_error_correlation`, `get_low_diversity`

### memory_permission

Actions: `grant`, `revoke`, `check`, `list`

### memory_conflict

Actions: `list`, `resolve`

### memory_health

No action required. The tool returns health and database status.

### memory_backup

Actions: `create`, `list`, `cleanup`, `restore`

### memory_init

Actions: `init`, `status`, `reset`, `verify`

### memory_export

Actions: `export`

### memory_import

Actions: `import`

### memory_conversation

Actions: `start`, `add_message`, `get`, `list`, `update`, `link_context`, `get_context`, `search`, `end`, `archive`

### memory_verify

Actions: `pre_check`, `post_check`, `acknowledge`, `status`

### memory_hook

Actions: `generate`, `install`, `status`, `uninstall`

### memory_observe

Actions: `extract`, `draft`, `commit`, `status`

## REST API

REST is **disabled by default** and **requires API key auth** unless explicitly disabled.

Enable REST:

```bash
AGENT_MEMORY_REST_ENABLED=true
AGENT_MEMORY_REST_API_KEY=your-secret
```

Authentication:

- `Authorization: Bearer <API_KEY>`
- or `X-API-Key: <API_KEY>`

### GET /health

Response:

```json
{ "ok": true, "uptimeSec": 123 }
```

### POST /v1/query

Request:

```json
{
  "agentId": "agent-1",
  "types": ["tools", "guidelines", "knowledge"],
  "scope": { "type": "project", "id": "proj-123", "inherit": true },
  "search": "token refresh",
  "semanticSearch": true,
  "semanticThreshold": 0.75,
  "limit": 20
}
```

Notes:

- `agentId` is required and is used for permission checks.
- Permissions are enforced per entry type.

### POST /v1/context

Request:

```json
{
  "agentId": "agent-1",
  "scopeType": "project",
  "scopeId": "proj-123",
  "inherit": true,
  "compact": false,
  "limitPerType": 50
}
```

## CLI

### Run servers

```bash
agent-memory mcp
agent-memory rest
agent-memory both
```

### Verify response content

```bash
echo "content" | agent-memory verify-response --type other
```

### Hook runner (for Claude Code hooks)

```bash
agent-memory hook <pretooluse|stop|userpromptsubmit|session-end> --project-id <id>
```

See `docs/guides/rules-sync.md` for IDE rule syncing commands.
