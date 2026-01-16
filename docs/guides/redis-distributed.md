# Redis Distributed Guide

Scale Agent Memory across multiple nodes using Redis for distributed caching, locking, and events.

> **See also:** [Deployment Modes](deployment-modes.md) for comparing SQLite vs PostgreSQL vs Redis

## Prerequisites

- Redis 6+ installed and running
- Multiple Agent Memory instances (for scaling)
- Network access between instances and Redis

---

## Quick Start

```bash
AGENT_MEMORY_REDIS_ENABLED=true \
AGENT_MEMORY_REDIS_HOST=localhost \
AGENT_MEMORY_REDIS_PORT=6379 \
agent-memory mcp
```

---

## When to Use Redis

| Scenario                          | Redis Needed? |
| --------------------------------- | ------------- |
| Single server, single process     | No            |
| Single server, multiple processes | Recommended   |
| Multiple servers                  | Yes           |
| High availability                 | Yes           |
| Shared cache across instances     | Yes           |

---

## What Redis Provides

### Distributed Caching

Query results are cached in Redis, shared across all instances:

```
Instance A queries → Cache miss → Query DB → Store in Redis
Instance B queries → Cache hit → Return from Redis (fast!)
```

### Distributed Locking

File locks work across instances:

```
Instance A locks file.ts → Lock stored in Redis
Instance B tries to lock file.ts → Blocked (lock exists)
```

### Event Broadcasting

Cache invalidation propagates to all instances:

```
Instance A updates entry → Publishes event to Redis
Instance B receives event → Invalidates local cache
```

---

## Configuration

### Required Settings

```bash
# Enable Redis
AGENT_MEMORY_REDIS_ENABLED=true

# Connection (choose one)
AGENT_MEMORY_REDIS_URL=redis://localhost:6379
# OR
AGENT_MEMORY_REDIS_HOST=localhost
AGENT_MEMORY_REDIS_PORT=6379
```

### Optional Settings

```bash
# Authentication
AGENT_MEMORY_REDIS_PASSWORD=your-password

# Database number (0-15)
AGENT_MEMORY_REDIS_DB=0

# Enable TLS
AGENT_MEMORY_REDIS_TLS=true

# Key prefix (namespace)
AGENT_MEMORY_REDIS_KEY_PREFIX=agentmem:

# Cache TTL (1 hour default)
AGENT_MEMORY_REDIS_CACHE_TTL_MS=3600000

# Lock settings
AGENT_MEMORY_REDIS_LOCK_TTL_MS=30000
AGENT_MEMORY_REDIS_LOCK_RETRY_COUNT=3
AGENT_MEMORY_REDIS_LOCK_RETRY_DELAY_MS=200

# Event channel
AGENT_MEMORY_REDIS_EVENT_CHANNEL=agentmem:events

# Connection settings
AGENT_MEMORY_REDIS_CONNECT_TIMEOUT_MS=10000
AGENT_MEMORY_REDIS_MAX_RETRIES=3
```

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Instance A  │     │ Instance B  │     │ Instance C  │
│             │     │             │     │             │
│ ┌─────────┐ │     │ ┌─────────┐ │     │ ┌─────────┐ │
│ │ Local   │ │     │ │ Local   │ │     │ │ Local   │ │
│ │ Cache   │ │     │ │ Cache   │ │     │ │ Cache   │ │
│ └────┬────┘ │     │ └────┬────┘ │     │ └────┬────┘ │
└──────┼──────┘     └──────┼──────┘     └──────┼──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │    Redis    │
                    │  - Cache    │
                    │  - Locks    │
                    │  - Events   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Database   │
                    │ (PostgreSQL │
                    │  or SQLite) │
                    └─────────────┘
```

---

## Docker Compose Example

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    ports:
      - '6379:6379'

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: agent_memory
      POSTGRES_USER: agent_memory
      POSTGRES_PASSWORD: secure-password
    volumes:
      - pg-data:/var/lib/postgresql/data

  agent-memory-1:
    image: ghcr.io/anthropics/agent-memory:latest
    environment:
      AGENT_MEMORY_DB_TYPE: postgresql
      AGENT_MEMORY_PG_HOST: postgres
      AGENT_MEMORY_PG_DATABASE: agent_memory
      AGENT_MEMORY_PG_USER: agent_memory
      AGENT_MEMORY_PG_PASSWORD: secure-password
      AGENT_MEMORY_REDIS_ENABLED: 'true'
      AGENT_MEMORY_REDIS_HOST: redis
    depends_on:
      - postgres
      - redis

  agent-memory-2:
    image: ghcr.io/anthropics/agent-memory:latest
    environment:
      AGENT_MEMORY_DB_TYPE: postgresql
      AGENT_MEMORY_PG_HOST: postgres
      AGENT_MEMORY_PG_DATABASE: agent_memory
      AGENT_MEMORY_PG_USER: agent_memory
      AGENT_MEMORY_PG_PASSWORD: secure-password
      AGENT_MEMORY_REDIS_ENABLED: 'true'
      AGENT_MEMORY_REDIS_HOST: redis
    depends_on:
      - postgres
      - redis

volumes:
  redis-data:
  pg-data:
```

---

## Distributed Locking

### File Locks Across Instances

```json
{
  "action": "checkout",
  "file_path": "/path/to/file.ts",
  "agent_id": "instance-a-agent"
}
```

**Tool:** `memory_file_lock`

The lock is stored in Redis with automatic expiration:

```
Key: agentmem:lock:file:/path/to/file.ts
Value: {"agent_id": "instance-a-agent", "expires": 1703...}
TTL: 30 seconds (configurable)
```

### Lock Configuration

```bash
# Lock expires after 30 seconds if not released
AGENT_MEMORY_REDIS_LOCK_TTL_MS=30000

# Retry 3 times to acquire lock
AGENT_MEMORY_REDIS_LOCK_RETRY_COUNT=3

# Wait 200ms between retries
AGENT_MEMORY_REDIS_LOCK_RETRY_DELAY_MS=200
```

---

## Cache Invalidation

When data changes, all instances are notified:

1. Instance A updates a guideline
2. Instance A publishes event to Redis channel
3. Instance B, C receive event via subscription
4. Instances B, C invalidate their local caches

### Event Channel

```bash
AGENT_MEMORY_REDIS_EVENT_CHANNEL=agentmem:events
```

---

## Key Namespacing

Use prefixes to isolate environments:

```bash
# Development
AGENT_MEMORY_REDIS_KEY_PREFIX=agentmem:dev:

# Production
AGENT_MEMORY_REDIS_KEY_PREFIX=agentmem:prod:

# Staging
AGENT_MEMORY_REDIS_KEY_PREFIX=agentmem:staging:
```

---

## Redis Authentication

### Password Authentication

```bash
AGENT_MEMORY_REDIS_PASSWORD=your-secure-password
```

### Redis URL with Credentials

```bash
AGENT_MEMORY_REDIS_URL=redis://:password@hostname:6379/0
```

### TLS Encryption

```bash
AGENT_MEMORY_REDIS_TLS=true
AGENT_MEMORY_REDIS_URL=rediss://hostname:6379
```

---

## Monitoring

### Check Redis Connection

```json
{}
```

**Tool:** `memory_health`

Response includes:

```json
{
  "redis": {
    "connected": true,
    "host": "localhost",
    "port": 6379
  }
}
```

### Redis CLI Monitoring

```bash
# Watch real-time commands
redis-cli monitor

# Check keys
redis-cli keys "agentmem:*"

# Check pub/sub
redis-cli subscribe agentmem:events
```

---

## Troubleshooting

### Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Fix:** Ensure Redis is running:

```bash
redis-cli ping
```

### Authentication Failed

```
Error: NOAUTH Authentication required
```

**Fix:** Set password:

```bash
AGENT_MEMORY_REDIS_PASSWORD=your-password
```

### Lock Timeout

Locks expire after TTL. If processes are slow:

```bash
# Increase lock TTL
AGENT_MEMORY_REDIS_LOCK_TTL_MS=60000
```

### High Memory Usage

Redis caches can grow large:

```bash
# Reduce cache TTL
AGENT_MEMORY_REDIS_CACHE_TTL_MS=1800000  # 30 minutes
```

---

## Environment Variables Reference

| Variable                                 | Default           | Description                          |
| ---------------------------------------- | ----------------- | ------------------------------------ |
| `AGENT_MEMORY_REDIS_ENABLED`             | `false`           | Enable Redis                         |
| `AGENT_MEMORY_REDIS_URL`                 | —                 | Connection URL (overrides host/port) |
| `AGENT_MEMORY_REDIS_HOST`                | `localhost`       | Server hostname                      |
| `AGENT_MEMORY_REDIS_PORT`                | `6379`            | Server port                          |
| `AGENT_MEMORY_REDIS_PASSWORD`            | —                 | Authentication password              |
| `AGENT_MEMORY_REDIS_DB`                  | `0`               | Database number                      |
| `AGENT_MEMORY_REDIS_TLS`                 | `false`           | Enable TLS                           |
| `AGENT_MEMORY_REDIS_KEY_PREFIX`          | `agentmem:`       | Key namespace                        |
| `AGENT_MEMORY_REDIS_CACHE_TTL_MS`        | `3600000`         | Cache TTL (1 hour)                   |
| `AGENT_MEMORY_REDIS_LOCK_TTL_MS`         | `30000`           | Lock TTL (30 sec)                    |
| `AGENT_MEMORY_REDIS_LOCK_RETRY_COUNT`    | `3`               | Lock retry attempts                  |
| `AGENT_MEMORY_REDIS_LOCK_RETRY_DELAY_MS` | `200`             | Retry delay                          |
| `AGENT_MEMORY_REDIS_EVENT_CHANNEL`       | `agentmem:events` | Pub/sub channel                      |
| `AGENT_MEMORY_REDIS_CONNECT_TIMEOUT_MS`  | `10000`           | Connection timeout                   |
| `AGENT_MEMORY_REDIS_MAX_RETRIES`         | `3`               | Max request retries                  |

---

## See Also

- [Architecture](../explanation/architecture.md) - System design
- [PostgreSQL Setup](postgresql-setup.md) - Enterprise database
- [Multi-Agent Coordination](multi-agent.md) - File locks and voting
