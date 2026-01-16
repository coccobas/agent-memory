# Database Connection Pool Metrics

This document provides examples of how to use the database connection pool monitoring metrics added in MED-005.

## Overview

The pool metrics system provides detailed monitoring of database connection pool health and performance. This includes:

- **Pool Size** (`agentmem_db_pool_size`) - Current total connections
- **Available Connections** (`agentmem_db_pool_available`) - Idle connections ready for use
- **Waiting Requests** (`agentmem_db_pool_waiting`) - Requests waiting for a connection
- **Idle Connections** (`agentmem_db_pool_idle`) - Connections not currently in use
- **Maximum Pool Size** (`agentmem_db_pool_max`) - Configured maximum connections

## Basic Usage

### Recording Metrics Manually

```typescript
import { recordPoolMetrics } from './utils/metrics.js';
import { PostgreSQLStorageAdapter } from './core/adapters/postgresql.adapter.js';

// Get pool statistics from your adapter
const adapter = new PostgreSQLStorageAdapter(config);
await adapter.connect();

const stats = adapter.getPoolStats();

// Record metrics
recordPoolMetrics(stats, { maxConnections: 20 });
```

### Automatic Periodic Recording

For production environments, use the automatic recorder:

```typescript
import { createPoolMetricsRecorder } from './utils/metrics.js';

// Create a recorder that updates metrics every 15 seconds
const recorder = createPoolMetricsRecorder(
  () => adapter.getPoolStats(),
  { maxConnections: config.poolMax },
  15000 // 15 seconds
);

// Start recording
recorder.start();

// Later, when shutting down:
recorder.stop();
```

## Integration Example

### In Application Startup

```typescript
// src/core/runtime.ts or similar startup file

import { createPoolMetricsRecorder } from '../utils/metrics.js';
import type { IStorageAdapter } from './adapters/interfaces.js';

export interface Runtime {
  // ... existing runtime fields
  poolMetricsRecorder?: { start: () => void; stop: () => void };
}

export function createRuntime(config: RuntimeConfig, adapter: IStorageAdapter): Runtime {
  // ... existing runtime initialization

  // Set up pool metrics monitoring if using PostgreSQL
  let poolMetricsRecorder;
  if ('getPoolStats' in adapter && typeof adapter.getPoolStats === 'function') {
    poolMetricsRecorder = createPoolMetricsRecorder(
      () => (adapter as any).getPoolStats(),
      { maxConnections: config.postgresql?.poolMax },
      15000 // Record every 15 seconds
    );

    // Start recording immediately
    poolMetricsRecorder.start();

    logger.info('Pool metrics monitoring enabled');
  }

  return {
    // ... existing runtime fields
    poolMetricsRecorder,
  };
}
```

### In Application Shutdown

```typescript
export async function shutdownRuntime(runtime: Runtime): Promise<void> {
  // ... existing shutdown logic

  // Stop pool metrics recording
  if (runtime.poolMetricsRecorder) {
    runtime.poolMetricsRecorder.stop();
    logger.info('Pool metrics monitoring stopped');
  }
}
```

## Prometheus Metrics Output

When you access the `/metrics` endpoint, you'll see output like:

```prometheus
# HELP agentmem_db_pool_size Current database connection pool size (total connections)
# TYPE agentmem_db_pool_size gauge
agentmem_db_pool_size 8

# HELP agentmem_db_pool_available Available database connections in pool
# TYPE agentmem_db_pool_available gauge
agentmem_db_pool_available 5

# HELP agentmem_db_pool_waiting Number of requests waiting for a database connection
# TYPE agentmem_db_pool_waiting gauge
agentmem_db_pool_waiting 0

# HELP agentmem_db_pool_idle Number of idle database connections in pool
# TYPE agentmem_db_pool_idle gauge
agentmem_db_pool_idle 5

# HELP agentmem_db_pool_max Maximum database connection pool size
# TYPE agentmem_db_pool_max gauge
agentmem_db_pool_max 20

# HELP agentmem_db_pool_connections Database connection pool status
# TYPE agentmem_db_pool_connections gauge
agentmem_db_pool_connections{state="idle"} 5
agentmem_db_pool_connections{state="active"} 3
agentmem_db_pool_connections{state="waiting"} 0
```

## Monitoring and Alerting

### Recommended Alerts

#### High Pool Utilization

```yaml
# Alert when pool is >80% utilized
- alert: DatabasePoolHighUtilization
  expr: |
    (agentmem_db_pool_size / agentmem_db_pool_max) > 0.8
  for: 5m
  annotations:
    summary: 'Database pool is highly utilized ({{ $value }}%)'
    description: 'Connection pool is running at {{ $value }}% capacity'
```

#### Waiting Requests

```yaml
# Alert when requests are waiting for connections
- alert: DatabasePoolWaiting
  expr: agentmem_db_pool_waiting > 0
  for: 1m
  annotations:
    summary: 'Database pool has waiting requests'
    description: '{{ $value }} requests are waiting for database connections'
```

#### Low Available Connections

```yaml
# Alert when available connections are very low
- alert: DatabasePoolLowAvailable
  expr: agentmem_db_pool_available < 2
  for: 2m
  annotations:
    summary: 'Low available database connections'
    description: 'Only {{ $value }} connections available in pool'
```

### Grafana Dashboard Queries

#### Pool Utilization Percentage

```promql
(agentmem_db_pool_size / agentmem_db_pool_max) * 100
```

#### Active Connections Over Time

```promql
agentmem_db_pool_connections{state="active"}
```

#### Connection Pool Breakdown (Stacked)

```promql
agentmem_db_pool_connections
```

## Testing

The pool metrics include comprehensive tests:

- **Unit Tests**: Test the metrics recording logic in isolation
- **Integration Tests**: Verify metrics work with actual PostgreSQL adapter (requires PostgreSQL)

Run tests:

```bash
# Unit tests (always run)
npm test -- tests/unit/pool-metrics.test.ts

# Integration tests (requires PostgreSQL)
AGENT_MEMORY_DB_TYPE=postgresql npm test -- tests/integration/pool-metrics.integration.test.ts
```

## Troubleshooting

### Metrics Not Updating

If metrics aren't updating:

1. Verify the recorder is started:

   ```typescript
   recorder.start();
   ```

2. Check that the adapter supports `getPoolStats()`:

   ```typescript
   if ('getPoolStats' in adapter) {
     console.log('Adapter supports pool stats');
   }
   ```

3. Verify PostgreSQL adapter is being used (SQLite doesn't have connection pools)

### High Waiting Count

If `agentmem_db_pool_waiting` is consistently > 0:

1. **Increase pool size**: Adjust `poolMax` in your configuration
2. **Optimize queries**: Review slow queries that hold connections
3. **Check connection leaks**: Ensure all queries properly release connections
4. **Review concurrency**: You may have more concurrent requests than pool can handle

### Pool Growing to Maximum

If `agentmem_db_pool_size` consistently hits `agentmem_db_pool_max`:

1. **Increase pool maximum**: If you have database capacity, increase `poolMax`
2. **Analyze query patterns**: Review if high concurrency is expected
3. **Connection timeout**: Check if connections are timing out (set `idleTimeoutMs`)
4. **Load balancing**: Consider adding read replicas or database sharding

## Performance Considerations

- **Recording Interval**: Default 15 seconds is suitable for most cases
  - Lower (5-10s) for high-traffic systems
  - Higher (30-60s) for low-traffic systems

- **Overhead**: Pool stats collection is very lightweight (< 1ms)

- **Memory**: Metrics use minimal memory (~100 bytes per gauge)

## Best Practices

1. **Always monitor in production**: Enable pool metrics in all production environments
2. **Set up alerts**: Configure alerts for pool exhaustion and waiting requests
3. **Baseline normal values**: Understand your application's normal pool usage
4. **Correlate with application metrics**: Compare pool metrics with request rate and latency
5. **Regular review**: Periodically review pool sizing based on metrics

## Related Files

- Implementation: `/src/utils/metrics.ts`
- Unit Tests: `/tests/unit/pool-metrics.test.ts`
- Integration Tests: `/tests/integration/pool-metrics.integration.test.ts`
- PostgreSQL Adapter: `/src/core/adapters/postgresql.adapter.ts`
