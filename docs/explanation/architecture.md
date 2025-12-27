# Architecture

Agent Memory is a structured memory backend for AI agents. It exposes a Model Context Protocol (MCP) interface and an optional REST API.

For the canonical system-wide architecture (including mandatory architecture guidelines), see `architecture_final.md` at the project root.

## Components

```
┌───────────────────────────────────┐
│         MCP / REST                │
│    (CLI + Fastify transports)     │
└──────────────┬────────────────────┘
               │
┌──────────────▼────────────────────┐
│       Transport Handlers          │
│  (tool dispatcher, controllers)   │
└──────────────┬────────────────────┘
               │
┌──────────────▼────────────────────┐
│      Application Core             │
│  (Container, Runtime, AppContext) │
└──────────────┬────────────────────┘
               │
┌──────────────▼────────────────────┐
│      Services & Pipeline          │
│  (permission, verification,       │
│   embedding, extraction, query)   │
└──────────────┬────────────────────┘
               │
┌──────────────▼────────────────────┐
│       Persistence Layer           │
│  (adapters → SQLite / PostgreSQL  │
│   + caches, locks, events)        │
└───────────────────────────────────┘
```

### MCP Server (`src/mcp/*`)
- JSON-RPC over stdio
- Tools for querying, writing, and managing memory entries

### REST API (`src/restapi/*`)
- HTTP wrapper for read-only access (`/v1/query`, `/v1/context`)
- Requires API key authentication

### Database Layer (`src/db/*`)
- **SQLite** (default) - better-sqlite3 for single-node deployments
- **PostgreSQL** (enterprise) - For distributed/high-availability deployments
- Drizzle ORM for schema and migrations

### Vector Store (`@lancedb/lancedb`)
- Optional semantic search embeddings stored in LanceDB

### Redis (optional)
- Distributed caching
- Distributed locking for multi-node coordination
- Event pub/sub for cache invalidation

### Services (`src/services/*`)
- Business logic: permissions, queries, extraction, backups, etc.

---

## Database Backends

Agent Memory supports two database backends:

| Feature | SQLite (Default) | PostgreSQL |
|---------|-----------------|------------|
| Deployment | Single node | Multi-node/distributed |
| Setup | Zero config | Requires server |
| Best for | Development, small teams | Enterprise, high availability |
| Performance | Fast for local | Connection pooling |

### Choosing a Backend

```bash
# SQLite (default)
agent-memory mcp

# PostgreSQL
AGENT_MEMORY_DB_TYPE=postgresql \
AGENT_MEMORY_PG_HOST=localhost \
AGENT_MEMORY_PG_DATABASE=agent_memory \
agent-memory mcp
```

See [PostgreSQL Setup](../guides/postgresql-setup.md) for detailed configuration.

---

## Distributed Architecture

For multi-node deployments, enable Redis:

```bash
AGENT_MEMORY_REDIS_ENABLED=true \
AGENT_MEMORY_REDIS_HOST=localhost \
agent-memory mcp
```

Redis provides:
- **Distributed caching** - Share query cache across nodes
- **Distributed locks** - Coordinate file locks across instances
- **Event pub/sub** - Invalidate caches when data changes

See [Redis Distributed Guide](../guides/redis-distributed.md) for setup.

---

## Adapter System

Agent Memory uses an adapter pattern to abstract persistence:

```
┌─────────────────────────────────────────┐
│            Business Logic               │
│  (services, handlers, query pipeline)   │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│           Adapter Interface             │
│  (StorageAdapter, LockAdapter, etc.)    │
└──────────────────┬──────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌───────────────┐     ┌───────────────┐
│ SQLite Impl   │     │ PostgreSQL    │
│ (default)     │     │ Impl          │
└───────────────┘     └───────────────┘
```

This allows:
- Swapping backends without changing business logic
- Testing with in-memory implementations
- Adding new backends (e.g., MySQL) without refactoring

See [Adapter System](adapter-system.md) for details.

---

## Data Flow (MCP)

1. Client sends a tool request via MCP
2. Request is validated and permissions are checked
3. Service layer executes query or mutation
4. Results are returned to the client with timestamps normalized

## Data Flow (REST)

1. Client calls `/v1/query` or `/v1/context` with API key
2. Permission checks are enforced using `agentId`
3. Results are returned as JSON

---

## Reliability & Safety

- **Versioning**: Write operations are versioned
- **Conflict detection**: Built-in conflict detection and audit logging
- **Rate limiting**: Enabled by default
- **Transactions**: Automatic retry with exponential backoff
- **Health checks**: Database connection monitoring and reconnection

---

## See Also

- `architecture_final.md` (project root) - Canonical architecture + mandatory guidelines
- [Data Model](data-model.md) - Entry types, scopes, inheritance
- [Security Model](security-model.md) - Authentication and permissions
- [Adapter System](adapter-system.md) - Multi-backend abstraction
