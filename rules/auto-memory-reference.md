---
description: Agent Memory tool parameters - consult when needing parameter details
globs: []
alwaysApply: false
---

# Agent Memory Parameter Reference

## Required Parameters by Tool

### memory_query

| Action    | Required | Optional                                                |
| --------- | -------- | ------------------------------------------------------- |
| `context` | action   | scopeType, scopeId, inherit, limit                      |
| `search`  | action   | types[], search, scope{}, tags{}, semanticSearch, limit |

**scope object:** `{"type": "project", "id": "<id>", "inherit": true}`
**tags object:** `{"include": [], "exclude": [], "require": []}`
**types array:** `["guidelines", "knowledge", "tools"]`

---

### memory_guideline

| Action       | Required                                    | Optional                                                         |
| ------------ | ------------------------------------------- | ---------------------------------------------------------------- |
| `add`        | action, scopeType, scopeId\*, name, content | category, priority, rationale, examples{}                        |
| `update`     | action, id                                  | content, category, priority, rationale, examples{}, changeReason |
| `get`        | action, (id OR name+scopeType)              | scopeId, inherit                                                 |
| `list`       | action                                      | scopeType, scopeId, category, includeInactive, limit, offset     |
| `deactivate` | action, id                                  | -                                                                |
| `bulk_add`   | action, entries[]                           | scopeType, scopeId (defaults for all entries)                    |

\*scopeId required unless scopeType is `global`

**examples object:** `{"good": ["..."], "bad": ["..."]}`
**category values:** `code_style`, `workflow`, `security`, `architecture`, `error_handling`
**priority:** 0-100 (default 50)

---

### memory_knowledge

| Action       | Required                                     | Optional                                                        |
| ------------ | -------------------------------------------- | --------------------------------------------------------------- |
| `add`        | action, scopeType, scopeId\*, title, content | category, source, confidence, validUntil                        |
| `update`     | action, id                                   | content, category, source, confidence, validUntil, changeReason |
| `get`        | action, (id OR title+scopeType)              | scopeId, inherit                                                |
| `list`       | action                                       | scopeType, scopeId, category, includeInactive, limit, offset    |
| `deactivate` | action, id                                   | -                                                               |
| `bulk_add`   | action, entries[]                            | scopeType, scopeId (defaults for all entries)                   |

\*scopeId required unless scopeType is `global`

**category values:** `decision`, `fact`, `context`, `reference`
**confidence:** 0-1 (default 1.0)
**validUntil:** ISO date string

---

### memory_tool

| Action       | Required                           | Optional                                                         |
| ------------ | ---------------------------------- | ---------------------------------------------------------------- |
| `add`        | action, scopeType, scopeId\*, name | category, description, parameters{}, examples[], constraints     |
| `update`     | action, id                         | description, parameters{}, examples[], constraints, changeReason |
| `get`        | action, (id OR name+scopeType)     | scopeId, inherit                                                 |
| `list`       | action                             | scopeType, scopeId, category, includeInactive, limit, offset     |
| `deactivate` | action, id                         | -                                                                |
| `bulk_add`   | action, entries[]                  | scopeType, scopeId (defaults for all entries)                    |

\*scopeId required unless scopeType is `global`

**category values:** `mcp`, `cli`, `function`, `api`

---

### memory_project

| Action   | Required                 | Optional                                 |
| -------- | ------------------------ | ---------------------------------------- |
| `create` | action, name             | orgId, description, rootPath, metadata{} |
| `list`   | action                   | orgId, limit, offset                     |
| `get`    | action, (id OR name)     | orgId                                    |
| `update` | action, id               | name, description, rootPath, metadata{}  |
| `delete` | action, id, confirm=true | -                                        |

**NOTE:** Use `create` not `add`

---

### memory_org

| Action   | Required     | Optional      |
| -------- | ------------ | ------------- |
| `create` | action, name | metadata{}    |
| `list`   | action       | limit, offset |

**NOTE:** Use `create` not `add`

---

### memory_session

| Action  | Required   | Optional                                      |
| ------- | ---------- | --------------------------------------------- |
| `start` | action     | projectId, name, purpose, agentId, metadata{} |
| `end`   | action, id | status                                        |
| `list`  | action     | projectId, status, limit, offset              |

**status values:** `active`, `paused`, `completed`, `discarded`

---

### memory_tag

| Action      | Required                                       | Optional                              |
| ----------- | ---------------------------------------------- | ------------------------------------- |
| `attach`    | action, entryType, entryId, (tagId OR tagName) | -                                     |
| `detach`    | action, entryType, entryId, tagId              | -                                     |
| `create`    | action, name                                   | category, description                 |
| `list`      | action                                         | category, isPredefined, limit, offset |
| `for_entry` | action, entryType, entryId                     | -                                     |

**entryType values:** `guideline`, `tool`, `knowledge` (SINGULAR!)
**tag category values:** `language`, `domain`, `category`, `meta`, `custom`

---

### memory_relation

| Action   | Required                                                         | Optional      |
| -------- | ---------------------------------------------------------------- | ------------- |
| `create` | action, sourceType, sourceId, targetType, targetId, relationType | createdBy     |
| `list`   | action                                                           | limit, offset |
| `delete` | action, id                                                       | -             |

**sourceType/targetType:** `guideline`, `tool`, `knowledge`, `project`
**relationType:** `applies_to`, `depends_on`, `conflicts_with`, `related_to`, `parent_task`, `subtask_of`

---

### memory_file_lock

| Action         | Required                    | Optional                                       |
| -------------- | --------------------------- | ---------------------------------------------- |
| `checkout`     | action, file_path, agent_id | session_id, project_id, expires_in, metadata{} |
| `checkin`      | action, file_path, agent_id | -                                              |
| `status`       | action, file_path           | -                                              |
| `list`         | action                      | -                                              |
| `force_unlock` | action, file_path           | reason                                         |

**file_path:** MUST be absolute path

---

### memory_conversation

| Action        | Required                              | Optional                                         |
| ------------- | ------------------------------------- | ------------------------------------------------ |
| `start`       | action                                | projectId, sessionId, title, agentId, metadata{} |
| `add_message` | action, conversationId, role, content | agentId, contextEntries[], toolsUsed[]           |
| `get`         | action, conversationId                | includeMessages, includeContext                  |
| `list`        | action                                | status, limit, offset                            |
| `end`         | action, conversationId                | generateSummary                                  |

**role values:** `user`, `agent`, `system`

---

### memory_task

| Action | Required           | Optional                                                         |
| ------ | ------------------ | ---------------------------------------------------------------- |
| `add`  | action, subtasks[] | parentTask, decompositionStrategy, scopeType, scopeId, projectId |
| `get`  | action, taskId     | -                                                                |
| `list` | action             | parentTaskId, scopeType, scopeId, limit, offset                  |

**decompositionStrategy:** `maximal`, `balanced`, `minimal`

---

### memory_voting

| Action          | Required                           | Optional              |
| --------------- | ---------------------------------- | --------------------- |
| `record_vote`   | action, taskId, agentId, voteValue | confidence, reasoning |
| `get_consensus` | action, taskId                     | k                     |
| `list_votes`    | action, taskId                     | limit, offset         |
| `get_stats`     | action                             | -                     |

---

### memory_analytics

| Action                  | Required | Optional                               |
| ----------------------- | -------- | -------------------------------------- |
| `get_stats`             | action   | scopeType, scopeId, startDate, endDate |
| `get_trends`            | action   | scopeType, scopeId, startDate, endDate |
| `get_error_correlation` | action   | agentA, agentB, timeWindow{}           |

---

### memory_conflict

| Action    | Required               | Optional                           |
| --------- | ---------------------- | ---------------------------------- |
| `list`    | action                 | resolved, entryType, limit, offset |
| `resolve` | action, id, resolution | resolvedBy                         |

---

### memory_permission

| Action   | Required                                             | Optional                                        |
| -------- | ---------------------------------------------------- | ----------------------------------------------- |
| `check`  | action, agent_id, scope_type, entry_type             | scope_id                                        |
| `grant`  | action, agent_id, scope_type, entry_type, permission | scope_id, created_by                            |
| `revoke` | action, permission_id                                | -                                               |
| `list`   | action                                               | agent_id, scope_type, entry_type, limit, offset |

**permission values:** `read`, `write`, `admin`

---

### memory_health

No parameters required. Returns server status.

---

### memory_init

| Action   | Required             | Optional       |
| -------- | -------------------- | -------------- |
| `status` | action               | -              |
| `init`   | action               | force, verbose |
| `reset`  | action, confirm=true | verbose        |
| `verify` | action               | -              |

---

### memory_export

| Action   | Required | Optional                                                               |
| -------- | -------- | ---------------------------------------------------------------------- |
| `export` | action   | format, scopeType, scopeId, types[], tags[], includeVersions, filename |

**format values:** `json`, `markdown`, `yaml`, `openapi`

---

### memory_import

| Action   | Required        | Optional                                                             |
| -------- | --------------- | -------------------------------------------------------------------- |
| `import` | action, content | format, conflictStrategy, importedBy, generateNewIds, scopeMapping{} |

**conflictStrategy values:** `skip`, `update`, `replace`, `error`

---

### memory_backup

| Action    | Required         | Optional  |
| --------- | ---------------- | --------- |
| `create`  | action           | name      |
| `list`    | action           | -         |
| `cleanup` | action           | keepCount |
| `restore` | action, filename | -         |

---

## Scope Types

| Type      | scopeId Required | Use Case                   |
| --------- | ---------------- | -------------------------- |
| `global`  | No               | Universal standards        |
| `org`     | Yes              | Team-wide standards        |
| `project` | Yes              | Project-specific (default) |
| `session` | Yes              | Temporary/experimental     |

---

## bulk_add Entry Format

**Top-level `scopeType` and `scopeId` apply to all entries.** Entries can override if needed. Entries support all optional fields from regular `add`.

### Guideline bulk_add

```json
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "<id>",
  "entries": [
    { "name": "rule-1", "content": "...", "priority": 90, "category": "security" },
    { "name": "rule-2", "content": "...", "rationale": "..." }
  ]
}
```

### Knowledge bulk_add

```json
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "<id>",
  "entries": [
    { "title": "fact-1", "content": "...", "category": "decision" },
    { "title": "fact-2", "content": "...", "confidence": 0.9 }
  ]
}
```

### Tool bulk_add

```json
{
  "action": "bulk_add",
  "scopeType": "project",
  "scopeId": "<id>",
  "entries": [
    { "name": "cmd-1", "description": "...", "category": "cli" },
    { "name": "cmd-2", "description": "...", "constraints": "..." }
  ]
}
```

### Response Format

Returns `{entries: [...], count: N}` with created entry objects including their IDs for tagging.

@version "1.0.0"
@last_updated "2025-12-18"
