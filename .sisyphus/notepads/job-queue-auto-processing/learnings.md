# Learnings - Job Queue Auto-Processing

## 2026-01-26 Implementation Complete

### Key Patterns Discovered

1. **Async Queue Processing Pattern**
   - Use `setImmediate(() => { void this.processQueue().catch(...) })` to trigger queue processing after job completion
   - This avoids blocking the completion response while still ensuring queue is processed
   - Type the catch parameter as `(err: unknown)` to satisfy ESLint's no-unsafe-assignment rule

2. **Execute Callback Pattern**
   - Decouple job management from job execution using a callback
   - `setExecuteCallback(callback)` allows the handler to inject execution logic
   - Callback handles its own completion/failure via `completeJob()`/`failJob()`
   - Wrap callback invocation in try-catch to handle errors gracefully

3. **Server Restart Handling**
   - Mark orphaned "running" jobs as failed during `initialize()`
   - Use clear error message: "Server restarted while job was running"
   - Trigger `processQueue()` after initialization if pending jobs exist

4. **Deduplication Strategy**
   - Check if pending job's tasks are covered by recently completed jobs
   - Match on both scopeType AND scopeId for accurate deduplication
   - Use configurable deduplication window (default 5 minutes)

5. **Job Merging**
   - Only merge single-task jobs with same scope
   - Create new merged job with combined unique tasks
   - Cancel original jobs with "Merged into job_xxx" message

### Technical Gotchas

- ESLint requires `(err: unknown)` typing in catch callbacks, not `(err)` or `(err: any)`
- The `invokeExecuteCallback` method should be private and handle missing callback gracefully
- Queue depth check should happen at start of `createJob()`, before any job creation logic

### Files Modified

1. `src/services/librarian/maintenance/types.ts` - QueueConfig interface
2. `src/services/librarian/maintenance/job-manager.ts` - All queue management logic
3. `src/mcp/handlers/librarian.handler.ts` - Execute callback wiring

### Verification

- All 9,542 tests pass
- No new lint errors in modified files
- 4 pre-existing lint errors in unrelated files (ide-conversation)
