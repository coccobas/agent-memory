# Dead Code Analysis Report

Generated: 2026-01-21

## Summary

| Metric                  | Count |
| ----------------------- | ----- |
| Unused Files            | 12    |
| Unused Exports          | 536   |
| Unused Types            | 441   |
| Unused Enum Members     | 1     |
| Unused Dev Dependencies | 1     |

## Unused Files

### SAFE - Config/Script Files (can delete)

- `drizzle.config.pg.ts` - PostgreSQL config (not currently used)
- `scripts/seed-graph-types.js` - Seed script (one-time use)
- `scripts/test-boundary-detection.ts` - Test script (experimental)

### CAUTION - Type Definitions

- `types/lancedb.d.ts` - LanceDB type declarations

### CAUTION - Barrel Exports (index.ts files)

These files are re-export barrels. Before deleting, check if they're imported externally:

- `src/core/interfaces/index.ts`
- `src/services/context/index.ts`
- `src/services/export/index.ts`
- `src/services/latent-memory/index.ts`
- `src/services/latent-memory/compression/index.ts`
- `src/services/summarization/retrieval/index.ts`
- `src/services/summarization/summarizer/index.ts`

### CAUTION - Test Fixtures

- `tests/fixtures/db-init-worker.ts` - Worker for test DB init

## Unused Dependencies

### Dev Dependencies

- `@vitest/coverage-v8` - Coverage tool (may be used in CI scripts)

### Missing Dependencies (imports exist but not in package.json)

- `nanoid` - Used in:
  - `tests/unit/coarse-to-fine-retrieval.test.ts`
  - `src/db/repositories/evidence.ts`
  - `src/db/repositories/tasks.ts`

## Top Unused Exports by Category

### SAFE - Test Utilities

- `ensureDirectory` (tests/fixtures/db-utils.ts:32)
- `cleanupTestDatabases` (test helpers)
- `cleanupVectorDb`, `cleanupTestVectorDbs`

### SAFE - Constants (Internal Use)

- `SEMANTIC_SCORE_WEIGHT`
- `DEFAULT_DUPLICATE_THRESHOLD`
- `CACHE_PRESSURE_THRESHOLD`
- `CACHE_EVICTION_TARGET`
- `QUERY_CACHE_TTL_MS`
- `SCOPE_CACHE_TTL_MS`

### CAUTION - Service Factories

These may be used for dependency injection or testing:

- `createExtractionService`
- `createBoundaryDetectorService`
- `createContextInjector`
- `createRecommendationStore`
- `createCheckpointManager`

### CAUTION - Config Registry

- `configRegistry` (src/config/index.ts:619)
- `getAllEnvVars`

### DANGER - MCP Descriptors

These are the MCP tool definitions - DO NOT DELETE:

- `memoryOrgDescriptor`
- `memoryProjectDescriptor`
- `memorySessionDescriptor`
- (... all other \*Descriptor exports)

### DANGER - Schema Definitions

Database schema exports - DO NOT DELETE:

- `auditLog`
- `organizations`
- `conversations`
- `tools`
- `knowledge`
- (... all other schema exports)

## Recommended Actions

### Immediate Safe Deletions

1. **Test script** (experimental, not in use):

   ```
   scripts/test-boundary-detection.ts
   ```

2. **Seed script** (one-time use, can regenerate):
   ```
   scripts/seed-graph-types.js
   ```

### Require Investigation

1. **Barrel index files**: Check if used by external packages
2. **PostgreSQL config**: Confirm PG support is deprecated
3. **LanceDB types**: Confirm LanceDB is not in use

### Do Not Delete

1. **MCP Descriptors** - Used for tool registration
2. **Schema definitions** - Database schema
3. **Service factories** - Used in dependency injection
4. **Constants** - May be used in tests or configuration

## Unused Types Analysis

441 unused types detected. Most are:

- Interface definitions for services (used internally)
- Schema types (used by drizzle-orm)
- Configuration types (used at runtime)

**Recommendation**: Types are zero-cost at runtime. Only remove if clearly deprecated.

## Action Plan

| Priority | Action                      | Risk    | Files |
| -------- | --------------------------- | ------- | ----- |
| 1        | Delete experimental scripts | SAFE    | 2     |
| 2        | Review barrel exports       | CAUTION | 7     |
| 3        | Fix missing nanoid dep      | BUG     | -     |
| 4        | Review unused exports       | VARIES  | 536   |
