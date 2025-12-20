# API Reference

Authoritative reference for MCP tool schemas (generated from the server), plus REST/CLI usage for integrations.

## Table of Contents

- [MCP Tools](#mcp-tools)
- [REST API](#rest-api)
- [CLI Commands](#cli-commands)
- [See Also](#see-also)

---

## MCP Tools

All MCP tools use action-based requests:

```json
{ "action": "<action-name>", "...": "parameters" }
```

### Common Parameters

| Parameter | Type | Description |
|---|---|---|
| `scopeType` | `global \| org \| project \| session` | Scope level |
| `scopeId` | string | Required for non-global scopes |
| `inherit` | boolean | Include parent scopes in queries |

### Tool Schemas (Generated)

<!-- AUTO-GENERATED:MCP-TOOLS-START -->

### Tool Index

| Tool | Purpose | Actions |
|---|---|---|
| `memory_analytics` | Get usage analytics and trends from audit log. Actions: get_stats, get_trends,… | `get_stats`, `get_trends`, `get_subtask_stats`, `get_error_correlation`, `get_low_diversity` |
| `memory_backup` | Manage database backups. Actions: create (create backup), list (list all backup… | `create`, `list`, `cleanup`, `restore` |
| `memory_conflict` | Manage version conflicts. Actions: list, resolve | `list`, `resolve` |
| `memory_consolidate` | Consolidate similar memory entries to reduce redundancy and improve coherence.… | `find_similar`, `dedupe`, `merge`, `abstract`, `archive_stale` |
| `memory_conversation` | Manage conversation history. Actions: start, add_message, get, list, update, li… | `start`, `add_message`, `get`, `list`, `update`, `link_context`, `get_context`, `search`, `end`, `archive` |
| `memory_export` | Export memory entries to various formats. Actions: export | `export` |
| `memory_file_lock` | Manage file locks for multi-agent coordination. Actions: checkout, checkin, sta… | `checkout`, `checkin`, `status`, `list`, `force_unlock` |
| `memory_guideline` | Manage coding/behavioral guidelines (rules the AI should follow). Actions: add,… | `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete` |
| `memory_health` | Check server health and database status. Returns version, database stats, and c… | — |
| `memory_hook` | Generate and manage IDE verification hooks. Actions: - generate: Generate hook… | `generate`, `install`, `status`, `uninstall` |
| `memory_import` | Import memory entries from various formats. Actions: import | `import` |
| `memory_init` | Manage database initialization and migrations. Actions: init (initialize/migrat… | `init`, `status`, `reset`, `verify` |
| `memory_knowledge` | Manage knowledge entries (facts, decisions, context to remember). Actions: add,… | `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete` |
| `memory_observe` | Extract memory entries from conversation/code context using LLM analysis. Actio… | `extract`, `draft`, `commit`, `status` |
| `memory_org` | Manage organizations. Actions: create, list | `create`, `list` |
| `memory_permission` | Manage permissions. Actions: grant, revoke, check, list | `grant`, `revoke`, `check`, `list` |
| `memory_project` | Manage projects. Actions: create, list, get, update | `create`, `list`, `get`, `update` |
| `memory_query` | Query and aggregate memory. **IMPORTANT: Call this FIRST at conversation start… | `search`, `context` |
| `memory_relation` | Manage entry relations. Actions: create, list, delete | `create`, `list`, `delete` |
| `memory_session` | Manage working sessions (group related work together). Actions: start, end, lis… | `start`, `end`, `list` |
| `memory_tag` | Manage tags. Actions: create, list, attach, detach, for_entry | `create`, `list`, `attach`, `detach`, `for_entry` |
| `memory_task` | Manage task decomposition. Actions: add, get, list | `add`, `get`, `list` |
| `memory_tool` | Manage tool definitions (store reusable tool patterns for future reference). Ac… | `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete` |
| `memory_verify` | Verify actions against critical guidelines with active intervention. Actions: -… | `pre_check`, `post_check`, `acknowledge`, `status` |
| `memory_voting` | Manage multi-agent voting and consensus. Actions: record_vote, get_consensus, l… | `record_vote`, `get_consensus`, `list_votes`, `get_stats` |
### `memory_analytics`

Get usage analytics and trends from audit log. Actions: get_stats, get_trends, get_subtask_stats, get_error_correlation, get_low_diversity

- Actions: `get_stats`, `get_trends`, `get_subtask_stats`, `get_error_correlation`, `get_low_diversity`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `agentA` | string |  | First agent ID for correlation |
| `agentB` | string |  | Second agent ID for correlation |
| `endDate` | string |  | End date filter (ISO timestamp) |
| `projectId` | string |  | Project ID for subtask stats |
| `scopeId` | string |  | Scope ID to filter by |
| `scopeType` | string (`global`, `org`, `project`, `session`) |  |  |
| `startDate` | string |  | Start date filter (ISO timestamp) |
| `subtaskType` | string |  | Filter by subtask type |
| `timeWindow` | object |  | Time window for correlation analysis |

### `memory_backup`

Manage database backups. Actions: create (create backup), list (list all backups), cleanup (remove old backups), restore (restore from backup)

- Actions: `create`, `list`, `cleanup`, `restore`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `filename` | string |  | Backup filename to restore (restore) |
| `keepCount` | number |  | Number of backups to keep (cleanup, default: 5) |
| `name` | string |  | Custom backup name (create, optional) |

### `memory_conflict`

Manage version conflicts. Actions: list, resolve

- Actions: `list`, `resolve`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `entryType` | string (`tool`, `guideline`, `knowledge`) |  | Filter by entry type (list) |
| `id` | string |  | Conflict ID (resolve) |
| `limit` | number |  |  |
| `offset` | number |  |  |
| `resolution` | string |  | Resolution description (resolve) |
| `resolved` | boolean |  | Filter by resolved status (list, default: unresolved only) |
| `resolvedBy` | string |  | Who resolved it (resolve) |

### `memory_consolidate`

Consolidate similar memory entries to reduce redundancy and improve coherence. Actions: - find_similar: Find groups of semantically similar entries (dry run) - dedupe: Remove near…

- Actions: `find_similar`, `dedupe`, `merge`, `abstract`, `archive_stale`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `consolidatedBy` | string |  | Agent/user identifier for audit trail |
| `dryRun` | boolean |  | If true, only report what would be consolidated without making changes |
| `entryTypes` | array<string (`tool`, `guideline`, `knowledge`)> |  | Entry types to consolidate (default: all) |
| `limit` | number |  | Maximum number of groups to process (default: 20) |
| `minRecencyScore` | number |  | For archive_stale: only archive if recencyScore is below this (0-1) |
| `scopeId` | string |  | Scope ID (required for non-global scopes) |
| `scopeType` | string (`global`, `org`, `project`, `session`) | yes | Scope type to consolidate within |
| `staleDays` | number |  | For archive_stale: entries older than this (in days) are considered stale |
| `threshold` | number |  | Similarity threshold 0-1 (default: 0.85). Higher = stricter matching. |

### `memory_conversation`

Manage conversation history. Actions: start, add_message, get, list, update, link_context, get_context, search, end, archive

- Actions: `start`, `add_message`, `get`, `list`, `update`, `link_context`, `get_context`, `search`, `end`, `archive`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `agentId` | string |  | Agent ID (start, add_message, etc.) |
| `content` | string |  | Message content (add_message) |
| `contextEntries` | array<unknown> |  | Memory entries used (add_message) |
| `conversationId` | string |  | Conversation ID (add_message, get, update, etc.) |
| `entryId` | string |  | Entry ID (link_context, get_context) |
| `entryType` | string (`tool`, `guideline`, `knowledge`) |  | Entry type (link_context, get_context) |
| `generateSummary` | boolean |  | Generate summary when ending (end) |
| `includeContext` | boolean |  | Include context links (get) |
| `includeMessages` | boolean |  | Include messages (get) |
| `limit` | number |  |  |
| `messageId` | string |  | Message ID (link_context) |
| `metadata` | object |  | Optional metadata (start, update) |
| `offset` | number |  |  |
| `projectId` | string |  | Project ID (start) |
| `relevanceScore` | number |  | Relevance score 0-1 (link_context) |
| `role` | string (`user`, `agent`, `system`) |  | Message role (add_message) |
| `search` | string |  | Search query (search) |
| `sessionId` | string |  | Session ID (start) |
| `status` | string (`active`, `completed`, `archived`) |  | Filter by status (list) |
| `title` | string |  | Conversation title (start, update) |
| `toolsUsed` | array<unknown> |  | Tools invoked (add_message) |

### `memory_export`

Export memory entries to various formats. Actions: export

- Actions: `export`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `filename` | string |  | Optional filename to save export to configured export directory. If not provided, content is returned in response only. |
| `format` | string (`json`, `markdown`, `yaml`, `openapi`) |  | Export format (default: json) |
| `includeInactive` | boolean |  | Include inactive/deleted entries (default: false) |
| `includeVersions` | boolean |  | Include version history in export (default: false) |
| `scopeId` | string |  | Scope ID (required if scopeType specified) |
| `scopeType` | string (`global`, `org`, `project`, `session`) |  | Scope type to export from |
| `tags` | array<string> |  | Filter by tags (include entries with any of these tags) |
| `types` | array<string (`tools`, `guidelines`, `knowledge`)> |  | Entry types to export (default: all) |

### `memory_file_lock`

Manage file locks for multi-agent coordination. Actions: checkout, checkin, status, list, force_unlock

- Actions: `checkout`, `checkin`, `status`, `list`, `force_unlock`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `agent_id` | string |  | Agent/IDE identifier |
| `expires_in` | number |  | Lock timeout in seconds (default 3600) |
| `file_path` | string |  | Absolute filesystem path to the file |
| `metadata` | object |  | Optional metadata |
| `project_id` | string |  | Optional project reference |
| `reason` | string |  | Reason for force unlock |
| `session_id` | string |  | Optional session reference |

### `memory_guideline`

Manage coding/behavioral guidelines (rules the AI should follow). Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete When to store: W…

- Actions: `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `category` | string |  | Category (e.g., security, code_style) |
| `changeReason` | string |  |  |
| `content` | string |  | The guideline text |
| `createdBy` | string |  |  |
| `examples` | object |  |  |
| `id` | string |  | Guideline ID |
| `includeInactive` | boolean |  |  |
| `inherit` | boolean |  |  |
| `limit` | number |  |  |
| `name` | string |  | Guideline name |
| `offset` | number |  |  |
| `priority` | number |  | Priority 0-100 |
| `rationale` | string |  | Why this guideline exists |
| `scopeId` | string |  |  |
| `scopeType` | string (`global`, `org`, `project`, `session`) |  |  |
| `updatedBy` | string |  |  |

### `memory_health`

Check server health and database status. Returns version, database stats, and cache info. Use this to verify the memory server is working or to get entry counts.

- Actions: —
- Parameters: (none)

### `memory_hook`

Generate and manage IDE verification hooks. Actions: - generate: Generate hook files without installing (returns content and instructions) - install: Generate and install hooks to…

- Actions: `generate`, `install`, `status`, `uninstall`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `ide` | string (`claude`, `cursor`, `vscode`) | yes | Target IDE |
| `projectId` | string |  | Project ID for loading guidelines (optional) |
| `projectPath` | string | yes | Absolute path to the project directory |
| `sessionId` | string |  | Session ID for loading guidelines (optional) |

### `memory_import`

Import memory entries from various formats. Actions: import

- Actions: `import`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `conflictStrategy` | string (`skip`, `update`, `replace`, `error`) |  | How to handle conflicts with existing entries (default: update) |
| `content` | string | yes | Content to import (JSON string, YAML string, Markdown, or OpenAPI spec) |
| `format` | string (`json`, `yaml`, `markdown`, `openapi`) |  | Import format (default: json, auto-detected if possible) |
| `generateNewIds` | boolean |  | Generate new IDs for imported entries instead of preserving originals (default: false) |
| `importedBy` | string |  | Agent ID or identifier for audit trail |
| `scopeMapping` | object |  | Map scope IDs from import to target scopes: { "oldScopeId": { "type": "org\|project\|session", "id": "newScopeId" } } |

### `memory_init`

Manage database initialization and migrations. Actions: init (initialize/migrate), status (check migration status), reset (reset database - WARNING: deletes all data)

- Actions: `init`, `status`, `reset`, `verify`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `confirm` | boolean |  | Confirm database reset - required for reset action. WARNING: This deletes all data! |
| `force` | boolean |  | Force re-initialization even if already initialized (init) |
| `verbose` | boolean |  | Enable verbose output (init, reset) |

### `memory_knowledge`

Manage knowledge entries (facts, decisions, context to remember). Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete When to store: A…

- Actions: `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `category` | string (`decision`, `fact`, `context`, `reference`) |  |  |
| `changeReason` | string |  |  |
| `confidence` | number |  | Confidence level 0-1 |
| `content` | string |  | The knowledge content |
| `createdBy` | string |  |  |
| `id` | string |  | Knowledge ID |
| `includeInactive` | boolean |  |  |
| `inherit` | boolean |  |  |
| `limit` | number |  |  |
| `offset` | number |  |  |
| `scopeId` | string |  |  |
| `scopeType` | string (`global`, `org`, `project`, `session`) |  |  |
| `source` | string |  | Where this knowledge came from |
| `title` | string |  | Knowledge title |
| `updatedBy` | string |  |  |
| `validUntil` | string |  | Expiration date (ISO format) |

### `memory_observe`

Extract memory entries from conversation/code context using LLM analysis. Actions: - extract: Analyze context and extract guidelines, knowledge, and tool patterns - draft: Return…

- Actions: `extract`, `draft`, `commit`, `status`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `agentId` | string |  | Agent identifier for audit |
| `autoPromote` | boolean |  | If true, entries above threshold can be stored at project scope when projectId is provided (default: on) |
| `autoPromoteThreshold` | number |  | Confidence threshold for auto-promotion (0-1, default: 0.85) |
| `autoStore` | boolean |  | Automatically store entries above confidence threshold (default: false) |
| `confidenceThreshold` | number |  | Minimum confidence to auto-store (0-1, default: 0.7) |
| `context` | string |  | Raw conversation or code context to analyze |
| `contextType` | string (`conversation`, `code`, `mixed`) |  | Type of context (default: mixed) |
| `entries` | array<object> |  | Client-extracted entries (required for commit) |
| `focusAreas` | array<string (`decisions`, `facts`, `rules`, `tools`)> |  | Focus extraction on specific types |
| `projectId` | string |  | Project ID (optional, enables project auto-promote) |
| `scopeId` | string |  | Scope ID (required for non-global scopes) |
| `scopeType` | string (`global`, `org`, `project`, `session`) |  | Scope for extracted entries (default: project) |
| `sessionId` | string |  | Session ID (required for draft/commit) |

### `memory_org`

Manage organizations. Actions: create, list

- Actions: `create`, `list`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `limit` | number |  | Max results (list, default 20) |
| `metadata` | object |  | Optional metadata (create) |
| `name` | string |  | Organization name (create) |
| `offset` | number |  | Skip N results (list) |

### `memory_permission`

Manage permissions. Actions: grant, revoke, check, list

- Actions: `grant`, `revoke`, `check`, `list`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `agent_id` | string |  | Agent identifier (grant, revoke, check, list) |
| `created_by` | string |  | Creator identifier (grant) |
| `entry_type` | string (`tool`, `guideline`, `knowledge`) |  | Entry type (grant, revoke, check, list) |
| `limit` | number |  | Max results (list, default: all) |
| `offset` | number |  | Skip N results (list) |
| `permission` | string (`read`, `write`, `admin`) |  | Permission level (grant) |
| `permission_id` | string |  | Permission ID (revoke) |
| `scope_id` | string |  | Scope ID (grant, revoke, check, list) |
| `scope_type` | string (`global`, `org`, `project`, `session`) |  | Scope type (grant, revoke, check, list) |

### `memory_project`

Manage projects. Actions: create, list, get, update

- Actions: `create`, `list`, `get`, `update`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `description` | string |  | Project description |
| `id` | string |  | Project ID (get, update) |
| `limit` | number |  |  |
| `metadata` | object |  | Optional metadata |
| `name` | string |  | Project name |
| `offset` | number |  |  |
| `orgId` | string |  | Parent organization ID |
| `rootPath` | string |  | Filesystem root path |

### `memory_query`

Query and aggregate memory. **IMPORTANT: Call this FIRST at conversation start with action:"context" to load project context.** Actions: - context: Get aggregated context for a sc…

- Actions: `search`, `context`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `compact` | boolean |  | Return compact results |
| `createdAfter` | string |  | Filter by creation date (ISO timestamp) |
| `createdBefore` | string |  | Filter by creation date (ISO timestamp) |
| `fields` | array<string> |  | Field-specific search: ["name", "description"] |
| `followRelations` | boolean |  | Expand search results to include related entries |
| `fuzzy` | boolean |  | Enable typo tolerance (Levenshtein distance) |
| `includeInactive` | boolean |  | Include inactive entries (search) |
| `includeVersions` | boolean |  | Include version history (search) |
| `inherit` | boolean |  | Include parent scopes (context, default true) |
| `limit` | number |  | Max results (search) or per type (context as limitPerType) |
| `priority` | object |  | Filter guidelines by priority range (0-100) |
| `regex` | boolean |  | Use regex instead of simple match |
| `relatedTo` | object |  | Find related entries (search) |
| `scope` | object |  | Scope to search within (search) |
| `scopeId` | string |  | Scope ID (context) |
| `scopeType` | string (`global`, `org`, `project`, `session`) |  | Scope type (context) |
| `search` | string |  | Free-text search (search) |
| `semanticSearch` | boolean |  | Enable semantic/vector search (default: true if embeddings available) |
| `semanticThreshold` | number |  | Minimum similarity score for semantic results (0-1, default: 0.7) |
| `tags` | object |  | Tag filters (search) |
| `types` | array<string (`tools`, `guidelines`, `knowledge`)> |  | Which sections to search (search) |
| `updatedAfter` | string |  | Filter by update date (ISO timestamp) |
| `updatedBefore` | string |  | Filter by update date (ISO timestamp) |
| `useFts5` | boolean |  | Use FTS5 full-text search instead of LIKE queries (default: false) |

### `memory_relation`

Manage entry relations. Actions: create, list, delete

- Actions: `create`, `list`, `delete`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `createdBy` | string |  |  |
| `id` | string |  | Relation ID (delete) |
| `limit` | number |  |  |
| `offset` | number |  |  |
| `relationType` | string (`applies_to`, `depends_on`, `conflicts_with`, `related_to`, `parent_task`, `subtask_of`) |  |  |
| `sourceId` | string |  |  |
| `sourceType` | string (`tool`, `guideline`, `knowledge`, `project`) |  |  |
| `targetId` | string |  |  |
| `targetType` | string (`tool`, `guideline`, `knowledge`, `project`) |  |  |

### `memory_session`

Manage working sessions (group related work together). Actions: start, end, list Workflow: Start a session at beginning of a task, end when complete. Sessions group related memory…

- Actions: `start`, `end`, `list`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `agentId` | string |  | Agent/IDE identifier (start) |
| `id` | string |  | Session ID (end) |
| `limit` | number |  |  |
| `metadata` | object |  | Session metadata (start) |
| `name` | string |  | Session name (start) |
| `offset` | number |  |  |
| `projectId` | string |  | Parent project ID (start) |
| `purpose` | string |  | Session purpose (start) |
| `status` | string (`completed`, `discarded`, `active`, `paused`) |  | End status (end) or filter (list) |

### `memory_tag`

Manage tags. Actions: create, list, attach, detach, for_entry

- Actions: `create`, `list`, `attach`, `detach`, `for_entry`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `category` | string (`language`, `domain`, `category`, `meta`, `custom`) |  |  |
| `description` | string |  |  |
| `entryId` | string |  |  |
| `entryType` | string (`tool`, `guideline`, `knowledge`, `project`) |  |  |
| `isPredefined` | boolean |  |  |
| `limit` | number |  |  |
| `name` | string |  | Tag name (unique) |
| `offset` | number |  |  |
| `tagId` | string |  | Tag ID |
| `tagName` | string |  | Tag name (creates if not exists) |

### `memory_task`

Manage task decomposition. Actions: add, get, list

- Actions: `add`, `get`, `list`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `createdBy` | string |  |  |
| `decompositionStrategy` | string (`maximal`, `balanced`, `minimal`) |  | Decomposition strategy (add) |
| `limit` | number |  |  |
| `offset` | number |  |  |
| `parentTask` | string |  | ID of parent task (add) |
| `parentTaskId` | string |  | Filter by parent task ID (list) |
| `projectId` | string |  | For storing decomposition metadata (add) |
| `scopeId` | string |  |  |
| `scopeType` | string (`global`, `org`, `project`, `session`) |  |  |
| `subtasks` | array<string> |  | Array of subtask descriptions/names (add) |
| `taskId` | string |  | Task ID (get) |

### `memory_tool`

Manage tool definitions (store reusable tool patterns for future reference). Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete When…

- Actions: `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `category` | string (`mcp`, `cli`, `function`, `api`) |  |  |
| `changeReason` | string |  | Reason for update |
| `constraints` | string |  | Usage constraints |
| `createdBy` | string |  | Creator identifier |
| `description` | string |  | What this tool does |
| `examples` | array<unknown> |  | Usage examples |
| `id` | string |  | Tool ID |
| `includeInactive` | boolean |  |  |
| `inherit` | boolean |  | Search parent scopes (default true) |
| `limit` | number |  |  |
| `name` | string |  | Tool name |
| `offset` | number |  |  |
| `parameters` | object |  | Parameter schema |
| `scopeId` | string |  | Scope ID |
| `scopeType` | string (`global`, `org`, `project`, `session`) |  | Scope level |
| `updatedBy` | string |  |  |

### `memory_verify`

Verify actions against critical guidelines with active intervention. Actions: - pre_check: REQUIRED before file modifications or code generation. Returns {blocked: true} if violat…

- Actions: `pre_check`, `post_check`, `acknowledge`, `status`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `agentId` | string |  | Agent identifier |
| `completedAction` | object |  | Completed action to log (post_check) |
| `content` | string |  | Response content to verify (post_check alternative) |
| `guidelineIds` | array<string> |  | Guideline IDs to acknowledge (acknowledge) |
| `projectId` | string |  | Project ID (optional, derived from session if not provided) |
| `proposedAction` | object |  | Action to verify (pre_check) |
| `sessionId` | string |  | Current session ID |

### `memory_voting`

Manage multi-agent voting and consensus. Actions: record_vote, get_consensus, list_votes, get_stats

- Actions: `record_vote`, `get_consensus`, `list_votes`, `get_stats`

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `agentId` | string |  | Agent identifier |
| `confidence` | number |  | Confidence level 0-1 (default: 1.0) |
| `k` | number |  | Number of votes ahead required for consensus (default: 1) |
| `reasoning` | string |  | Reasoning for this vote |
| `taskId` | string |  | Task ID (references knowledge/tool entry) |
| `voteValue` | object |  | Agent vote value (any JSON-serializable value) |

<!-- AUTO-GENERATED:MCP-TOOLS-END -->

---

## REST API

REST is **disabled by default**. Enable with environment variables:

```bash
AGENT_MEMORY_REST_ENABLED=true
AGENT_MEMORY_REST_API_KEY=your-secret-key
```

### Authentication

Include in every request (except `/health`):

- `Authorization: Bearer <API_KEY>`
- or `X-API-Key: <API_KEY>`

### Endpoints

#### GET /health

No authentication required.

```bash
curl http://127.0.0.1:8787/health
```

Response:

```json
{
  "ok": true,
  "uptimeSec": 3600
}
```

#### POST /v1/query

Search memory entries.

```bash
curl -X POST http://127.0.0.1:8787/v1/query \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-app",
    "types": ["guidelines", "knowledge"],
    "scope": {
      "type": "project",
      "id": "proj-def456",
      "inherit": true
    },
    "search": "authentication",
    "semanticSearch": true,
    "semanticThreshold": 0.7,
    "limit": 20
  }'
```

#### POST /v1/context

Get aggregated context for a scope.

```bash
curl -X POST http://127.0.0.1:8787/v1/context \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-app",
    "scopeType": "project",
    "scopeId": "proj-def456",
    "inherit": true,
    "compact": false,
    "limitPerType": 50
  }'
```

Response includes:

- `scope`
- `tools`, `guidelines`, `knowledge`
- `meta`

### Error Responses

Errors return a simple JSON payload:

```json
{ "error": "Unauthorized" }
```

Common statuses:

| HTTP Status | Meaning |
|---:|---|
| 400 | Invalid request parameters |
| 401 | Missing or invalid API key |
| 403 | Insufficient permissions |
| 429 | Rate limited |
| 500 | Server error |

---

## CLI Commands

### Server Commands

```bash
# Start MCP server (default)
agent-memory mcp

# Start REST server
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=secret \
agent-memory rest

# Start both servers
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_API_KEY=secret \
agent-memory both
```

### Utility Commands

```bash
# Check version
agent-memory --version

# Verify response content
echo "content" | agent-memory verify-response --type code_generate

# Install/check/uninstall IDE hooks/rules files
agent-memory hook install --ide claude --project-path /path/to/project
agent-memory hook status --ide claude --project-path /path/to/project
agent-memory hook uninstall --ide claude --project-path /path/to/project

# Execute hook logic (expects JSON on stdin; used by Claude Code hooks)
agent-memory hook pretooluse --project-id proj-def456
agent-memory hook stop --project-id proj-def456
agent-memory hook userpromptsubmit --project-id proj-def456
agent-memory hook session-end --project-id proj-def456
```

### Environment Variables

Key variables (see [full reference](environment-variables.md)):

```bash
# Data location
AGENT_MEMORY_DATA_DIR=~/.agent-memory

# Semantic search
AGENT_MEMORY_OPENAI_API_KEY=sk-...

# REST API
AGENT_MEMORY_REST_ENABLED=true
AGENT_MEMORY_REST_API_KEY=your-secret
AGENT_MEMORY_REST_HOST=127.0.0.1
AGENT_MEMORY_REST_PORT=8787

# Permissions (for single-agent setups)
AGENT_MEMORY_PERMISSIONS_MODE=permissive
```

---

## See Also

- [Getting Started](../getting-started.md) - First workflow walkthrough
- [Environment Variables](environment-variables.md) - All configuration options
- [Workflows Guide](../guides/workflows.md) - Common usage patterns
- [Architecture](../concepts/architecture.md) - System design

