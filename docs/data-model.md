# Data Model

Agent Memory stores three entry types across hierarchical scopes.

## Scopes

- **Global**: applies everywhere.
- **Org**: shared within an organization.
- **Project**: project-specific knowledge.
- **Session**: ephemeral working context.

Scopes inherit from broader to narrower.

## Entry Types

### Tools

Operational knowledge such as CLI commands, API calls, or workflow patterns.

### Guidelines

Rules and best practices. Often used for code standards and security policies.

### Knowledge

Facts, decisions, and contextual information.

## Versioning

- Each entry is versioned on update.
- History can be retrieved via `history` actions.

## Tags and Relations

- Tags categorize entries and enable filtering.
- Relations link entries across types (e.g., guideline -> knowledge).

## Permissions

Permissions are scoped and can be set at entry or type levels.
Default is deny unless permissions exist or permissive mode is enabled.
