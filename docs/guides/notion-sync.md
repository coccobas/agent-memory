# Notion Database Sync

Sync Notion databases to Agent Memory tasks with version history tracking. This enables fast local access to your Notion data plus a complete change audit trail.

## Overview

The Notion sync feature:

- **One-way sync**: Notion → Agent Memory (read-only backup)
- **Daily scheduled sync**: Configurable cron schedule (default: 5 AM daily)
- **Version history**: Every change creates a new version (append-only)
- **Multiple databases**: Sync multiple Notion databases with custom field mappings
- **Audit trail**: Import evidence records track every sync operation

## Quick Start

### 1. Set Environment Variables

```bash
# Required: Your Notion integration token
export NOTION_API_KEY=secret_xxx

# Optional: Enable scheduled sync
export AGENT_MEMORY_NOTION_SYNC_ENABLED=true

# Optional: Custom schedule (default: daily at 5 AM)
export AGENT_MEMORY_NOTION_SYNC_SCHEDULE="0 5 * * *"
```

### 2. Create Configuration File

Create `notion-sync.config.json` in your project root:

```json
{
  "databases": [
    {
      "id": "your-notion-database-id",
      "name": "Project Tasks",
      "projectId": "your-agent-memory-project-id",
      "fieldMappings": {
        "title": "Name",
        "description": "Description",
        "status": "Status",
        "assignee": "Assignee",
        "dueDate": "Due Date",
        "severity": "Priority",
        "tags": "Tags"
      }
    }
  ]
}
```

### 3. Trigger Manual Sync

Use the MCP tool to sync immediately:

```json
{ "action": "sync" }
```

Or sync a specific database:

```json
{ "action": "sync", "databaseId": "abc123-def456-..." }
```

## Configuration

### Environment Variables

| Variable                               | Default                     | Description                       |
| -------------------------------------- | --------------------------- | --------------------------------- |
| `NOTION_API_KEY`                       | (required)                  | Notion integration token          |
| `AGENT_MEMORY_NOTION_SYNC_ENABLED`     | `false`                     | Enable scheduled sync             |
| `AGENT_MEMORY_NOTION_SYNC_SCHEDULE`    | `0 5 * * *`                 | Cron expression for sync schedule |
| `AGENT_MEMORY_NOTION_SYNC_CONFIG_PATH` | `./notion-sync.config.json` | Path to config file               |

### Config File Schema

```typescript
interface NotionSyncConfig {
  databases: Array<{
    // Notion database ID (from URL or API)
    id: string;

    // Human-readable name for logging
    name: string;

    // Agent Memory project to sync into
    projectId: string;

    // Map Agent Memory task fields to Notion property names
    fieldMappings: {
      title?: string; // Task title (required)
      description?: string; // Task description
      status?: string; // Task status
      assignee?: string; // Assigned person
      dueDate?: string; // Due date
      severity?: string; // Priority/severity
      tags?: string; // Tags (multi-select)
    };

    // Optional: Only sync items matching this filter
    filter?: NotionFilter;

    // Optional: Custom sync interval override
    syncInterval?: string;
  }>;
}
```

### Supported Notion Property Types

| Notion Type    | Agent Memory Field   | Notes                  |
| -------------- | -------------------- | ---------------------- |
| `title`        | `title`              | Required for task name |
| `rich_text`    | `description`        | Plain text extraction  |
| `number`       | `estimatedMinutes`   | Numeric values         |
| `select`       | `status`, `severity` | Single selection       |
| `multi_select` | `tags`               | Array of strings       |
| `date`         | `dueDate`            | ISO date format        |
| `checkbox`     | (metadata)           | Boolean values         |
| `status`       | `status`             | Notion status property |
| `people`       | `assignee`           | First person's name    |

Unsupported property types are stored in task metadata as JSON.

## MCP Tool Reference

### Actions

#### `sync`

Trigger manual sync of Notion databases.

```json
{
  "action": "sync",
  "databaseId": "optional-specific-database-id",
  "fullSync": false,
  "dryRun": false
}
```

| Parameter    | Type    | Description                                |
| ------------ | ------- | ------------------------------------------ |
| `databaseId` | string  | Sync specific database (optional)          |
| `fullSync`   | boolean | Ignore last sync timestamp, sync all items |
| `dryRun`     | boolean | Preview changes without applying           |

#### `status`

Get scheduler and sync configuration status.

```json
{ "action": "status" }
```

Returns:

- Scheduler enabled/disabled
- Next scheduled sync time
- Last sync timestamp per database
- Configuration validation status

#### `list_databases`

List configured Notion databases.

```json
{ "action": "list_databases" }
```

## Version History

Every sync creates version records for changed tasks:

```sql
-- Query version history for a task
SELECT * FROM task_versions
WHERE task_id = 'task-uuid'
ORDER BY version DESC;
```

Version records include:

- `version`: Incrementing version number
- `changedFields`: JSON of which fields changed
- `previousValues`: JSON of old values
- `changeSource`: Always `'notion_sync'` for synced tasks
- `createdAt`: Timestamp of the change

## Import Evidence

Each sync operation creates an evidence record for audit:

```json
{
  "evidenceType": "document",
  "title": "Notion Sync: Project Tasks",
  "source": "notion_sync",
  "metadata": {
    "databaseId": "abc123",
    "databaseName": "Project Tasks",
    "syncType": "incremental",
    "itemsProcessed": 42,
    "itemsCreated": 5,
    "itemsUpdated": 12,
    "itemsDeleted": 0,
    "duration": 1234
  }
}
```

## Rate Limiting

The sync respects Notion's API limits:

- **3 requests per second** rate limit
- Automatic retry with exponential backoff
- Circuit breaker for sustained failures

## Conflict Resolution

When both Notion and Agent Memory have changes:

- **Notion wins**: The Notion value is used
- **Conflict logged**: A warning is logged with both values
- **Version preserved**: The overwritten value is in version history

## Troubleshooting

### Sync Not Running

1. Check `AGENT_MEMORY_NOTION_SYNC_ENABLED=true`
2. Verify `NOTION_API_KEY` is set
3. Check config file path and validity
4. Review logs for errors

### Permission Errors

Ensure your Notion integration has:

- Read access to the database
- Access shared with the integration in Notion

### Missing Data

- Check field mappings match Notion property names exactly
- Verify property types are supported
- Check filter configuration if using

### Rate Limit Errors

The sync automatically handles rate limits, but if you see persistent errors:

- Reduce number of databases synced simultaneously
- Increase sync interval
- Check for other processes using the same API key

## Example: Full Setup

```bash
# 1. Create Notion integration at https://www.notion.so/my-integrations
# 2. Share your database with the integration

# 3. Set environment
export NOTION_API_KEY=secret_abc123
export AGENT_MEMORY_NOTION_SYNC_ENABLED=true

# 4. Create config
cat > notion-sync.config.json << 'EOF'
{
  "databases": [
    {
      "id": "12345678-abcd-1234-abcd-123456789abc",
      "name": "Sprint Tasks",
      "projectId": "proj_abc123",
      "fieldMappings": {
        "title": "Task Name",
        "description": "Details",
        "status": "Status",
        "assignee": "Owner",
        "dueDate": "Due",
        "severity": "Priority",
        "tags": "Labels"
      }
    }
  ]
}
EOF

# 5. Start Agent Memory
npx agent-memory mcp

# 6. Trigger initial sync via MCP tool
# {"action": "sync", "fullSync": true}
```

## Security Notes

- **Never commit** `NOTION_API_KEY` to version control
- Use environment variables or secrets management
- The config file should not contain sensitive data
- Sync is read-only; Agent Memory cannot modify Notion
