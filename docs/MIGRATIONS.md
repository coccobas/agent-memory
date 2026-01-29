# Database Migrations Guide

## Overview

Agent Memory uses a dual-tracking system for database migrations:

1. **Application tracking** via `_migrations` table (used at runtime)
2. **Drizzle-kit journal** via `src/db/migrations/meta/_journal.json` (used by CLI tools)

## Migration Workflow

### Adding a New Migration

1. **Generate the migration**:

   ```bash
   npm run db:generate
   ```

2. **Sync the journal** (ensures both systems are in sync):

   ```bash
   npm run db:sync-journal
   ```

3. **Test locally**:

   ```bash
   npm run db:migrate  # Or just restart the server - migrations auto-apply
   ```

4. **Commit both the migration file AND the updated journal**:
   ```bash
   git add src/db/migrations/*.sql src/db/migrations/meta/_journal.json
   git commit -m "Add migration: <description>"
   ```

## Migration Health Checks

The system automatically performs health checks on startup:

### Runtime Checks

- ✅ Detects pending migrations and applies them automatically
- ✅ Verifies migration checksums to detect tampering
- ✅ Validates critical tables exist after migrations
- ✅ Logs warnings if schema drift is detected

### Manual Verification

Check migration status:

```bash
# Via CLI
npx agent-memory init status

# Via MCP tool
memory_init({ action: "status" })

# Via SQL
sqlite3 ~/.agent-memory/memory.db "SELECT name FROM _migrations ORDER BY applied_at;"
```

## Common Issues

### Issue: "table already exists" during migration

**Cause**: Migration journal out of sync with actual applied migrations.

**Solution**:

```bash
# Option 1: Sync the journal
npm run db:sync-journal

# Option 2: Mark manually applied migrations
sqlite3 ~/.agent-memory/memory.db "INSERT OR IGNORE INTO _migrations (name, checksum) VALUES ('0028_add_episodes.sql', 'manual_fix');"
```

### Issue: Episodes list returns empty after adding episodes

**Cause**: Database schema missing columns (migrations not applied).

**Solution**:

```bash
# Check for pending migrations
npx agent-memory init status

# Apply pending migrations
npx agent-memory init init

# Or restart the server (auto-applies)
```

### Issue: Drizzle-kit fails with "already exists" error

**Cause**: Drizzle journal tracking is corrupted/out of sync.

**Solution**:

```bash
# Rebuild the journal from actual migration files
npm run db:sync-journal

# Verify it matches the database
npm run db:migrate
```

## Best Practices

### DO ✅

- Always run `db:sync-journal` after generating migrations
- Commit both migration files and the journal together
- Use checksum validation in production
- Test migrations locally before deploying
- Back up the database before running migrations in production

### DON'T ❌

- Manually edit applied migrations (will fail checksum validation)
- Skip migrations or cherry-pick them out of order
- Commit migrations without updating the journal
- Run drizzle-kit commands without syncing the journal afterward
- Assume migrations will auto-apply in all environments

## Emergency Procedures

### Corrupted Migration State

If migrations are severely out of sync:

1. **Back up the database**:

   ```bash
   npm run db:backup
   ```

2. **Check current state**:

   ```bash
   sqlite3 ~/.agent-memory/memory.db ".tables"
   sqlite3 ~/.agent-memory/memory.db "SELECT COUNT(*) FROM _migrations;"
   ```

3. **Sync journal**:

   ```bash
   npm run db:sync-journal
   ```

4. **Force re-check**:

   ```bash
   npx agent-memory init status
   ```

5. **If tables are missing, manually add columns**:

   ```sql
   -- Example: Add missing episodes columns
   ALTER TABLE episodes ADD COLUMN project_id TEXT REFERENCES projects(id);
   ALTER TABLE episodes ADD COLUMN conversation_id TEXT REFERENCES conversations(id);

   -- Then mark migration as applied
   INSERT INTO _migrations (name, checksum) VALUES ('0038_add_project_id_to_episodes.sql', 'manual_fix');
   ```

### Complete Reset (CAUTION: Data Loss)

Only use this if migration state is irrecoverable:

```bash
# Back up first!
npm run db:backup

# Reset database
npx agent-memory init reset --confirm

# Verify clean state
npx agent-memory init status
```

## Architecture Notes

### Why Two Tracking Systems?

1. **`_migrations` table** (application):
   - Runtime migration tracking
   - Checksum validation
   - Multi-process safe (transaction-based)
   - Platform-independent

2. **Drizzle journal** (tooling):
   - Used by drizzle-kit CLI tools
   - Enables schema introspection
   - Required for `db:generate` to work correctly
   - Prone to corruption if not kept in sync

### Auto-Initialization

The database automatically initializes on first startup:

- Creates `_migrations` table
- Applies all pending migrations in order
- Validates checksums of applied migrations
- Clears prepared statement cache after schema changes

### Checksum Validation

Each migration has a SHA-256 checksum stored in `_migrations.checksum`:

- Detects if migration files have been modified after application
- Fails initialization if checksums don't match (unless `force=true`)
- Auto-fixes in development mode if `database.autoFixChecksums=true`

## Troubleshooting

### Enable Verbose Logging

```bash
# Set in config or env
VERBOSE=true npx agent-memory

# Or use init command
npx agent-memory init init --verbose
```

### Check Journal Sync

```bash
# Count entries in journal
cat src/db/migrations/meta/_journal.json | jq '.entries | length'

# Count migration files
ls -1 src/db/migrations/*.sql | wc -l

# Should match!
```

### Verify Schema Integrity

```bash
# Check episodes table columns
sqlite3 ~/.agent-memory/memory.db "PRAGMA table_info(episodes);" | grep -E "project_id|conversation_id"

# Should output:
# 22|project_id|TEXT|0||0
# 23|conversation_id|TEXT|0||0
```

## Related Commands

```bash
# Database operations
npm run db:backup          # Backup database
npm run db:restore <file>  # Restore from backup
npm run db:studio          # Open Drizzle Studio GUI

# Migration operations
npm run db:generate        # Generate new migration
npm run db:migrate         # Apply migrations (drizzle-kit)
npm run db:sync-journal    # Sync journal with files

# Health checks
npx agent-memory init status   # Check migration status
npx agent-memory init init     # Force apply migrations
npx agent-memory init verify   # Verify integrity
```

## See Also

- [Database Schema](../src/db/schema/README.md)
- [Configuration Guide](./CONFIGURATION.md)
- [Deployment Guide](./DEPLOYMENT.md)
