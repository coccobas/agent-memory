# ADR-0015: Scaling Strategy

## Status

Accepted

## Context

Agent Memory supports multiple backend configurations to address different deployment scales:

- **SQLite**: Embedded database for local development and small deployments
- **PostgreSQL**: Production-grade database with connection pooling
- **Redis**: Distributed caching, locking, and event coordination

Without unified documentation, users lack clear guidance on:

- When to migrate between backends
- Performance thresholds and scaling limits
- Which configuration fits their deployment topology

This leads to:

- Premature optimization (using PostgreSQL + Redis for single-user setups)
- Under-provisioning (SQLite for multi-instance deployments)
- Operational issues from mismatched backend choices

## Decision

Document the official three-tier scaling path with clear thresholds and migration triggers:

### Tier 1: SQLite (Default)

**Characteristics:**

- Single process deployment only
- File-based storage with WAL mode
- Single writer with reader concurrency
- Instance-local caching

**Operational Limits:**
| Metric | Limit |
|--------|-------|
| Writes/second (sustained) | < 50 |
| Concurrent connections | 1 (exclusive writer) |
| Instances | 1 |
| Database size | < 10 GB practical |

**Best For:**

- Local development and testing
- Single-user CLI tools
- Edge deployments and embedded applications
- Small teams with low write volume

**Migration Trigger:**
Migrate to PostgreSQL when experiencing:

- `SQLITE_BUSY` or `SQLITE_LOCKED` errors
- Need for multiple application instances
- Horizontal scaling requirements
- Database replication needs

### Tier 2: PostgreSQL

**Characteristics:**

- Multi-instance capable via connection pooling
- True concurrent writes
- Network-accessible database
- Horizontal read scaling via replicas

**Operational Limits:**
| Metric | Limit |
|--------|-------|
| Writes/second (per instance) | < 500 |
| Pool connections (per instance) | 2-20 |
| Instances | Multiple |
| Database size | PostgreSQL limits (TB+) |

**Best For:**

- Production deployments
- Medium-sized teams
- Multi-agent coordination
- High availability requirements

**Migration Trigger:**
Add Redis when experiencing:

- Cache inconsistency across instances
- File lock coordination failures
- Event synchronization needs
- Global rate limiting requirements

### Tier 3: PostgreSQL + Redis

**Characteristics:**

- Distributed caching across instances
- Cross-instance file locking
- Pub/sub event broadcasting
- Shared circuit breaker state

**Operational Limits:**
| Metric | Limit |
|--------|-------|
| Writes/second (cluster) | < 5000+ |
| Instances | Many |
| Cache distribution | Global |
| Lock coordination | Cross-instance |

**Best For:**

- Enterprise deployments
- Large-scale multi-agent systems
- High availability with distributed caching
- Global deployments

## Consequences

**Positive:**

- Clear migration triggers prevent premature optimization
- Predictable performance characteristics per tier
- Documented upgrade path reduces migration risk
- Users can right-size their deployment from the start
- Operational runbooks can reference tier-specific guidance

**Negative:**

- Commits to specific scaling recommendations that may not fit edge cases
- Thresholds are estimates and depend on workload characteristics
- May require updates as performance characteristics evolve

## References

- SQLite configuration: `src/config/registry/sections/database.ts`
- PostgreSQL configuration: `src/config/registry/sections/postgresql.ts`
- Redis configuration: `src/config/registry/sections/redis.ts`
- Circuit breaker: `src/config/registry/sections/circuitBreaker.ts`
- Rate limiting: `src/config/registry/sections/rateLimit.ts`
- Deployment modes guide: `docs/guides/deployment-modes.md`
- PostgreSQL setup: `docs/guides/postgresql-setup.md`
- Redis distributed guide: `docs/guides/redis-distributed.md`
- Related: ADR-0013 (Multi-Backend Abstraction)
- Related: ADR-0007 (Transaction Retry Logic)
