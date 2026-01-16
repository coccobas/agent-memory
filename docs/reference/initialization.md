# Initialization and Migrations

Agent Memory auto-initializes its SQLite database and applies migrations on startup.

## Auto Initialization

By default, the server will:

1. Create the database file if missing.
2. Create the `_migrations` table.
3. Apply any pending SQL migrations in `src/db/migrations` (or `dist/db/migrations` in production builds).

## Configuration

| Variable                          | Default | Description                              |
| --------------------------------- | ------- | ---------------------------------------- |
| `AGENT_MEMORY_SKIP_INIT`          | `false` | Skip auto-initialization/migrations.     |
| `AGENT_MEMORY_DEV_MODE`           | `false` | Enables dev-oriented behaviors.          |
| `AGENT_MEMORY_AUTO_FIX_CHECKSUMS` | `false` | Auto-fix checksum mismatches (dev only). |

## Manual initialization via MCP

Use the MCP tool `memory_init`:

```json
{ "action": "init" }
```

Other actions:

- `status`: check migration state
- `reset`: reset database (requires explicit confirmation)

## Safety Notes

- Only `DROP`/`ALTER` statements with missing tables are skipped. Other errors fail fast.
- Use `AGENT_MEMORY_SKIP_INIT=true` only if you manage migrations externally.
