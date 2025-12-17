# Database Initialization

Agent Memory includes an automatic database initialization system that ensures the database schema is always up-to-date when the server starts.

## How It Works

### Automatic Initialization

When the MCP server starts, it automatically:

1. **Checks if the database exists** - Creates the database file if needed
2. **Tracks applied migrations** - Maintains a `_migrations` table to track which migrations have been applied
3. **Applies pending migrations** - Runs any SQL migration files that haven't been applied yet
4. **Validates schema** - Ensures all required tables are present

This happens transparently on first startup - no manual intervention required!

### Migration Files

Migration files are stored in `src/db/migrations/`:

- `0000_lying_the_hand.sql` - Base schema (organizations, projects, sessions, tools, guidelines, knowledge, tags, relations, conflicts)
- `0001_add_file_locks.sql` - File locks for multi-agent coordination

The system automatically applies them in order based on filename sorting.

## Manual Control

### memory_init Tool

The MCP server exposes a `memory_init` tool for manual database management:

#### Check Status

```json
{
  "action": "status"
}
```

Returns:
- `initialized`: Whether the database has been initialized
- `appliedMigrations`: List of migrations that have been applied
- `pendingMigrations`: List of migrations that need to be applied
- `status`: Overall status (`ready`, `needs_migration`, or `not_initialized`)

#### Initialize/Migrate

```json
{
  "action": "init",
  "force": false,
  "verbose": true
}
```

Parameters:
- `force` (optional): Force re-initialization even if already initialized
- `verbose` (optional): Enable detailed logging

#### Reset Database

**⚠️ WARNING: This deletes all data!**

```json
{
  "action": "reset",
  "confirm": true,
  "verbose": true
}
```

Parameters:
- `confirm` (required): Must be `true` to proceed
- `verbose` (optional): Enable detailed logging

## Environment Variables

### AGENT_MEMORY_SKIP_INIT

Set to `'1'` to skip automatic database initialization:

```bash
AGENT_MEMORY_SKIP_INIT=1
```

Useful for:
- Running against a pre-initialized database
- Custom initialization workflows
- Testing scenarios

### AGENT_MEMORY_DB_PATH

Override the default database location:

```bash
AGENT_MEMORY_DB_PATH=/custom/path/memory.db
```

Default: `data/memory.db` (resolved relative to the Agent Memory project root; for npm installs this is the `agent-memory` module directory)

On Unix/macOS you can also use `~` to reference your home directory (example: `AGENT_MEMORY_DB_PATH=~/.agent-memory/memory.db`).

### AGENT_MEMORY_PERF

Enable verbose initialization logging:

```bash
AGENT_MEMORY_PERF=1
```

Shows migration application progress and timing.

## Migration Tracking

The system uses a `_migrations` table to track which migrations have been applied:

```sql
CREATE TABLE _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
)
```

This ensures:
- **Idempotency** - Migrations are never applied twice
- **Order preservation** - Migrations run in sequence
- **Auditability** - You can see when each migration was applied

## Development Workflow

### Adding New Migrations

1. Generate a new migration:
   ```bash
   npm run db:generate
   ```

2. This creates a new SQL file in `src/db/migrations/`

3. The migration will be automatically applied on next server start

### Testing Migrations

```bash
# Run the test script
npm run build
node dist/test-init.js
```

This verifies:
- Database initializes successfully
- All migrations apply correctly
- All tables are created

## Troubleshooting

<details>
<summary><strong>Show details</strong></summary>

### "No migration files found"

The migrations directory couldn't be located. Ensure:
- You're running from the project root
- The `src/db/migrations/` directory exists
- Migration files have `.sql` extension

### "Migration failed"

Check:
- SQL syntax in the migration file
- Foreign key constraints
- Unique index violations

Run with `verbose: true` for detailed error information.

### Reset and Start Fresh

If you need to completely reset:

```javascript
// Using the MCP tool
{
  "action": "reset",
  "confirm": true
}
```

Or manually:

```bash
# Delete the database file
rm -rf data/memory.db*

# Restart the server (auto-initializes)
```

</details>

## Best Practices

1. **Never edit applied migrations** - Create a new migration instead
2. **Test migrations locally** - Use the test script before deploying
3. **Keep migrations small** - One logical change per migration
4. **Use transactions** - Migrations run in transactions for safety
5. **Document breaking changes** - Add comments in migration files

## Architecture

<details>
<summary><strong>Show details</strong></summary>

The initialization system consists of three main components:

### 1. `src/db/init.ts`

Core initialization logic:
- `initializeDatabase()` - Apply pending migrations
- `getMigrationStatus()` - Check current state
- `resetDatabase()` - Drop all tables and re-initialize

### 2. `src/db/connection.ts`

Database connection with auto-init:
- Calls `initializeDatabase()` on first connection
- Only runs once per server lifetime
- Can be disabled with `AGENT_MEMORY_SKIP_INIT`

### 3. `src/mcp/handlers/init.handler.ts`

MCP tool handlers for manual control:
- Exposes init, status, and reset actions
- Provides user-friendly responses
- Includes safety checks (e.g., confirm for reset)

</details>

## Examples

<details>
<summary><strong>Show details</strong></summary>

### Check if Database Needs Migration

```typescript
import { getSqlite } from './db/connection.js';
import { getMigrationStatus } from './db/init.js';

const sqlite = getSqlite();
const status = getMigrationStatus(sqlite);

if (status.pendingMigrations.length > 0) {
  console.log('Migrations needed:', status.pendingMigrations);
}
```

### Manually Initialize

```typescript
import { getSqlite } from './db/connection.js';
import { initializeDatabase } from './db/init.js';

const sqlite = getSqlite();
const result = initializeDatabase(sqlite, { verbose: true });

if (result.success) {
  console.log('Applied:', result.migrationsApplied);
}
```

### Custom Initialization Logic

```typescript
import { getDb } from './db/connection.js';

// Skip auto-init
const db = getDb({ skipInit: true });

// Run custom initialization
// ... your logic here ...
```

</details>

## Future Enhancements

<details>
<summary><strong>Show details</strong></summary>

Potential improvements:

- **Migration rollback** - Undo migrations
- **Migration versioning** - Tag migrations with versions
- **Migration validation** - Lint SQL before applying
- **Migration dry-run** - Preview changes without applying
- **Migration dependencies** - Declare inter-migration dependencies

</details>
