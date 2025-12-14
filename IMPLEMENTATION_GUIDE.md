# Agent Memory Implementation Guide

**Purpose:** Step-by-step guide for implementing improvements identified in code review
**Target:** AI agents executing individual tasks
**Version:** 1.0.0
**Based On:** Code Review Report (December 14, 2025)

---

## How to Use This Guide

Each task is self-contained and can be implemented independently. Tasks are organized by:
- **Phase**: Strategic grouping (can be done in any order)
- **Task**: A complete unit of work
- **Subtask**: Atomic step within a task

### Task Format
```
## [PHASE-TASK] Task Name
- Priority: Critical/High/Medium/Low
- Effort: Small (1-2h) / Medium (2-8h) / Large (8h+)
- Dependencies: List of prerequisite tasks
- Files: Primary files to modify
- Tests: Test files to create/update
```

---

# Phase 1: Performance Optimizations

## [P1-T1] Implement True LRU Cache for Query Results

**Priority:** High
**Effort:** Medium
**Dependencies:** None
**Files:** `src/services/query.service.ts`
**Tests:** `tests/unit/query-cache.test.ts` (new)

### Context
Current cache uses simple FIFO eviction. Need proper LRU with memory awareness.

### Subtasks

#### [P1-T1-S1] Create LRU Cache Class
**File:** `src/utils/lru-cache.ts` (new)

```typescript
// Create new file with this structure:
export interface LRUCacheOptions {
  maxSize: number;
  maxMemoryMB?: number;
  ttlMs?: number;
  onEvict?: (key: string, value: unknown) => void;
}

export class LRUCache<T> {
  // Use Map for O(1) access with insertion order
  // Track memory usage if maxMemoryMB set
  // Implement: get, set, delete, clear, has, size, stats
}
```

**Implementation steps:**
1. Create file `src/utils/lru-cache.ts`
2. Implement `LRUCache` class using `Map` (maintains insertion order)
3. Add `get()` method that moves accessed item to end (most recent)
4. Add `set()` method that evicts oldest when at capacity
5. Add memory tracking using `JSON.stringify(value).length` approximation
6. Add TTL support with lazy expiration check on `get()`
7. Export class and types

#### [P1-T1-S2] Add Memory Pressure Monitoring
**File:** `src/utils/lru-cache.ts`

```typescript
// Add to LRUCache class:
private checkMemoryPressure(): boolean {
  const usage = process.memoryUsage();
  const heapUsedMB = usage.heapUsed / 1024 / 1024;
  const heapTotalMB = usage.heapTotal / 1024 / 1024;
  return (heapUsedMB / heapTotalMB) > 0.85; // 85% threshold
}

// Call in set() to trigger early eviction under pressure
```

**Implementation steps:**
1. Add `checkMemoryPressure()` private method
2. Add configurable threshold (default 85%)
3. In `set()`, evict 10% of entries if under pressure
4. Add `getMemoryStats()` public method

#### [P1-T1-S3] Replace QueryCache with LRU Implementation
**File:** `src/services/query.service.ts`

**Implementation steps:**
1. Import `LRUCache` from `../utils/lru-cache.js`
2. Replace `QueryCache` class (lines 110-252) with:
```typescript
const queryCache = new LRUCache<MemoryQueryResult>({
  maxSize: 200,
  maxMemoryMB: 50,
  ttlMs: 5 * 60 * 1000, // 5 minutes
});
```
3. Update `getQueryCacheStats()` to use new cache stats
4. Update cache key generation to be deterministic

#### [P1-T1-S4] Create Unit Tests
**File:** `tests/unit/lru-cache.test.ts` (new)

**Implementation steps:**
1. Create test file
2. Test basic get/set operations
3. Test LRU eviction order
4. Test TTL expiration
5. Test memory pressure eviction
6. Test concurrent access patterns

---

## [P1-T2] Implement Scope Chain Caching

**Priority:** High
**Effort:** Small
**Dependencies:** [P1-T1] (uses LRU cache)
**Files:** `src/services/query.service.ts`
**Tests:** `tests/unit/scope-chain.test.ts` (new)

### Context
`resolveScopeChain()` makes multiple DB queries per call. Cache resolved chains.

### Subtasks

#### [P1-T2-S1] Add Scope Chain Cache
**File:** `src/services/query.service.ts`

**Location:** After line 254 (after queryCache)

```typescript
// Add scope chain cache with shorter TTL (scope structure changes less often)
const scopeChainCache = new LRUCache<ScopeDescriptor[]>({
  maxSize: 100,
  ttlMs: 10 * 60 * 1000, // 10 minutes
});

function getScopeChainCacheKey(input?: { type: ScopeType; id?: string; inherit?: boolean }): string {
  if (!input) return 'global:inherit';
  return `${input.type}:${input.id ?? 'null'}:${input.inherit ?? true}`;
}
```

#### [P1-T2-S2] Update resolveScopeChain Function
**File:** `src/services/query.service.ts`
**Location:** Function starting at line 343

**Implementation steps:**
1. At function start, check cache:
```typescript
const cacheKey = getScopeChainCacheKey(input);
const cached = scopeChainCache.get(cacheKey);
if (cached) return cached;
```
2. Before return, cache result:
```typescript
scopeChainCache.set(cacheKey, chain);
return chain;
```

#### [P1-T2-S3] Add Cache Invalidation on Scope Changes
**File:** `src/db/repositories/scopes.ts`

**Implementation steps:**
1. Import `invalidateScopeChainCache` from query service
2. Call invalidation after:
   - `createOrg()`
   - `createProject()`
   - `updateProject()`
   - `startSession()`
   - `endSession()`

#### [P1-T2-S4] Export Invalidation Function
**File:** `src/services/query.service.ts`

```typescript
export function invalidateScopeChainCache(scopeType?: ScopeType, scopeId?: string): void {
  if (!scopeType) {
    scopeChainCache.clear();
    return;
  }
  // Invalidate specific scope and all children
  // Project change invalidates project + all its sessions
  // Org change invalidates org + all projects + all sessions
}
```

---

## [P1-T3] Optimize Tag Filtering with Set Operations

**Priority:** Medium
**Effort:** Small
**Dependencies:** None
**Files:** `src/services/query.service.ts`
**Tests:** Update `tests/unit/query.service.test.ts`

### Context
Current tag filtering is O(n*m). Can be O(n+m) with Set operations.

### Subtasks

#### [P1-T3-S1] Refactor filterByTags Function
**File:** `src/services/query.service.ts`
**Location:** Lines 469-520

**Replace with:**
```typescript
function filterByTags(
  tagsByEntry: Record<string, Tag[]>,
  tagFilter: MemoryQueryParams['tags']
): Set<string> {
  const include = new Set((tagFilter?.include ?? []).map(t => t.toLowerCase()));
  const require = new Set((tagFilter?.require ?? []).map(t => t.toLowerCase()));
  const exclude = new Set((tagFilter?.exclude ?? []).map(t => t.toLowerCase()));

  const allowed = new Set<string>();

  for (const [entryId, tagList] of Object.entries(tagsByEntry)) {
    const nameSet = new Set(tagList.map(t => t.name.toLowerCase()));

    // Exclude check: intersection must be empty
    if (exclude.size > 0) {
      const hasExcluded = [...exclude].some(ex => nameSet.has(ex));
      if (hasExcluded) continue;
    }

    // Require check: require must be subset of nameSet
    if (require.size > 0) {
      const hasAllRequired = [...require].every(req => nameSet.has(req));
      if (!hasAllRequired) continue;
    }

    // Include check: intersection must be non-empty
    if (include.size > 0) {
      const hasAnyIncluded = [...include].some(inc => nameSet.has(inc));
      if (!hasAnyIncluded) continue;
    }

    allowed.add(entryId);
  }

  return allowed;
}
```

---

## [P1-T4] Batch Version Loading to Eliminate N+1 Queries

**Priority:** High
**Effort:** Medium
**Dependencies:** None
**Files:** `src/services/query.service.ts`
**Tests:** Update `tests/unit/query.service.test.ts`

### Context
Version loading queries database per entry type. Should batch across all entry IDs.

### Subtasks

#### [P1-T4-S1] Create Batched Version Loader
**File:** `src/services/query.service.ts`

**Add new function before `executeMemoryQuery`:**

```typescript
interface BatchedVersions {
  tools: Map<string, { current: ToolVersion; history: ToolVersion[] }>;
  guidelines: Map<string, { current: GuidelineVersion; history: GuidelineVersion[] }>;
  knowledge: Map<string, { current: KnowledgeVersion; history: KnowledgeVersion[] }>;
}

function loadVersionsBatched(
  toolIds: string[],
  guidelineIds: string[],
  knowledgeIds: string[]
): BatchedVersions {
  const db = getDb();
  const result: BatchedVersions = {
    tools: new Map(),
    guidelines: new Map(),
    knowledge: new Map(),
  };

  // Single query per type with all IDs
  if (toolIds.length > 0) {
    const versions = db.select().from(toolVersions)
      .where(inArray(toolVersions.toolId, toolIds))
      .all();
    // Group by toolId, sort by versionNum desc
    // ... implementation
  }

  // Repeat for guidelines and knowledge
  return result;
}
```

#### [P1-T4-S2] Refactor processType to Use Batched Loading
**File:** `src/services/query.service.ts`
**Location:** Lines 981-1395

**Implementation steps:**
1. Collect all entry IDs across all types first
2. Call `loadVersionsBatched()` once
3. Pass result to each type's processing loop
4. Remove individual version loading logic from loop

---

## [P1-T5] Add Prepared Statement Caching

**Priority:** Medium
**Effort:** Medium
**Dependencies:** None
**Files:** `src/db/connection.ts`, new `src/db/statements.ts`
**Tests:** `tests/unit/statements.test.ts` (new)

### Context
Frequently used queries can benefit from prepared statement reuse.

### Subtasks

#### [P1-T5-S1] Create Statement Cache Module
**File:** `src/db/statements.ts` (new)

```typescript
import type Database from 'better-sqlite3';

const statementCache = new Map<string, Database.Statement>();

export function getPreparedStatement(
  sqlite: Database.Database,
  sql: string
): Database.Statement {
  let stmt = statementCache.get(sql);
  if (!stmt) {
    stmt = sqlite.prepare(sql);
    statementCache.set(sql, stmt);
  }
  return stmt;
}

export function clearStatementCache(): void {
  statementCache.clear();
}

// Pre-defined common queries
export const QUERIES = {
  GET_TOOL_BY_ID: 'SELECT * FROM tools WHERE id = ?',
  GET_GUIDELINE_BY_ID: 'SELECT * FROM guidelines WHERE id = ?',
  GET_KNOWLEDGE_BY_ID: 'SELECT * FROM knowledge WHERE id = ?',
  GET_TAGS_FOR_ENTRY: `
    SELECT t.* FROM tags t
    JOIN entry_tags et ON t.id = et.tag_id
    WHERE et.entry_type = ? AND et.entry_id = ?
  `,
  // Add more common queries
} as const;
```

#### [P1-T5-S2] Update Repositories to Use Prepared Statements
**Files:** `src/db/repositories/*.ts`

**Implementation steps:**
1. Import `getPreparedStatement` and `QUERIES`
2. Replace `sqlite.prepare(sql).get()` with `getPreparedStatement(sqlite, sql).get()`
3. Use constants from `QUERIES` for common operations

#### [P1-T5-S3] Clear Cache on Connection Close
**File:** `src/db/connection.ts`

```typescript
export function closeDb(): void {
  if (sqliteInstance) {
    clearStatementCache(); // Add this line
    sqliteInstance.close();
    // ... rest of function
  }
}
```

---

# Phase 2: Reliability Improvements

## [P2-T1] Implement Connection Health Checks and Auto-Reconnect

**Priority:** Critical
**Effort:** Medium
**Dependencies:** None
**Files:** `src/db/connection.ts`
**Tests:** `tests/unit/connection.test.ts` (new)

### Context
Current singleton has no health monitoring or recovery from connection failures.

### Subtasks

#### [P2-T1-S1] Add Health Check Function
**File:** `src/db/connection.ts`

```typescript
export function isDbHealthy(): boolean {
  if (!sqliteInstance) return false;

  try {
    // Simple query to verify connection works
    const result = sqliteInstance.prepare('SELECT 1 as ok').get() as { ok: number };
    return result?.ok === 1;
  } catch {
    return false;
  }
}
```

#### [P2-T1-S2] Add Auto-Reconnect Logic
**File:** `src/db/connection.ts`

```typescript
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1000;

async function attemptReconnect(options: ConnectionOptions = {}): Promise<boolean> {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logger.error({ attempts: reconnectAttempts }, 'Max reconnect attempts reached');
    return false;
  }

  reconnectAttempts++;
  logger.warn({ attempt: reconnectAttempts }, 'Attempting database reconnect');

  try {
    closeDb();
    await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS * reconnectAttempts));
    getDb(options);
    reconnectAttempts = 0;
    logger.info('Database reconnected successfully');
    return true;
  } catch (error) {
    logger.error({ error, attempt: reconnectAttempts }, 'Reconnect failed');
    return attemptReconnect(options);
  }
}

export async function getDbWithHealthCheck(options: ConnectionOptions = {}): Promise<ReturnType<typeof drizzle>> {
  if (!isDbHealthy()) {
    const reconnected = await attemptReconnect(options);
    if (!reconnected) {
      throw new Error('Database connection failed and could not reconnect');
    }
  }
  return getDb(options);
}
```

#### [P2-T1-S3] Add Periodic Health Check (Optional)
**File:** `src/db/connection.ts`

```typescript
let healthCheckInterval: NodeJS.Timeout | null = null;

export function startHealthCheckInterval(intervalMs = 30000): void {
  if (healthCheckInterval) return;

  healthCheckInterval = setInterval(() => {
    if (!isDbHealthy()) {
      logger.warn('Health check failed, triggering reconnect');
      attemptReconnect().catch(err => {
        logger.error({ error: err }, 'Background reconnect failed');
      });
    }
  }, intervalMs);
}

export function stopHealthCheckInterval(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}
```

#### [P2-T1-S4] Update Server to Use Health-Checked Connection
**File:** `src/mcp/server.ts`
**Location:** Lines 1388-1404

```typescript
// Replace getDb() call with:
try {
  logger.info('Initializing database with health check...');
  await getDbWithHealthCheck();
  startHealthCheckInterval();
  logger.info('Database initialized successfully');
} catch (error) {
  // ... existing error handling
}
```

---

## [P2-T2] Add Retry Logic with Exponential Backoff

**Priority:** High
**Effort:** Medium
**Dependencies:** None
**Files:** New `src/utils/retry.ts`, update services
**Tests:** `tests/unit/retry.test.ts` (new)

### Context
Transient failures in DB operations and API calls should be retried.

### Subtasks

#### [P2-T2-S1] Create Retry Utility
**File:** `src/utils/retry.ts` (new)

```typescript
export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  retryableErrors: () => true,
  onRetry: () => {},
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxAttempts || !opts.retryableErrors(lastError)) {
        throw lastError;
      }

      opts.onRetry(lastError, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError!;
}

// Sync version for SQLite operations
export function withRetrySync<T>(
  fn: () => T,
  options: RetryOptions = {}
): T {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxAttempts || !opts.retryableErrors(lastError)) {
        throw lastError;
      }

      opts.onRetry(lastError, attempt);
      // Sync sleep using Atomics (Node.js only)
      const buffer = new SharedArrayBuffer(4);
      const view = new Int32Array(buffer);
      Atomics.wait(view, 0, 0, Math.min(opts.initialDelayMs * attempt, opts.maxDelayMs));
    }
  }

  throw lastError!;
}
```

#### [P2-T2-S2] Define Retryable Error Patterns
**File:** `src/utils/retry.ts`

```typescript
export function isRetryableDbError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('database is locked') ||
    message.includes('busy') ||
    message.includes('cannot start a transaction within a transaction') ||
    message.includes('disk i/o error')
  );
}

export function isRetryableNetworkError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket hang up') ||
    message.includes('network') ||
    message.includes('rate limit')
  );
}
```

#### [P2-T2-S3] Apply Retry to Embedding Service
**File:** `src/services/embedding.service.ts`

**Update `embedOpenAI` method:**

```typescript
import { withRetry, isRetryableNetworkError } from '../utils/retry.js';

private async embedOpenAI(text: string): Promise<number[]> {
  return withRetry(
    async () => {
      if (!this.openaiClient) {
        throw new Error('OpenAI client not initialized');
      }
      const response = await this.openaiClient.embeddings.create({
        model: this.openaiModel,
        input: text,
      });
      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned from OpenAI');
      }
      return embedding;
    },
    {
      maxAttempts: 3,
      retryableErrors: isRetryableNetworkError,
      onRetry: (error, attempt) => {
        logger.warn({ error: error.message, attempt }, 'Retrying OpenAI embedding');
      },
    }
  );
}
```

#### [P2-T2-S4] Apply Retry to Critical DB Operations
**File:** `src/db/repositories/tools.ts` (and other repos)

```typescript
import { withRetrySync, isRetryableDbError } from '../../utils/retry.js';

export function getToolById(id: string): Tool | null {
  return withRetrySync(
    () => {
      const db = getDb();
      return db.select().from(tools).where(eq(tools.id, id)).get() ?? null;
    },
    { retryableErrors: isRetryableDbError }
  );
}
```

---

## [P2-T3] Implement File Lock Cleanup on Startup

**Priority:** High
**Effort:** Small
**Dependencies:** None
**Files:** `src/db/repositories/file_locks.ts`, `src/mcp/server.ts`
**Tests:** Update `tests/integration/file_locks.test.ts`

### Context
File locks can become orphaned if the process crashes. Need cleanup on startup.

### Subtasks

#### [P2-T3-S1] Add Expired Lock Cleanup Function
**File:** `src/db/repositories/file_locks.ts`

```typescript
export function cleanupExpiredLocks(): { cleaned: number; errors: string[] } {
  const db = getDb();
  const now = new Date().toISOString();
  const errors: string[] = [];

  try {
    // Find and delete expired locks
    const result = db
      .delete(fileLocks)
      .where(sql`${fileLocks.expiresAt} IS NOT NULL AND ${fileLocks.expiresAt} < ${now}`)
      .run();

    return { cleaned: result.changes, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { cleaned: 0, errors };
  }
}

export function cleanupStaleLocks(maxAgeHours = 24): { cleaned: number; errors: string[] } {
  const db = getDb();
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
  const errors: string[] = [];

  try {
    // Delete locks older than cutoff that have no expiration set
    const result = db
      .delete(fileLocks)
      .where(
        sql`${fileLocks.expiresAt} IS NULL AND ${fileLocks.checkedOutAt} < ${cutoff}`
      )
      .run();

    return { cleaned: result.changes, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { cleaned: 0, errors };
  }
}
```

#### [P2-T3-S2] Add Startup Cleanup Call
**File:** `src/mcp/server.ts`
**Location:** After database initialization (around line 1410)

```typescript
import { cleanupExpiredLocks, cleanupStaleLocks } from '../db/repositories/file_locks.js';

// After getDb() call:
try {
  const expiredResult = cleanupExpiredLocks();
  const staleResult = cleanupStaleLocks(24); // 24 hour max age

  if (expiredResult.cleaned > 0 || staleResult.cleaned > 0) {
    logger.info(
      { expired: expiredResult.cleaned, stale: staleResult.cleaned },
      'Cleaned up orphaned file locks'
    );
  }
} catch (error) {
  logger.warn({ error }, 'Failed to cleanup file locks on startup');
}
```

#### [P2-T3-S3] Add Periodic Lock Cleanup
**File:** `src/mcp/server.ts`

```typescript
let lockCleanupInterval: NodeJS.Timeout | null = null;

function startLockCleanupInterval(intervalMs = 60 * 60 * 1000): void { // 1 hour
  lockCleanupInterval = setInterval(() => {
    try {
      const result = cleanupExpiredLocks();
      if (result.cleaned > 0) {
        logger.debug({ cleaned: result.cleaned }, 'Periodic lock cleanup');
      }
    } catch (error) {
      logger.warn({ error }, 'Periodic lock cleanup failed');
    }
  }, intervalMs);
}

// Call after server starts
startLockCleanupInterval();

// Clean up on shutdown
process.on('SIGINT', () => {
  if (lockCleanupInterval) clearInterval(lockCleanupInterval);
  // ... rest of shutdown
});
```

---

## [P2-T4] Add Migration File Integrity Verification

**Priority:** Medium
**Effort:** Small
**Dependencies:** None
**Files:** `src/db/init.ts`
**Tests:** `tests/unit/db.init.test.ts`

### Context
Migration files should have checksums to detect tampering or corruption.

### Subtasks

#### [P2-T4-S1] Generate and Store Migration Checksums
**File:** `src/db/init.ts`

```typescript
import { createHash } from 'node:crypto';

function computeChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// Update _migrations table schema
function ensureMigrationTable(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);

  // Add checksum column if missing (for upgrades)
  try {
    sqlite.exec('ALTER TABLE _migrations ADD COLUMN checksum TEXT');
  } catch {
    // Column already exists
  }
}
```

#### [P2-T4-S2] Verify Checksums on Apply
**File:** `src/db/init.ts`

```typescript
function applyMigration(
  sqlite: Database.Database,
  name: string,
  path: string,
  options: { force?: boolean; verbose?: boolean } = {}
): void {
  const sql = readFileSync(path, 'utf-8');
  const checksum = computeChecksum(sql);

  // Check if already applied with different checksum
  const existing = sqlite
    .prepare('SELECT checksum FROM _migrations WHERE name = ?')
    .get(name) as { checksum: string | null } | undefined;

  if (existing && existing.checksum && existing.checksum !== checksum) {
    if (!options.force) {
      throw new Error(
        `Migration ${name} checksum mismatch. Expected: ${existing.checksum}, Got: ${checksum}. ` +
        `Use force mode to override.`
      );
    }
    logger.warn({ migration: name }, 'Checksum mismatch, proceeding with force mode');
  }

  // ... rest of apply logic ...

  // Record with checksum
  sqlite
    .prepare('INSERT OR REPLACE INTO _migrations (name, checksum) VALUES (?, ?)')
    .run(name, checksum);
}
```

#### [P2-T4-S3] Add Checksum Verification Command
**File:** `src/db/init.ts`

```typescript
export function verifyMigrationIntegrity(sqlite: Database.Database): {
  valid: boolean;
  mismatches: Array<{ name: string; expected: string; actual: string }>;
} {
  const applied = sqlite
    .prepare('SELECT name, checksum FROM _migrations')
    .all() as Array<{ name: string; checksum: string | null }>;

  const migrationFiles = getMigrationFiles();
  const mismatches: Array<{ name: string; expected: string; actual: string }> = [];

  for (const migration of migrationFiles) {
    const applied = applied.find(a => a.name === migration.name);
    if (!applied || !applied.checksum) continue;

    const content = readFileSync(migration.path, 'utf-8');
    const actual = computeChecksum(content);

    if (actual !== applied.checksum) {
      mismatches.push({
        name: migration.name,
        expected: applied.checksum,
        actual,
      });
    }
  }

  return { valid: mismatches.length === 0, mismatches };
}
```

---

## [P2-T5] Add Input Size Validation

**Priority:** Medium
**Effort:** Small
**Dependencies:** None
**Files:** `src/services/validation.service.ts`
**Tests:** Update `tests/unit/validation.service.test.ts`

### Context
Very large inputs can cause memory issues. Add size limits.

### Subtasks

#### [P2-T5-S1] Define Size Limits
**File:** `src/services/validation.service.ts`

```typescript
export const SIZE_LIMITS = {
  // Text field limits (characters)
  NAME_MAX_LENGTH: 500,
  TITLE_MAX_LENGTH: 1000,
  DESCRIPTION_MAX_LENGTH: 10000,
  CONTENT_MAX_LENGTH: 100000,  // 100KB
  RATIONALE_MAX_LENGTH: 5000,

  // JSON field limits (bytes when serialized)
  METADATA_MAX_BYTES: 50000,    // 50KB
  PARAMETERS_MAX_BYTES: 50000,  // 50KB
  EXAMPLES_MAX_BYTES: 100000,   // 100KB

  // Array limits
  TAGS_MAX_COUNT: 50,
  EXAMPLES_MAX_COUNT: 20,
  BULK_OPERATION_MAX: 100,
} as const;
```

#### [P2-T5-S2] Add Size Validation Functions
**File:** `src/services/validation.service.ts`

```typescript
export function validateTextLength(
  value: string | undefined | null,
  fieldName: string,
  maxLength: number
): void {
  if (value && value.length > maxLength) {
    throw new AgentMemoryError(
      `${fieldName} exceeds maximum length of ${maxLength} characters (got ${value.length})`,
      ErrorCodes.INVALID_PARAMETER,
      { field: fieldName, maxLength, actualLength: value.length }
    );
  }
}

export function validateJsonSize(
  value: unknown,
  fieldName: string,
  maxBytes: number
): void {
  if (value === undefined || value === null) return;

  const serialized = JSON.stringify(value);
  if (serialized.length > maxBytes) {
    throw new AgentMemoryError(
      `${fieldName} exceeds maximum size of ${maxBytes} bytes (got ${serialized.length})`,
      ErrorCodes.INVALID_PARAMETER,
      { field: fieldName, maxBytes, actualBytes: serialized.length }
    );
  }
}

export function validateArrayLength(
  value: unknown[] | undefined | null,
  fieldName: string,
  maxCount: number
): void {
  if (value && value.length > maxCount) {
    throw new AgentMemoryError(
      `${fieldName} exceeds maximum count of ${maxCount} items (got ${value.length})`,
      ErrorCodes.INVALID_PARAMETER,
      { field: fieldName, maxCount, actualCount: value.length }
    );
  }
}
```

#### [P2-T5-S3] Apply Validation in Handlers
**File:** `src/mcp/handlers/tools.handler.ts` (and other handlers)

```typescript
import {
  validateTextLength,
  validateJsonSize,
  SIZE_LIMITS
} from '../../services/validation.service.js';

// In add() handler:
validateTextLength(params.name, 'name', SIZE_LIMITS.NAME_MAX_LENGTH);
validateTextLength(params.description, 'description', SIZE_LIMITS.DESCRIPTION_MAX_LENGTH);
validateJsonSize(params.parameters, 'parameters', SIZE_LIMITS.PARAMETERS_MAX_BYTES);
validateJsonSize(params.examples, 'examples', SIZE_LIMITS.EXAMPLES_MAX_BYTES);
```

---

# Phase 3: OS Compatibility

## [P3-T1] Add Platform-Specific Path Handling

**Priority:** High
**Effort:** Medium
**Dependencies:** None
**Files:** `src/utils/paths.ts` (new), update file-related code
**Tests:** `tests/unit/paths.test.ts` (new)

### Context
Windows paths need special handling (long paths, separators, case insensitivity).

### Subtasks

#### [P3-T1-S1] Create Cross-Platform Path Utility
**File:** `src/utils/paths.ts` (new)

```typescript
import { normalize, resolve, sep, join, parse } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';

const IS_WINDOWS = process.platform === 'win32';

/**
 * Normalize path for cross-platform use
 * - Converts separators to platform default
 * - Resolves relative paths
 * - Handles case insensitivity on Windows
 */
export function normalizePath(inputPath: string): string {
  let normalized = normalize(resolve(inputPath));

  // Windows: convert to lowercase for consistent comparison
  if (IS_WINDOWS) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

/**
 * Convert to Windows long path format if needed
 * Paths > 260 chars need \\?\ prefix on Windows
 */
export function toLongPath(inputPath: string): string {
  if (!IS_WINDOWS) return inputPath;

  const resolved = resolve(inputPath);
  if (resolved.length > 260 && !resolved.startsWith('\\\\?\\')) {
    return '\\\\?\\' + resolved;
  }
  return resolved;
}

/**
 * Get canonical path (resolved symlinks)
 */
export function getCanonicalPath(inputPath: string): string {
  try {
    return realpathSync(inputPath);
  } catch {
    return resolve(inputPath);
  }
}

/**
 * Compare paths for equality across platforms
 */
export function pathsEqual(path1: string, path2: string): boolean {
  const norm1 = normalizePath(path1);
  const norm2 = normalizePath(path2);
  return norm1 === norm2;
}

/**
 * Get relative path that works cross-platform
 */
export function getRelativePath(from: string, to: string): string {
  // Use forward slashes for consistency (works on all platforms)
  const relative = resolve(from, to);
  return relative.split(sep).join('/');
}

/**
 * Validate path is safe (no directory traversal, etc.)
 */
export function isPathSafe(inputPath: string, allowedRoot?: string): boolean {
  const resolved = resolve(inputPath);

  // Check for null bytes (security issue)
  if (inputPath.includes('\0')) return false;

  // If root specified, ensure path is within it
  if (allowedRoot) {
    const normalizedRoot = normalizePath(allowedRoot);
    const normalizedPath = normalizePath(resolved);
    return normalizedPath.startsWith(normalizedRoot);
  }

  return true;
}
```

#### [P3-T1-S2] Update File Lock Repository
**File:** `src/db/repositories/file_locks.ts`

```typescript
import { normalizePath, isPathSafe } from '../../utils/paths.js';

export function checkout(params: CheckoutParams): FileLock {
  // Normalize path for storage
  const normalizedPath = normalizePath(params.filePath);

  // Validate path
  if (!isPathSafe(params.filePath)) {
    throw new AgentMemoryError(
      'Invalid file path',
      ErrorCodes.INVALID_FILE_PATH,
      { path: params.filePath }
    );
  }

  // ... rest of function, use normalizedPath for DB operations
}
```

#### [P3-T1-S3] Update Database Path Handling
**File:** `src/db/connection.ts`

```typescript
import { normalizePath, toLongPath } from '../utils/paths.js';

const DEFAULT_DB_PATH = (() => {
  const envPath = process.env.AGENT_MEMORY_DB_PATH;
  if (envPath) return toLongPath(envPath);
  return toLongPath(resolve(projectRoot, 'data/memory.db'));
})();
```

---

## [P3-T2] Add Windows Signal Handling

**Priority:** Medium
**Effort:** Small
**Dependencies:** None
**Files:** `src/mcp/server.ts`
**Tests:** Manual testing on Windows

### Context
SIGINT/SIGTERM work differently on Windows. Need alternative handling.

### Subtasks

#### [P3-T2-S1] Add Cross-Platform Shutdown Handling
**File:** `src/mcp/server.ts`

```typescript
function setupShutdownHandlers(): void {
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');

    // Stop intervals
    stopHealthCheckInterval();
    if (lockCleanupInterval) clearInterval(lockCleanupInterval);

    // Close database
    closeDb();

    logger.info('Shutdown complete');
    process.exit(0);
  };

  // Unix signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Windows: handle Ctrl+C via readline
  if (process.platform === 'win32') {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on('SIGINT', () => {
      process.emit('SIGINT' as any);
    });

    // Windows-specific close event
    rl.on('close', () => shutdown('close'));
  }

  // Handle process exit
  process.on('exit', (code) => {
    logger.info({ code }, 'Process exiting');
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.fatal({ error: error.message }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    shutdown('unhandledRejection');
  });
}

// Call in runServer()
setupShutdownHandlers();
```

---

## [P3-T3] Add Native Module Fallback

**Priority:** Medium
**Effort:** Large
**Dependencies:** None
**Files:** `src/db/connection.ts`, `package.json`
**Tests:** Test on various platforms

### Context
better-sqlite3 may fail on some platforms. Add fallback to sql.js (pure JS).

### Subtasks

#### [P3-T3-S1] Add sql.js as Optional Dependency
**File:** `package.json`

```json
{
  "optionalDependencies": {
    "sql.js": "^1.10.0"
  }
}
```

#### [P3-T3-S2] Create Database Driver Abstraction
**File:** `src/db/driver.ts` (new)

```typescript
export interface DatabaseDriver {
  prepare(sql: string): PreparedStatement;
  exec(sql: string): void;
  pragma(pragma: string): unknown;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

export interface PreparedStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

let driverType: 'better-sqlite3' | 'sql.js' = 'better-sqlite3';

export function getDriverType(): string {
  return driverType;
}

export async function createDriver(dbPath: string, options: { readonly?: boolean }): Promise<DatabaseDriver> {
  // Try better-sqlite3 first
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath, { readonly: options.readonly });
    driverType = 'better-sqlite3';
    return wrapBetterSqlite3(db);
  } catch (error) {
    console.warn('better-sqlite3 not available, falling back to sql.js');
  }

  // Fallback to sql.js
  try {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    // Read existing DB or create new
    const db = existsSync(dbPath)
      ? new SQL.Database(readFileSync(dbPath))
      : new SQL.Database();
    driverType = 'sql.js';
    return wrapSqlJs(db, dbPath);
  } catch (error) {
    throw new Error('No SQLite driver available. Install better-sqlite3 or sql.js.');
  }
}

function wrapBetterSqlite3(db: any): DatabaseDriver {
  // ... wrapper implementation
}

function wrapSqlJs(db: any, dbPath: string): DatabaseDriver {
  // ... wrapper implementation with auto-save
}
```

#### [P3-T3-S3] Update Connection Module
**File:** `src/db/connection.ts`

```typescript
import { createDriver, DatabaseDriver } from './driver.js';

let driverInstance: DatabaseDriver | null = null;

export async function getDbAsync(options: ConnectionOptions = {}): Promise<ReturnType<typeof drizzle>> {
  if (dbInstance) return dbInstance;

  const dbPath = options.dbPath ?? DEFAULT_DB_PATH;

  // Ensure directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Create driver (tries better-sqlite3, falls back to sql.js)
  driverInstance = await createDriver(dbPath, { readonly: options.readonly });

  // Enable WAL mode (if supported)
  try {
    driverInstance.pragma('journal_mode = WAL');
  } catch {
    // sql.js doesn't support WAL
  }

  // ... rest of initialization
}
```

---

## [P3-T4] Add Container Deployment Support

**Priority:** Low
**Effort:** Medium
**Dependencies:** None
**Files:** New `Dockerfile`, `docker-compose.yml`, docs
**Tests:** Docker build and run tests

### Subtasks

#### [P3-T4-S1] Create Dockerfile
**File:** `Dockerfile` (new)

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ sqlite-dev

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache sqlite-libs

# Copy built files and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create data directory
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV AGENT_MEMORY_DB_PATH=/app/data/memory.db

# Expose MCP via stdio (no port needed)
# The container should be run with stdin/stdout attached

CMD ["node", "dist/index.js"]
```

#### [P3-T4-S2] Create Docker Compose File
**File:** `docker-compose.yml` (new)

```yaml
version: '3.8'

services:
  agent-memory:
    build: .
    container_name: agent-memory
    volumes:
      - agent-memory-data:/app/data
    environment:
      - AGENT_MEMORY_DB_PATH=/app/data/memory.db
      - LOG_LEVEL=info
    # For MCP over stdio, use stdin_open and tty
    stdin_open: true
    tty: true
    restart: unless-stopped

volumes:
  agent-memory-data:
```

#### [P3-T4-S3] Add Container Documentation
**File:** `docs/docker.md` (new)

```markdown
# Docker Deployment Guide

## Building the Image

```bash
docker build -t agent-memory:latest .
```

## Running with Claude Desktop

Claude Desktop expects MCP servers via stdio. To connect:

1. Build and run container in background:
```bash
docker-compose up -d
```

2. Connect Claude Desktop using docker exec:
```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "docker",
      "args": ["exec", "-i", "agent-memory", "node", "dist/index.js"]
    }
  }
}
```

## Data Persistence

The database is stored in a Docker volume `agent-memory-data`.

To backup:
```bash
docker cp agent-memory:/app/data/memory.db ./backup.db
```

To restore:
```bash
docker cp ./backup.db agent-memory:/app/data/memory.db
```
```

---

# Phase 4: IDE Compatibility

## [P4-T1] Create VS Code Extension

**Priority:** High
**Effort:** Large
**Dependencies:** None
**Files:** New `vscode-extension/` directory
**Tests:** VS Code extension tests

### Context
VS Code integration would greatly improve usability.

### Subtasks

#### [P4-T1-S1] Create Extension Scaffold
**Directory:** `vscode-extension/` (new)

```
vscode-extension/
├── src/
│   ├── extension.ts
│   ├── memoryProvider.ts
│   ├── commands.ts
│   └── views/
│       ├── toolsView.ts
│       ├── guidelinesView.ts
│       └── knowledgeView.ts
├── package.json
├── tsconfig.json
└── README.md
```

#### [P4-T1-S2] Implement Extension Activation
**File:** `vscode-extension/src/extension.ts`

```typescript
import * as vscode from 'vscode';
import { MemoryProvider } from './memoryProvider';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {
  // Create memory provider (MCP client)
  const memoryProvider = new MemoryProvider();

  // Register tree views
  const toolsTreeProvider = new ToolsTreeProvider(memoryProvider);
  vscode.window.registerTreeDataProvider('agentMemory.tools', toolsTreeProvider);

  // Register commands
  registerCommands(context, memoryProvider);

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBar.text = '$(database) Agent Memory';
  statusBar.command = 'agentMemory.showStatus';
  statusBar.show();

  context.subscriptions.push(statusBar);
}

export function deactivate() {}
```

#### [P4-T1-S3] Implement MCP Client
**File:** `vscode-extension/src/memoryProvider.ts`

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

export class MemoryProvider {
  private client: Client | null = null;
  private process: ChildProcess | null = null;

  async connect(): Promise<void> {
    // Get server path from settings
    const config = vscode.workspace.getConfiguration('agentMemory');
    const serverPath = config.get<string>('serverPath');

    // Spawn server process
    this.process = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create MCP client
    const transport = new StdioClientTransport({
      reader: this.process.stdout!,
      writer: this.process.stdin!,
    });

    this.client = new Client({ name: 'vscode-agent-memory', version: '1.0.0' });
    await this.client.connect(transport);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error('Not connected');
    return this.client.callTool({ name, arguments: args });
  }

  async disconnect(): Promise<void> {
    if (this.client) await this.client.close();
    if (this.process) this.process.kill();
  }
}
```

#### [P4-T1-S4] Add Extension Commands
**File:** `vscode-extension/src/commands.ts`

```typescript
import * as vscode from 'vscode';
import { MemoryProvider } from './memoryProvider';

export function registerCommands(
  context: vscode.ExtensionContext,
  provider: MemoryProvider
): void {
  // Search memory
  context.subscriptions.push(
    vscode.commands.registerCommand('agentMemory.search', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search memory',
        placeHolder: 'Enter search query...',
      });

      if (!query) return;

      const results = await provider.callTool('memory_query', {
        action: 'search',
        search: query,
      });

      // Show results in quick pick or webview
      // ... implementation
    })
  );

  // Add knowledge
  context.subscriptions.push(
    vscode.commands.registerCommand('agentMemory.addKnowledge', async () => {
      const title = await vscode.window.showInputBox({
        prompt: 'Knowledge title',
      });
      if (!title) return;

      const content = await vscode.window.showInputBox({
        prompt: 'Knowledge content',
      });
      if (!content) return;

      await provider.callTool('memory_knowledge', {
        action: 'add',
        title,
        content,
        category: 'fact',
      });

      vscode.window.showInformationMessage('Knowledge added successfully');
    })
  );

  // Add guideline from selection
  context.subscriptions.push(
    vscode.commands.registerCommand('agentMemory.addGuidelineFromSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selection = editor.document.getText(editor.selection);
      if (!selection) {
        vscode.window.showWarningMessage('No text selected');
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: 'Guideline name',
      });
      if (!name) return;

      await provider.callTool('memory_guideline', {
        action: 'add',
        name,
        content: selection,
        category: 'code_style',
      });

      vscode.window.showInformationMessage('Guideline created from selection');
    })
  );
}
```

#### [P4-T1-S5] Create Extension Package.json
**File:** `vscode-extension/package.json`

```json
{
  "name": "agent-memory-vscode",
  "displayName": "Agent Memory",
  "description": "VS Code integration for Agent Memory MCP server",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "agentMemory.search",
        "title": "Search Memory",
        "category": "Agent Memory"
      },
      {
        "command": "agentMemory.addKnowledge",
        "title": "Add Knowledge",
        "category": "Agent Memory"
      },
      {
        "command": "agentMemory.addGuidelineFromSelection",
        "title": "Create Guideline from Selection",
        "category": "Agent Memory"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "agentMemory",
          "title": "Agent Memory",
          "icon": "resources/memory-icon.svg"
        }
      ]
    },
    "views": {
      "agentMemory": [
        {
          "id": "agentMemory.tools",
          "name": "Tools"
        },
        {
          "id": "agentMemory.guidelines",
          "name": "Guidelines"
        },
        {
          "id": "agentMemory.knowledge",
          "name": "Knowledge"
        }
      ]
    },
    "configuration": {
      "title": "Agent Memory",
      "properties": {
        "agentMemory.serverPath": {
          "type": "string",
          "default": "",
          "description": "Path to agent-memory server (dist/index.js)"
        },
        "agentMemory.autoConnect": {
          "type": "boolean",
          "default": true,
          "description": "Automatically connect on VS Code startup"
        }
      }
    }
  }
}
```

---

## [P4-T2] Improve Claude Desktop Auto-Configuration

**Priority:** Medium
**Effort:** Medium
**Dependencies:** None
**Files:** `scripts/setup-claude-desktop.ts` (new)
**Tests:** Manual testing

### Subtasks

#### [P4-T2-S1] Create Auto-Setup Script
**File:** `scripts/setup-claude-desktop.ts` (new)

```typescript
#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

interface ClaudeConfig {
  mcpServers?: Record<string, {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
}

function getConfigPath(): string {
  const platform = process.platform;

  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else if (platform === 'win32') {
    return join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
  } else {
    // Linux
    return join(homedir(), '.config', 'claude', 'claude_desktop_config.json');
  }
}

function detectClaudeInstallation(): boolean {
  const configPath = getConfigPath();
  const configDir = join(configPath, '..');
  return existsSync(configDir);
}

function readCurrentConfig(configPath: string): ClaudeConfig {
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function setupAgentMemory(): void {
  console.log('Agent Memory - Claude Desktop Setup');
  console.log('====================================\n');

  // Check if Claude is installed
  if (!detectClaudeInstallation()) {
    console.error('Error: Claude Desktop does not appear to be installed.');
    console.error('Please install Claude Desktop first.');
    process.exit(1);
  }

  const configPath = getConfigPath();
  console.log(`Config file: ${configPath}\n`);

  // Read current config
  const config = readCurrentConfig(configPath);

  // Get agent-memory path
  const agentMemoryPath = resolve(__dirname, '..', 'dist', 'index.js');

  if (!existsSync(agentMemoryPath)) {
    console.error('Error: Agent Memory not built. Run `npm run build` first.');
    process.exit(1);
  }

  // Add/update agent-memory config
  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  const existingConfig = config.mcpServers['agent-memory'];
  if (existingConfig) {
    console.log('Existing agent-memory configuration found.');
    console.log('Current config:', JSON.stringify(existingConfig, null, 2));
    console.log('\nUpdating...');
  } else {
    console.log('Adding agent-memory configuration...');
  }

  config.mcpServers['agent-memory'] = {
    command: 'node',
    args: [agentMemoryPath],
    env: {
      LOG_LEVEL: 'info',
    },
  };

  // Ensure directory exists
  const configDir = join(configPath, '..');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Write config
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log('\nConfiguration updated successfully!');
  console.log('\nNext steps:');
  console.log('1. Restart Claude Desktop');
  console.log('2. You should see "agent-memory" in the MCP servers list');
  console.log('3. Use memory_* tools in your conversations');
}

setupAgentMemory();
```

#### [P4-T2-S2] Add NPM Script
**File:** `package.json`

```json
{
  "scripts": {
    "setup:claude": "tsx scripts/setup-claude-desktop.ts"
  }
}
```

#### [P4-T2-S3] Add Setup Documentation
**File:** `docs/claude-desktop-setup.md` (new)

```markdown
# Claude Desktop Setup Guide

## Automatic Setup

Run the setup script:

```bash
npm run setup:claude
```

This will:
1. Detect your Claude Desktop installation
2. Add agent-memory to your MCP servers configuration
3. Set appropriate environment variables

## Manual Setup

### macOS

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/path/to/agent-memory/dist/index.js"]
    }
  }
}
```

### Windows

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["C:\\path\\to\\agent-memory\\dist\\index.js"]
    }
  }
}
```

### Linux

Edit `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/path/to/agent-memory/dist/index.js"]
    }
  }
}
```

## Troubleshooting

### Server not appearing

1. Check the config file is valid JSON
2. Ensure the path to index.js is absolute
3. Restart Claude Desktop completely

### Connection errors

1. Run `npm run build` to ensure code is compiled
2. Test manually: `node dist/index.js`
3. Check logs in Claude Desktop developer console
```

---

## [P4-T3] Add IDE-Specific Export Formats

**Priority:** Low
**Effort:** Medium
**Dependencies:** None
**Files:** `src/services/ide-export.service.ts`
**Tests:** `tests/unit/ide-export.service.test.ts` (new)

### Subtasks

#### [P4-T3-S1] Add VS Code Snippets Export
**File:** `src/services/ide-export.service.ts`

```typescript
interface VSCodeSnippet {
  prefix: string;
  body: string[];
  description: string;
}

export function exportToVSCodeSnippets(tools: Tool[]): Record<string, VSCodeSnippet> {
  const snippets: Record<string, VSCodeSnippet> = {};

  for (const tool of tools) {
    const version = getCurrentVersion(tool.id, 'tool');
    if (!version) continue;

    snippets[tool.name] = {
      prefix: tool.name,
      body: generateSnippetBody(tool, version),
      description: version.description || tool.name,
    };
  }

  return snippets;
}

function generateSnippetBody(tool: Tool, version: ToolVersion): string[] {
  // Generate VS Code snippet placeholders from parameters
  const params = version.parameters as Record<string, unknown>;
  const lines: string[] = [];

  let placeholderIndex = 1;
  lines.push(`// ${tool.name}`);

  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      lines.push(`${key}: \${${placeholderIndex}:${String(value)}}`);
      placeholderIndex++;
    }
  }

  return lines;
}
```

#### [P4-T3-S2] Add JetBrains Live Templates Export
**File:** `src/services/ide-export.service.ts`

```typescript
export function exportToJetBrainsTemplates(tools: Tool[]): string {
  const templates: string[] = [];

  templates.push('<?xml version="1.0" encoding="UTF-8"?>');
  templates.push('<templateSet group="Agent Memory">');

  for (const tool of tools) {
    const version = getCurrentVersion(tool.id, 'tool');
    if (!version) continue;

    const params = version.parameters as Record<string, unknown>;
    let template = tool.name;
    let variables = '';

    if (params && typeof params === 'object') {
      const varNames = Object.keys(params);
      template = varNames.map(v => `$${v.toUpperCase()}$`).join(' ');
      variables = varNames.map(v =>
        `<variable name="${v.toUpperCase()}" expression="" defaultValue="" alwaysStopAt="true" />`
      ).join('\n');
    }

    templates.push(`
  <template name="${tool.name}" value="${template}" description="${escapeXml(version.description || '')}" toReformat="false" toShortenFQNames="true">
    ${variables}
    <context>
      <option name="OTHER" value="true" />
    </context>
  </template>`);
  }

  templates.push('</templateSet>');
  return templates.join('\n');
}
```

#### [P4-T3-S3] Add Export Handler Actions
**File:** `src/mcp/handlers/export.handler.ts`

```typescript
// Add to export handler switch
case 'vscode-snippets':
  return exportToVSCodeSnippets(tools);
case 'jetbrains-templates':
  return exportToJetBrainsTemplates(tools);
```

---

# Phase 5: Code Quality Improvements

## [P5-T1] Split Large Files

**Priority:** Medium
**Effort:** Medium
**Dependencies:** None
**Files:** `src/services/query.service.ts`, `src/mcp/server.ts`
**Tests:** Ensure all existing tests pass

### Context
`query.service.ts` (1642 lines) and `server.ts` (1638 lines) should be split.

### Subtasks

#### [P5-T1-S1] Split Query Service
**Create new files:**
- `src/services/query/types.ts` - Type definitions
- `src/services/query/cache.ts` - Cache implementation
- `src/services/query/scope.ts` - Scope chain resolution
- `src/services/query/scoring.ts` - Relevance scoring
- `src/services/query/filters.ts` - Tag/relation/text filtering
- `src/services/query/fts.ts` - FTS5 implementation
- `src/services/query/executor.ts` - Main query execution
- `src/services/query/index.ts` - Re-exports

**Implementation steps:**
1. Create `src/services/query/` directory
2. Move type definitions (lines 30-330) to `types.ts`
3. Move cache class (lines 98-290) to `cache.ts`
4. Move scope functions (lines 291-435) to `scope.ts`
5. Move scoring function (lines 797-883) to `scoring.ts`
6. Move filter functions (lines 440-575) to `filters.ts`
7. Move FTS5 functions (lines 577-655, 892-940) to `fts.ts`
8. Keep main function in `executor.ts`
9. Create `index.ts` with all exports
10. Update imports in dependent files

#### [P5-T1-S2] Split Server File
**Create new files:**
- `src/mcp/tools/definitions.ts` - TOOLS array
- `src/mcp/tools/handlers.ts` - bundledHandlers object
- `src/mcp/server/health.ts` - Health check handler
- `src/mcp/server/lifecycle.ts` - Server lifecycle management
- `src/mcp/server.ts` - Slimmed down main server

**Implementation steps:**
1. Move TOOLS array (lines 68-945) to `tools/definitions.ts`
2. Move bundledHandlers (lines 951-1364) to `tools/handlers.ts`
3. Move health handler (lines 1154-1226) to `server/health.ts`
4. Move lifecycle functions to `server/lifecycle.ts`
5. Keep createServer and runServer in `server.ts`
6. Update imports

---

## [P5-T2] Extract Magic Numbers to Constants

**Priority:** Low
**Effort:** Small
**Dependencies:** None
**Files:** Create `src/constants.ts`, update various files
**Tests:** No new tests needed

### Subtasks

#### [P5-T2-S1] Create Constants File
**File:** `src/constants.ts` (new)

```typescript
// Cache settings
export const CACHE = {
  DEFAULT_TTL_MS: 5 * 60 * 1000,      // 5 minutes
  AGGRESSIVE_TTL_MS: 10 * 60 * 1000,  // 10 minutes
  SCOPE_CHAIN_TTL_MS: 10 * 60 * 1000, // 10 minutes
  DEFAULT_MAX_SIZE: 100,
  AGGRESSIVE_MAX_SIZE: 200,
  EMBEDDING_MAX_SIZE: 1000,
} as const;

// Query defaults
export const QUERY = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  CONFLICT_WINDOW_MS: 5 * 1000,  // 5 seconds
  RECENCY_DAYS: 30,
} as const;

// Scoring weights
export const SCORING = {
  EXPLICIT_RELATION: 5.0,
  TAG_MATCH: 3.0,
  SCOPE_PROXIMITY: 2.0,
  TEXT_MATCH: 1.0,
  PRIORITY: 1.5,
  RECENCY: 0.5,
  SEMANTIC_WEIGHT: 0.7,
  OTHER_FACTORS_WEIGHT: 0.3,
} as const;

// File locks
export const FILE_LOCKS = {
  DEFAULT_EXPIRES_SECONDS: 3600,  // 1 hour
  STALE_THRESHOLD_HOURS: 24,
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000,  // 1 hour
} as const;

// Health check
export const HEALTH = {
  CHECK_INTERVAL_MS: 30 * 1000,  // 30 seconds
  MEMORY_PRESSURE_THRESHOLD: 0.85,  // 85%
} as const;

// Retry logic
export const RETRY = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 100,
  MAX_DELAY_MS: 5000,
  BACKOFF_MULTIPLIER: 2,
} as const;

// Fuzzy search
export const FUZZY = {
  SIMILARITY_THRESHOLD: 0.7,
} as const;
```

#### [P5-T2-S2] Update Files to Use Constants
**Files:** Various

Replace magic numbers with constant references:

```typescript
// Before
const ttl = 5 * 60 * 1000;

// After
import { CACHE } from '../constants.js';
const ttl = CACHE.DEFAULT_TTL_MS;
```

---

## [P5-T3] Add E2E Tests for MCP Protocol

**Priority:** High
**Effort:** Large
**Dependencies:** None
**Files:** New `tests/e2e/` directory
**Tests:** New E2E test files

### Subtasks

#### [P5-T3-S1] Create E2E Test Infrastructure
**File:** `tests/e2e/setup.ts` (new)

```typescript
import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

export class TestServer {
  private process: ChildProcess | null = null;
  private client: Client | null = null;
  private tempDir: string;

  constructor() {
    this.tempDir = mkdtempSync(join(tmpdir(), 'agent-memory-test-'));
  }

  async start(): Promise<void> {
    const serverPath = resolve(__dirname, '../../dist/index.js');

    this.process = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        AGENT_MEMORY_DB_PATH: join(this.tempDir, 'test.db'),
        LOG_LEVEL: 'error',
      },
    });

    const transport = new StdioClientTransport({
      reader: this.process.stdout!,
      writer: this.process.stdin!,
    });

    this.client = new Client({ name: 'e2e-test', version: '1.0.0' });
    await this.client.connect(transport);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error('Server not started');
    const result = await this.client.callTool({ name, arguments: args });
    return JSON.parse(result.content[0].text);
  }

  async listTools(): Promise<string[]> {
    if (!this.client) throw new Error('Server not started');
    const result = await this.client.listTools();
    return result.tools.map(t => t.name);
  }

  async stop(): Promise<void> {
    if (this.client) await this.client.close();
    if (this.process) this.process.kill();
    rmSync(this.tempDir, { recursive: true, force: true });
  }
}

// Global setup/teardown
export let testServer: TestServer;

export async function globalSetup(): Promise<void> {
  testServer = new TestServer();
  await testServer.start();
}

export async function globalTeardown(): Promise<void> {
  await testServer.stop();
}
```

#### [P5-T3-S2] Create Protocol Compliance Tests
**File:** `tests/e2e/protocol.test.ts` (new)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestServer } from './setup';

describe('MCP Protocol Compliance', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = new TestServer();
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('Tool Discovery', () => {
    it('should list all expected tools', async () => {
      const tools = await server.listTools();

      expect(tools).toContain('memory_org');
      expect(tools).toContain('memory_project');
      expect(tools).toContain('memory_session');
      expect(tools).toContain('memory_tool');
      expect(tools).toContain('memory_guideline');
      expect(tools).toContain('memory_knowledge');
      expect(tools).toContain('memory_tag');
      expect(tools).toContain('memory_relation');
      expect(tools).toContain('memory_query');
      expect(tools).toContain('memory_health');
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const result = await server.callTool('memory_health', {});

      expect(result).toHaveProperty('status', 'healthy');
      expect(result).toHaveProperty('database');
      expect(result.database).toHaveProperty('type', 'SQLite');
    });
  });

  describe('CRUD Operations', () => {
    it('should create and retrieve organization', async () => {
      const created = await server.callTool('memory_org', {
        action: 'create',
        name: 'Test Org',
      });

      expect(created).toHaveProperty('id');
      expect(created).toHaveProperty('name', 'Test Org');

      const listed = await server.callTool('memory_org', {
        action: 'list',
      });

      expect(listed.items).toHaveLength(1);
      expect(listed.items[0].name).toBe('Test Org');
    });

    // Add more CRUD tests...
  });

  describe('Query Operations', () => {
    it('should search across entry types', async () => {
      // Setup test data
      await server.callTool('memory_knowledge', {
        action: 'add',
        title: 'TypeScript Best Practices',
        content: 'Always use strict mode',
        category: 'fact',
      });

      // Search
      const results = await server.callTool('memory_query', {
        action: 'search',
        search: 'TypeScript',
      });

      expect(results.results).toHaveLength(1);
      expect(results.results[0].type).toBe('knowledge');
    });
  });
});
```

#### [P5-T3-S3] Add Stress Tests
**File:** `tests/e2e/stress.test.ts` (new)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestServer } from './setup';

describe('Stress Tests', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = new TestServer();
    await server.start();
  }, 30000);

  afterAll(async () => {
    await server.stop();
  });

  it('should handle 100 concurrent writes', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      server.callTool('memory_knowledge', {
        action: 'add',
        title: `Knowledge Entry ${i}`,
        content: `Content for entry ${i}`,
        category: 'fact',
      })
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(100);
    results.forEach(r => expect(r).toHaveProperty('id'));
  }, 60000);

  it('should handle large query results', async () => {
    // Create 500 entries
    for (let i = 0; i < 500; i++) {
      await server.callTool('memory_knowledge', {
        action: 'add',
        title: `Batch Entry ${i}`,
        content: `Content ${i}`,
        category: 'fact',
      });
    }

    // Query with high limit
    const results = await server.callTool('memory_query', {
      action: 'search',
      types: ['knowledge'],
      limit: 100,
    });

    expect(results.results).toHaveLength(100);
    expect(results.meta.totalCount).toBeGreaterThanOrEqual(500);
  }, 120000);
});
```

---

# Appendix: Quick Reference

## Task Dependencies Graph

```
P1-T1 (LRU Cache)
  └── P1-T2 (Scope Chain Cache)

P2-T1 (Health Check)
P2-T2 (Retry Logic)
P2-T3 (Lock Cleanup)
P2-T4 (Migration Integrity)
P2-T5 (Input Validation)

P3-T1 (Path Handling)
P3-T2 (Windows Signals)
P3-T3 (Native Fallback) - Large
P3-T4 (Docker) - Large

P4-T1 (VS Code Extension) - Large
P4-T2 (Claude Desktop Setup)
P4-T3 (IDE Export Formats)

P5-T1 (Split Files)
P5-T2 (Constants)
P5-T3 (E2E Tests) - Large
```

## Priority Matrix

| Priority | Tasks |
|----------|-------|
| Critical | P2-T1 |
| High | P1-T1, P1-T2, P1-T4, P2-T2, P2-T3, P3-T1, P4-T1, P5-T3 |
| Medium | P1-T3, P1-T5, P2-T4, P2-T5, P3-T2, P3-T3, P4-T2, P5-T1 |
| Low | P3-T4, P4-T3, P5-T2 |

## Effort Estimates

| Effort | Tasks |
|--------|-------|
| Small (1-2h) | P1-T2, P1-T3, P2-T3, P2-T4, P2-T5, P3-T2, P5-T2 |
| Medium (2-8h) | P1-T1, P1-T4, P1-T5, P2-T1, P2-T2, P3-T1, P4-T2, P4-T3, P5-T1 |
| Large (8h+) | P3-T3, P3-T4, P4-T1, P5-T3 |

---

*Guide generated from Code Review Report - December 14, 2025*
