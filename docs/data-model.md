# Data Model

Complete reference for the Agent Memory database schema.

## Entity Relationship Diagram

<details>
<summary><strong>Show details</strong></summary>

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SCOPE HIERARCHY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐         ┌──────────────┐         ┌──────────────┐        │
│   │ organizations│ 1────n  │   projects   │ 1────n  │   sessions   │        │
│   │              │◄────────│              │◄────────│              │        │
│   │ id           │         │ id           │         │ id           │        │
│   │ name         │         │ org_id (FK)  │         │ project_id   │        │
│   │ metadata     │         │ name         │         │ name         │        │
│   │ created_at   │         │ description  │         │ purpose      │        │
│   └──────────────┘         │ root_path    │         │ agent_id     │        │
│                            │ metadata     │         │ status       │        │
│                            └──────────────┘         │ started_at   │        │
│                                                     │ ended_at     │        │
│                                                     │ metadata     │        │
│                                                     └──────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            MEMORY SECTIONS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │      tools       │    │    guidelines    │    │    knowledge     │       │
│  ├──────────────────┤    ├──────────────────┤    ├──────────────────┤       │
│  │ id               │    │ id               │    │ id               │       │
│  │ scope_type       │    │ scope_type       │    │ scope_type       │       │
│  │ scope_id         │    │ scope_id         │    │ scope_id         │       │
│  │ name             │    │ name             │    │ title            │       │
│  │ category         │    │ category         │    │ category         │       │
│  │ current_version  │    │ priority         │    │ current_version  │       │
│  │ is_active        │    │ current_version  │    │ is_active        │       │
│  │ created_at       │    │ is_active        │    │ created_at       │       │
│  │ created_by       │    │ created_at       │    │ created_by       │       │
│  └────────┬─────────┘    │ created_by       │    └────────┬─────────┘       │
│           │              └────────┬─────────┘             │                  │
│           │ 1                     │ 1                     │ 1                │
│           │                       │                       │                  │
│           n                       n                       n                  │
│  ┌────────┴─────────┐    ┌────────┴─────────┐    ┌────────┴─────────┐       │
│  │  tool_versions   │    │guideline_versions│    │knowledge_versions│       │
│  ├──────────────────┤    ├──────────────────┤    ├──────────────────┤       │
│  │ id               │    │ id               │    │ id               │       │
│  │ tool_id (FK)     │    │ guideline_id(FK) │    │ knowledge_id(FK) │       │
│  │ version_num      │    │ version_num      │    │ version_num      │       │
│  │ description      │    │ content          │    │ content          │       │
│  │ parameters       │    │ rationale        │    │ source           │       │
│  │ examples         │    │ examples         │    │ confidence       │       │
│  │ constraints      │    │ change_reason    │    │ valid_until      │       │
│  │ change_reason    │    │ created_at       │    │ change_reason    │       │
│  │ conflict_flag    │    │ created_by       │    │ created_at       │       │
│  │ created_at       │    │ conflict_flag    │    │ created_by       │       │
│  │ created_by       │    └──────────────────┘    │ conflict_flag    │       │
│  └──────────────────┘                            └──────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          CROSS-REFERENCE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │      tags        │    │   entry_tags     │    │ entry_relations  │       │
│  ├──────────────────┤    ├──────────────────┤    ├──────────────────┤       │
│  │ id               │◄──n│ id               │    │ id               │       │
│  │ name             │    │ entry_type       │    │ source_type      │       │
│  │ category         │    │ entry_id         │    │ source_id        │       │
│  │ is_predefined    │    │ tag_id (FK)      │    │ target_type      │       │
│  │ description      │    │ created_at       │    │ target_id        │       │
│  │ created_at       │    └──────────────────┘    │ relation_type    │       │
│  └──────────────────┘                            │ created_at       │       │
│                                                  │ created_by       │       │
│                                                  └──────────────────┘       │
│                                                                              │
│  ┌──────────────────┐                                                        │
│  │   conflict_log   │                                                        │
│  ├──────────────────┤                                                        │
│  │ id               │                                                        │
│  │ entry_type       │                                                        │
│  │ entry_id         │                                                        │
│  │ version_a_id     │                                                        │
│  │ version_b_id     │                                                        │
│  │ detected_at      │                                                        │
│  │ resolved         │                                                        │
│  │ resolution       │                                                        │
│  │ resolved_at      │                                                        │
│  │ resolved_by      │                                                        │
│  └──────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

</details>

## Table Definitions

<details>
<summary><strong>Show details</strong></summary>

### organizations

Top-level grouping for multi-team scenarios.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `name` | TEXT | No | - | Organization name |
| `metadata` | TEXT | Yes | - | JSON metadata |
| `created_at` | TEXT | No | now() | ISO timestamp |

**Indexes:** Primary key on `id`

---

### projects

Projects within organizations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `org_id` | TEXT | Yes | - | FK to organizations |
| `name` | TEXT | No | - | Project name |
| `description` | TEXT | Yes | - | Project description |
| `root_path` | TEXT | Yes | - | Filesystem path |
| `metadata` | TEXT | Yes | - | JSON (goals, constraints) |
| `created_at` | TEXT | No | now() | ISO timestamp |
| `updated_at` | TEXT | No | now() | ISO timestamp |

**Indexes:**
- Primary key on `id`
- `idx_projects_org` on `org_id`

**Constraints:**
- Unique on `(org_id, name)`

---

### sessions

Working sessions within projects.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `project_id` | TEXT | Yes | - | FK to projects |
| `name` | TEXT | Yes | - | Session label |
| `purpose` | TEXT | Yes | - | Session purpose |
| `agent_id` | TEXT | Yes | - | Creating agent/IDE |
| `status` | TEXT | No | 'active' | Session status |
| `started_at` | TEXT | No | now() | Start timestamp |
| `ended_at` | TEXT | Yes | - | End timestamp |
| `metadata` | TEXT | Yes | - | JSON scratch data |

**Status Values:**
- `active` - Currently in progress
- `paused` - Temporarily suspended
- `completed` - Finished successfully
- `discarded` - Abandoned/cancelled

**Indexes:**
- Primary key on `id`
- `idx_sessions_project` on `project_id`
- `idx_sessions_status` on `status`

---

### tools

Tool registry with versioning support.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `scope_type` | TEXT | No | - | Scope level |
| `scope_id` | TEXT | Yes | - | Scope reference |
| `name` | TEXT | No | - | Tool name |
| `category` | TEXT | Yes | - | Tool category |
| `current_version_id` | TEXT | Yes | - | FK to tool_versions |
| `is_active` | INTEGER | No | 1 | Soft delete flag |
| `created_at` | TEXT | No | now() | ISO timestamp |
| `created_by` | TEXT | Yes | - | Creator identifier |

**Scope Types:** `global`, `org`, `project`, `session`

**Categories:** `mcp`, `cli`, `function`, `api`

**Indexes:**
- Primary key on `id`
- `idx_tools_scope` on `(scope_type, scope_id)`

**Constraints:**
- Unique on `(scope_type, scope_id, name)`

---

### tool_versions

Append-only version history for tools.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `tool_id` | TEXT | No | - | FK to tools |
| `version_num` | INTEGER | No | - | Sequential version |
| `description` | TEXT | Yes | - | Tool description |
| `parameters` | TEXT | Yes | - | JSON parameter schema |
| `examples` | TEXT | Yes | - | JSON usage examples |
| `constraints` | TEXT | Yes | - | Usage limitations |
| `created_at` | TEXT | No | now() | ISO timestamp |
| `created_by` | TEXT | Yes | - | Creator identifier |
| `change_reason` | TEXT | Yes | - | Why updated |
| `conflict_flag` | INTEGER | No | 0 | Conflict marker |

**Indexes:**
- Primary key on `id`
- `idx_tool_versions_tool` on `tool_id`

**Constraints:**
- Unique on `(tool_id, version_num)`

---

### guidelines

Best practices and rules with versioning.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `scope_type` | TEXT | No | - | Scope level |
| `scope_id` | TEXT | Yes | - | Scope reference |
| `name` | TEXT | No | - | Guideline name |
| `category` | TEXT | Yes | - | Guideline category |
| `priority` | INTEGER | No | 50 | 0-100, higher = more important |
| `current_version_id` | TEXT | Yes | - | FK to guideline_versions |
| `is_active` | INTEGER | No | 1 | Soft delete flag |
| `created_at` | TEXT | No | now() | ISO timestamp |
| `created_by` | TEXT | Yes | - | Creator identifier |

**Categories:** `code_style`, `behavior`, `security`, `performance`, `error_handling`, `logging`

**Indexes:**
- Primary key on `id`
- `idx_guidelines_scope` on `(scope_type, scope_id)`

**Constraints:**
- Unique on `(scope_type, scope_id, name)`

---

### guideline_versions

Append-only version history for guidelines.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `guideline_id` | TEXT | No | - | FK to guidelines |
| `version_num` | INTEGER | No | - | Sequential version |
| `content` | TEXT | No | - | Guideline text |
| `rationale` | TEXT | Yes | - | Why this exists |
| `examples` | TEXT | Yes | - | JSON `{good:[], bad:[]}` |
| `created_at` | TEXT | No | now() | ISO timestamp |
| `created_by` | TEXT | Yes | - | Creator identifier |
| `change_reason` | TEXT | Yes | - | Why updated |
| `conflict_flag` | INTEGER | No | 0 | Conflict marker |

**Indexes:**
- Primary key on `id`
- `idx_guideline_versions_guideline` on `guideline_id`

**Constraints:**
- Unique on `(guideline_id, version_num)`

---

### knowledge

Facts, decisions, and context with versioning.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `scope_type` | TEXT | No | - | Scope level |
| `scope_id` | TEXT | Yes | - | Scope reference |
| `title` | TEXT | No | - | Entry title |
| `category` | TEXT | Yes | - | Knowledge category |
| `current_version_id` | TEXT | Yes | - | FK to knowledge_versions |
| `is_active` | INTEGER | No | 1 | Soft delete flag |
| `created_at` | TEXT | No | now() | ISO timestamp |
| `created_by` | TEXT | Yes | - | Creator identifier |

**Categories:** `decision`, `fact`, `context`, `reference`

**Indexes:**
- Primary key on `id`
- `idx_knowledge_scope` on `(scope_type, scope_id)`

**Constraints:**
- Unique on `(scope_type, scope_id, title)`

---

### knowledge_versions

Append-only version history for knowledge.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `knowledge_id` | TEXT | No | - | FK to knowledge |
| `version_num` | INTEGER | No | - | Sequential version |
| `content` | TEXT | No | - | Knowledge content |
| `source` | TEXT | Yes | - | Information source |
| `confidence` | REAL | No | 1.0 | Certainty (0-1) |
| `valid_until` | TEXT | Yes | - | Expiration timestamp |
| `created_at` | TEXT | No | now() | ISO timestamp |
| `created_by` | TEXT | Yes | - | Creator identifier |
| `change_reason` | TEXT | Yes | - | Why updated |
| `conflict_flag` | INTEGER | No | 0 | Conflict marker |

**Indexes:**
- Primary key on `id`
- `idx_knowledge_versions_knowledge` on `knowledge_id`

**Constraints:**
- Unique on `(knowledge_id, version_num)`

---

### tags

Hybrid tag taxonomy (predefined + custom).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `name` | TEXT | No | - | Tag name (unique) |
| `category` | TEXT | Yes | - | Tag category |
| `is_predefined` | INTEGER | No | 0 | Built-in tag flag |
| `description` | TEXT | Yes | - | Tag description |
| `created_at` | TEXT | No | now() | ISO timestamp |

**Categories:** `language`, `domain`, `category`, `meta`, `custom`

**Related MCP tools:** see `memory_tag` with actions `create`, `list`, `attach`, `detach`, and `for_entry` in [API Reference](./api-reference.md#memory_tag).

**Predefined Tags:**
- Languages: `python`, `typescript`, `javascript`, `rust`, `go`, `java`, `sql`, `bash`, `markdown`
- Domains: `web`, `cli`, `api`, `database`, `ml`, `devops`, `security`, `testing`, `documentation`
- Meta: `deprecated`, `experimental`, `stable`, `required`, `optional`

</details>

**Constraints:**
- Unique on `name`

---

### entry_tags

Polymorphic tag assignments.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `entry_type` | TEXT | No | - | Entity type |
| `entry_id` | TEXT | No | - | Entity ID |
| `tag_id` | TEXT | No | - | FK to tags |
| `created_at` | TEXT | No | now() | ISO timestamp |

**Entry Types:** `tool`, `guideline`, `knowledge`, `project`

**Indexes:**
- Primary key on `id`
- `idx_entry_tags_entry` on `(entry_type, entry_id)`
- `idx_entry_tags_tag` on `tag_id`

**Constraints:**
- Unique on `(entry_type, entry_id, tag_id)`

**Related MCP tools:** tag operations under [Tags](./api-reference.md#tags).

---

### entry_relations

Explicit links between entries.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `source_type` | TEXT | No | - | Source entity type |
| `source_id` | TEXT | No | - | Source entity ID |
| `target_type` | TEXT | No | - | Target entity type |
| `target_id` | TEXT | No | - | Target entity ID |
| `relation_type` | TEXT | No | - | Relation type |
| `created_at` | TEXT | No | now() | ISO timestamp |
| `created_by` | TEXT | Yes | - | Creator identifier |

**Relation Types:**
- `applies_to` - Guideline/tool applies to target
- `depends_on` - Source depends on target
- `conflicts_with` - Mutually exclusive
- `related_to` - General association
- `parent_task` - Source is parent task of target (for task decomposition)
- `subtask_of` - Source is subtask of target (inverse of parent_task)

**Indexes:**
- Primary key on `id`
- `idx_relations_source` on `(source_type, source_id)`
- `idx_relations_target` on `(target_type, target_id)`

**Constraints:**
- Unique on `(source_type, source_id, target_type, target_id, relation_type)`

**Related MCP tools:** `memory_relation` with actions `create`, `list`, `delete` in [API Reference](./api-reference.md#memory_relation).

---

### conflict_log

Concurrent write conflict tracking.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `entry_type` | TEXT | No | - | Entity type |
| `entry_id` | TEXT | No | - | Entity ID |
| `version_a_id` | TEXT | No | - | First version ID |
| `version_b_id` | TEXT | No | - | Conflicting version ID |
| `detected_at` | TEXT | No | now() | Detection timestamp |
| `resolved` | INTEGER | No | 0 | Resolution status |
| `resolution` | TEXT | Yes | - | Resolution method |
| `resolved_at` | TEXT | Yes | - | Resolution timestamp |
| `resolved_by` | TEXT | Yes | - | Resolver identifier |

**Indexes:**
- Primary key on `id`
- `idx_conflicts_unresolved` on `(entry_type, entry_id)` where `resolved = 0`

**Related MCP tools:** `memory_conflict` with actions `list` and `resolve` in [API Reference](./api-reference.md#memory_conflict).

---

### file_locks

File locks for multi-agent coordination.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `file_path` | TEXT | No | - | Absolute filesystem path |
| `checked_out_by` | TEXT | No | - | Agent/IDE identifier |
| `session_id` | TEXT | Yes | - | FK to sessions |
| `project_id` | TEXT | Yes | - | FK to projects |
| `checked_out_at` | TEXT | No | now() | Lock timestamp |
| `expires_at` | TEXT | Yes | - | Expiration timestamp |
| `metadata` | TEXT | Yes | - | JSON metadata |

**Indexes:**
- Primary key on `id`
- Unique index on `file_path`
- `idx_file_locks_agent` on `checked_out_by`
- `idx_file_locks_expires` on `expires_at`
- `idx_file_locks_project` on `project_id`

**Related MCP tools:** `memory_file_lock` with actions `checkout`, `checkin`, `status`, `list`, `force_unlock` in [API Reference](./api-reference.md#memory_file_lock).

---

### entry_embeddings

Tracks which entries have embeddings generated for semantic search.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `entry_type` | TEXT | No | - | Entity type: `tool`, `guideline`, `knowledge` |
| `entry_id` | TEXT | No | - | Entity ID |
| `version_id` | TEXT | No | - | Version ID |
| `has_embedding` | INTEGER | No | 0 | Whether embedding exists |
| `embedding_model` | TEXT | Yes | - | Model used for embedding |
| `embedding_provider` | TEXT | Yes | - | Provider: `openai`, `local`, `disabled` |
| `created_at` | TEXT | No | now() | ISO timestamp |
| `updated_at` | TEXT | No | now() | ISO timestamp |

**Indexes:**
- Primary key on `id`
- `idx_entry_embeddings_entry` on `(entry_type, entry_id)`
- `idx_entry_embeddings_status` on `has_embedding`
- Unique index on `(entry_type, entry_id, version_id)`

---

### permissions

Fine-grained access control for agents/users.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `agent_id` | TEXT | No | - | Agent/user identifier |
| `scope_type` | TEXT | Yes | - | Scope type: `global`, `org`, `project`, `session` |
| `scope_id` | TEXT | Yes | - | Scope ID (NULL = all scopes of this type) |
| `entry_type` | TEXT | Yes | - | Entry type: `tool`, `guideline`, `knowledge` |
| `entry_id` | TEXT | Yes | - | Entry ID (NULL = all entries in scope) |
| `permission` | TEXT | No | - | Permission level: `read`, `write`, `admin` |
| `created_at` | TEXT | No | now() | ISO timestamp |

**Indexes:**
- Primary key on `id`
- `idx_permissions_agent` on `agent_id`
- `idx_permissions_scope` on `(scope_type, scope_id)`
- `idx_permissions_entry` on `(entry_type, entry_id)`
- Unique index on `(agent_id, scope_type, scope_id, entry_type, entry_id, permission)`

**Related MCP tools:** `memory_permission` with actions `grant`, `revoke`, `check`, `list` in [API Reference](./api-reference.md#memory_permission).

---

### audit_log

Tracks all actions for compliance and debugging.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `agent_id` | TEXT | Yes | - | Agent identifier |
| `action` | TEXT | No | - | Action type: `query`, `create`, `update`, `delete` |
| `entry_type` | TEXT | Yes | - | Entry type: `tool`, `guideline`, `knowledge` |
| `entry_id` | TEXT | Yes | - | Entry ID |
| `scope_type` | TEXT | Yes | - | Scope type: `global`, `org`, `project`, `session` |
| `scope_id` | TEXT | Yes | - | Scope ID |
| `query_params` | TEXT | Yes | - | JSON query parameters (for queries) |
| `result_count` | INTEGER | Yes | - | Result count (for queries) |
| `execution_time` | INTEGER | Yes | - | Execution time in milliseconds |
| `success` | INTEGER | No | 1 | Success flag (1 = success, 0 = failure) |
| `error_message` | TEXT | Yes | - | Error message if failed |
| `subtask_type` | TEXT | Yes | - | Subtask type (for execution tracking) |
| `parent_task_id` | TEXT | Yes | - | Parent task ID (for subtask tracking) |
| `created_at` | TEXT | No | now() | ISO timestamp |

**Indexes:**
- Primary key on `id`
- `idx_audit_agent` on `agent_id`
- `idx_audit_action` on `action`
- `idx_audit_entry` on `(entry_type, entry_id)`
- `idx_audit_created` on `created_at`
- `idx_audit_execution` on `(success, subtask_type)`
- `idx_audit_parent_task` on `parent_task_id`

**Related MCP tools:** `memory_analytics` with actions `get_stats`, `get_trends`, `get_subtask_stats`, `get_error_correlation`, `get_low_diversity` in [API Reference](./api-reference.md#memory_analytics).

---

### agent_votes

Tracks votes from multiple agents for consensus (MDAP support).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `task_id` | TEXT | No | - | Task ID (references knowledge/tool entry) |
| `agent_id` | TEXT | No | - | Agent identifier |
| `vote_value` | TEXT | No | - | JSON string of agent's vote |
| `confidence` | REAL | No | 1.0 | Confidence level (0-1) |
| `reasoning` | TEXT | Yes | - | Reasoning for this vote |
| `created_at` | TEXT | No | now() | ISO timestamp |

**Indexes:**
- Primary key on `id`
- `idx_votes_task` on `task_id`
- `idx_votes_agent` on `agent_id`
- Unique index on `(task_id, agent_id)`

**Related MCP tools:** `memory_voting` with actions `record_vote`, `get_consensus`, `list_votes`, `get_stats` in [API Reference](./api-reference.md#memory_voting).

---

### conversations

Tracks conversation threads between agents and users.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `session_id` | TEXT | Yes | - | FK to sessions |
| `project_id` | TEXT | Yes | - | FK to projects |
| `agent_id` | TEXT | Yes | - | Agent identifier |
| `title` | TEXT | Yes | - | Conversation title |
| `status` | TEXT | No | `active` | Status: `active`, `completed`, `archived` |
| `started_at` | TEXT | No | now() | ISO timestamp |
| `ended_at` | TEXT | Yes | - | ISO timestamp (set when completed/archived) |
| `metadata` | TEXT | Yes | - | JSON metadata (tags, summary, etc.) |

**Indexes:**
- Primary key on `id`
- `idx_conversations_session` on `session_id`
- `idx_conversations_project` on `project_id`
- `idx_conversations_agent` on `agent_id`
- `idx_conversations_status` on `status`
- `idx_conversations_started` on `started_at`

**Related MCP tools:** `memory_conversation` with actions `start`, `add_message`, `get`, `list`, `update`, `link_context`, `get_context`, `search`, `end`, `archive` in [API Reference](./api-reference.md#memory_conversation).

---

### conversation_messages

Individual messages in conversations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `conversation_id` | TEXT | No | - | FK to conversations |
| `role` | TEXT | No | - | Message role: `user`, `agent`, `system` |
| `content` | TEXT | No | - | Message content |
| `message_index` | INTEGER | No | - | Order within conversation (0-based) |
| `context_entries` | TEXT | Yes | - | JSON array: `[{type: "tool"|"guideline"|"knowledge", id: string}]` |
| `tools_used` | TEXT | Yes | - | JSON array: `["memory_query", ...]` |
| `created_at` | TEXT | No | now() | ISO timestamp |
| `metadata` | TEXT | Yes | - | JSON metadata (tokens, model, confidence, etc.) |

**Indexes:**
- Primary key on `id`
- `idx_messages_conversation` on `conversation_id`
- `idx_messages_index` on `(conversation_id, message_index)`
- `idx_messages_role` on `(conversation_id, role)`

**Related MCP tools:** `memory_conversation` with action `add_message` in [API Reference](./api-reference.md#memory_conversation).

---

### conversation_context

Links memory entries to conversations/messages.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | No | - | Primary key (UUID) |
| `conversation_id` | TEXT | No | - | FK to conversations |
| `message_id` | TEXT | Yes | - | FK to conversation_messages (optional) |
| `entry_type` | TEXT | No | - | Entry type: `tool`, `guideline`, `knowledge` |
| `entry_id` | TEXT | No | - | Entry ID |
| `relevance_score` | REAL | Yes | - | Relevance score 0-1 |
| `created_at` | TEXT | No | now() | ISO timestamp |

**Indexes:**
- Primary key on `id`
- `idx_context_conversation` on `conversation_id`
- `idx_context_message` on `message_id`
- `idx_context_entry` on `(entry_type, entry_id)`
- Unique index on `(conversation_id, message_id, entry_type, entry_id)`

**Related MCP tools:** `memory_conversation` with actions `link_context`, `get_context` in [API Reference](./api-reference.md#memory_conversation).

---

</details>

## Scope Inheritance

The scope system enables hierarchical organization:

```
Global (scope_type: 'global', scope_id: NULL)
   │
   ├── Organization A (scope_type: 'org', scope_id: 'org_a')
   │      │
   │      ├── Project 1 (scope_type: 'project', scope_id: 'proj_1')
   │      │      │
   │      │      └── Session X (scope_type: 'session', scope_id: 'sess_x')
   │      │
   │      └── Project 2 (scope_type: 'project', scope_id: 'proj_2')
   │
   └── Organization B (scope_type: 'org', scope_id: 'org_b')
```

### Query Resolution

When querying with inheritance enabled:

1. Start at requested scope
2. Walk up to parent scopes
3. Merge results (more specific overrides general)
4. Return combined set

**Example:** Query guidelines for `session_x`:
1. Get session_x guidelines
2. Add project_1 guidelines (not already present)
3. Add org_a guidelines (not already present)
4. Add global guidelines (not already present)

---

## Versioning System

<details>
<summary><strong>Show details</strong></summary>

### Append-Only Updates

All changes create new versions:

```
Tool "git_commit"
├── Version 1 (created: 2024-12-01)
│   └── description: "Commit changes"
├── Version 2 (created: 2024-12-05)
│   └── description: "Commit staged changes"
│   └── change_reason: "Clarified scope"
└── Version 3 (current, created: 2024-12-10)
    └── description: "Commit staged changes to repository"
    └── change_reason: "Added repository context"
```

### Current Version Pointer

Each entry has `current_version_id` pointing to the latest version:
- Updates increment version number
- Previous versions preserved
- History accessible via `*_history` tools

### Conflict Detection

When two updates occur within 5 seconds:

1. Both versions are created
2. Later version gets `conflict_flag = true`
3. Entry added to `conflict_log`
4. Queries can warn about unresolved conflicts

---

</details>

## JSON Fields

<details>
<summary><strong>Show details</strong></summary>

Several columns store JSON data:

### parameters (tool_versions)

```json
{
  "required": ["message"],
  "optional": ["files", "amend"],
  "schema": {
    "message": { "type": "string", "description": "Commit message" },
    "files": { "type": "array", "items": "string" },
    "amend": { "type": "boolean", "default": false }
  }
}
```

### examples (tool_versions)

```json
[
  {
    "description": "Simple commit",
    "input": { "message": "Fix bug" },
    "output": "Committed abc123"
  }
]
```

### examples (guideline_versions)

```json
{
  "good": [
    "async function fetch() { try { await api.get() } catch (e) { handle(e) } }"
  ],
  "bad": [
    "async function fetch() { await api.get() } // unhandled rejection"
  ]
}
```

### metadata (projects, sessions)

```json
{
  "goals": ["Launch MVP", "Improve performance"],
  "constraints": ["No external dependencies", "Must support IE11"],
  "currentState": "In development",
  "team": ["alice", "bob"]
}
```
