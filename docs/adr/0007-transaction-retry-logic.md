# ADR-0007: Transaction Retry Logic

## Status

Accepted

## Context

SQLite can fail with transient errors like `SQLITE_BUSY` and `SQLITE_LOCKED` when multiple processes or connections attempt concurrent writes. These errors are recoverable if the operation is retried after a brief delay.

Without retry logic, transient database contention causes application-level failures even though the underlying issue is temporary.

## Decision

Implement `transactionWithRetry()` function that:

1. Wraps SQLite transactions with automatic retry on transient errors
2. Uses exponential backoff with configurable parameters:
   - `maxRetries`: Maximum retry attempts (default: 3)
   - `initialDelayMs`: Initial delay before first retry (default: 50ms)
   - `maxDelayMs`: Maximum delay cap (default: 1000ms)
   - `backoffMultiplier`: Exponential growth factor (default: 2.0)
3. Identifies retryable errors by checking for:
   - `SQLITE_BUSY`
   - `SQLITE_LOCKED`
   - `SQLITE_PROTOCOL`
   - `database is locked`
   - `database is busy`

The retry logic is implemented as an async function that uses non-blocking `setTimeout` for delays.

## Consequences

**Positive:**

- Resilient to transient database contention
- Configurable retry behavior via config system
- Non-blocking delays (doesn't freeze event loop)
- Explicit error logging for debugging

**Negative:**

- Added latency on retry (by design)
- Slightly more complex error handling code
- PostgreSQL mode bypasses this logic (handled by adapter layer)

## References

- Code location: `src/db/connection.ts:168-293`
- Configuration: `src/config/index.ts` (transaction section)
- Related: ADR-0013 (Multi-Backend Abstraction)
