# Decisions - Job Queue Auto-Processing

## 2026-01-26 Architecture Decisions

### Decision 1: Use setImmediate for Queue Processing

**Context**: Need to trigger queue processing after job completion without blocking the response.

**Options Considered**:

1. Direct call to `processQueue()` - Would block completion response
2. `setTimeout(0)` - Works but less idiomatic for Node.js
3. `setImmediate()` - Node.js idiomatic way to defer execution

**Decision**: Use `setImmediate()` with void promise catch pattern.

**Rationale**:

- Non-blocking - completion response returns immediately
- Idiomatic Node.js pattern for deferring work
- Error handling via catch prevents unhandled rejections

### Decision 2: Execute Callback Pattern

**Context**: Need to execute maintenance jobs from queue without circular dependencies.

**Options Considered**:

1. Direct LibrarianService import in JobManager - Creates circular dependency
2. Event emitter pattern - More complex, harder to trace
3. Callback injection - Simple, explicit, testable

**Decision**: Use callback injection via `setExecuteCallback()`.

**Rationale**:

- Avoids circular dependencies
- Handler controls execution logic
- Easy to test (mock callback)
- Clear ownership of job lifecycle

### Decision 3: Fail Orphaned Jobs on Restart

**Context**: Jobs marked as "running" when server restarts are orphaned.

**Options Considered**:

1. Resume orphaned jobs - Complex, may cause issues
2. Delete orphaned jobs - Loses audit trail
3. Mark as failed - Preserves history, clear status

**Decision**: Mark orphaned running jobs as failed with clear error message.

**Rationale**:

- Preserves job history for debugging
- Clear indication of what happened
- Allows queue to process pending jobs
- No risk of duplicate execution
