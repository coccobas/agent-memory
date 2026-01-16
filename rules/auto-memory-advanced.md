---
description: Advanced Agent Memory features - consult for multi-agent, conflicts, maintenance
globs: []
alwaysApply: false
---

# Advanced Agent Memory

## Multi-Agent Features

### File Locking

Before editing files in multi-agent scenarios:

1. Check status: `memory_file_lock` action `status` with absolute `file_path`
2. Checkout: action `checkout` with `file_path`, `agent_id`
3. Edit file
4. Checkin: action `checkin` with `file_path`, `agent_id`

### Task Decomposition

For complex features: `memory_task` action `add`

- `subtasks[]`: array of task descriptions
- `decompositionStrategy`: `maximal` | `balanced` | `minimal`

### Voting (Multi-Agent)

When agents disagree:

1. Record votes: `memory_voting` action `record_vote` with `taskId`, `agentId`, `voteValue`
2. Get consensus: action `get_consensus` with `taskId`

---

## Conflict Resolution

### Automatic Detection

Conflicts detected when two writes happen within 5 seconds to same entry. Both versions preserved, later flagged with `conflictFlag: true`.

### Resolution Workflow

1. Check conflicts: `memory_conflict` action `list` with `resolved: false`
2. Review both versions
3. Resolve: action `resolve` with `id`, `resolution` description

### Resolution Priority

1. User preference
2. Recency (newer preferred)
3. Source authority (higher confidence)
4. Scope specificity (specific > general)
5. Completeness

### Semantic Conflicts

Before storing, query for similar entries. If contradiction found:

- Present both to user
- Ask for resolution
- Store resolution as knowledge (category: decision)

---

## Scope Management

### Hierarchy

`global` → `org` → `project` → `session`

### Promotion

When guideline applies universally:

1. Verify truly universal
2. Update scope (don't duplicate)
3. Deactivate old version if needed

### Deduplication

Always check higher scopes before storing. Use `inherit: true` in queries.

---

## Maintenance

### Periodic Tasks

| Frequency | Task                 | Tool/Action                           |
| --------- | -------------------- | ------------------------------------- |
| Daily     | Check conflicts      | `memory_conflict` action `list`       |
| Daily     | Health check         | `memory_health`                       |
| Weekly    | Review analytics     | `memory_analytics` action `get_stats` |
| Weekly    | Export backup        | `memory_export` action `export`       |
| Monthly   | Clean unused entries | Review analytics, deactivate stale    |
| Monthly   | Review permissions   | `memory_permission` action `list`     |
| Monthly   | Clean file locks     | `memory_file_lock` action `list`      |

### Analytics Usage

Use `memory_analytics` to:

- Find frequently accessed entries → promote priority
- Find unused entries → consider cleanup
- Identify error patterns → update guidelines

---

## Error Handling

| Error             | Response                                                         |
| ----------------- | ---------------------------------------------------------------- |
| Operation fails   | Log, continue, retry next interaction                            |
| Conflict detected | Both versions preserved - resolve systematically                 |
| Permission denied | Check with `memory_permission`, request if needed                |
| File locked       | Wait for expiry, check status, `force_unlock` only if authorized |

---

## Import/Export

### Export

`memory_export` action `export`

- `format`: `json` | `markdown` | `yaml` | `openapi`
- `scopeType`, `scopeId`: filter by scope

### Import

`memory_import` action `import`

- `content`: JSON/YAML string
- `conflictStrategy`: `skip` | `update` | `replace` | `error`

---

## Permissions

Check before sensitive operations:

- `memory_permission` action `check` with `agent_id`, `scope_type`, `entry_type`
- Grant: action `grant` with `permission` (`read` | `write` | `admin`)

@version "1.0.0"
@last_updated "2025-12-18"
