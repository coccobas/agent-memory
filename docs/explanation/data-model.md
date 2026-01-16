# Data Model

Agent Memory stores three entry types across hierarchical scopes.

## Scopes

Memory is organized in a hierarchy. Queries inherit from parent scopes:

```
Global            → Universal patterns (security, best practices)
└── Organization  → Team-wide standards
    └── Project   → Project-specific decisions
        └── Session → Working context (ephemeral)
```

| Scope       | Purpose                      | Inheritance           |
| ----------- | ---------------------------- | --------------------- |
| **Global**  | Universal rules and patterns | Root (no parent)      |
| **Org**     | Team/organization standards  | Inherits from Global  |
| **Project** | Project-specific knowledge   | Inherits from Org     |
| **Session** | Working context, experiments | Inherits from Project |

### Inheritance Behavior

When querying with `inherit: true`:

```json
{
  "action": "context",
  "scopeType": "project",
  "scopeId": "proj-123",
  "inherit": true
}
```

Results include:

1. Project-scoped entries
2. Organization-scoped entries (if project has an org)
3. Global-scoped entries

---

## Entry Types

### Guidelines

Rules and best practices that affect agent behavior.

| Field       | Description                                        |
| ----------- | -------------------------------------------------- |
| `name`      | Unique identifier (e.g., "no-any-type")            |
| `content`   | The rule text                                      |
| `category`  | Optional category (e.g., "code_style", "security") |
| `priority`  | 0-100, higher = more important                     |
| `rationale` | Why this guideline exists                          |

**When to use:** "We always...", "Never...", coding standards, security policies.

### Knowledge

Facts, decisions, and contextual information.

| Field        | Description                                |
| ------------ | ------------------------------------------ |
| `title`      | Descriptive title                          |
| `content`    | The fact or decision                       |
| `category`   | `decision`, `fact`, `context`, `reference` |
| `confidence` | 0-1, how certain is this knowledge         |
| `source`     | Where this knowledge came from             |
| `validUntil` | Optional expiration date                   |

**When to use:** "We chose X because...", "The system uses...", architectural decisions.

### Tools

Operational knowledge like CLI commands, API calls, or workflow patterns.

| Field         | Description                      |
| ------------- | -------------------------------- |
| `name`        | Tool name (e.g., "docker-build") |
| `description` | What this tool does              |
| `category`    | `mcp`, `cli`, `function`, `api`  |
| `parameters`  | JSON schema for parameters       |
| `examples`    | Usage examples                   |
| `constraints` | Usage constraints                |

**When to use:** CLI commands, API endpoints, scripts, reusable patterns.

---

## Versioning

Every entry is versioned on update:

```json
{
  "id": "guide-abc123",
  "name": "no-any-type",
  "version": 3,
  "currentVersion": {
    "content": "Never use 'any' type in TypeScript",
    "createdAt": "2024-01-15T10:30:00Z",
    "createdBy": "claude-code"
  }
}
```

### Retrieving History

```json
{
  "action": "history",
  "id": "guide-abc123"
}
```

Returns all versions with their content and metadata.

---

## Tags

Tags categorize entries and enable filtering:

```json
{
  "action": "attach",
  "entryType": "guideline",
  "entryId": "guide-abc123",
  "tagName": "typescript"
}
```

### Tag Categories

| Category   | Purpose                                   |
| ---------- | ----------------------------------------- |
| `language` | Programming language (typescript, python) |
| `domain`   | Domain area (security, performance)       |
| `category` | Entry category (code_style, architecture) |
| `meta`     | Metadata (deprecated, experimental)       |
| `custom`   | User-defined tags                         |

### Filtering by Tags

```json
{
  "action": "search",
  "tags": {
    "include": ["typescript"],
    "exclude": ["deprecated"]
  }
}
```

---

## Relations

Relations link entries across types:

| Relation Type    | Meaning                             |
| ---------------- | ----------------------------------- |
| `applies_to`     | Guideline applies to knowledge/tool |
| `depends_on`     | Entry depends on another            |
| `conflicts_with` | Entries are mutually exclusive      |
| `related_to`     | General relationship                |
| `parent_task`    | Task hierarchy                      |
| `subtask_of`     | Task hierarchy                      |

### Creating Relations

```json
{
  "action": "create",
  "sourceType": "guideline",
  "sourceId": "guide-abc",
  "targetType": "knowledge",
  "targetId": "know-xyz",
  "relationType": "applies_to"
}
```

**Tool:** `memory_relation`

---

## Permissions

Permissions control who can read/write entries:

| Permission | Access                         |
| ---------- | ------------------------------ |
| `read`     | View entries                   |
| `write`    | Create, update, delete entries |
| `admin`    | Manage permissions             |

### Default Behavior

- **Strict mode** (default): Deny unless explicit permission exists
- **Permissive mode**: Allow if no explicit deny

```bash
# Enable permissive mode
AGENT_MEMORY_PERMISSIONS_MODE=permissive
```

---

## See Also

- [Architecture](architecture.md) - System design
- [Security Model](security-model.md) - Permission details
- [MCP Tools Reference](../reference/mcp-tools.md) - API documentation
