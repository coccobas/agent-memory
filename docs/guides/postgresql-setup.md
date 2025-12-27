# PostgreSQL Setup Guide

Configure Agent Memory to use PostgreSQL for enterprise deployments.

> **See also:** [Deployment Modes](deployment-modes.md) for comparing SQLite vs PostgreSQL vs Redis

## Prerequisites

- PostgreSQL 14+ installed and running
- Database created for Agent Memory
- Network access to PostgreSQL server

---

## Quick Start

```bash
AGENT_MEMORY_DB_TYPE=postgresql \
AGENT_MEMORY_PG_HOST=localhost \
AGENT_MEMORY_PG_DATABASE=agent_memory \
AGENT_MEMORY_PG_USER=postgres \
AGENT_MEMORY_PG_PASSWORD=your-password \
agent-memory mcp
```

---

## When to Use PostgreSQL

| Use Case | Recommended Backend |
|----------|---------------------|
| Single developer | SQLite (default) |
| Small team, single server | SQLite |
| Multiple servers | PostgreSQL |
| High availability required | PostgreSQL |
| Large datasets (10M+ entries) | PostgreSQL |

---

## Configuration

### Required Settings

```bash
# Switch to PostgreSQL backend
AGENT_MEMORY_DB_TYPE=postgresql

# Connection settings
AGENT_MEMORY_PG_HOST=localhost
AGENT_MEMORY_PG_PORT=5432
AGENT_MEMORY_PG_DATABASE=agent_memory
AGENT_MEMORY_PG_USER=postgres
AGENT_MEMORY_PG_PASSWORD=your-password
```

### Optional Settings

```bash
# Enable SSL (recommended for production)
AGENT_MEMORY_PG_SSL=true

# Connection pool settings
AGENT_MEMORY_PG_POOL_MIN=2
AGENT_MEMORY_PG_POOL_MAX=10

# Timeouts
AGENT_MEMORY_PG_IDLE_TIMEOUT_MS=30000
AGENT_MEMORY_PG_CONNECTION_TIMEOUT_MS=10000
AGENT_MEMORY_PG_STATEMENT_TIMEOUT_MS=30000
```

---

## Database Setup

### 1. Create Database

```sql
CREATE DATABASE agent_memory;
CREATE USER agent_memory_user WITH PASSWORD 'secure-password';
GRANT ALL PRIVILEGES ON DATABASE agent_memory TO agent_memory_user;
```

### 2. Grant Schema Permissions

Connect to the `agent_memory` database:

```sql
\c agent_memory
GRANT ALL ON SCHEMA public TO agent_memory_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO agent_memory_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO agent_memory_user;
```

### 3. Initialize Schema

Agent Memory automatically runs migrations on startup:

```bash
AGENT_MEMORY_DB_TYPE=postgresql \
AGENT_MEMORY_PG_HOST=localhost \
AGENT_MEMORY_PG_DATABASE=agent_memory \
AGENT_MEMORY_PG_USER=agent_memory_user \
AGENT_MEMORY_PG_PASSWORD=secure-password \
agent-memory mcp
```

Check logs for migration output.

---

## Connection Pooling

PostgreSQL uses connection pooling for efficiency:

| Setting | Default | Description |
|---------|---------|-------------|
| `AGENT_MEMORY_PG_POOL_MIN` | 2 | Minimum connections kept open |
| `AGENT_MEMORY_PG_POOL_MAX` | 10 | Maximum concurrent connections |
| `AGENT_MEMORY_PG_IDLE_TIMEOUT_MS` | 30000 | Close idle connections after this time |

### Recommendations

| Deployment | Min | Max |
|------------|-----|-----|
| Development | 1 | 5 |
| Small production | 2 | 10 |
| High traffic | 5 | 20 |

---

## SSL/TLS Configuration

### Enable SSL

```bash
AGENT_MEMORY_PG_SSL=true
```

### PostgreSQL Server SSL Setup

In `postgresql.conf`:
```
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
```

In `pg_hba.conf`:
```
hostssl all all 0.0.0.0/0 md5
```

---

## Docker Compose Example

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: agent_memory
      POSTGRES_USER: agent_memory_user
      POSTGRES_PASSWORD: secure-password
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  agent-memory:
    image: ghcr.io/anthropics/agent-memory:latest
    environment:
      AGENT_MEMORY_DB_TYPE: postgresql
      AGENT_MEMORY_PG_HOST: postgres
      AGENT_MEMORY_PG_DATABASE: agent_memory
      AGENT_MEMORY_PG_USER: agent_memory_user
      AGENT_MEMORY_PG_PASSWORD: secure-password
    depends_on:
      - postgres

volumes:
  pgdata:
```

---

## Migration from SQLite

### 1. Export from SQLite

```json
{
  "action": "export",
  "format": "json"
}
```

**Tool:** `memory_export`

### 2. Start PostgreSQL Instance

Configure PostgreSQL as shown above.

### 3. Import to PostgreSQL

```json
{
  "action": "import",
  "content": "<exported-json>",
  "format": "json",
  "admin_key": "your-admin-key"
}
```

**Tool:** `memory_import`

---

## Monitoring

### Check Connection Status

```json
{}
```

**Tool:** `memory_health`

Response includes:
```json
{
  "database": {
    "type": "postgresql",
    "connected": true,
    "poolSize": 5,
    "idleConnections": 3
  }
}
```

### PostgreSQL Logs

Monitor PostgreSQL logs for connection issues:
```bash
tail -f /var/log/postgresql/postgresql-16-main.log
```

---

## Troubleshooting

### Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Fix:** Ensure PostgreSQL is running:
```bash
sudo systemctl status postgresql
```

### Authentication Failed

```
Error: password authentication failed for user "postgres"
```

**Fix:** Check `pg_hba.conf` and user credentials.

### SSL Required

```
Error: SSL/TLS required
```

**Fix:** Enable SSL:
```bash
AGENT_MEMORY_PG_SSL=true
```

### Connection Timeout

```
Error: connection timed out
```

**Fix:** Increase timeout:
```bash
AGENT_MEMORY_PG_CONNECTION_TIMEOUT_MS=30000
```

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DB_TYPE` | `sqlite` | Set to `postgresql` |
| `AGENT_MEMORY_PG_HOST` | `localhost` | Server hostname |
| `AGENT_MEMORY_PG_PORT` | `5432` | Server port |
| `AGENT_MEMORY_PG_DATABASE` | `agent_memory` | Database name |
| `AGENT_MEMORY_PG_USER` | `postgres` | Username |
| `AGENT_MEMORY_PG_PASSWORD` | — | Password |
| `AGENT_MEMORY_PG_SSL` | `false` | Enable SSL |
| `AGENT_MEMORY_PG_POOL_MIN` | `2` | Min pool connections |
| `AGENT_MEMORY_PG_POOL_MAX` | `10` | Max pool connections |
| `AGENT_MEMORY_PG_IDLE_TIMEOUT_MS` | `30000` | Idle connection timeout |
| `AGENT_MEMORY_PG_CONNECTION_TIMEOUT_MS` | `10000` | Connection timeout |
| `AGENT_MEMORY_PG_STATEMENT_TIMEOUT_MS` | `30000` | Query timeout |

---

## See Also

- [Architecture](../explanation/architecture.md) - System design
- [Redis Distributed](redis-distributed.md) - Multi-node scaling
- [Environment Variables](../reference/environment-variables.md) - All config options
