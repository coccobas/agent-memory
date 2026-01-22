# MCP Tools Reference

Authoritative reference for MCP tool schemas, auto-generated from the server.

## Table of Contents

- [Common Parameters](#common-parameters)
- [Tool Schemas](#tool-schemas-generated)
- [See Also](#see-also)

---

## MCP Tools

All MCP tools use action-based requests:

```json
{ "action": "<action-name>", "...": "parameters" }
```

### Common Parameters

| Parameter   | Type                                  | Description                      |
| ----------- | ------------------------------------- | -------------------------------- |
| `scopeType` | `global \| org \| project \| session` | Scope level                      |
| `scopeId`   | string                                | Required for non-global scopes   |
| `inherit`   | boolean                               | Include parent scopes in queries |

### Tool Schemas (Generated)

<!-- AUTO-GENERATED:MCP-TOOLS-START -->

### Tool Index

| Tool                  | Purpose                                                                           | Actions                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory`              | Natural language interface to memory. Store: "Remember X", Retrieve: "What abou…  | —                                                                                                                                                                                                                            |
| `memory_context`      | Unified context management for memory retrieval. Actions: - get: Retrieve conte…  | `get`, `budget-info`, `stats`, `show`, `refresh`                                                                                                                                                                             |
| `memory_discover`     | Discover hidden/advanced memory features with usage examples.                     | —                                                                                                                                                                                                                            |
| `memory_episode`      | Manage episodes - bounded temporal activity groupings for tracking "what happen…  | `begin`, `log`, `add`, `get`, `list`, `update`, `deactivate`, `delete`, `start`, `complete`, `fail`, `cancel`, `add_event`, `get_events`, `link_entity`, `get_linked`, `get_timeline`, `what_happened`, `trace_causal_chain` |
| `memory_evidence`     | Manage immutable evidence artifacts. Actions: add, get, list, deactivate, list\_… | `add`, `get`, `list`, `deactivate`, `list_by_type`, `list_by_source`                                                                                                                                                         |
| `memory_graph_status` | Get diagnostic information about the knowledge graph's current state. Returns:…   | `status`                                                                                                                                                                                                                     |
| `memory_guideline`    | Manage coding/behavioral guidelines. Actions: add, update, get, list, history,…   | `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`                                                                                                                  |
| `memory_knowledge`    | Manage knowledge entries (facts, decisions, context). Actions: add, update, get…  | `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`                                                                                                                  |
| `memory_librarian`    | Manage the Librarian Agent for pattern detection and promotion recommendations.…  | `analyze`, `status`, `run_maintenance`, `list_recommendations`, `show_recommendation`, `approve`, `reject`, `skip`, `get_job_status`, `list_jobs`                                                                            |
| `memory_onboard`      | Guided setup wizard for new projects. Auto-detects project info, imports docs a…  | —                                                                                                                                                                                                                            |
| `memory_org`          | Manage organizations. Actions: create, list                                       | `create`, `list`                                                                                                                                                                                                             |
| `memory_permission`   | Manage permissions. Actions: grant, revoke, check, list                           | `grant`, `revoke`, `check`, `list`                                                                                                                                                                                           |
| `memory_project`      | Manage projects. Actions: create, list, get, update, delete                       | `create`, `list`, `get`, `update`, `delete`                                                                                                                                                                                  |
| `memory_query`        | Query and aggregate memory. Actions: search, context                              | `search`, `context`                                                                                                                                                                                                          |
| `memory_quickstart`   | One-call setup for memory context and session. Auto-detects project from cwd. C…  | —                                                                                                                                                                                                                            |
| `memory_relation`     | Manage entry relations. Actions: create, list, delete                             | `create`, `list`, `delete`                                                                                                                                                                                                   |
| `memory_remember`     | Store memories using natural language. Auto-detects type (guideline, knowledge,…  | —                                                                                                                                                                                                                            |
| `memory_session`      | Manage working sessions. Actions: start, end, list                                | `start`, `end`, `list`                                                                                                                                                                                                       |
| `memory_status`       | Get a compact dashboard of your memory status. Returns project info, active ses…  | —                                                                                                                                                                                                                            |
| `memory_tag`          | Manage tags. Actions: create, list, attach, detach, for_entry                     | `create`, `list`, `attach`, `detach`, `for_entry`                                                                                                                                                                            |
| `memory_task`         | Manage work items (bugs, features, tasks). Actions: add, update, get, list, dea…  | `add`, `update`, `get`, `list`, `deactivate`, `delete`, `update_status`, `list_by_status`, `list_blocked`, `add_blocker`, `remove_blocker`, `get_subtasks`, `preview`, `confirm`, `reject`                                   |
| `memory_tool`         | Manage tool definitions (reusable patterns). Actions: add, update, get, list, h…  | `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`                                                                                                                  |
| `memory_walkthrough`  | Interactive step-by-step tutorial for Agent Memory. Guides new users through co…  | `start`, `next`, `prev`, `goto`, `status`, `reset`                                                                                                                                                                           |

### `memory`

Natural language interface to memory. Store: "Remember X", Retrieve: "What about X?", Session: "Start/end task"

- Actions: —

| Parameter     | Type    | Required | Description              |
| ------------- | ------- | -------: | ------------------------ |
| `agentId`     | string  |          |                          |
| `analyzeOnly` | boolean |          |                          |
| `projectId`   | string  |          |                          |
| `sessionId`   | string  |          |                          |
| `text`        | string  |      yes | Natural language request |

### `memory_context`

Unified context management for memory retrieval. Actions: - get: Retrieve context for a specific purpose (session_start, tool_injection, query, custom) - budget-info: Get budget c…

- Actions: `get`, `budget-info`, `stats`, `show`, `refresh`

| Parameter      | Type                                                              | Required | Description                                                                       |
| -------------- | ----------------------------------------------------------------- | -------: | --------------------------------------------------------------------------------- |
| `budget`       | number                                                            |          | Token budget override (or "auto" for purpose-based)                               |
| `complexity`   | string (`simple`, `moderate`, `complex`, `critical`)              |          | Task complexity (for custom purpose)                                              |
| `excludeStale` | boolean                                                           |          | Exclude stale entries from output                                                 |
| `format`       | string (`markdown`, `json`, `natural_language`)                   |          | Output format (default: markdown)                                                 |
| `include`      | array<string (`guidelines`, `knowledge`, `tools`, `experiences`)> |          | Entry types to include (default: all for purpose)                                 |
| `maxEntries`   | number                                                            |          | Maximum entries to return (soft limit)                                            |
| `mintoStyle`   | boolean                                                           |          | Use Minto Pyramid format (default: true). Set false for verbose dashboard output. |
| `projectId`    | string                                                            |          | Project ID (can differ from scopeId for session scope)                            |
| `purpose`      | string (`session_start`, `tool_injection`, `query`, `custom`)     |          | Purpose determines budget and behavior                                            |
| `query`        | string                                                            |          | Query text (optional for query purpose)                                           |
| `scopeId`      | string                                                            |          | Scope ID (required for non-global scopes)                                         |
| `scopeType`    | string (`global`, `org`, `project`, `session`)                    |          | Scope type for context retrieval                                                  |
| `sessionId`    | string                                                            |          | Session ID for session-scoped queries                                             |
| `toolName`     | string                                                            |          | Tool name (required for tool_injection purpose)                                   |

### `memory_discover`

Discover hidden/advanced memory features with usage examples.

- Actions: —

| Parameter    | Type                                                           | Required | Description                                                                       |
| ------------ | -------------------------------------------------------------- | -------: | --------------------------------------------------------------------------------- |
| `filter`     | string (`all`, `advanced`, `system`, `graph`, `summarization`) |          | Filter by feature category (default: all)                                         |
| `mintoStyle` | boolean                                                        |          | Use Minto Pyramid format (default: true). Set false for verbose dashboard output. |

### `memory_episode`

Manage episodes - bounded temporal activity groupings for tracking "what happened during X?" and causal chains. **Quick Start (recommended):** ``` {"action":"begin","sessionId":"s…

- Actions: `begin`, `log`, `add`, `get`, `list`, `update`, `deactivate`, `delete`, `start`, `complete`, `fail`, `cancel`, `add_event`, `get_events`, `link_entity`, `get_linked`, `get_timeline`, `what_happened`, `trace_causal_chain`

| Parameter         | Type                                                             | Required | Description                                                                                 |
| ----------------- | ---------------------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------- |
| `agentId`         | string                                                           |          | Agent identifier (required for writes)                                                      |
| `createdBy`       | string                                                           |          | Creator identifier                                                                          |
| `data`            | object                                                           |          | Event data (JSON)                                                                           |
| `description`     | string                                                           |          | Episode description                                                                         |
| `direction`       | string (`forward`, `backward`)                                   |          | Direction for causal chain traversal                                                        |
| `end`             | string                                                           |          | End timestamp for timeline range (ISO 8601)                                                 |
| `entryId`         | string                                                           |          | Entry ID for linked entity                                                                  |
| `entryType`       | string                                                           |          | Entry type for linked entity ('guideline', 'knowledge', 'tool', 'experience')               |
| `episodeId`       | string                                                           |          | Episode ID (alias for id, for backward compatibility)                                       |
| `eventType`       | string                                                           |          | Event type: 'started', 'checkpoint', 'decision', 'error', 'completed' (default: checkpoint) |
| `id`              | string                                                           |          | Episode ID                                                                                  |
| `includeInactive` | boolean                                                          |          | Include deactivated episodes                                                                |
| `limit`           | number                                                           |          | Max results to return                                                                       |
| `maxDepth`        | number                                                           |          | Maximum depth for causal chain traversal (default: 10)                                      |
| `message`         | string                                                           |          | Event message (for log action)                                                              |
| `metadata`        | object                                                           |          | Additional metadata                                                                         |
| `name`            | string                                                           |          | Episode name                                                                                |
| `offset`          | number                                                           |          | Skip N results                                                                              |
| `outcome`         | string                                                           |          | Episode outcome description                                                                 |
| `outcomeType`     | string (`success`, `partial`, `failure`, `abandoned`)            |          | Episode outcome type                                                                        |
| `parentEpisodeId` | string                                                           |          | Parent episode ID for hierarchical episodes                                                 |
| `reason`          | string                                                           |          | Reason for cancellation                                                                     |
| `role`            | string                                                           |          | Role of linked entity ('created', 'modified', 'referenced')                                 |
| `scopeId`         | string                                                           |          | Scope ID (required for non-global scopes)                                                   |
| `scopeType`       | string (`global`, `org`, `project`, `session`)                   |          | Scope type (default: project)                                                               |
| `sessionId`       | string                                                           |          | Session ID                                                                                  |
| `start`           | string                                                           |          | Start timestamp for timeline range (ISO 8601)                                               |
| `status`          | string (`planned`, `active`, `completed`, `failed`, `cancelled`) |          | Filter by status                                                                            |
| `tags`            | array<string>                                                    |          | Episode tags                                                                                |
| `triggerRef`      | string                                                           |          | Reference to the trigger (e.g., task ID, event ID)                                          |
| `triggerType`     | string                                                           |          | What triggered this episode ('user_request', 'system_event', 'scheduled')                   |

### `memory_evidence`

Manage immutable evidence artifacts. Actions: add, get, list, deactivate, list_by_type, list_by_source. IMMUTABLE: no update action.

- Actions: `add`, `get`, `list`, `deactivate`, `list_by_type`, `list_by_source`

| Parameter         | Type                                                                                                 | Required | Description         |
| ----------------- | ---------------------------------------------------------------------------------------------------- | -------: | ------------------- |
| `agentId`         | string                                                                                               |          | Required for writes |
| `baseline`        | number                                                                                               |          |                     |
| `capturedAt`      | string                                                                                               |          |                     |
| `capturedBy`      | string                                                                                               |          |                     |
| `checksum`        | string                                                                                               |          |                     |
| `content`         | string                                                                                               |          |                     |
| `createdBy`       | string                                                                                               |          |                     |
| `description`     | string                                                                                               |          |                     |
| `endLine`         | number                                                                                               |          |                     |
| `evidenceType`    | string (`screenshot`, `log`, `snippet`, `output`, `benchmark`, `link`, `document`, `quote`, `other`) |          |                     |
| `fileName`        | string                                                                                               |          |                     |
| `filePath`        | string                                                                                               |          |                     |
| `fileSize`        | number                                                                                               |          |                     |
| `id`              | string                                                                                               |          |                     |
| `includeInactive` | boolean                                                                                              |          |                     |
| `inherit`         | boolean                                                                                              |          |                     |
| `language`        | string                                                                                               |          |                     |
| `limit`           | number                                                                                               |          |                     |
| `metadata`        | object                                                                                               |          |                     |
| `metric`          | string                                                                                               |          |                     |
| `mimeType`        | string                                                                                               |          |                     |
| `offset`          | number                                                                                               |          |                     |
| `scopeId`         | string                                                                                               |          |                     |
| `scopeType`       | string (`global`, `org`, `project`, `session`)                                                       |          |                     |
| `source`          | string                                                                                               |          |                     |
| `sourceFile`      | string                                                                                               |          |                     |
| `startLine`       | number                                                                                               |          |                     |
| `tags`            | array<string>                                                                                        |          |                     |
| `title`           | string                                                                                               |          |                     |
| `unit`            | string                                                                                               |          |                     |
| `url`             | string                                                                                               |          |                     |
| `value`           | number                                                                                               |          |                     |

### `memory_graph_status`

Get diagnostic information about the knowledge graph's current state. Returns: - Node type count and names (builtin vs custom) - Edge type count and names (builtin vs custom) - Cu…

- Actions: `status`
- Parameters: (none)

### `memory_guideline`

Manage coding/behavioral guidelines. Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete

- Actions: `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`

| Parameter         | Type                                           | Required | Description         |
| ----------------- | ---------------------------------------------- | -------: | ------------------- |
| `agentId`         | string                                         |          | Required for writes |
| `category`        | string                                         |          |                     |
| `changeReason`    | string                                         |          |                     |
| `content`         | string                                         |          |                     |
| `createdBy`       | string                                         |          |                     |
| `examples`        | object                                         |          |                     |
| `id`              | string                                         |          |                     |
| `includeInactive` | boolean                                        |          |                     |
| `inherit`         | boolean                                        |          |                     |
| `limit`           | number                                         |          |                     |
| `name`            | string                                         |          |                     |
| `offset`          | number                                         |          |                     |
| `priority`        | number                                         |          |                     |
| `rationale`       | string                                         |          |                     |
| `scopeId`         | string                                         |          |                     |
| `scopeType`       | string (`global`, `org`, `project`, `session`) |          |                     |
| `updatedBy`       | string                                         |          |                     |

### `memory_knowledge`

Manage knowledge entries (facts, decisions, context). Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete

- Actions: `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`

| Parameter         | Type                                                | Required | Description         |
| ----------------- | --------------------------------------------------- | -------: | ------------------- |
| `agentId`         | string                                              |          | Required for writes |
| `category`        | string (`decision`, `fact`, `context`, `reference`) |          |                     |
| `changeReason`    | string                                              |          |                     |
| `confidence`      | number                                              |          |                     |
| `content`         | string                                              |          |                     |
| `createdBy`       | string                                              |          |                     |
| `id`              | string                                              |          |                     |
| `includeInactive` | boolean                                             |          |                     |
| `inherit`         | boolean                                             |          |                     |
| `invalidatedBy`   | string                                              |          |                     |
| `limit`           | number                                              |          |                     |
| `offset`          | number                                              |          |                     |
| `scopeId`         | string                                              |          |                     |
| `scopeType`       | string (`global`, `org`, `project`, `session`)      |          |                     |
| `source`          | string                                              |          |                     |
| `title`           | string                                              |          |                     |
| `updatedBy`       | string                                              |          |                     |
| `validFrom`       | string                                              |          |                     |
| `validUntil`      | string                                              |          |                     |

### `memory_librarian`

Manage the Librarian Agent for pattern detection and promotion recommendations. Actions: - analyze: Run pattern detection analysis on experiences - status: Get librarian service a…

- Actions: `analyze`, `status`, `run_maintenance`, `list_recommendations`, `show_recommendation`, `approve`, `reject`, `skip`, `get_job_status`, `list_jobs`

| Parameter               | Type                                                 | Required | Description                                                                                                             |
| ----------------------- | ---------------------------------------------------- | -------: | ----------------------------------------------------------------------------------------------------------------------- |
| `dryRun`                | boolean                                              |          | If true, analyze without making changes                                                                                 |
| `initiatedBy`           | string                                               |          | Who initiated this maintenance run                                                                                      |
| `jobId`                 | string                                               |          | Job ID to get status for                                                                                                |
| `limit`                 | number                                               |          | Maximum results to return                                                                                               |
| `lookbackDays`          | number                                               |          | Days to look back for experiences (default: 30)                                                                         |
| `mergeIntoExperienceId` | string                                               |          | Merge into existing strategy instead of creating new. Pass the experience ID of the existing strategy.                  |
| `mergeStrategy`         | string (`append`, `replace`, `increment`)            |          | How to merge: append (add source cases to existing), replace (overwrite pattern text), increment (just bump confidence) |
| `minConfidence`         | number                                               |          | Filter by minimum confidence                                                                                            |
| `notes`                 | string                                               |          | Review notes                                                                                                            |
| `offset`                | number                                               |          | Results to skip                                                                                                         |
| `recommendationId`      | string                                               |          | Recommendation ID                                                                                                       |
| `reviewedBy`            | string                                               |          | Reviewer identifier                                                                                                     |
| `scopeId`               | string                                               |          | Scope ID                                                                                                                |
| `scopeType`             | string (`global`, `org`, `project`, `session`)       |          | Scope type                                                                                                              |
| `status`                | string (`pending`, `running`, `completed`, `failed`) |          | Filter by job status                                                                                                    |
| `tasks`                 | array<string>                                        |          | Which tasks to run (defaults to all): consolidation, forgetting, graphBackfill                                          |

### `memory_onboard`

Guided setup wizard for new projects. Auto-detects project info, imports docs as knowledge, and seeds tech-stack-specific guidelines. Call with no params for full auto-detection,…

- Actions: —

| Parameter        | Type                                                            | Required | Description                                                                       |
| ---------------- | --------------------------------------------------------------- | -------: | --------------------------------------------------------------------------------- |
| `dryRun`         | boolean                                                         |          | Preview what would be done without making changes (default: false)                |
| `importDocs`     | boolean                                                         |          | Import documentation files as knowledge entries (default: true)                   |
| `mintoStyle`     | boolean                                                         |          | Use Minto Pyramid format (default: true). Set false for verbose dashboard output. |
| `projectName`    | string                                                          |          | Override detected project name                                                    |
| `seedGuidelines` | boolean                                                         |          | Seed best-practice guidelines based on tech stack (default: true)                 |
| `skipSteps`      | array<string (`createProject`, `importDocs`, `seedGuidelines`)> |          | Steps to skip: createProject, importDocs, seedGuidelines                          |

### `memory_org`

Manage organizations. Actions: create, list

- Actions: `create`, `list`

| Parameter  | Type   | Required | Description |
| ---------- | ------ | -------: | ----------- |
| `limit`    | number |          |             |
| `metadata` | object |          |             |
| `name`     | string |          |             |
| `offset`   | number |          |             |

### `memory_permission`

Manage permissions. Actions: grant, revoke, check, list

- Actions: `grant`, `revoke`, `check`, `list`

| Parameter       | Type                                           | Required | Description |
| --------------- | ---------------------------------------------- | -------: | ----------- |
| `admin_key`     | string                                         |          |             |
| `agent_id`      | string                                         |          |             |
| `created_by`    | string                                         |          |             |
| `entry_type`    | string (`tool`, `guideline`, `knowledge`)      |          |             |
| `limit`         | number                                         |          |             |
| `offset`        | number                                         |          |             |
| `permission`    | string (`read`, `write`, `admin`)              |          |             |
| `permission_id` | string                                         |          |             |
| `scope_id`      | string                                         |          |             |
| `scope_type`    | string (`global`, `org`, `project`, `session`) |          |             |

### `memory_project`

Manage projects. Actions: create, list, get, update, delete

- Actions: `create`, `list`, `get`, `update`, `delete`

| Parameter     | Type    | Required | Description                                   |
| ------------- | ------- | -------: | --------------------------------------------- |
| `admin_key`   | string  |          | Admin key (required for create/update/delete) |
| `confirm`     | boolean |          | Confirmation flag (required for delete)       |
| `description` | string  |          | Project description                           |
| `id`          | string  |          | Project ID (get, update, delete)              |
| `limit`       | number  |          |                                               |
| `metadata`    | object  |          | Optional metadata                             |
| `name`        | string  |          | Project name                                  |
| `offset`      | number  |          |                                               |
| `orgId`       | string  |          | Parent organization ID                        |
| `rootPath`    | string  |          | Filesystem root path                          |

### `memory_query`

Query and aggregate memory. Actions: search, context

- Actions: `search`, `context`

| Parameter           | Type                                               | Required | Description                                                                                       |
| ------------------- | -------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------------- |
| `agentId`           | string                                             |          |                                                                                                   |
| `atTime`            | string                                             |          | ISO timestamp for temporal filter                                                                 |
| `compact`           | boolean                                            |          |                                                                                                   |
| `createdAfter`      | string                                             |          |                                                                                                   |
| `createdBefore`     | string                                             |          |                                                                                                   |
| `explain`           | boolean                                            |          | Return nested explain output with score breakdowns, stage timing, and reasoning (default: false). |
| `fields`            | array<string>                                      |          |                                                                                                   |
| `followRelations`   | boolean                                            |          |                                                                                                   |
| `fuzzy`             | boolean                                            |          |                                                                                                   |
| `hierarchical`      | boolean                                            |          | Return ~1.5k token summary instead of ~15k full entries                                           |
| `includeInactive`   | boolean                                            |          |                                                                                                   |
| `includeVersions`   | boolean                                            |          |                                                                                                   |
| `inherit`           | boolean                                            |          | Include parent scopes (default true)                                                              |
| `limit`             | number                                             |          |                                                                                                   |
| `mintoStyle`        | boolean                                            |          | Use Minto Pyramid format for context action (default: true). Set false for verbose output.        |
| `priority`          | object                                             |          |                                                                                                   |
| `regex`             | boolean                                            |          |                                                                                                   |
| `relatedTo`         | object                                             |          |                                                                                                   |
| `scope`             | object                                             |          |                                                                                                   |
| `scopeId`           | string                                             |          |                                                                                                   |
| `scopeType`         | string (`global`, `org`, `project`, `session`)     |          |                                                                                                   |
| `search`            | string                                             |          | Free-text search                                                                                  |
| `semanticSearch`    | boolean                                            |          |                                                                                                   |
| `semanticThreshold` | number                                             |          |                                                                                                   |
| `tags`              | object                                             |          |                                                                                                   |
| `types`             | array<string (`tools`, `guidelines`, `knowledge`)> |          |                                                                                                   |
| `updatedAfter`      | string                                             |          |                                                                                                   |
| `updatedBefore`     | string                                             |          |                                                                                                   |
| `useFts5`           | boolean                                            |          |                                                                                                   |
| `validDuring`       | object                                             |          |                                                                                                   |

### `memory_quickstart`

One-call setup for memory context and session. Auto-detects project from cwd. Can also create projects and grant permissions in a single call.

- Actions: —

| Parameter            | Type                                   | Required | Description                                                                                                                                                 |
| -------------------- | -------------------------------------- | -------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentId`            | string                                 |          |                                                                                                                                                             |
| `autoEpisode`        | boolean                                |          | Auto-create episode when sessionName indicates substantive work (default: true). Triggers on patterns like "fix bug", "implement feature", "refactor", etc. |
| `createProject`      | boolean                                |          | Create project if it does not exist (requires projectName)                                                                                                  |
| `displayMode`        | string (`compact`, `standard`, `full`) |          | Display verbosity: compact (1-line summary), standard (boxed sections, default), full (with hints)                                                          |
| `grantPermissions`   | boolean                                |          | Grant permissions to agent (default: true when createProject)                                                                                               |
| `inherit`            | boolean                                |          |                                                                                                                                                             |
| `limitPerType`       | number                                 |          |                                                                                                                                                             |
| `mintoStyle`         | boolean                                |          | Use Minto Pyramid format (default: true). Set false for verbose dashboard output.                                                                           |
| `permissionLevel`    | string (`read`, `write`, `admin`)      |          | Permission level to grant (default: write)                                                                                                                  |
| `projectDescription` | string                                 |          | Description for new project                                                                                                                                 |
| `projectId`          | string                                 |          |                                                                                                                                                             |
| `projectName`        | string                                 |          | Name for new project (required if createProject)                                                                                                            |
| `rootPath`           | string                                 |          | Root path for project (auto-detected from cwd if not provided)                                                                                              |
| `sessionName`        | string                                 |          | Start session with this name                                                                                                                                |
| `sessionPurpose`     | string                                 |          |                                                                                                                                                             |
| `verbose`            | boolean                                |          | Return full context instead of hierarchical summary (default: false)                                                                                        |

### `memory_relation`

Manage entry relations. Actions: create, list, delete

- Actions: `create`, `list`, `delete`

| Parameter      | Type                                                                                                            | Required | Description |
| -------------- | --------------------------------------------------------------------------------------------------------------- | -------: | ----------- |
| `agentId`      | string                                                                                                          |          |             |
| `createdBy`    | string                                                                                                          |          |             |
| `id`           | string                                                                                                          |          |             |
| `limit`        | number                                                                                                          |          |             |
| `offset`       | number                                                                                                          |          |             |
| `relationType` | string (`applies_to`, `depends_on`, `conflicts_with`, `related_to`, `parent_task`, `subtask_of`, `promoted_to`) |          |             |
| `sourceId`     | string                                                                                                          |          |             |
| `sourceType`   | string (`tool`, `guideline`, `knowledge`, `project`, `experience`)                                              |          |             |
| `targetId`     | string                                                                                                          |          |             |
| `targetType`   | string (`tool`, `guideline`, `knowledge`, `project`, `experience`)                                              |          |             |

### `memory_remember`

Store memories using natural language. Auto-detects type (guideline, knowledge, tool) and category.

- Actions: —

| Parameter   | Type                                      | Required | Description      |
| ----------- | ----------------------------------------- | -------: | ---------------- |
| `forceType` | string (`guideline`, `knowledge`, `tool`) |          |                  |
| `priority`  | number                                    |          |                  |
| `tags`      | array<string>                             |          |                  |
| `text`      | string                                    |      yes | What to remember |

### `memory_session`

Manage working sessions. Actions: start, end, list

- Actions: `start`, `end`, `list`

| Parameter   | Type                                                  | Required | Description |
| ----------- | ----------------------------------------------------- | -------: | ----------- |
| `agentId`   | string                                                |          |             |
| `id`        | string                                                |          |             |
| `limit`     | number                                                |          |             |
| `metadata`  | object                                                |          |             |
| `name`      | string                                                |          |             |
| `offset`    | number                                                |          |             |
| `projectId` | string                                                |          |             |
| `purpose`   | string                                                |          |             |
| `status`    | string (`completed`, `discarded`, `active`, `paused`) |          |             |

### `memory_status`

Get a compact dashboard of your memory status. Returns project info, active session, and entry counts in one call. Use this instead of multiple list calls to understand memory sta…

- Actions: —

| Parameter           | Type    | Required | Description                                                                       |
| ------------------- | ------- | -------: | --------------------------------------------------------------------------------- |
| `includeTopEntries` | boolean |          | Include top 5 entries per type (default: false)                                   |
| `mintoStyle`        | boolean |          | Use Minto Pyramid format (default: true). Set false for verbose dashboard output. |

### `memory_tag`

Manage tags. Actions: create, list, attach, detach, for_entry

- Actions: `create`, `list`, `attach`, `detach`, `for_entry`

| Parameter      | Type                                                        | Required | Description |
| -------------- | ----------------------------------------------------------- | -------: | ----------- |
| `agentId`      | string                                                      |          |             |
| `category`     | string (`language`, `domain`, `category`, `meta`, `custom`) |          |             |
| `description`  | string                                                      |          |             |
| `entryId`      | string                                                      |          |             |
| `entryType`    | string (`tool`, `guideline`, `knowledge`, `project`)        |          |             |
| `isPredefined` | boolean                                                     |          |             |
| `limit`        | number                                                      |          |             |
| `name`         | string                                                      |          |             |
| `offset`       | number                                                      |          |             |
| `tagId`        | string                                                      |          |             |
| `tagName`      | string                                                      |          |             |

### `memory_task`

Manage work items (bugs, features, tasks). Actions: add, update, get, list, deactivate, delete, update_status, list_by_status, list_blocked, add_blocker, remove_blocker, get_subta…

- Actions: `add`, `update`, `get`, `list`, `deactivate`, `delete`, `update_status`, `list_by_status`, `list_blocked`, `add_blocker`, `remove_blocker`, `get_subtasks`, `preview`, `confirm`, `reject`

| Parameter          | Type                                                                              | Required | Description                           |
| ------------------ | --------------------------------------------------------------------------------- | -------: | ------------------------------------- |
| `actualMinutes`    | number                                                                            |          |                                       |
| `agentId`          | string                                                                            |          | Required for writes                   |
| `assignee`         | string                                                                            |          |                                       |
| `blockerId`        | string                                                                            |          |                                       |
| `category`         | string                                                                            |          |                                       |
| `createdBy`        | string                                                                            |          |                                       |
| `description`      | string                                                                            |          |                                       |
| `dueDate`          | string                                                                            |          |                                       |
| `endLine`          | number                                                                            |          |                                       |
| `estimatedMinutes` | number                                                                            |          |                                       |
| `file`             | string                                                                            |          |                                       |
| `id`               | string                                                                            |          |                                       |
| `includeInactive`  | boolean                                                                           |          |                                       |
| `inherit`          | boolean                                                                           |          |                                       |
| `limit`            | number                                                                            |          |                                       |
| `metadata`         | object                                                                            |          |                                       |
| `offset`           | number                                                                            |          |                                       |
| `parentTaskId`     | string                                                                            |          |                                       |
| `previewId`        | string                                                                            |          | Preview ID for confirm/reject actions |
| `reporter`         | string                                                                            |          |                                       |
| `resolution`       | string                                                                            |          |                                       |
| `scopeId`          | string                                                                            |          |                                       |
| `scopeType`        | string (`global`, `org`, `project`, `session`)                                    |          |                                       |
| `severity`         | string (`critical`, `high`, `medium`, `low`)                                      |          |                                       |
| `startLine`        | number                                                                            |          |                                       |
| `status`           | string (`backlog`, `open`, `in_progress`, `blocked`, `review`, `done`, `wont_do`) |          |                                       |
| `tags`             | array<string>                                                                     |          |                                       |
| `taskDomain`       | string (`agent`, `physical`)                                                      |          |                                       |
| `taskType`         | string (`bug`, `feature`, `improvement`, `debt`, `research`, `question`, `other`) |          |                                       |
| `title`            | string                                                                            |          |                                       |
| `updatedBy`        | string                                                                            |          |                                       |
| `urgency`          | string (`immediate`, `soon`, `normal`, `later`)                                   |          |                                       |

### `memory_tool`

Manage tool definitions (reusable patterns). Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete

- Actions: `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`

| Parameter         | Type                                           | Required | Description         |
| ----------------- | ---------------------------------------------- | -------: | ------------------- |
| `agentId`         | string                                         |          | Required for writes |
| `category`        | string (`mcp`, `cli`, `function`, `api`)       |          |                     |
| `changeReason`    | string                                         |          |                     |
| `constraints`     | string                                         |          |                     |
| `createdBy`       | string                                         |          |                     |
| `description`     | string                                         |          |                     |
| `examples`        | array<object>                                  |          |                     |
| `id`              | string                                         |          |                     |
| `includeInactive` | boolean                                        |          |                     |
| `inherit`         | boolean                                        |          |                     |
| `limit`           | number                                         |          |                     |
| `name`            | string                                         |          |                     |
| `offset`          | number                                         |          |                     |
| `parameters`      | object                                         |          |                     |
| `scopeId`         | string                                         |          |                     |
| `scopeType`       | string (`global`, `org`, `project`, `session`) |          |                     |
| `updatedBy`       | string                                         |          |                     |

### `memory_walkthrough`

Interactive step-by-step tutorial for Agent Memory. Guides new users through concepts, setup, and first-time usage. Use action:"start" to begin or resume, action:"next" to advance.

- Actions: `start`, `next`, `prev`, `goto`, `status`, `reset`

| Parameter | Type                                                                                            | Required | Description                              |
| --------- | ----------------------------------------------------------------------------------------------- | -------: | ---------------------------------------- |
| `step`    | string (`welcome`, `project_setup`, `first_memory`, `querying`, `sessions`, `tips`, `complete`) |          | Step to jump to (only for action:"goto") |

<!-- AUTO-GENERATED:MCP-TOOLS-END -->

---

## See Also

- [REST API Reference](rest-api.md) - HTTP API for non-MCP integrations
- [CLI Reference](cli.md) - Command-line interface
- [Environment Variables](environment-variables.md) - All configuration options
- [Tutorials](../tutorials/quickstart.md) - Getting started guide
- [Architecture](../explanation/architecture.md) - System design
