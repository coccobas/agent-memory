---
description: Agent Memory tool parameters - consult when needing parameter details
globs: []
alwaysApply: false
---

# Agent Memory Parameter Reference

> Auto-generated from 50 MCP tool descriptors.
> Do not edit manually - run `npm run generate:rules` to update.

## Quick Index

| Tool                                                      | Actions                                                                 | Visibility   |
| --------------------------------------------------------- | ----------------------------------------------------------------------- | ------------ |
| [`graph_edge`](#graph_edge)                               | 8 actions                                                               | advanced     |
| [`graph_node`](#graph_node)                               | 8 actions                                                               | advanced     |
| [`memory`](#memory)                                       | —                                                                       | core         |
| [`memory_analytics`](#memory_analytics)                   | 9 actions                                                               | advanced     |
| [`memory_backup`](#memory_backup)                         | `create`, `list`, `cleanup`, `restore`                                  | system       |
| [`memory_conflict`](#memory_conflict)                     | `list`, `resolve`                                                       | system       |
| [`memory_consolidate`](#memory_consolidate)               | `find_similar`, `dedupe`, `merge`, `abstract`, `archive_stale`          | advanced     |
| [`memory_context`](#memory_context)                       | —                                                                       | advanced     |
| [`memory_conversation`](#memory_conversation)             | 10 actions                                                              | advanced     |
| [`memory_decomposition`](#memory_decomposition)           | `add`, `get`, `list`                                                    | advanced     |
| [`memory_discover`](#memory_discover)                     | —                                                                       | standard     |
| [`memory_episode`](#memory_episode)                       | 19 actions                                                              | standard     |
| [`memory_evidence`](#memory_evidence)                     | 6 actions                                                               | standard     |
| [`memory_experience`](#memory_experience)                 | 17 actions                                                              | advanced     |
| [`memory_export`](#memory_export)                         | `export`                                                                | system       |
| [`memory_extraction_approve`](#memory_extraction_approve) | —                                                                       | advanced     |
| [`memory_feedback`](#memory_feedback)                     | `list_retrievals`, `list_outcomes`, `list_decisions`, `export`, `stats` | advanced     |
| [`memory_file_lock`](#memory_file_lock)                   | `checkout`, `checkin`, `status`, `list`, `force_unlock`                 | advanced     |
| [`memory_forget`](#memory_forget)                         | `analyze`, `forget`, `status`                                           | advanced     |
| [`memory_graph_status`](#memory_graph_status)             | `status`                                                                | standard     |
| [`memory_guideline`](#memory_guideline)                   | 10 actions                                                              | standard     |
| [`memory_health`](#memory_health)                         | —                                                                       | system       |
| [`memory_hook`](#memory_hook)                             | `generate`, `install`, `status`, `uninstall`                            | system       |
| [`memory_import`](#memory_import)                         | `import`                                                                | system       |
| [`memory_init`](#memory_init)                             | `init`, `status`, `reset`                                               | system       |
| [`memory_knowledge`](#memory_knowledge)                   | 10 actions                                                              | standard     |
| [`memory_latent`](#memory_latent)                         | 7 actions                                                               | advanced     |
| [`memory_librarian`](#memory_librarian)                   | 8 actions                                                               | core         |
| [`memory_lora`](#memory_lora)                             | `export`, `list_adapters`, `generate_script`                            | experimental |
| [`memory_observe`](#memory_observe)                       | `extract`, `draft`, `commit`, `status`                                  | advanced     |
| [`memory_onboard`](#memory_onboard)                       | —                                                                       | core         |
| [`memory_ops`](#memory_ops)                               | 6 actions                                                               | advanced     |
| [`memory_org`](#memory_org)                               | `create`, `list`                                                        | standard     |
| [`memory_permission`](#memory_permission)                 | `grant`, `revoke`, `check`, `list`                                      | standard     |
| [`memory_project`](#memory_project)                       | `create`, `list`, `get`, `update`, `delete`                             | standard     |
| [`memory_query`](#memory_query)                           | `search`, `context`                                                     | core         |
| [`memory_quickstart`](#memory_quickstart)                 | —                                                                       | core         |
| [`memory_relation`](#memory_relation)                     | `create`, `list`, `delete`                                              | standard     |
| [`memory_remember`](#memory_remember)                     | —                                                                       | core         |
| [`memory_review`](#memory_review)                         | `list`, `show`, `approve`, `reject`, `skip`                             | advanced     |
| [`memory_rl`](#memory_rl)                                 | 9 actions                                                               | experimental |
| [`memory_session`](#memory_session)                       | `start`, `end`, `list`                                                  | standard     |
| [`memory_status`](#memory_status)                         | —                                                                       | core         |

| [`memory_summarize`](#memory_summarize) | 6 actions | advanced |
| [`memory_tag`](#memory_tag) | `create`, `list`, `attach`, `detach`, `for_entry` | standard |
| [`memory_task`](#memory_task) | 12 actions | standard |
| [`memory_tool`](#memory_tool) | 10 actions | standard |
| [`memory_verify`](#memory_verify) | `pre_check`, `post_check`, `acknowledge`, `status` | system |
| [`memory_voting`](#memory_voting) | `record_vote`, `get_consensus`, `list_votes`, `get_stats` | experimental |

---

## Core Workflow

### memory_quickstart

One-call setup for memory context and session. Auto-detects project from cwd. Can also create projects and grant permissions in a single call.

| Parameter            | Type      |  Required  | Description                                                                                          |
| -------------------- | --------- | :--------: | ---------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------- |
| `agentId`            | string    |            |                                                                                                      |
| `autoEpisode`        | boolean   |            | Auto-create episode when sessionName indicates substantive work (default: true). Triggers on patter… |
| `createProject`      | boolean   |            | Create project if it does not exist (requires projectName)                                           |
| `displayMode`        | `compact` | `standard` | `full`                                                                                               |     | Display verbosity: compact (1-line summary), standard (boxed sections, default), full (with hints) |
| `grantPermissions`   | boolean   |            | Grant permissions to agent (default: true when createProject)                                        |
| `inherit`            | boolean   |            |                                                                                                      |
| `limitPerType`       | number    |            |                                                                                                      |
| `permissionLevel`    | `read`    |  `write`   | `admin`                                                                                              |     | Permission level to grant (default: write)                                                         |
| `projectDescription` | string    |            | Description for new project                                                                          |
| `projectId`          | string    |            |                                                                                                      |
| `projectName`        | string    |            | Name for new project (required if createProject)                                                     |
| `rootPath`           | string    |            | Root path for project (auto-detected from cwd if not provided)                                       |
| `sessionName`        | string    |            | Start session with this name                                                                         |
| `sessionPurpose`     | string    |            |                                                                                                      |
| `verbose`            | boolean   |            | Return full context instead of hierarchical summary (default: false)                                 |

---

### memory_remember

Store memories using natural language. Auto-detects type (guideline, knowledge, tool) and category.

| Parameter   | Type        |  Required   | Description      |
| ----------- | ----------- | :---------: | ---------------- | --- | --- |
| `text`      | string      |      ✓      | What to remember |
| `forceType` | `guideline` | `knowledge` | `tool`           |     |     |
| `priority`  | number      |             |                  |
| `tags`      | string[]    |             |                  |

---

### memory

Natural language interface to memory. Store: "Remember X", Retrieve: "What about X?", Session: "Start/end task"

| Parameter     | Type    | Required | Description              |
| ------------- | ------- | :------: | ------------------------ |
| `text`        | string  |    ✓     | Natural language request |
| `agentId`     | string  |          |                          |
| `analyzeOnly` | boolean |          |                          |
| `projectId`   | string  |          |                          |
| `sessionId`   | string  |          |                          |

---

### memory_status

Get a compact dashboard of your memory status.

| Parameter           | Type    | Required | Description                                     |
| ------------------- | ------- | :------: | ----------------------------------------------- |
| `includeTopEntries` | boolean |          | Include top 5 entries per type (default: false) |

---

## Entry Management

### memory_tool

Manage tool definitions (reusable patterns). Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete

**Actions:** `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`

| Parameter         | Type     | Required | Description         |
| ----------------- | -------- | :------: | ------------------- | --------- | --- | --- |
| `agentId`         | string   |          | Required for writes |
| `category`        | `mcp`    |  `cli`   | `function`          | `api`     |     |     |
| `changeReason`    | string   |          |                     |
| `constraints`     | string   |          |                     |
| `createdBy`       | string   |          |                     |
| `description`     | string   |          |                     |
| `examples`        | array    |          |                     |
| `id`              | string   |          |                     |
| `includeInactive` | boolean  |          |                     |
| `inherit`         | boolean  |          |                     |
| `limit`           | number   |          |                     |
| `name`            | string   |          |                     |
| `offset`          | number   |          |                     |
| `parameters`      | object   |          |                     |
| `scopeId`         | string   |          |                     |
| `scopeType`       | `global` |  `org`   | `project`           | `session` |     |     |
| `updatedBy`       | string   |          |                     |

---

### memory_guideline

Manage coding/behavioral guidelines. Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete

**Actions:** `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`

| Parameter         | Type     | Required | Description         |
| ----------------- | -------- | :------: | ------------------- | --------- | --- | --- |
| `agentId`         | string   |          | Required for writes |
| `category`        | string   |          |                     |
| `changeReason`    | string   |          |                     |
| `content`         | string   |          |                     |
| `createdBy`       | string   |          |                     |
| `examples`        | object   |          |                     |
| `id`              | string   |          |                     |
| `includeInactive` | boolean  |          |                     |
| `inherit`         | boolean  |          |                     |
| `limit`           | number   |          |                     |
| `name`            | string   |          |                     |
| `offset`          | number   |          |                     |
| `priority`        | number   |          |                     |
| `rationale`       | string   |          |                     |
| `scopeId`         | string   |          |                     |
| `scopeType`       | `global` |  `org`   | `project`           | `session` |     |     |
| `updatedBy`       | string   |          |                     |

---

### memory_knowledge

Manage knowledge entries (facts, decisions, context). Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete

**Actions:** `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`

| Parameter         | Type       | Required | Description         |
| ----------------- | ---------- | :------: | ------------------- | ----------- | --- | --- |
| `agentId`         | string     |          | Required for writes |
| `category`        | `decision` |  `fact`  | `context`           | `reference` |     |     |
| `changeReason`    | string     |          |                     |
| `confidence`      | number     |          |                     |
| `content`         | string     |          |                     |
| `createdBy`       | string     |          |                     |
| `id`              | string     |          |                     |
| `includeInactive` | boolean    |          |                     |
| `inherit`         | boolean    |          |                     |
| `invalidatedBy`   | string     |          |                     |
| `limit`           | number     |          |                     |
| `offset`          | number     |          |                     |
| `scopeId`         | string     |          |                     |
| `scopeType`       | `global`   |  `org`   | `project`           | `session`   |     |     |
| `source`          | string     |          |                     |
| `title`           | string     |          |                     |
| `updatedBy`       | string     |          |                     |
| `validFrom`       | string     |          |                     |
| `validUntil`      | string     |          |                     |

---

### memory_evidence

Manage immutable evidence artifacts. Actions: add, get, list, deactivate, list_by_type, list_by_source. IMMUTABLE: no update action.

**Actions:** `add`, `get`, `list`, `deactivate`, `list_by_type`, `list_by_source`

| Parameter         | Type          | Required | Description         |
| ----------------- | ------------- | :------: | ------------------- | --------- | --- | --- |
| `agentId`         | string        |          | Required for writes |
| `baseline`        | number        |          |                     |
| `capturedAt`      | string        |          |                     |
| `capturedBy`      | string        |          |                     |
| `checksum`        | string        |          |                     |
| `content`         | string        |          |                     |
| `createdBy`       | string        |          |                     |
| `description`     | string        |          |                     |
| `endLine`         | number        |          |                     |
| `evidenceType`    | string (enum) |          |                     |
| `fileName`        | string        |          |                     |
| `filePath`        | string        |          |                     |
| `fileSize`        | number        |          |                     |
| `id`              | string        |          |                     |
| `includeInactive` | boolean       |          |                     |
| `inherit`         | boolean       |          |                     |
| `language`        | string        |          |                     |
| `limit`           | number        |          |                     |
| `metadata`        | object        |          |                     |
| `metric`          | string        |          |                     |
| `mimeType`        | string        |          |                     |
| `offset`          | number        |          |                     |
| `scopeId`         | string        |          |                     |
| `scopeType`       | `global`      |  `org`   | `project`           | `session` |     |     |
| `source`          | string        |          |                     |
| `sourceFile`      | string        |          |                     |
| `startLine`       | number        |          |                     |
| `tags`            | string[]      |          |                     |
| `title`           | string        |          |                     |
| `unit`            | string        |          |                     |
| `url`             | string        |          |                     |
| `value`           | number        |          |                     |

**evidenceType values:** `screenshot`, `log`, `snippet`, `output`, `benchmark`, `link`, `document`, `quote`, `other`

---

## Querying & Search

### memory_query

Query and aggregate memory. Actions: search, context

**Actions:** `search`, `context`

| Parameter           | Type     | Required | Description                                             |
| ------------------- | -------- | :------: | ------------------------------------------------------- | --------- | --- | --- |
| `agentId`           | string   |          |                                                         |
| `atTime`            | string   |          | ISO timestamp for temporal filter                       |
| `compact`           | boolean  |          |                                                         |
| `createdAfter`      | string   |          |                                                         |
| `createdBefore`     | string   |          |                                                         |
| `fields`            | string[] |          |                                                         |
| `followRelations`   | boolean  |          |                                                         |
| `fuzzy`             | boolean  |          |                                                         |
| `hierarchical`      | boolean  |          | Return ~1.5k token summary instead of ~15k full entries |
| `includeInactive`   | boolean  |          |                                                         |
| `includeVersions`   | boolean  |          |                                                         |
| `inherit`           | boolean  |          | Include parent scopes (default true)                    |
| `limit`             | number   |          |                                                         |
| `priority`          | object   |          |                                                         |
| `regex`             | boolean  |          |                                                         |
| `relatedTo`         | object   |          |                                                         |
| `scope`             | object   |          |                                                         |
| `scopeId`           | string   |          |                                                         |
| `scopeType`         | `global` |  `org`   | `project`                                               | `session` |     |     |
| `search`            | string   |          | Free-text search                                        |
| `semanticSearch`    | boolean  |          |                                                         |
| `semanticThreshold` | number   |          |                                                         |
| `tags`              | object   |          |                                                         |
| `types`             | string[] |          |                                                         |
| `updatedAfter`      | string   |          |                                                         |
| `updatedBefore`     | string   |          |                                                         |
| `useFts5`           | boolean  |          |                                                         |
| `validDuring`       | object   |          |                                                         |

---

### memory_discover

Discover hidden/advanced memory features with usage examples.

| Parameter | Type          | Required | Description                               |
| --------- | ------------- | :------: | ----------------------------------------- |
| `filter`  | string (enum) |          | Filter by feature category (default: all) |

**filter values:** `all`, `advanced`, `system`, `graph`, `summarization`

---

## Scope Management

### memory_org

Manage organizations. Actions: create, list

**Actions:** `create`, `list`

| Parameter  | Type   | Required | Description |
| ---------- | ------ | :------: | ----------- |
| `limit`    | number |          |             |
| `metadata` | object |          | (create)    |
| `name`     | string |          | (create)    |
| `offset`   | number |          |             |

---

### memory_project

Manage projects. Actions: create, list, get, update, delete

**Actions:** `create`, `list`, `get`, `update`, `delete`

| Parameter     | Type    | Required | Description                                   |
| ------------- | ------- | :------: | --------------------------------------------- |
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

---

### memory_session

Manage working sessions. Actions: start, end, list

**Actions:** `start`, `end`, `list`

| Parameter   | Type        |  Required   | Description |
| ----------- | ----------- | :---------: | ----------- | -------- | --- | --- |
| `agentId`   | string      |             |             |
| `id`        | string      |             |             |
| `limit`     | number      |             |             |
| `metadata`  | object      |             |             |
| `name`      | string      |             |             |
| `offset`    | number      |             |             |
| `projectId` | string      |             |             |
| `purpose`   | string      |             |             |
| `status`    | `completed` | `discarded` | `active`    | `paused` |     |     |

---

## Organization

### memory_tag

Manage tags. Actions: create, list, attach, detach, for_entry

**Actions:** `create`, `list`, `attach`, `detach`, `for_entry`

| Parameter      | Type          |  Required   | Description |
| -------------- | ------------- | :---------: | ----------- | --------- | --- | --- |
| `agentId`      | string        |             |             |
| `category`     | string (enum) |             |             |
| `description`  | string        |             |             |
| `entryId`      | string        |             |             |
| `entryType`    | `tool`        | `guideline` | `knowledge` | `project` |     |     |
| `isPredefined` | boolean       |             |             |
| `limit`        | number        |             |             |
| `name`         | string        |             |             |
| `offset`       | number        |             |             |
| `tagId`        | string        |             |             |
| `tagName`      | string        |             |             |

**category values:** `language`, `domain`, `category`, `meta`, `custom`

---

### memory_relation

Manage entry relations. Actions: create, list, delete

**Actions:** `create`, `list`, `delete`

| Parameter      | Type          | Required | Description |
| -------------- | ------------- | :------: | ----------- |
| `agentId`      | string        |          |             |
| `createdBy`    | string        |          |             |
| `id`           | string        |          |             |
| `limit`        | number        |          |             |
| `offset`       | number        |          |             |
| `relationType` | string (enum) |          |             |
| `sourceId`     | string        |          |             |
| `sourceType`   | string (enum) |          |             |
| `targetId`     | string        |          |             |
| `targetType`   | string (enum) |          |             |

**sourceType values:** `tool`, `guideline`, `knowledge`, `project`, `experience`

**targetType values:** `tool`, `guideline`, `knowledge`, `project`, `experience`

**relationType values:** `applies_to`, `depends_on`, `conflicts_with`, `related_to`, `parent_task`, `subtask_of`, `promoted_to`

---

## Tasks & Episodes

### memory_decomposition

Manage task decomposition - breaking down larger tasks into subtasks.

**Actions:** `add`, `get`, `list`

| Parameter               | Type          |  Required   | Description                               |
| ----------------------- | ------------- | :---------: | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------- |
| `createdBy`             | string        |             |                                           |
| `decompositionStrategy` | `maximal`     | `balanced`  | `minimal`                                 |                                                                                                      | Decomposition strategy (add) |
| `entryType`             | `task`        | `knowledge` |                                           | Target entry type: task (uses tasks table) or knowledge (uses knowledge entries with relations). De… |
| `limit`                 | number        |             |                                           |
| `offset`                | number        |             |                                           |
| `parentTask`            | string        |             | ID of parent task/knowledge entry (add)   |
| `parentTaskId`          | string        |             | Filter by parent task ID (list)           |
| `projectId`             | string        |             | For storing decomposition metadata (add)  |
| `scopeId`               | string        |             |                                           |
| `scopeType`             | `global`      |    `org`    | `project`                                 | `session`                                                                                            |                              |                                         |
| `severity`              | `critical`    |   `high`    | `medium`                                  | `low`                                                                                                |                              | Task severity (only for entryType=task) |
| `subtasks`              | string[]      |             | Array of subtask descriptions/names (add) |
| `taskDomain`            | `agent`       | `physical`  |                                           | Task domain: agent (auto-transitions) or physical (manual). Only for entryType=task                  |
| `taskId`                | string        |             | Task/knowledge ID (get)                   |
| `taskType`              | string (enum) |             | Task type (only for entryType=task)       |
| `urgency`               | `immediate`   |   `soon`    | `normal`                                  | `later`                                                                                              |                              | Task urgency (only for entryType=task)  |

**taskType values:** `bug`, `feature`, `improvement`, `debt`, `research`, `question`, `other`

---

### memory_task

Manage work items (bugs, features, tasks). Actions: add, update, get, list, deactivate, delete, update_status, list_by_status, list_blocked, get_subtasks, add_blocker, remove_blocker

**Actions:** `add`, `update`, `get`, `list`, `deactivate`, `delete`, `update_status`, `list_by_status`, `list_blocked`, `add_blocker`, `remove_blocker`, `get_subtasks`

| Parameter          | Type          |  Required  | Description         |
| ------------------ | ------------- | :--------: | ------------------- | --------- | --- | --- |
| `actualMinutes`    | number        |            |                     |
| `agentId`          | string        |            | Required for writes |
| `assignee`         | string        |            |                     |
| `blockerId`        | string        |            |                     |
| `category`         | string        |            |                     |
| `createdBy`        | string        |            |                     |
| `description`      | string        |            |                     |
| `dueDate`          | string        |            |                     |
| `endLine`          | number        |            |                     |
| `estimatedMinutes` | number        |            |                     |
| `file`             | string        |            |                     |
| `id`               | string        |            |                     |
| `includeInactive`  | boolean       |            |                     |
| `inherit`          | boolean       |            |                     |
| `limit`            | number        |            |                     |
| `metadata`         | object        |            |                     |
| `offset`           | number        |            |                     |
| `parentTaskId`     | string        |            |                     |
| `reporter`         | string        |            |                     |
| `resolution`       | string        |            |                     |
| `scopeId`          | string        |            |                     |
| `scopeType`        | `global`      |   `org`    | `project`           | `session` |     |     |
| `severity`         | `critical`    |   `high`   | `medium`            | `low`     |     |     |
| `startLine`        | number        |            |                     |
| `status`           | string (enum) |            |                     |
| `tags`             | string[]      |            |                     |
| `taskDomain`       | `agent`       | `physical` |                     |           |
| `taskType`         | string (enum) |            |                     |
| `title`            | string        |            |                     |
| `updatedBy`        | string        |            |                     |
| `urgency`          | `immediate`   |   `soon`   | `normal`            | `later`   |     |     |

**taskType values:** `bug`, `feature`, `improvement`, `debt`, `research`, `question`, `other`

**status values:** `backlog`, `open`, `in_progress`, `blocked`, `review`, `done`, `wont_do`

---

### memory_episode

Manage episodes - bounded temporal activity groupings for tracking "what happened during X?" and causal chains.

**Actions:** `begin`, `log`, `add`, `get`, `list`, `update`, `deactivate`, `delete`, `start`, `complete`, `fail`, `cancel`, `add_event`, `get_events`, `link_entity`, `get_linked`, `get_timeline`, `what_happened`, `trace_causal_chain`

| Parameter         | Type          |  Required  | Description                                                                                 |
| ----------------- | ------------- | :--------: | ------------------------------------------------------------------------------------------- | ------------------------------------ | --- | ----------------------------- |
| `agentId`         | string        |            | Agent identifier (required for writes)                                                      |
| `createdBy`       | string        |            | Creator identifier                                                                          |
| `data`            | object        |            | Event data (JSON)                                                                           |
| `description`     | string        |            | Episode description                                                                         |
| `direction`       | `forward`     | `backward` |                                                                                             | Direction for causal chain traversal |
| `end`             | string        |            | End timestamp for timeline range (ISO 8601)                                                 |
| `entryId`         | string        |            | Entry ID for linked entity                                                                  |
| `entryType`       | string        |            | Entry type for linked entity ('guideline', 'knowledge', 'tool', 'experience')               |
| `episodeId`       | string        |            | Episode ID (alias for id, for backward compatibility)                                       |
| `eventType`       | string        |            | Event type: 'started', 'checkpoint', 'decision', 'error', 'completed' (default: checkpoint) |
| `id`              | string        |            | Episode ID                                                                                  |
| `includeInactive` | boolean       |            | Include deactivated episodes                                                                |
| `limit`           | number        |            | Max results to return                                                                       |
| `maxDepth`        | number        |            | Maximum depth for causal chain traversal (default: 10)                                      |
| `message`         | string        |            | Event message (for log action)                                                              |
| `metadata`        | object        |            | Additional metadata                                                                         |
| `name`            | string        |            | Episode name                                                                                |
| `offset`          | number        |            | Skip N results                                                                              |
| `outcome`         | string        |            | Episode outcome description                                                                 |
| `outcomeType`     | `success`     | `partial`  | `failure`                                                                                   | `abandoned`                          |     | Episode outcome type          |
| `parentEpisodeId` | string        |            | Parent episode ID for hierarchical episodes                                                 |
| `reason`          | string        |            | Reason for cancellation                                                                     |
| `role`            | string        |            | Role of linked entity ('created', 'modified', 'referenced')                                 |
| `scopeId`         | string        |            | Scope ID (required for non-global scopes)                                                   |
| `scopeType`       | `global`      |   `org`    | `project`                                                                                   | `session`                            |     | Scope type (default: project) |
| `sessionId`       | string        |            | Session ID                                                                                  |
| `start`           | string        |            | Start timestamp for timeline range (ISO 8601)                                               |
| `status`          | string (enum) |            | Filter by status                                                                            |
| `tags`            | array         |            | Episode tags                                                                                |
| `triggerRef`      | string        |            | Reference to the trigger (e.g., task ID, event ID)                                          |
| `triggerType`     | string        |            | What triggered this episode ('user_request', 'system_event', 'scheduled')                   |

**status values:** `planned`, `active`, `completed`, `failed`, `cancelled`

---

## Learning & Experience

### memory_review

Review candidate memory entries from a session.

**Actions:** `list`, `show`, `approve`, `reject`, `skip`

| Parameter   | Type   | Required | Description                                                                             |
| ----------- | ------ | :------: | --------------------------------------------------------------------------------------- |
| `sessionId` | string |    ✓     | Session ID to review candidates from                                                    |
| `entryId`   | string |          | Entry ID or short ID (for show, approve, reject, skip)                                  |
| `projectId` | string |          | Target project ID for approved entries (optional, derived from session if not provided) |

---

### memory_experience

Manage experiential memory - learned patterns from past interactions.

**Actions:** `add`, `update`, `get`, `list`, `history`, `deactivate`, `delete`, `bulk_add`, `bulk_update`, `bulk_delete`, `promote`, `record_outcome`, `add_step`, `get_trajectory`, `record_case`, `capture_from_transcript`, `learn`

| Parameter           | Type          |   Required   | Description                                                         |
| ------------------- | ------------- | :----------: | ------------------------------------------------------------------- | -------------------------------------------- | --- | ------------------------------- |
| `applicability`     | string        |              | When to apply this                                                  |
| `category`          | string        |              | Category (e.g., debugging, refactoring, api-design)                 |
| `changeReason`      | string        |              | Reason for update                                                   |
| `confidence`        | number        |              | Confidence 0-1 (based on success rate)                              |
| `content`           | string        |              | Main learning/insight text                                          |
| `contraindications` | string        |              | When NOT to apply                                                   |
| `createdBy`         | string        |              | Creator identifier                                                  |
| `feedback`          | string        |              | Feedback on the outcome                                             |
| `id`                | string        |              | Experience ID                                                       |
| `includeInactive`   | boolean       |              | Include inactive entries                                            |
| `inherit`           | boolean       |              | Search parent scopes (default true)                                 |
| `level`             | `case`        |  `strategy`  |                                                                     | Experience abstraction level (default: case) |
| `limit`             | number        |              | Max results to return                                               |
| `offset`            | number        |              | Skip N results                                                      |
| `outcome`           | string        |              | Result: success/failure + details                                   |
| `pattern`           | string        |              | Abstracted pattern description                                      |
| `reason`            | string        |              | Reason for promotion                                                |
| `scenario`          | string        |              | What triggered this (context)                                       |
| `scopeId`           | string        |              | Scope ID (required for non-global scopes)                           |
| `scopeType`         | `global`      |    `org`     | `project`                                                           | `session`                                    |     | Scope level                     |
| `source`            | `observation` | `reflection` | `user`                                                              | `promotion`                                  |     | How this experience was created |
| `steps`             | object[]      |              | Trajectory steps for case-level experiences                         |
| `success`           | boolean       |              | Whether the experience helped                                       |
| `text`              | string        |              | Natural language text for learn action (e.g., "Fixed X by doing Y") |
| `title`             | string        |              | Experience title                                                    |
| `toLevel`           | `strategy`    |   `skill`    |                                                                     | Target level for promotion                   |
| `toolCategory`      | `mcp`         |    `cli`     | `function`                                                          | `api`                                        |     | Tool category (skill promotion) |
| `toolDescription`   | string        |              | Tool description (skill promotion)                                  |
| `toolName`          | string        |              | Tool name (required for skill promotion)                            |
| `toolParameters`    | object        |              | Tool parameters schema (skill promotion)                            |
| `updatedBy`         | string        |              | Updater identifier                                                  |

---

### memory_librarian

Manage the Librarian Agent for pattern detection and promotion recommendations.

**Actions:** `analyze`, `status`, `run_maintenance`, `list_recommendations`, `show_recommendation`, `approve`, `reject`, `skip`

| Parameter          | Type          | Required | Description                                                                                      |
| ------------------ | ------------- | :------: | ------------------------------------------------------------------------------------------------ | --------- | --- | ---------- |
| `dryRun`           | boolean       |          | If true, analyze without creating recommendations (analyze, run_maintenance)                     |
| `initiatedBy`      | string        |          | Who initiated this maintenance run (run_maintenance)                                             |
| `limit`            | number        |          | Maximum results to return                                                                        |
| `lookbackDays`     | number        |          | Days to look back for experiences (default: 30) (analyze)                                        |
| `minConfidence`    | number        |          | Filter by minimum confidence (list_recommendations)                                              |
| `notes`            | string        |          | Review notes (approve, reject, skip)                                                             |
| `offset`           | number        |          | Results to skip                                                                                  |
| `recommendationId` | string        |          | Recommendation ID (show_recommendation, approve, reject, skip)                                   |
| `reviewedBy`       | string        |          | Reviewer identifier (approve, reject, skip)                                                      |
| `scopeId`          | string        |          | Scope ID                                                                                         |
| `scopeType`        | `global`      |  `org`   | `project`                                                                                        | `session` |     | Scope type |
| `status`           | string (enum) |          | Filter by status (list_recommendations)                                                          |
| `tasks`            | array         |          | Which tasks to run (defaults to all): consolidation, forgetting, graphBackfill (run_maintenance) |

**status values:** `pending`, `approved`, `rejected`, `skipped`, `expired`

---

## Extraction & Observation

### memory_observe

Extract memory entries from conversation/code context using LLM analysis.

**Actions:** `extract`, `draft`, `commit`, `status`

| Parameter              | Type           | Required | Description                                                                                          |
| ---------------------- | -------------- | :------: | ---------------------------------------------------------------------------------------------------- | --------- | -------------------------------- | ---------------------------------------------- |
| `agentId`              | string         |          | Agent identifier for audit                                                                           |
| `autoPromote`          | boolean        |          | If true, entries above threshold can be stored at project scope when projectId is provided (default… |
| `autoPromoteThreshold` | number         |          | Confidence threshold for auto-promotion (0-1, default: 0.85)                                         |
| `autoStore`            | boolean        |          | Automatically store entries above confidence threshold (default: false)                              |
| `confidenceThreshold`  | number         |          | Minimum confidence to auto-store (0-1, default: 0.7)                                                 |
| `context`              | string         |          | Raw conversation or code context to analyze                                                          |
| `contextType`          | `conversation` |  `code`  | `mixed`                                                                                              |           | Type of context (default: mixed) |
| `entries`              | object[]       |          | Client-extracted entries (required for commit)                                                       |
| `focusAreas`           | string[]       |          | Focus extraction on specific types                                                                   |
| `projectId`            | string         |          | Project ID (optional, enables project auto-promote)                                                  |
| `scopeId`              | string         |          | Scope ID (required for non-global scopes)                                                            |
| `scopeType`            | `global`       |  `org`   | `project`                                                                                            | `session` |                                  | Scope for extracted entries (default: project) |
| `sessionId`            | string         |          | Session ID (required for draft/commit)                                                               |

---

### memory_extraction_approve

Approve and store extraction suggestions.

| Parameter        | Type     | Required | Description                                                     |
| ---------------- | -------- | :------: | --------------------------------------------------------------- |
| `hash`           | string   |          | Hash of the suggestion to approve (from \_suggestions metadata) |
| `modifyCategory` | string   |          | Override the suggested category                                 |
| `modifyTitle`    | string   |          | Override the suggested title                                    |
| `suggestions`    | object[] |          | Array of suggestions to approve (if not using hash)             |
| `tags`           | string[] |          | Tags to attach to the stored entry                              |

---

## Maintenance

### memory_consolidate

Consolidate similar memory entries to reduce redundancy and improve coherence.

**Actions:** `find_similar`, `dedupe`, `merge`, `abstract`, `archive_stale`

| Parameter         | Type     | Required | Description                                                               |
| ----------------- | -------- | :------: | ------------------------------------------------------------------------- | --------- | --- | -------------------------------- |
| `consolidatedBy`  | string   |          | Agent/user identifier for audit trail                                     |
| `dryRun`          | boolean  |          | If true, only report what would be consolidated without making changes    |
| `entryTypes`      | string[] |          | Entry types to consolidate (default: all)                                 |
| `limit`           | number   |          | Maximum number of groups to process (default: 20)                         |
| `minRecencyScore` | number   |          | For archive_stale: only archive if recencyScore is below this (0-1)       |
| `scopeId`         | string   |          | Scope ID (required for non-global scopes)                                 |
| `scopeType`       | `global` |  `org`   | `project`                                                                 | `session` |     | Scope type to consolidate within |
| `staleDays`       | number   |          | For archive_stale: entries older than this (in days) are considered stale |
| `threshold`       | number   |          | Similarity threshold 0-1 (default: 0.85). Higher = stricter matching.     |

---

### memory_forget

Manage memory forgetting and decay. Actions: analyze, forget, status

**Actions:** `analyze`, `forget`, `status`

| Parameter             | Type      |  Required   | Description                                               |
| --------------------- | --------- | :---------: | --------------------------------------------------------- | ---------- | --- | --------------------------------------- |
| `agentId`             | string    |             | Agent ID for audit trail (forget)                         |
| `dryRun`              | boolean   |             | Preview only, no changes (default: true)                  |
| `entryTypes`          | string[]  |             | Entry types to analyze (default: all)                     |
| `importanceThreshold` | number    |             | Importance score threshold 0-1 (default: 0.4)             |
| `limit`               | number    |             | Maximum entries to process (default: 100)                 |
| `minAccessCount`      | number    |             | Minimum access count for frequency strategy (default: 2)  |
| `scopeId`             | string    |             | Scope ID (required for non-global scopes)                 |
| `scopeType`           | `global`  |    `org`    | `project`                                                 | `session`  |     | Scope type to analyze (analyze, forget) |
| `staleDays`           | number    |             | Days since last access for recency strategy (default: 90) |
| `strategy`            | `recency` | `frequency` | `importance`                                              | `combined` |     | Forgetting strategy (default: combined) |

---

### memory_ops

Operational utilities for memory system health and diagnostics.

**Actions:** `auto_tag`, `session_timeout`, `red_flags`, `embedding_coverage`, `backfill_status`, `trigger_config`

| Parameter   | Type        |  Required   | Description                                                                                     |
| ----------- | ----------- | :---------: | ----------------------------------------------------------------------------------------------- | --------- | ----------------------------------------- | ----------------------------- |
| `category`  | string      |             | Category hint for auto-tagging                                                                  |
| `content`   | string      |             | Content to analyze for tag inference or red flag detection                                      |
| `entryId`   | string      |             | Entry ID (for apply mode or scoring)                                                            |
| `entryType` | `guideline` | `knowledge` | `tool`                                                                                          |           | Type of entry (for apply mode or scoring) |
| `scopeId`   | string      |             | Scope ID for coverage check                                                                     |
| `scopeType` | `global`    |    `org`    | `project`                                                                                       | `session` |                                           | Scope type for coverage check |
| `sessionId` | string      |             | Session ID for timeout queries                                                                  |
| `subAction` | string      |             | Sub-action: status/check/record_activity (session_timeout) or get/update/reset (trigger_config) |
| `types`     | string[]    |             | Entry types to include in coverage check                                                        |
| `updates`   | object      |             | Partial trigger config updates (for trigger_config update action)                               |

---

## Multi-Agent Coordination

### memory_file_lock

Manage file locks for multi-agent coordination. Actions: checkout, checkin, status, list, force_unlock

**Actions:** `checkout`, `checkin`, `status`, `list`, `force_unlock`

| Parameter    | Type   | Required | Description                            |
| ------------ | ------ | :------: | -------------------------------------- |
| `agent_id`   | string |          | Agent/IDE identifier                   |
| `expires_in` | number |          | Lock timeout in seconds (default 3600) |
| `file_path`  | string |          | Absolute filesystem path to the file   |
| `metadata`   | object |          | Optional metadata                      |
| `project_id` | string |          | Optional project reference             |
| `reason`     | string |          | Reason for force unlock                |
| `session_id` | string |          | Optional session reference             |

---

### memory_voting

Manage multi-agent voting and consensus. Actions: record_vote, get_consensus, list_votes, get_stats

**Actions:** `record_vote`, `get_consensus`, `list_votes`, `get_stats`

| Parameter    | Type   | Required | Description                                               |
| ------------ | ------ | :------: | --------------------------------------------------------- |
| `agentId`    | string |          | Agent identifier                                          |
| `confidence` | number |          | Confidence level 0-1 (default: 1.0)                       |
| `k`          | number |          | Number of votes ahead required for consensus (default: 1) |
| `reasoning`  | string |          | Reasoning for this vote                                   |
| `taskId`     | string |          | Task ID (references knowledge/tool entry)                 |
| `voteValue`  | object |          | Agent vote value (any JSON-serializable value)            |

---

### memory_conflict

Manage version conflicts. Actions: list, resolve

**Actions:** `list`, `resolve`

| Parameter    | Type    |  Required   | Description                                                |
| ------------ | ------- | :---------: | ---------------------------------------------------------- | --- | --------------------------- |
| `entryType`  | `tool`  | `guideline` | `knowledge`                                                |     | Filter by entry type (list) |
| `id`         | string  |             | Conflict ID (resolve)                                      |
| `limit`      | number  |             |                                                            |
| `offset`     | number  |             |                                                            |
| `resolution` | string  |             | Resolution description (resolve)                           |
| `resolved`   | boolean |             | Filter by resolved status (list, default: unresolved only) |
| `resolvedBy` | string  |             | Who resolved it (resolve)                                  |

---

## Analytics & Feedback

### memory_analytics

Get usage analytics and trends from audit log. Actions: get_stats, get_trends, get_subtask_stats, get_error_correlation, get_low_diversity, get_tool_stats, get_subagent_stats, get_notification_stats,…

**Actions:** `get_stats`, `get_trends`, `get_subtask_stats`, `get_error_correlation`, `get_low_diversity`, `get_tool_stats`, `get_subagent_stats`, `get_notification_stats`, `get_dashboard`

| Parameter       | Type     | Required  | Description                                        |
| --------------- | -------- | :-------: | -------------------------------------------------- | --------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `agentA`        | string   |           | First agent ID for correlation                     |
| `agentB`        | string   |           | Second agent ID for correlation                    |
| `endDate`       | string   |           | End date filter (ISO timestamp)                    |
| `projectId`     | string   |           | Project ID for subtask stats                       |
| `scopeId`       | string   |           | Scope ID to filter by                              |
| `scopeType`     | `global` |   `org`   | `project`                                          | `session` |                                                              |                                                                  |
| `sessionId`     | string   |           | Session ID for hook analytics                      |
| `severity`      | `error`  | `warning` | `info`                                             |           | Filter by notification severity (for get_notification_stats) |
| `startDate`     | string   |           | Start date filter (ISO timestamp)                  |
| `subagentTypes` | array    |           | Filter by subagent types (for get_subagent_stats)  |
| `subtaskType`   | string   |           | Filter by subtask type                             |
| `timeRange`     | `day`    |  `week`   | `month`                                            | `all`     |                                                              | Time range for hook analytics (alternative to startDate/endDate) |
| `timeWindow`    | object   |           | Time window for correlation analysis               |
| `toolNames`     | array    |           | Filter by specific tool names (for get_tool_stats) |

---

### memory_conversation

Manage conversation audit logs. Records and retrieves conversation history for debugging and analysis. Actions: start, add_message, get, list, update, link_context, get_context, search, end, archive

**Actions:** `start`, `add_message`, `get`, `list`, `update`, `link_context`, `get_context`, `search`, `end`, `archive`

| Parameter         | Type     |  Required   | Description |
| ----------------- | -------- | :---------: | ----------- | --- | --- |
| `agentId`         | string   |             |             |
| `content`         | string   |             |             |
| `contextEntries`  | array    |             |             |
| `conversationId`  | string   |             |             |
| `entryId`         | string   |             |             |
| `entryType`       | `tool`   | `guideline` | `knowledge` |     |     |
| `generateSummary` | boolean  |             |             |
| `includeContext`  | boolean  |             |             |
| `includeMessages` | boolean  |             |             |
| `limit`           | number   |             |             |
| `messageId`       | string   |             |             |
| `metadata`        | object   |             |             |
| `offset`          | number   |             |             |
| `projectId`       | string   |             |             |
| `relevanceScore`  | number   |             |             |
| `role`            | `user`   |   `agent`   | `system`    |     |     |
| `search`          | string   |             |             |
| `sessionId`       | string   |             |             |
| `status`          | `active` | `completed` | `archived`  |     |     |
| `title`           | string   |             |             |
| `toolsUsed`       | array    |             |             |

---

### memory_feedback

Query and export RL feedback data for training.

**Actions:** `list_retrievals`, `list_outcomes`, `list_decisions`, `export`, `stats`

| Parameter          | Type         |  Required   | Description                          |
| ------------------ | ------------ | :---------: | ------------------------------------ | --- | ---------------------- |
| `endDate`          | string       |             | Filter by end date (ISO timestamp)   |
| `entryTypes`       | string[]     |             | Filter by entry types                |
| `limit`            | number       |             | Max results to return                |
| `offset`           | number       |             | Skip N results                       |
| `onlyWithOutcomes` | boolean      |             | Include only samples with outcomes   |
| `outcomeTypes`     | string[]     |             | Filter by outcome types              |
| `policyType`       | `extraction` | `retrieval` | `consolidation`                      |     | Policy type for export |
| `sessionId`        | string       |             | Session ID for filtering             |
| `startDate`        | string       |             | Filter by start date (ISO timestamp) |

---

## Knowledge Graph

### graph_node

Manage graph nodes in the flexible knowledge graph.

**Actions:** `add`, `get`, `list`, `update`, `history`, `deactivate`, `reactivate`, `delete`

| Parameter      | Type     | Required | Description                                                    |
| -------------- | -------- | :------: | -------------------------------------------------------------- | --------- | --- | ---------------------- |
| `changeReason` | string   |          | Reason for update (update)                                     |
| `createdBy`    | string   |          | Creator identifier (add)                                       |
| `id`           | string   |          | Node ID (get, update, history, deactivate, reactivate, delete) |
| `isActive`     | boolean  |          | Filter by active status (list)                                 |
| `limit`        | number   |          | Max results (list)                                             |
| `name`         | string   |          | Node name (add, update)                                        |
| `nodeTypeName` | string   |          | Node type name (add, list)                                     |
| `offset`       | number   |          | Skip N results (list)                                          |
| `properties`   | object   |          | Node properties (add, update)                                  |
| `scopeId`      | string   |          | Scope ID (add, list)                                           |
| `scopeType`    | `global` |  `org`   | `project`                                                      | `session` |     | Scope type (add, list) |
| `updatedBy`    | string   |          | Updater identifier (update)                                    |
| `validFrom`    | string   |          | When this version becomes valid (ISO timestamp)                |
| `validUntil`   | string   |          | When this version expires (ISO timestamp)                      |

---

### graph_edge

Manage graph edges and perform traversal in the flexible knowledge graph.

**Actions:** `add`, `get`, `list`, `update`, `delete`, `neighbors`, `traverse`, `paths`

| Parameter        | Type     | Required | Description                                |
| ---------------- | -------- | :------: | ------------------------------------------ | --- | ----------------------------------------- |
| `createdBy`      | string   |          | Creator identifier (add)                   |
| `direction`      | `out`    |   `in`   | `both`                                     |     | Traversal direction (neighbors, traverse) |
| `edgeTypeName`   | string   |          | Edge type name (add, list)                 |
| `edgeTypes`      | string[] |          | Filter by edge types (neighbors, traverse) |
| `endNodeId`      | string   |          | Target node ID (paths)                     |
| `id`             | string   |          | Edge ID (get, update, delete)              |
| `limit`          | number   |          | Max results (list, neighbors, traverse)    |
| `maxDepth`       | number   |          | Max traversal depth (traverse, paths)      |
| `nodeId`         | string   |          | Node ID for neighbor query (neighbors)     |
| `nodeTypeFilter` | string[] |          | Filter by node types (neighbors, traverse) |
| `offset`         | number   |          | Skip N results (list)                      |
| `properties`     | object   |          | Edge properties (add, update)              |
| `sourceId`       | string   |          | Source node ID (add, list)                 |
| `startNodeId`    | string   |          | Starting node ID (traverse, paths)         |
| `targetId`       | string   |          | Target node ID (add, list)                 |
| `weight`         | number   |          | Edge weight (add, update)                  |

---

### memory_graph_status

Get diagnostic information about the knowledge graph's current state.

**Actions:** `status`

No parameters required.

---

## Advanced Features

### memory_latent

Manage latent memory and KV-cache for efficient context injection.

**Actions:** `create`, `get`, `search`, `inject`, `warm_session`, `stats`, `prune`

| Parameter        | Type   |  Required   | Description                                                        |
| ---------------- | ------ | :---------: | ------------------------------------------------------------------ | ------------ | --------------------------------------------------------------- | ---------------------------------- |
| `conversationId` | string |             | Conversation ID for context injection (inject)                     |
| `format`         | `json` | `markdown`  | `natural_language`                                                 |              | Output format for context injection (inject, default: markdown) |
| `limit`          | number |             | Maximum number of results to return (search, warm_session)         |
| `maxTokens`      | number |             | Maximum tokens for injected context (inject)                       |
| `query`          | string |             | Search query for semantic matching (search)                        |
| `sessionId`      | string |             | Session ID for context injection or warming (inject, warm_session) |
| `sourceId`       | string |             | ID of source entry (create, get)                                   |
| `sourceType`     | `tool` | `guideline` | `knowledge`                                                        | `experience` |                                                                 | Type of source entry (create, get) |
| `staleDays`      | number |             | Days of inactivity before pruning entries (prune, default: 30)     |
| `text`           | string |             | Optional text override instead of fetching from source (create)    |

---

### memory_summarize

Manage hierarchical summaries for efficient memory retrieval at scale.

**Actions:** `build`, `status`, `get`, `search`, `drill_down`, `delete`

| Parameter             | Type     | Required | Description                                                                                          |
| --------------------- | -------- | :------: | ---------------------------------------------------------------------------------------------------- | --------- | --- | ------------------------ |
| `entryTypes`          | string[] |          | Entry types to include in summaries (default: all)                                                   |
| `forceRebuild`        | boolean  |          | Force rebuild of all summaries, even if they exist (build)                                           |
| `id`                  | string   |          | Summary ID (get)                                                                                     |
| `level`               | number   |          | Hierarchy level to search (0=chunk, 1=topic, 2=domain) (search)                                      |
| `limit`               | number   |          | Maximum number of results to return (search, default: 10)                                            |
| `minGroupSize`        | number   |          | Minimum entries required to form a community (build, default: 3). Lower values create more granular… |
| `query`               | string   |          | Search query for semantic matching (search)                                                          |
| `scopeId`             | string   |          | Scope ID (required for non-global scopes)                                                            |
| `scopeType`           | `global` |  `org`   | `project`                                                                                            | `session` |     | Scope type for summaries |
| `similarityThreshold` | number   |          | Minimum similarity (0-1) for entries to be grouped together (build, default: 0.5). Lower values all… |
| `summaryId`           | string   |          | Summary ID to drill down from (drill_down)                                                           |

---

### memory_context

Show auto-detected context for debugging.

| Parameter | Type   | Required  | Description |
| --------- | ------ | :-------: | ----------- | --------------------------------------------------------------------------------------------- |
| `action`  | `show` | `refresh` |             | Action to perform: "show" (display detected context) or "refresh" (clear cache and re-detect) |

---

## System & Admin

### memory_permission

Manage permissions. Actions: grant, revoke, check, list

**Actions:** `grant`, `revoke`, `check`, `list`

| Parameter       | Type     |  Required   | Description |
| --------------- | -------- | :---------: | ----------- | --------- | --- | --- |
| `admin_key`     | string   |             |             |
| `agent_id`      | string   |             |             |
| `created_by`    | string   |             |             |
| `entry_type`    | `tool`   | `guideline` | `knowledge` |           |     |
| `limit`         | number   |             |             |
| `offset`        | number   |             |             |
| `permission`    | `read`   |   `write`   | `admin`     |           |     |
| `permission_id` | string   |             |             |
| `scope_id`      | string   |             |             |
| `scope_type`    | `global` |    `org`    | `project`   | `session` |     |     |

---

### memory_health

Check server health and database status. Returns version, database stats, and cache info.

No parameters required.

---

### memory_backup

Manage database backups. Actions: create (create backup), list (list all backups), cleanup (remove old backups), restore (restore from backup)

**Actions:** `create`, `list`, `cleanup`, `restore`

| Parameter   | Type   | Required | Description                                     |
| ----------- | ------ | :------: | ----------------------------------------------- |
| `admin_key` | string |          | Admin key (required)                            |
| `filename`  | string |          | Backup filename to restore (restore)            |
| `keepCount` | number |          | Number of backups to keep (cleanup, default: 5) |
| `name`      | string |          | Custom backup name (create, optional)           |

---

### memory_init

Manage database initialization and migrations. Actions: init (initialize/migrate), status (check migration status), reset (reset database - WARNING: deletes all data)

**Actions:** `init`, `status`, `reset`

| Parameter   | Type    | Required | Description                                                                         |
| ----------- | ------- | :------: | ----------------------------------------------------------------------------------- |
| `admin_key` | string  |          | Admin key (required for init/reset)                                                 |
| `confirm`   | boolean |          | Confirm database reset - required for reset action. WARNING: This deletes all data! |
| `force`     | boolean |          | Force re-initialization even if already initialized (init)                          |
| `verbose`   | boolean |          | Enable verbose output (init, reset)                                                 |

---

### memory_export

Export memory entries to various formats. Actions: export

**Actions:** `export`

| Parameter         | Type     |  Required  | Description                                                                                          |
| ----------------- | -------- | :--------: | ---------------------------------------------------------------------------------------------------- | --------- | --- | ----------------------------- |
| `admin_key`       | string   |            | Admin key (required when writing to disk)                                                            |
| `agentId`         | string   |            | Agent identifier for access control/auditing                                                         |
| `filename`        | string   |            | Optional filename to save export to configured export directory. If not provided, content is return… |
| `format`          | `json`   | `markdown` | `yaml`                                                                                               | `openapi` |     | Export format (default: json) |
| `includeInactive` | boolean  |            | Include inactive/deleted entries (default: false)                                                    |
| `includeVersions` | boolean  |            | Include version history in export (default: false)                                                   |
| `scopeId`         | string   |            | Scope ID (required if scopeType specified)                                                           |
| `scopeType`       | `global` |   `org`    | `project`                                                                                            | `session` |     | Scope type to export from     |
| `tags`            | string[] |            | Filter by tags (include entries with any of these tags)                                              |
| `types`           | string[] |            | Entry types to export (default: all)                                                                 |

---

### memory_import

Import memory entries from various formats. Actions: import

**Actions:** `import`

| Parameter          | Type    | Required | Description                                                                                            |
| ------------------ | ------- | :------: | ------------------------------------------------------------------------------------------------------ | --------- | --- | --------------------------------------------------------------- |
| `content`          | string  |    ✓     | Content to import (JSON string, YAML string, Markdown, or OpenAPI spec)                                |
| `admin_key`        | string  |          | Admin key (required)                                                                                   |
| `conflictStrategy` | `skip`  | `update` | `replace`                                                                                              | `error`   |     | How to handle conflicts with existing entries (default: update) |
| `format`           | `json`  |  `yaml`  | `markdown`                                                                                             | `openapi` |     | Import format (default: json, auto-detected if possible)        |
| `generateNewIds`   | boolean |          | Generate new IDs for imported entries instead of preserving originals (default: false)                 |
| `importedBy`       | string  |          | Agent ID or identifier for audit trail                                                                 |
| `scopeMapping`     | object  |          | Map scope IDs from import to target scopes: { "oldScopeId": { "type": "org\|project\|session", "id": … |

---

### memory_verify

Verify actions against critical guidelines with active intervention.

**Actions:** `pre_check`, `post_check`, `acknowledge`, `status`

| Parameter         | Type     | Required | Description                                                 |
| ----------------- | -------- | :------: | ----------------------------------------------------------- |
| `agentId`         | string   |          | Agent identifier                                            |
| `completedAction` | object   |          | Completed action to log (post_check)                        |
| `content`         | string   |          | Response content to verify (post_check alternative)         |
| `guidelineIds`    | string[] |          | Guideline IDs to acknowledge (acknowledge)                  |
| `projectId`       | string   |          | Project ID (optional, derived from session if not provided) |
| `proposedAction`  | object   |          | Action to verify (pre_check)                                |
| `sessionId`       | string   |          | Current session ID                                          |

---

### memory_hook

Generate and manage IDE verification hooks.

**Actions:** `generate`, `install`, `status`, `uninstall`

| Parameter     | Type     | Required | Description                                  |
| ------------- | -------- | :------: | -------------------------------------------- | --- | ---------- |
| `ide`         | `claude` | `cursor` | `vscode`                                     | ✓   | Target IDE |
| `projectPath` | string   |    ✓     | Absolute path to the project directory       |
| `projectId`   | string   |          | Project ID for loading guidelines (optional) |
| `sessionId`   | string   |          | Session ID for loading guidelines (optional) |

---

### memory_onboard

Guided setup wizard for new projects. Auto-detects project info, imports docs as knowledge, and seeds tech-stack-specific guidelines. Call with no params for full auto-detection, or specify options t…

| Parameter        | Type     | Required | Description                                                        |
| ---------------- | -------- | :------: | ------------------------------------------------------------------ |
| `dryRun`         | boolean  |          | Preview what would be done without making changes (default: false) |
| `importDocs`     | boolean  |          | Import documentation files as knowledge entries (default: true)    |
| `projectName`    | string   |          | Override detected project name                                     |
| `seedGuidelines` | boolean  |          | Seed best-practice guidelines based on tech stack (default: true)  |
| `skipSteps`      | string[] |          | Steps to skip: createProject, importDocs, seedGuidelines           |

---

## Experimental (ML/Training)

### memory_rl

Manage RL policies for memory operations.

**Actions:** `status`, `train`, `evaluate`, `enable`, `config`, `export_dataset`, `load_model`, `list_models`, `compare`

| Parameter       | Type          |  Required   | Description                                                              |
| --------------- | ------------- | :---------: | ------------------------------------------------------------------------ | ------- | ---------------------------- | ------------------------- |
| `config`        | object        |             | Policy configuration (epochs, batchSize, learningRate, beta, outputPath) |
| `datasetPath`   | string        |             | Path to dataset file for evaluation                                      |
| `enabled`       | boolean       |             | Enable/disable policy                                                    |
| `endDate`       | string        |             | Training data end date (ISO)                                             |
| `evalSplit`     | number        |             | Evaluation split ratio (0-1)                                             |
| `format`        | `huggingface` |  `openai`   | `csv`                                                                    | `jsonl` |                              | Export format for dataset |
| `maxExamples`   | number        |             | Max training examples                                                    |
| `minConfidence` | number        |             | Minimum confidence threshold                                             |
| `modelPath`     | string        |             | Path to trained model file                                               |
| `outputPath`    | string        |             | Output directory path for exports                                        |
| `policy`        | `extraction`  | `retrieval` | `consolidation`                                                          |         | Target policy                |
| `policyA`       | `extraction`  | `retrieval` | `consolidation`                                                          |         | First policy for comparison  |
| `policyB`       | `extraction`  | `retrieval` | `consolidation`                                                          |         | Second policy for comparison |
| `startDate`     | string        |             | Training data start date (ISO)                                           |
| `version`       | string        |             | Model version to load (default: latest)                                  |

---

### memory_lora

Export guidelines as LoRA training data for model fine-tuning.

**Actions:** `export`, `list_adapters`, `generate_script`

| Parameter              | Type          | Required | Description                                                                 |
| ---------------------- | ------------- | :------: | --------------------------------------------------------------------------- | -------- | --- | ------------------------------------ |
| `admin_key`            | string        |          | Admin key (required for export and script generation with outputPath)       |
| `agentId`              | string        |          | Agent identifier for access control (required for export)                   |
| `datasetPath`          | string        |          | Path to dataset directory (for generate_script)                             |
| `examplesPerGuideline` | number        |          | Number of examples to generate per guideline (default: 3)                   |
| `format`               | `huggingface` | `openai` | `anthropic`                                                                 | `alpaca` |     | Export format (default: huggingface) |
| `guidelineFilter`      | object        |          | Filter guidelines for export (category, priority, tags, scopeType, scopeId) |
| `includeExamples`      | boolean       |          | Generate examples from guideline examples field (default: true)             |
| `outputPath`           | string        |          | Output directory path for datasets/scripts                                  |
| `targetModel`          | string        |          | Target model name (e.g., "meta-llama/Llama-3-8B", "gpt-3.5-turbo")          |
| `trainEvalSplit`       | number        |          | Train/eval split ratio (0-1, default: 0.9)                                  |

---

## Scope Types

| Type      | scopeId Required | Use Case                   |
| --------- | :--------------: | -------------------------- |
| `global`  |        No        | Universal standards        |
| `org`     |       Yes        | Team-wide standards        |
| `project` |       Yes        | Project-specific (default) |
| `session` |       Yes        | Temporary/experimental     |

---

@version "2.0.0"
@last_updated "2026-01-21"
@tool_count 50
