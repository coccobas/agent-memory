# Deployment Modes

Choose the right deployment mode for your use case.

> **Related:** [PostgreSQL Setup](postgresql-setup.md) | [Redis Distributed](redis-distributed.md)

---

## Quick Decision Guide

| Mode | Instances | Writes/sec | Use Case |
|------|-----------|------------|----------|
| SQLite | 1 | ~50-100 | Development, single-user |
| PostgreSQL | Multiple | ~500/instance | Production, teams |
| PostgreSQL + Redis | Multiple | High | Enterprise, distributed |

---

## SQLite Mode (Default)

SQLite is the default backend, requiring no external dependencies.

```bash
# Default - no configuration needed
agent-memory mcp
```

### Limitations

> **WARNING**: SQLite supports only **single-instance** deployments.
>
> Multiple processes accessing the same database file will cause `SQLITE_BUSY` or `SQLITE_LOCKED` errors.

| Limitation | Impact |
|------------|--------|
| Single-writer bottleneck | Only one write at a time (WAL mode improves but doesn't eliminate) |
| File-based storage | No network access - database must be on local filesystem |
| Instance-local caches | No cross-process cache synchronization |
| No horizontal scaling | Cannot run multiple instances against same database |

### When SQLite Works Well

- Local development and testing
- Single-user CLI tools
- Embedded applications
- Low-write workloads (<50 writes/sec)

### When to Migrate

Consider PostgreSQL when you need:
- Multiple users or agents accessing simultaneously
- Horizontal scaling (multiple instances)
- Deployment to Kubernetes or similar orchestrators
- High availability or replication

See: [PostgreSQL Setup](postgresql-setup.md)

---

## PostgreSQL Mode

PostgreSQL enables multi-instance deployments with connection pooling.

```bash
AGENT_MEMORY_DB_TYPE=postgresql \
AGENT_MEMORY_PG_HOST=localhost \
AGENT_MEMORY_PG_DATABASE=agent_memory \
agent-memory mcp
```

### Benefits Over SQLite

- True concurrent writes via connection pooling
- Network-accessible database
- Multiple instances can connect simultaneously
- Enterprise features (replication, backups, monitoring)

### Limitations

- Instance-local caches still apply (unless Redis is added)
- Requires PostgreSQL server setup and maintenance

See: [PostgreSQL Setup](postgresql-setup.md)

---

## PostgreSQL + Redis Mode

For enterprise deployments requiring distributed caching and cross-instance coordination.

```bash
AGENT_MEMORY_DB_TYPE=postgresql \
AGENT_MEMORY_REDIS_ENABLED=true \
AGENT_MEMORY_REDIS_HOST=localhost \
agent-memory mcp
```

### What Redis Adds

| Feature | Without Redis | With Redis |
|---------|---------------|------------|
| Cache | Instance-local | Distributed |
| File locks | Instance-local | Cross-instance |
| Events | Instance-local | Pub/sub across instances |
| Rate limiting | Per-instance | Global |

See: [Redis Distributed](redis-distributed.md)

---

## Migration Path

```
SQLite (start here)
    ↓
PostgreSQL (when scaling beyond single instance)
    ↓
PostgreSQL + Redis (when distributed features needed)
```

Each step is additive - your data and configuration carry forward.
