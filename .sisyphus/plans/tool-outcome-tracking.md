# Tool Outcome Tracking - Full Extension

## TL;DR

> **Quick Summary**: Extend the error-only learning system to track **core coding tool** outcomes (success/failure/partial) for Edit, Write, Bash, Read, Glob, and Grep tools. Analyze patterns from both successes and failures, and generate knowledge from positive patterns. Support both Claude Code hooks and OpenCode plugin.
>
> **Deliverables**:
>
> - NEW `tool_outcomes` table (event-level, NOT aggregate) + keep `error_log` for backward compat
> - Extended PostToolUse hook to record ALL tool executions (Claude Code)
> - OpenCode plugin integration for tool outcome tracking
> - New `OutcomeAnalyzerService` replacing ErrorAnalyzerService
> - Pattern detection for: best practices, recovery patterns, tool sequences, efficiency
> - Periodic analysis during sessions + session-end analysis
>
> **Estimated Effort**: Medium-Large (5-6 days)
> **Parallel Execution**: YES - 3 waves (7 tasks)
> **Critical Path**: Task 1 → Task 2 → Task 4/5 → Task 6/7

---

## Context

### Current State (CRITICAL)

**PostToolUse hook exists but is NOT enabled in the hook generator.**

Looking at `src/services/hook-generator.service.ts:104-162`, the `generateClaudeCodeSettings()` function generates hooks for: PreToolUse, Stop, UserPromptSubmit, SessionStart, SessionEnd.

**PostToolUse is NOT in this list.** The command exists at `src/commands/hook/posttooluse-command.ts` but it is never wired into the generated `.claude/settings.json`.

**Consequence**: None of the outcome learning paths (error recording, pattern detection) currently run in Claude Code by default. This plan ENABLES them by adding PostToolUse to the hook generator.

### Original Request

User requested extending the error-only learning system to:

1. Track successes, not just failures
2. Detect general patterns (best practices, sequences, efficiency)
3. Generate knowledge from positive patterns

### Interview Summary

**Key Decisions**:

- Schema: NEW `tool_outcomes` table (event-level); keep `error_log` table for backward compat
- Tool filtering: Track core coding tools (Edit|Write|Bash|Read|Glob|Grep) - see Task 2 for rationale
- Pattern types: Best practices, recovery patterns, tool sequences, efficiency patterns
- Context capture: Input summary, output summary, duration, preceding tool
- Analysis trigger: Periodic (every N tools) + session-end

**Research Findings**:

- Current `error_log` has 13 columns, all error-focused
- PostToolUse hook already parses success/failure
- ErrorAnalyzerService has LLM integration ready
- HookLearningService has `onSessionEnd` method

---

## Work Objectives

### Core Objective

Transform the error-only tracking system into a comprehensive tool outcome tracking system that learns from both failures AND successes, detecting patterns that can improve agent performance.

### Concrete Deliverables

- `src/db/schema/tool-outcomes.ts` - NEW event-level schema (no aggregate fields)
- `src/db/migrations/0041_add_tool_outcomes.sql` - Migration (creates NEW table, keeps error_log)
- `src/db/repositories/tool-outcomes.ts` - Extended repository
- `src/services/learning/outcome-analyzer.service.ts` - Renamed/extended analyzer
- Modified `posttooluse-command.ts` - Record ALL outcomes
- Modified `hook-learning.service.ts` - Periodic + session-end analysis
- New pattern detection prompts for success patterns

### Definition of Done

- [x] Core coding tool executions (Edit|Write|Bash|Read|Glob|Grep) recorded in DB (success + failure)
- [x] Tool sequences tracked (preceding_tool_id field)
- [x] Periodic analysis triggers every N tool executions (configurable)
- [x] LLM detects best practices from success patterns
- [x] LLM detects recovery patterns (success after failure)
- [x] LLM detects efficient tool sequences
- [x] Generated knowledge includes pattern type metadata (see "Pattern Metadata Storage" below)
- [x] All tests pass (existing + new)
- [x] Backward compatibility: existing error queries still work

### Must Have

- Core coding tool outcomes tracked (Edit|Write|Bash|Read|Glob|Grep), not just errors
- Input/output summaries captured (truncated, privacy-safe)
- Duration tracking for efficiency analysis
- Preceding tool tracking for sequence analysis
- Pattern type classification (best_practice, recovery, sequence, efficiency)
- Configurable periodic analysis threshold
- Backward compatible with existing error_log queries

### Database Backend Scope (CRITICAL)

**This feature is SQLite-ONLY in this plan.**

| Component                         | SQLite Support                 | PostgreSQL Support                  |
| --------------------------------- | ------------------------------ | ----------------------------------- |
| `tool_outcomes` table             | YES (via migration)            | OUT OF SCOPE                        |
| `session_tool_counter` table      | YES (via migration)            | OUT OF SCOPE                        |
| MCP `tool_outcome` action         | YES (works when dbType=sqlite) | NO-OP (logs warning, returns early) |
| MCP `session_end_analysis` action | YES                            | NO-OP                               |
| OpenCode plugin integration       | YES                            | Skipped (checks dbType)             |

**Why SQLite-only:**

1. PostgreSQL support adds complexity (different migration, different schema syntax)
2. Hook learning features are primarily for local development (where SQLite is standard)
3. Can be extended to PostgreSQL in a follow-up task

**Implementation for PostgreSQL graceful degradation:**

```typescript
// In MCP handlers (hook-learning.handler.ts), check at entry:
if (context.config.dbType === 'postgresql') {
  return formatTimestamps({
    success: false,
    message:
      'Tool outcome tracking is not supported with PostgreSQL backend. Feature is SQLite-only.',
    action: params.action,
  });
}

// In OpenCode plugin, check before calling MCP:
const dbType = await mcpClient.callTool('memory_status', {}).then((r) => r.dbType);
if (dbType === 'postgresql') {
  // Skip tool outcome recording, log once
  return;
}
```

**Files that need PostgreSQL checks:**

- `src/mcp/handlers/hook-learning.handler.ts` - Early return in `tool_outcome` and `session_end_analysis`
- `plugins/opencode/agent-memory.ts` - Skip MCP calls if PostgreSQL

### Must NOT Have (Guardrails)

- NO raw tool input/output stored **in `tool_outcomes` table** (summarize/truncate only)
  - **Scope clarification**: Existing conversation capture in `src/commands/hook/posttooluse-command.ts:485`
    stores raw tool data in conversation messages. That behavior is OUT OF SCOPE for this plan.
    This guardrail applies ONLY to the new `tool_outcomes.input_summary` and `tool_outcomes.output_summary` columns.
- **NO blocking hook execution on SLOW operations** (clarified below)
- NO LLM calls for every tool execution (batch only)
- NO auto-storage at project scope (session only, needs promotion)
- NO breaking changes to existing error_log queries (maintain aliases)
- **Retention policy OUT OF SCOPE** - Unbounded growth is ACCEPTED in this plan; pruning will be added in a follow-up Librarian task. See Definitions section for intended future behavior.
- NO storing sensitive data in `tool_outcomes` (API keys, passwords detected and redacted via Definitions)

**CLARIFICATION: "No blocking on slow operations" guardrail:**

The original guardrail "NO blocking hook execution on DB writes (fire-and-forget)" is **refined** as follows:

| Operation Type                     | Blocking Allowed?        | Rationale                               |
| ---------------------------------- | ------------------------ | --------------------------------------- |
| Fast SQLite operations (<5ms)      | **YES (await)**          | Needed for counter/ordering correctness |
| LLM analysis calls (30s+)          | **NO (fire-and-forget)** | Would freeze user's IDE                 |
| Network calls to external services | **NO (fire-and-forget)** | Unpredictable latency                   |

**What this means in practice:**

- `await toolOutcomesRepo.record(...)` is OK - fast DB write
- `await toolOutcomesRepo.incrementAndGetToolCount(...)` is OK - fast DB operation
- `outcomeAnalyzer.analyze(...).then(...)` with NO await - LLM call is backgrounded

**This is consistent with existing PostToolUse behavior** which already awaits some DB/analytics work while backgrounding LLM-based extraction. See `src/commands/hook/posttooluse-command.ts` for existing patterns.

**Specific policy for error_log vs tool_outcomes:**

| Table             | Current Behavior             | New Behavior             | Rationale                                                   |
| ----------------- | ---------------------------- | ------------------------ | ----------------------------------------------------------- |
| `error_log`       | Fire-and-forget (`.catch()`) | **Keep fire-and-forget** | Backward compat; existing latency characteristics preserved |
| `tool_outcomes`   | N/A (new)                    | **Await**                | Needed for counter/ordering correctness                     |
| Counter increment | N/A (new)                    | **Await**                | Must be sequenced after tool_outcomes insert                |

**Implementation in PostToolUse:**

```typescript
// Step 1: Record to tool_outcomes (AWAIT - needed for correctness)
const outcomeId = await ctx.repos.toolOutcomes.record({ ... });

// Step 2: Increment counter (AWAIT - needs outcome id)
await ctx.repos.toolOutcomes.incrementAndGetToolCount(sessionId);

// Step 3: If failure, ALSO write to error_log (FIRE-AND-FORGET - preserve existing behavior)
if (outcome === 'failure') {
  ctx.repos.errorLog.record({ ... }).catch(err => logger.warn('error_log write failed', { err }));
}

// Step 4: Periodic analysis if threshold met (FIRE-AND-FORGET - LLM call)
if (shouldTriggerAnalysis) {
  triggerPeriodicAnalysis(...).catch(err => logger.warn('analysis failed', { err }));
}
```

**Why keep error_log fire-and-forget:**

- Existing behavior - changing it would affect hook latency characteristics
- error_log is for aggregate error tracking, not ordering-sensitive
- tool_outcomes is the new source of truth for sequence analysis

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **User wants tests**: YES (TDD)
- **Framework**: vitest

Each TODO follows RED-GREEN-REFACTOR.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Schema migration (error_log → tool_outcomes)
└── Task 3: Outcome analyzer service (extend ErrorAnalyzerService)

Wave 2 (After Wave 1):
├── Task 2: PostToolUse hook (record ALL outcomes)
├── Task 4: Periodic analysis integration
└── Task 5: Session-end extended analysis

Wave 3 (After Wave 2):
├── Task 6: Integration tests + edge cases
└── Task 7: OpenCode plugin integration
```

### Dependency Matrix

| Task | Depends On | Blocks  | Can Parallelize With |
| ---- | ---------- | ------- | -------------------- |
| 1    | None       | 2, 4, 5 | 3                    |
| 2    | 1          | 4, 5, 7 | 3                    |
| 3    | None       | 4, 5, 6 | 1                    |
| 4    | 1, 2, 3    | 6       | 5                    |
| 5    | 1, 2, 3    | 6       | 4                    |
| 6    | 4, 5       | None    | 7                    |
| 7    | 2          | None    | 6                    |

---

## Definitions

### Outcome Types

| Outcome   | Definition                                            | Example                                       |
| --------- | ----------------------------------------------------- | --------------------------------------------- |
| `success` | Tool returned expected result without errors          | File edit applied, query returned results     |
| `failure` | Tool threw an error or returned error status          | File not found, permission denied, API error  |
| `partial` | Tool completed but with warnings or degraded behavior | Operation succeeded with deprecation warnings |

**Partial Outcome Detection:**

An outcome is classified as `partial` when:

1. `success === true` (tool didn't throw)
2. AND output contains warning indicators:
   - String contains `warning:` or `Warning:` (case-insensitive)
   - String contains `deprecated` or `Deprecated`
   - String contains `[WARN]` or `[WARNING]`
   - JSON response has `warnings: []` array with items

```typescript
function classifyOutcome(success: boolean, output: string): 'success' | 'failure' | 'partial' {
  if (!success) return 'failure';

  const warningPatterns = [/\bwarning[:\s]/i, /\bdeprecated\b/i, /\[warn(ing)?\]/i];

  const hasWarning = warningPatterns.some((p) => p.test(output));
  return hasWarning ? 'partial' : 'success';
}
```

### Redaction Rules

**Never store these patterns in `inputSummary` or `outputSummary`:**

| Pattern Type   | Regex                                       | Replace With          |
| -------------- | ------------------------------------------- | --------------------- |
| API Keys       | `sk-[a-zA-Z0-9]{20,}`                       | `[REDACTED:api_key]`  |
| AWS Keys       | `AKIA[0-9A-Z]{16}`                          | `[REDACTED:aws_key]`  |
| Bearer Token   | `Bearer\s+[a-zA-Z0-9._-]+`                  | `[REDACTED:bearer]`   |
| Password       | `password[=:]\s*['"]?[^'"\\s]+`             | `[REDACTED:password]` |
| Private Key    | `-----BEGIN.*PRIVATE KEY-----`              | `[REDACTED:key]`      |
| Generic Secret | `secret[=:]\s*['"]?[a-zA-Z0-9._-]{8,}['"]?` | `[REDACTED:secret]`   |

**Implementation:**

```typescript
const REDACTION_PATTERNS = [
  { regex: /sk-[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED:api_key]' },
  { regex: /AKIA[0-9A-Z]{16}/g, replacement: '[REDACTED:aws_key]' },
  { regex: /Bearer\s+[a-zA-Z0-9._-]+/gi, replacement: '[REDACTED:bearer]' },
  { regex: /password[=:]\s*['"]?[^'"\s]+/gi, replacement: '[REDACTED:password]' },
  {
    regex: /-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g,
    replacement: '[REDACTED:key]',
  },
  { regex: /secret[=:]\s*['"]?[a-zA-Z0-9._-]{8,}['"]?/gi, replacement: '[REDACTED:secret]' },
];

function redactSensitive(text: string): string {
  return REDACTION_PATTERNS.reduce((t, p) => t.replace(p.regex, p.replacement), text);
}
```

### Retention Policy

| Setting                 | Default Value | Description                                   |
| ----------------------- | ------------- | --------------------------------------------- |
| `retentionDays`         | 30            | Outcomes older than this are pruned           |
| `maxOutcomesPerProject` | 10000         | Hard cap per project (oldest pruned first)    |
| `pruneOnMaintenance`    | true          | Auto-prune during Librarian maintenance cycle |

**Pruning Strategy:**

1. **Time-based**: Delete outcomes where `createdAt < NOW() - retentionDays`
2. **Count-based**: If count > maxOutcomesPerProject, delete oldest until under limit
3. **Trigger**: Runs during `LibrarianAgent` nightly maintenance (5am default)

**Configuration:**

```typescript
interface RetentionConfig {
  retentionDays: number; // Env: AGENT_MEMORY_OUTCOME_RETENTION_DAYS
  maxOutcomesPerProject: number; // Env: AGENT_MEMORY_OUTCOME_MAX_PER_PROJECT
  pruneOnMaintenance: boolean; // Env: AGENT_MEMORY_OUTCOME_PRUNE_ENABLED
}

const DEFAULT_RETENTION: RetentionConfig = {
  retentionDays: 30,
  maxOutcomesPerProject: 10000,
  pruneOnMaintenance: true,
};
```

**Pruning is NOT implemented in this plan** - it will be added as a separate task in Librarian maintenance. This plan only documents the intended behavior for reference.

### Pattern Metadata Storage

**Problem**: When generating knowledge entries from detected patterns, we need to store metadata about the pattern type (best_practice, recovery, sequence, efficiency) so it can be queried and reported.

**Solution**: Use existing schema fields - NO schema changes required:

| Pattern Data   | Storage Field                  | Example Value             |
| -------------- | ------------------------------ | ------------------------- |
| Pattern type   | `knowledgeVersions.source`     | `"pattern:best_practice"` |
| Creator        | `knowledge.createdBy`          | `"outcome-analyzer"`      |
| Confidence     | `knowledgeVersions.confidence` | `0.85`                    |
| Tools involved | Embed in `content`             | `"Tools: Edit, Bash"`     |

**Implementation in `storePatternKnowledge()`:**

```typescript
// Uses knowledgeRepo.create() - verified in src/db/repositories/knowledge.ts:81
async storePatternKnowledge(pattern: DetectedPattern, sessionId: string): Promise<void> {
  const { suggestedKnowledge } = pattern;
  const knowledgeRepo = this.context.repos.knowledge; // From container

  await knowledgeRepo.create({
    scopeType: 'session',
    scopeId: sessionId,
    title: suggestedKnowledge.title,
    category: 'fact', // All patterns are facts
    content: `${suggestedKnowledge.content}\n\nTools: ${pattern.tools.join(', ')}`,
    source: `pattern:${pattern.patternType}`, // <-- Pattern type stored here
    confidence: pattern.confidence,
    createdBy: 'outcome-analyzer',
  });
}
```

**Querying patterns by type:**

```sql
-- Find all best practice knowledge
SELECT k.*, kv.source, kv.confidence
FROM knowledge k
JOIN knowledge_versions kv ON k.current_version_id = kv.id
WHERE kv.source LIKE 'pattern:%'
  AND kv.source = 'pattern:best_practice';

-- Find all patterns from outcome analyzer
SELECT * FROM knowledge WHERE created_by = 'outcome-analyzer';
```

**Why this approach:**

1. **No schema migration** - Uses existing fields
2. **Queryable** - Can filter by `source LIKE 'pattern:%'`
3. **Standard confidence** - Uses built-in confidence field
4. **Traceable** - `createdBy` identifies automated vs manual entries

### Pattern Storage Ownership (CRITICAL)

**`[NEW]` The `storePatternKnowledge()` method MUST BE CREATED in `HookLearningService`.**

This method does NOT currently exist. It must be added as part of Task 4/Task 5.

**Location:** `[MODIFY]` `src/services/learning/hook-learning.service.ts`

**Method Signature (to be implemented):**

```typescript
// [NEW] Add to HookLearningService class
async storePatternKnowledge(pattern: DetectedPattern, sessionId: string): Promise<void> {
  const { suggestedKnowledge } = pattern;

  // Uses injected repo (NOT this.context - see setDependencies pattern)
  if (!this.knowledgeRepo) throw new Error('Knowledge repository not available');

  // Maps to existing IKnowledgeRepository.create() interface
  // See src/db/repositories/knowledge.ts:81 for create() signature
  await this.knowledgeRepo.create({
    scopeType: 'session',               // Always session scope (needs promotion later)
    scopeId: sessionId,
    title: suggestedKnowledge.title,
    category: 'fact',                   // All patterns are facts
    content: `${suggestedKnowledge.content}\n\nTools: ${pattern.tools.join(', ')}`,
    source: `pattern:${pattern.patternType}`,  // Pattern type stored in source field
    confidence: pattern.confidence,
    createdBy: 'outcome-analyzer',      // Identifies automated creation
  });
}
```

**Where to implement:** Task 4 (Periodic Analysis) - add as part of HookLearningService modifications.

**Call Sites (2 locations):**

| Location                 | Caller                               | When Called                                                            | Task   |
| ------------------------ | ------------------------------------ | ---------------------------------------------------------------------- | ------ |
| **Periodic Analysis**    | PostToolUse hook                     | After periodic analysis completes, for each high-confidence pattern    | Task 4 |
| **Session-End Analysis** | `HookLearningService.onSessionEnd()` | After session-end analysis completes, for each high-confidence pattern | Task 5 |

**Task 4 Call Site (PostToolUse):**

```typescript
// In PostToolUse, after periodic analysis completes:
const hookLearning = getHookLearningService();
for (const pattern of analysis.patterns) {
  if (pattern.confidence >= 0.7) {
    await hookLearning.storePatternKnowledge(pattern, sessionId);
  }
}
```

**Task 5 Call Site (Session-End):**

```typescript
// In HookLearningService.onSessionEnd():
async onSessionEnd(sessionId: string): Promise<void> {
  const outcomes = await this.outcomeRepo.getBySession(sessionId);
  const analysis = await this.outcomeAnalyzer.analyzeAllPatterns(outcomes);

  for (const pattern of analysis.patterns) {
    if (pattern.confidence >= this.config.confidenceThreshold) {
      await this.storePatternKnowledge(pattern, sessionId);  // Internal call
    }
  }
}
```

**Why HookLearningService owns pattern storage:**

1. **Centralized**: One method handles all pattern→knowledge conversion
2. **Consistent metadata**: Same `source`, `createdBy` format everywhere
3. **Access to repos**: Service has injected repositories via `setDependencies()`
4. **Existing pattern**: Service already handles experience/knowledge storage (see `onErrorLearning` which creates experience entries)

---

## TODOs

**Reference Convention:**

- `[EXISTING]` - File/path already exists in codebase (verified)
- `[NEW]` - File/path to be created by this task
- `[MODIFY]` - Existing file that needs changes

This helps implementers distinguish between starting points and deliverables.

---

### Task 1: Create New tool_outcomes Table (Event-Level Schema)

**What to do**:

- Create NEW `tool_outcomes` table (event-level, NOT aggregate)
- Keep `error_log` table unchanged for backward compatibility
- **NO sync trigger** - PostToolUse writes to BOTH tables directly (see Source of Truth section)
- Create new `ToolOutcomesRepository` in container

**Schema (EVENT-LEVEL - no aggregation)**:

````typescript
// src/db/schema/tool-outcomes.ts
export const toolOutcomes = sqliteTable('tool_outcomes', {
  // Primary key - one row per tool execution
  id: text('id').primaryKey().notNull(),

  // Session context
  sessionId: text('session_id').notNull(),
  projectId: text('project_id'),

  // Tool identification
  toolName: text('tool_name').notNull(),

  // Outcome classification
  outcome: text('outcome').notNull(), // 'success' | 'failure' | 'partial'
  outcomeType: text('outcome_type'), // error type for failures, null for success/partial
  message: text('message'), // Error message OR success summary

  // Privacy-safe context (REDACTED)
  toolInputHash: text('tool_input_hash'), // SHA-256 hash, not raw input
  inputSummary: text('input_summary'), // Truncated + redacted (max 200 chars)
  outputSummary: text('output_summary'), // Truncated + redacted (max 500 chars)

  // Execution metrics
  durationMs: integer('duration_ms'), // Heuristic: time since last outcome (see Implementation Notes)

  // Sequence tracking
  precedingToolId: text('preceding_tool_id'), // FK to previous tool_outcomes.id in session

  // Analysis tracking
  analyzed: integer('analyzed').default(0).notNull(), // 0=pending, 1=analyzed

  // Timestamp (one per execution) - SEE "Timestamp Ordering Rules" section below
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

/**
 * TIMESTAMP AND ORDERING RULES (CRITICAL for sequence/batch correctness)
 *
 * 1. FORMAT: Always use ISO 8601 with millisecond precision
 *    - Repository ALWAYS sets: `createdAt: new Date().toISOString()`
 *    - Example: "2026-01-29T10:30:45.123Z"
 *    - SQLite's CURRENT_TIMESTAMP is ONLY the default for direct SQL inserts;
 *      Drizzle inserts via repository will override with app-generated timestamp
 *
 * 2. ID GENERATION: Use UUID v4 with `out_` prefix (consistent with existing patterns)
 *    - Format: `out_${generateId()}` (e.g., "out_a1b2c3d4-e5f6-...")
 *    - Matches existing patterns: `err_${generateId()}` in error-log, `exp_${generateId()}` in experiences
 *    - UUID v4 is random, so ID ordering does NOT correlate with insertion order
 *
 * 3. TIE-BREAKING: When multiple rows share the same createdAt (within 1ms):
 *    - UUID v4 provides DETERMINISTIC but ARBITRARY ordering (not insertion-order)
 *    - This is ACCEPTABLE for our use case because:
 *      a) Sequence analysis (`precedingToolId`) is set by the inserter based on last outcome, not derived from ID
 *      b) Batch selection queries outcomes by COUNT, not by ID range
 *      c) Within-ms ties are rare in practice (hooks are sequential per session)
 *    - All ORDER BY queries MUST use: `ORDER BY created_at DESC, id DESC`
 *
 * 4. WHY UUID v4 (not ULID):
 *    - Consistency: Matches existing ID patterns throughout codebase (`generateId()` is UUID v4)
 *    - No new dependency: ulid is NOT currently used in this project
 *    - Sufficient: Our algorithm doesn't require insertion-order ID sorting
 *
 * 5. REPOSITORY RECORD API (AUTHORITATIVE CONTRACT):
 *    ```typescript
 *    /**
 *     * Records a tool outcome. Repository generates id and createdAt.
 *     * @param outcome - All fields EXCEPT id and createdAt
 *     * @returns The generated outcome ID (for use as next precedingToolId)
 *     */
 *    async record(outcome: Omit<ToolOutcome, 'id' | 'createdAt'>): Promise<string> {
 *      const id = `out_${generateId()}`;  // UUID v4 with `out_` prefix
 *      const createdAt = new Date().toISOString();
 *      await this.db.insert(toolOutcomes).values({
 *        ...outcome,
 *        id,
 *        createdAt,
 *      }).run();
 *      return id;
 *    }
 *    ```
 *
 *    THIS IS THE ONLY CONTRACT. All callers (PostToolUse, HookLearningService) use this.
 *    - Caller does NOT pass `id` or `createdAt`
 *    - Repository generates `id` with `out_` prefix (matches `err_` prefix in error-log)
 *    - Repository generates `createdAt` with ms-precision ISO timestamp
 *    - Return value is the generated ID (for chaining precedingToolId)
 *
 * 6. QUERIES: All ordering queries use consistent pattern:
 *    ```typescript
 *    .orderBy(desc(toolOutcomes.createdAt), desc(toolOutcomes.id))
 *    ```
 */

// Index for sequence queries
export const toolOutcomesSessionIdx = index('tool_outcomes_session_idx').on(toolOutcomes.sessionId);
export const toolOutcomesCreatedAtIdx = index('tool_outcomes_created_at_idx').on(
  toolOutcomes.createdAt
);
````

**CRITICAL - Why Event-Level (NOT aggregate):**

The original `error_log` table used aggregation (occurrenceCount, firstOccurrence, lastOccurrence) to deduplicate repeated errors. For `tool_outcomes`, we use EVENT-LEVEL storage because:

1. **Sequence analysis requires ordered events**: `precedingToolId` forms a linear chain
2. **Duration varies per execution**: Can't aggregate durationMs meaningfully
3. **Input/output context is per-execution**: Each tool call has different context
4. **Pattern analysis needs granular data**: Recovery patterns need to see A→failure→B→success

Aggregation happens at ANALYSIS time, not storage time.

**Migration Strategy**:

1. Create NEW table `tool_outcomes` with event-level schema (no aggregate fields)
2. Copy all existing `error_log` rows into `tool_outcomes`:
   - `outcome = 'failure'`
   - `outcomeType = error_log.error_type`
   - `message = error_log.error_message`
   - `inputSummary = NULL` (wasn't captured)
   - `outputSummary = NULL` (wasn't captured)
   - `durationMs = NULL` (wasn't captured)
   - `precedingToolId = NULL` (wasn't tracked)
3. Keep `error_log` table UNCHANGED
4. **NO SYNC TRIGGER** (see Source of Truth section below)
5. Wire new `ToolOutcomesRepository` into container

**CRITICAL - Source of Truth for Failure Events:**

The `error_log` repository uses UPSERT logic: repeated errors (same signature+session) UPDATE existing rows (increment count) rather than INSERT. This means:

- An `AFTER INSERT` trigger would only fire on the FIRST occurrence of each unique error
- Repeated errors would NOT create new tool_outcomes rows

**Decision: DUAL-WRITE Strategy (no trigger)**

PostToolUse writes to BOTH tables directly:

1. **For failures**: Write to BOTH `error_log` (aggregate behavior preserved) AND `tool_outcomes` (event-level)
2. **For successes/partials**: Write to `tool_outcomes` ONLY (no aggregate needed)

```typescript
// In PostToolUse after determining outcome:
if (outcome === 'failure') {
  // Maintain backward compat: write to error_log with aggregate/dedupe behavior
  await errorLogRepo.record({ sessionId, toolName, errorType, errorMessage, errorSignature, toolInputHash });
}
// Always write to tool_outcomes for event-level tracking
await toolOutcomesRepo.record({ sessionId, toolName, outcome, ... });
```

**Why this is safe:**

- `error_log` remains the aggregate view of errors (existing queries work unchanged)
- `tool_outcomes` is the event stream (every execution recorded)
- No trigger complexity or race conditions
- Clear ownership: PostToolUse is the single writer to both tables

**How dual-write works in the new execution mode:**

With PostToolUse now using `initializeHookContext()` (see Task 2 prerequisite), both repos are available:

- `ctx.repos.errorLog` - existing repo, available after context init
- `ctx.repos.toolOutcomes` - new repo, wired in Task 1

```typescript
// In PostToolUse after determining outcome:
const ctx = getContext();

// Write to tool_outcomes (always)
await ctx.repos.toolOutcomes.record({ sessionId, toolName, outcome, ... });

// Write to error_log (failures only, for backward compat)
if (outcome === 'failure') {
  await ctx.repos.errorLog.record({ sessionId, toolName, errorType, errorMessage, ... });
}
```

**This guarantees "existing error queries still work"** because:

1. `error_log` table is unchanged
2. Failures are written to `error_log` with same aggregate/dedupe behavior
3. The repo is available because PostToolUse uses full hook context

**Migration SQL** (`0041_add_tool_outcomes.sql`):

```sql
-- Create new event-level table
CREATE TABLE IF NOT EXISTS tool_outcomes (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  project_id TEXT,
  tool_name TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'partial')),
  outcome_type TEXT,
  message TEXT,
  tool_input_hash TEXT,
  input_summary TEXT,
  output_summary TEXT,
  duration_ms INTEGER,
  preceding_tool_id TEXT,
  analyzed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS tool_outcomes_session_idx ON tool_outcomes(session_id);
CREATE INDEX IF NOT EXISTS tool_outcomes_created_at_idx ON tool_outcomes(created_at);
CREATE INDEX IF NOT EXISTS tool_outcomes_project_idx ON tool_outcomes(project_id);

-- OPTIONAL: Migrate existing error_log data
-- LIMITATION: error_log is AGGREGATE (deduplicated), so this migration creates
-- ONE row per unique error, NOT per-occurrence. Historical sequence/recovery
-- analysis will be incomplete for pre-migration data.
-- This is acceptable because:
--   1. New events going forward are per-occurrence
--   2. Historical aggregate data is still useful for error counts
--   3. Sequence analysis requires consecutive events (not possible to reconstruct)
INSERT INTO tool_outcomes (
  id, session_id, project_id, tool_name, outcome, outcome_type, message,
  tool_input_hash, analyzed, created_at
)
SELECT
  id, session_id, project_id, tool_name, 'failure', error_type, error_message,
  tool_input_hash, analyzed, created_at
FROM error_log;

-- NO sync trigger - PostToolUse writes to both tables directly
-- See "Source of Truth" section in plan for rationale

-- NO tool_timing table - no correlation ID available in hook input
-- Duration tracking uses heuristic approach (see Implementation Notes)

-- Session tool counter for periodic analysis (SQLite-based due to process isolation)
-- See Task 4 "Counter Storage Location" for details
CREATE TABLE IF NOT EXISTS session_tool_counter (
  session_id TEXT PRIMARY KEY NOT NULL,
  tool_count INTEGER NOT NULL DEFAULT 0,
  last_analysis_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Repository & Schema Wiring** (COMPLETE list of files to modify):

```typescript
// 1. Export schema from index
// File: src/db/schema/index.ts
export * from './tool-outcomes.js';
// NOTE: No tool-timing.js - duration uses heuristic (see Implementation Notes)

// 2. Add to repository interface (note: interface is `Repositories`, not `RepositoryMap`)
// File: src/core/interfaces/repositories/index.ts
export interface Repositories {
  // ... existing repos (lines 69-101) ...
  errorLog?: ErrorLogRepository;  // Existing (line 100)
  toolOutcomes?: ToolOutcomesRepository;  // NEW - optional like errorLog
}

// 3. Wire in factory
// File: src/core/factory/repositories.ts
import { createToolOutcomesRepository, type ToolOutcomesRepository } from '../../db/repositories/tool-outcomes.js';

// Add to createRepositories function (around line 70, after errorLog):
toolOutcomes: createToolOutcomesRepository(deps),
```

**CRITICAL - Backward Compatibility:**

- `error_log` table remains UNCHANGED and WRITABLE
- Existing code (`getContext().repos.errorLog`) continues to work
- PostToolUse writes failures to BOTH tables (dual-write, no trigger)
- NEW code writes directly to tool_outcomes via `getContext().repos.toolOutcomes`

**Must NOT do**:

- Break existing queries that use error_log
- Lose existing error data
- Store unbounded text (truncate all summaries)

**Recommended Agent Profile**:

- **Category**: `quick`
- **Skills**: [`coding-standards`, `backend-patterns`]

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Task 3)
- **Blocks**: Tasks 2, 4, 5
- **Blocked By**: None

**References**:

- `[EXISTING]` `src/db/schema/error-log.ts` - Current schema (aggregate pattern to avoid)
- `[MODIFY]` `src/db/schema/index.ts` - Schema exports (add tool-outcomes.ts)
- `[EXISTING]` `src/db/repositories/error-log.ts` - Current repository pattern (copy for new repo)
- `[EXISTING]` `src/db/migrations/0040_add_error_log.sql` - Migration file pattern (copy)
- `[MODIFY]` `src/core/factory/repositories.ts` - Repository wiring location
- `[MODIFY]` `src/core/interfaces/repositories/index.ts` - Repository type definitions
- `[NEW]` `src/db/schema/tool-outcomes.ts` - New schema file (tool_outcomes table)
- `[NEW]` `src/db/schema/session-tool-counter.ts` - New schema file (session_tool_counter table)
- `[NEW]` `src/db/repositories/tool-outcomes.ts` - New repository file
- `[NEW]` `src/db/migrations/0041_add_tool_outcomes.sql` - New migration file (both tables)

**Acceptance Criteria**:

```bash
# Get actual DB path (matches src/services/hook-generator.service.ts:70-78)
# - Development: ./data/memory.db (project-local if exists)
# - Installed/Hooks: ~/.agent-memory/memory.db (NOT /data/!)
# - Custom: $AGENT_MEMORY_DB_PATH if set
#
# For dev testing, use project-local:
DB_PATH="${AGENT_MEMORY_DB_PATH:-./data/memory.db}"
# For installed/hook testing, use:
# DB_PATH="${AGENT_MEMORY_DB_PATH:-$HOME/.agent-memory/memory.db}"

# Schema exists with event-level columns (no aggregate fields)
sqlite3 "$DB_PATH" ".schema tool_outcomes"
# Expected: Shows outcome, input_summary, output_summary, duration_ms, preceding_tool_id
# Expected: NO occurrence_count, first_occurrence, last_occurrence

# error_log table still exists and is writable (NOT a view)
sqlite3 "$DB_PATH" "INSERT INTO error_log (id, session_id, tool_name, error_type, error_message, error_signature, first_occurrence, last_occurrence, created_at) VALUES ('test-123', 'sess-1', 'TestTool', 'TestError', 'Test message', 'sig-123', datetime('now'), datetime('now'), datetime('now'))"
# Expected: SUCCESS (table accepts inserts)

# NOTE: No sync trigger - PostToolUse writes to both tables directly
# See "Source of Truth" section in Task 1 for rationale

# Repository is wired into container
grep -r "toolOutcomes" src/core/factory/repositories.ts
# Expected: Shows toolOutcomes repository wiring

# Tests pass (repo tests live in tests/unit/ per project convention)
npm test tests/unit/tool-outcomes.repo.test.ts
# Expected: All tests pass
```

**Commit**: YES

- Message: `feat(db): add tool_outcomes event-level table`
- Files: `src/db/schema/tool-outcomes.ts`, `src/db/repositories/tool-outcomes.ts`, `src/db/migrations/0041_add_tool_outcomes.sql`, `src/core/factory/repositories.ts`
- Pre-commit: `npm test src/db/repositories/tool-outcomes`

---

### Implementation Notes: Duration & PrecedingToolId Derivation

**CRITICAL - No Correlation ID Available:**

Claude Code hook input (`src/commands/hook/types.ts:ClaudeHookInput`) does NOT include a `tool_call_id` or any unique identifier to correlate PreToolUse and PostToolUse events for the same tool execution.

Available fields: `session_id`, `tool_name`, `tool_input`, `tool_response` - but NO unique execution ID.

**Consequence**: Accurate duration tracking requires a correlation key that doesn't exist.

**How to compute `durationMs` (HEURISTIC APPROACH):**

Since no correlation ID exists, use a heuristic estimate based on time since previous outcome:

```typescript
// PostToolUse only (no PreToolUse changes needed)
// File: src/commands/hook/posttooluse-command.ts

// Duration is estimated as time since last recorded outcome for this session
// This is imprecise but workable without a correlation ID
const lastOutcome = await toolOutcomesRepo.getLastOutcomeForSession(sessionId);
let durationMs: number | null = null;

if (lastOutcome) {
  const lastTime = new Date(lastOutcome.createdAt).getTime();
  const now = Date.now();
  // Only use if reasonable (< 5 min, likely same execution context)
  if (now - lastTime < 300000) {
    durationMs = now - lastTime;
  }
}

// Note: This gives "time since last tool completed", not "time for THIS tool"
// For first tool in session, durationMs will be null
```

**Limitations of heuristic approach:**

- Measures time between tool completions, not individual tool duration
- Inaccurate if tools run in parallel
- First tool in session has no duration
- Acceptable for pattern analysis (relative speed comparisons still useful)

**Future Enhancement**: If Claude adds `tool_call_id` to hook input, switch to accurate PreToolUse→PostToolUse correlation via `tool_timing` table.

**NO tool_timing table in this plan** - removed since correlation ID doesn't exist.

**How to compute `precedingToolId`:**

Query the `tool_outcomes` table for the most recent entry in the session:

```typescript
// In tool-outcomes repository, add method:
// Uses deterministic ordering: createdAt DESC, id DESC (see Timestamp Ordering Rules)
async getLastOutcomeForSession(sessionId: string): Promise<ToolOutcome | null> {
  const result = await this.db
    .select()
    .from(toolOutcomes)
    .where(eq(toolOutcomes.sessionId, sessionId))
    .orderBy(desc(toolOutcomes.createdAt), desc(toolOutcomes.id))
    .limit(1);
  return result[0] ?? null;
}

// Usage in PostToolUse:
const lastOutcome = await repo.getLastOutcomeForSession(sessionId);
const precedingToolId = lastOutcome?.id ?? null;
```

**Important**: This creates a linear sequence, not a tree. If parallel tool execution occurs, the "preceding" tool is simply the most recently recorded one.

---

### Task 2: PostToolUse Hook - Record ALL Outcomes

**PREREQUISITE: PostToolUse Hook Installation**

**CRITICAL**: The PostToolUse hook is NOT currently enabled in the hook generator!

Looking at `src/services/hook-generator.service.ts:104-162`, the `generateClaudeCodeSettings()` function generates settings.json with these hooks:

- PreToolUse ✓
- Stop ✓
- UserPromptSubmit ✓
- SessionStart ✓
- SessionEnd ✓
- **PostToolUse ✗ MISSING**

**This task MUST also include:**

1. **Generate PostToolUse hook script** (`src/services/hook-generator.service.ts`):

```typescript
// Add new function:
export function generateClaudeCodePostToolUseHookScript(params?: { projectId?: string }): string {
  const projectId = params?.projectId || '';
  return `#!/bin/bash
# Claude Code PostToolUse hook
# Auto-generated by Agent Memory
set -euo pipefail
if [ -t 0 ]; then exit 0; fi
# ... (same DB path detection as PreToolUse) ...
exec agent-memory hook posttooluse${projectId ? ` --project-id "${projectId}"` : ''} --agent-id "\${AGENT_ID:-claude-code}"
`;
}
```

2. **Add PostToolUse to settings.json** (`generateClaudeCodeSettings`):

**Tool Matcher Scope - "ALL" means these specific tools:**

| Tool    | Why Tracked                             |
| ------- | --------------------------------------- |
| `Edit`  | File modifications - core coding action |
| `Write` | File creation - core coding action      |
| `Bash`  | Command execution - builds, tests, git  |
| `Read`  | File reading - context gathering        |
| `Glob`  | File search - codebase exploration      |
| `Grep`  | Content search - codebase exploration   |

**NOT tracked** (by design):

- `Task` - Subagent delegation, tracked separately
- `mcp_*` - MCP tool calls, may add later
- `Question` - User interaction, not tool execution

**Rationale**: Focus on core coding and exploration tools that have measurable success/failure patterns.

```typescript
// Add to hooks object in generateClaudeCodeSettings():
PostToolUse: [
  {
    matcher: 'Edit|Write|Bash|Read|Glob|Grep',
    hooks: [
      {
        type: 'command',
        command: postToolUsePath,
      },
    ],
  },
],
```

3. **Update generateHooks()** to include PostToolUse script generation

4. **Files to modify**:
   - `src/services/hook-generator.service.ts` - Add PostToolUse generation
   - `.claude/settings.json` (regenerated) - Add PostToolUse hook config

**Without this prerequisite, PostToolUse code changes will have NO EFFECT** - the hook won't fire!

---

**CRITICAL: PostToolUse Execution Mode and Repo Availability**

Currently, `posttooluse` runs under `initializeHookDatabase()` by default (see `src/commands/hook.ts:290`), which means:

- Only `db` and `sqlite` are available
- `getContext().repos.*` is NOT available
- Full AppContext is NOT registered

**This plan CHANGES PostToolUse to use `initializeHookContext()` instead:**

```typescript
// [MODIFY] src/commands/hook.ts:289-291
// Change from:
} else {
  await initializeHookDatabase();
}

// To:
} else if (sub === 'posttooluse' || sub === 'post-tool-use') {
  // PostToolUse needs hook context for outcome recording and periodic analysis
  await initializeHookContext();
} else {
  await initializeHookDatabase();
}
```

**Why change the execution mode:**

1. **Outcome recording** needs `toolOutcomesRepo` (available via ctx.repos)
2. **Error log dual-write** needs `errorLogRepo` (available via ctx.repos)
3. **Periodic analysis** needs HookLearningService dependencies
4. **Config access** needs `buildConfig()` (already done in `initializeHookContext()`)

**Latency impact:**

- `initializeHookDatabase()`: ~10ms (DB only)
- `initializeHookContext()`: ~50-100ms (context + wiring)
- Acceptable because PostToolUse runs AFTER tool execution, not blocking user

**Config access in PostToolUse:**
After switching to `initializeHookContext()`, config is available via:

```typescript
import { buildConfig } from '../../config/index.js';
const config = buildConfig();
const threshold = config.periodicAnalysis.toolCountThreshold;
```

Note: The `src/config/learning.ts` file mentioned earlier is NOT needed - config comes from the registry-based system via `buildConfig()`.

---

**What to do**:

- Modify hook to record EVERY tool execution (not just failures)
- Capture success context: input summary, output summary, duration
- Track preceding tool for sequence analysis
- Maintain await for DB writes, fire-and-forget for LLM (see guardrails)
- **ALSO: Add PostToolUse to hook generator (see prerequisite above)**
- **ALSO: Change PostToolUse to use initializeHookContext() (see above)**

**Utility Functions File (`[NEW] src/commands/hook/outcome-utils.ts`):**

Create this file with all utility functions needed for outcome recording:

```typescript
// src/commands/hook/outcome-utils.ts
import { createHash } from 'crypto';

/** Outcome classification - see Definitions section for full spec */
export type OutcomeType = 'success' | 'failure' | 'partial';

export function classifyOutcome(success: boolean, output: string): OutcomeType {
  if (!success) return 'failure';
  const warningPatterns = [/\bwarning[:\s]/i, /\bdeprecated\b/i, /\[warn(ing)?\]/i];
  const hasWarning = warningPatterns.some((p) => p.test(output));
  return hasWarning ? 'partial' : 'success';
}

/** Redaction - see Definitions section for full pattern list */
const REDACTION_PATTERNS = [
  { regex: /sk-[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED:api_key]' },
  { regex: /AKIA[0-9A-Z]{16}/g, replacement: '[REDACTED:aws_key]' },
  { regex: /Bearer\s+[a-zA-Z0-9._-]+/gi, replacement: '[REDACTED:bearer]' },
  { regex: /password[=:]\s*['"]?[^'"\s]+/gi, replacement: '[REDACTED:password]' },
  {
    regex: /-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g,
    replacement: '[REDACTED:key]',
  },
  { regex: /secret[=:]\s*['"]?[a-zA-Z0-9._-]{8,}['"]?/gi, replacement: '[REDACTED:secret]' },
];

export function redactSensitive(text: string): string {
  return REDACTION_PATTERNS.reduce((t, p) => t.replace(p.regex, p.replacement), text);
}

/** Summarize input, truncating to maxLen chars */
export function summarizeInput(input: unknown, maxLen: number = 200): string {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

/** Summarize output, truncating to maxLen chars */
export function summarizeOutput(output: unknown, maxLen: number = 500): string {
  const str = typeof output === 'string' ? output : JSON.stringify(output);
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

/** Hash input for deduplication/comparison */
export function hashInput(input: unknown): string {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}
```

---

**Key Changes to PostToolUse**:

```typescript
// Import utilities from new file
import {
  classifyOutcome,
  redactSensitive,
  summarizeInput,
  summarizeOutput,
  hashInput,
} from './outcome-utils.js';

// Compute duration using DB heuristic (see Implementation Notes - no correlation ID)
// Duration = time since last recorded outcome in this session
const lastOutcome = await toolOutcomesRepo.getLastOutcomeForSession(sessionId);
let durationMs: number | null = null;
if (lastOutcome) {
  const lastTime = new Date(lastOutcome.createdAt).getTime();
  const now = Date.now();
  if (now - lastTime < 300000) {
    // Only if < 5 min (same execution context)
    durationMs = now - lastTime;
  }
}

// Get preceding tool from DB
const lastOutcome = await toolOutcomesRepo.getLastOutcomeForSession(sessionId);
const precedingToolId = lastOutcome?.id ?? null;

// Classify outcome (success/failure/partial)
const outputSummary = summarizeOutput(toolResponse, 500);
const outcomeType = classifyOutcome(success, outputSummary); // Uses Definitions section logic

// Record outcome regardless of success/failure
const outcome: ToolOutcome = {
  id: generateId(),
  sessionId,
  projectId,
  toolName,
  outcome: outcomeType, // 'success' | 'failure' | 'partial'
  outcomeType: success ? null : errorType, // error category for failures
  message: success ? redactSensitive(summarizeOutput(toolResponse)) : errorMessage,
  toolInputHash: hashInput(toolInput),
  inputSummary: redactSensitive(summarizeInput(toolInput, 200)),
  outputSummary: redactSensitive(outputSummary),
  durationMs,
  precedingToolId,
  analyzed: 0,
};

// AWAIT the record() call - this is a fast DB write (<1ms), NOT fire-and-forget
// The fire-and-forget rule applies to LLM calls, not DB operations
// See "Fire-and-Forget vs Await Rules" in Task 4 for details
await toolOutcomesRepo.record(outcome);
```

**Must NOT do**:

- Store raw input/output (summarize only)
- Block hook execution
- Break existing error detection logic

**Recommended Agent Profile**:

- **Category**: `quick`
- **Skills**: [`coding-standards`, `backend-patterns`]

**Parallelization**:

- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2 (after Task 1)
- **Blocks**: Tasks 4, 5
- **Blocked By**: Task 1

**References**:

- `[MODIFY]` `src/commands/hook/posttooluse-command.ts:300-400` - Current error recording (add success recording)
- `[EXISTING]` `src/commands/hook/posttooluse-command.ts:66-130` - parseToolResult (reuse)
- `[EXISTING]` `src/commands/hook/pretooluse-command.ts` - NOT modified (duration uses heuristic, NOT PreToolUse timing)
- `[MODIFY]` `src/services/hook-generator.service.ts:104-162` - Hook settings generation (add PostToolUse)
- `[EXISTING]` `src/services/hook-generator.service.ts:52-91` - PreToolUse script pattern (copy for PostToolUse)
- `[NEW]` `src/commands/hook/outcome-utils.ts` - Utility functions (classifyOutcome, redactSensitive, summarizeInput/Output, hashInput)
- `[MODIFY]` `src/commands/hook.ts:289-291` - Change PostToolUse to use initializeHookContext() (see prerequisite)

**Acceptance Criteria**:

```bash
# 1. Verify PostToolUse hook is enabled in generated settings
# Run hook install and check settings.json
npx agent-memory hook install --ide claude --project-path /tmp/test-project
cat /tmp/test-project/.claude/settings.json | jq '.hooks.PostToolUse'
# Expected: Shows array with matcher "Edit|Write|Bash|Read|Glob|Grep" and command pointing to hook script

# Verify hook script exists
ls -la /tmp/test-project/.claude/hooks/
# Expected: Shows posttooluse script file (e.g., agent-memory-posttooluse.sh)

# 2. Create new test file for PostToolUse outcome recording
# File: tests/unit/posttooluse-outcome-recording.test.ts
# Tests should cover:
#   - Success outcome recorded with inputSummary, outputSummary, durationMs
#   - Failure outcome recorded with errorType and message
#   - precedingToolId populated from previous tool in session
#   - Await pattern for DB writes (not fire-and-forget)

npm test tests/unit/posttooluse-outcome-recording.test.ts
# Expected: All 4+ tests pass

# 3. Verify in DB (manual validation)
sqlite3 data/memory.db "SELECT outcome, COUNT(*) FROM tool_outcomes GROUP BY outcome"
# Expected: Shows both 'success' and 'failure' rows
```

**ALSO: Add MCP Action for External Clients (OpenCode Plugin)**

The PostToolUse hook writes directly to `tool_outcomes` because it runs in-process. However, the OpenCode plugin (Task 7) uses MCP calls, so it needs an MCP action to record outcomes.

**Add `tool_outcome` action to `memory_capture`:**

```typescript
// File: src/mcp/handlers/hook-learning.handler.ts
// Add new handler:

async tool_outcome(context: AppContext, params: Record<string, unknown>) {
  const service = context.services.hookLearning;
  if (!service?.isAvailable()) {
    return formatTimestamps({
      success: false,
      message: 'Hook learning service not available',
    });
  }

  const sessionId = getRequiredParam(params, 'sessionId', isString);
  const toolName = getRequiredParam(params, 'toolName', isString);
  const outcome = getRequiredParam(params, 'outcome', isOutcomeType); // success|failure|partial
  const inputSummary = getOptionalParam(params, 'inputSummary', isString);
  const outputSummary = getOptionalParam(params, 'outputSummary', isString);
  const projectId = getOptionalParam(params, 'projectId', isString);

  try {
    const result = await service.recordToolOutcome({
      sessionId,
      projectId,
      toolName,
      outcome,
      inputSummary,
      outputSummary,
    });

    return formatTimestamps({
      success: true,
      action: 'tool_outcome',
      ...result,
    });
  } catch (error) {
    logger.error({ error: formatError(error), sessionId }, 'Tool outcome recording failed');
    return formatTimestamps({
      success: false,
      action: 'tool_outcome',
      error: formatError(error),
    });
  }
}

// Add to hookLearningHandlers object and update MCP descriptor
```

**Outcome Insertion Paths (Two Writers, Clear Ownership):**

There are TWO writers to `tool_outcomes`, each with clear ownership:

| Writer                                    | Used By                 | Runs Where          | Accesses Repo                        |
| ----------------------------------------- | ----------------------- | ------------------- | ------------------------------------ |
| Direct `toolOutcomesRepo.record()`        | Claude Code hooks       | PostToolUse process | Via `ctx.repos.toolOutcomes`         |
| `HookLearningService.recordToolOutcome()` | OpenCode plugin via MCP | MCP server process  | Via injected `this.toolOutcomesRepo` |

**Why two paths instead of one:**

- Claude Code hooks run as separate processes → can't call MCP
- OpenCode plugin runs in-process with MCP → uses MCP for consistency

**Field derivation rules are IDENTICAL for both paths:**

- Both use the same redaction logic (from `outcome-utils.ts`)
- Both compute `precedingToolId` via `getLastOutcomeForSession()`
- Both compute `durationMs` via heuristic (time since last outcome)
- Both increment counter after successful insert

**The only difference is WHERE the code runs:**

- Claude Code: field derivation in `posttooluse-command.ts`
- OpenCode: field derivation in `HookLearningService.recordToolOutcome()`

---

**Server-Side Field Mapping (HookLearningService.recordToolOutcome):**

The MCP client (OpenCode) provides only: `sessionId`, `toolName`, `outcome`, `inputSummary?`, `outputSummary?`, `projectId?`

The server fills in remaining DB fields:

| DB Field          | Source                    | Implementation                                                          |
| ----------------- | ------------------------- | ----------------------------------------------------------------------- |
| `id`              | Server generates          | `out_${generateId()}` (matches error-log pattern `err_${generateId()}`) |
| `sessionId`       | From MCP params           | Direct mapping                                                          |
| `projectId`       | From MCP params (or null) | Direct mapping                                                          |
| `toolName`        | From MCP params           | Direct mapping                                                          |
| `outcome`         | From MCP params           | Direct mapping                                                          |
| `inputSummary`    | From MCP params (or null) | Server applies redaction + truncation                                   |
| `outputSummary`   | From MCP params (or null) | Server applies redaction + truncation                                   |
| `toolInputHash`   | Server computes           | `hashInput(inputSummary ?? '')`                                         |
| `precedingToolId` | Server queries DB         | Same logic as PostToolUse: `getLastOutcomeForSession()`                 |
| `durationMs`      | Server computes           | Same heuristic as PostToolUse: time since last outcome                  |
| `analyzed`        | Defaults to 0             | Not analyzed yet                                                        |
| `createdAt`       | Server generates          | `new Date().toISOString()`                                              |

**Implementation in HookLearningService:**

**CRITICAL: Dependency Injection Pattern**

`HookLearningService` uses `setDependencies()`, NOT `this.context`. See `src/services/learning/hook-learning.service.ts:328`.

**Step 1: Extend setDependencies signature** (`[MODIFY]` `src/services/learning/hook-learning.service.ts`):

```typescript
// Add to setDependencies interface (around line 328):
import type { ToolOutcomesRepository } from '../../db/repositories/tool-outcomes.js';

setDependencies(deps: {
  experienceRepo?: IExperienceRepository;
  knowledgeRepo?: IKnowledgeRepository;
  // ... existing deps ...
  toolOutcomesRepo?: ToolOutcomesRepository;  // NEW
}): void {
  // ... existing assignments ...
  if (deps.toolOutcomesRepo) {
    this.toolOutcomesRepo = deps.toolOutcomesRepo;
  }
}

// Add private field:
private toolOutcomesRepo: ToolOutcomesRepository | null = null;
```

**Step 2: Wire dependency** (`[MODIFY]` locations where setDependencies is called):

```typescript
// In src/commands/hook.ts (around lines 84, 127, 176):
learningService.setDependencies({
  // ... existing deps ...
  toolOutcomesRepo: context.repos.toolOutcomes, // NEW
});

// In src/core/factory/context-wiring.ts (around line 205):
services.hookLearning.setDependencies({
  // ... existing deps ...
  toolOutcomesRepo: repos.toolOutcomes, // NEW
});
```

**Step 3: Add recordToolOutcome method** (`[MODIFY]` `src/services/learning/hook-learning.service.ts`):

```typescript
async recordToolOutcome(params: {
  sessionId: string;
  toolName: string;
  outcome: 'success' | 'failure' | 'partial';
  inputSummary?: string;
  outputSummary?: string;
  projectId?: string;
}): Promise<{ id: string }> {
  // Uses injected repo (NOT this.context)
  if (!this.toolOutcomesRepo) throw new Error('Tool outcomes repository not available');

  // Server-side field computation (same logic as PostToolUse hook)
  const lastOutcome = await this.toolOutcomesRepo.getLastOutcomeForSession(params.sessionId);
  const precedingToolId = lastOutcome?.id ?? null;

  // Heuristic duration
  let durationMs: number | null = null;
  if (lastOutcome) {
    const lastTime = new Date(lastOutcome.createdAt).getTime();
    const now = Date.now();
    if (now - lastTime < 300000) {
      durationMs = now - lastTime;
    }
  }

  // Apply redaction + truncation on server side (guardrail enforcement)
  const safeInputSummary = params.inputSummary
    ? redactSensitive(summarizeInput(params.inputSummary, 200))
    : null;
  const safeOutputSummary = params.outputSummary
    ? redactSensitive(summarizeOutput(params.outputSummary, 500))
    : null;

  const id = `out_${generateId()}`;
  await this.toolOutcomesRepo.record({
    id,
    sessionId: params.sessionId,
    projectId: params.projectId ?? null,
    toolName: params.toolName,
    outcome: params.outcome,
    inputSummary: safeInputSummary,
    outputSummary: safeOutputSummary,
    toolInputHash: hashInput(params.inputSummary ?? ''),
    precedingToolId,
    durationMs,
    analyzed: 0,
  });

  // Also increment counter (see Issue 2 below)
  await this.toolOutcomesRepo.incrementAndGetToolCount(params.sessionId);

  return { id };
}
```

**Why server-side field computation:**

1. **Security guardrail** - Server enforces redaction regardless of client
2. **Consistency** - Same logic for Claude hooks and OpenCode
3. **Simplicity** - Client just sends what it knows; server fills the rest

**Also add `session_end_analysis` action** (for OpenCode session end trigger):

```typescript
// File: src/mcp/handlers/hook-learning.handler.ts
async session_end_analysis(context: AppContext, params: Record<string, unknown>) {
  const service = context.services.hookLearning;
  if (!service?.isAvailable()) {
    return formatTimestamps({
      success: false,
      message: 'Hook learning service not available',
    });
  }

  const sessionId = getRequiredParam(params, 'sessionId', isString);

  try {
    await service.onSessionEnd(sessionId);
    return formatTimestamps({
      success: true,
      action: 'session_end_analysis',
      sessionId,
    });
  } catch (error) {
    logger.error({ error: formatError(error), sessionId }, 'Session-end analysis failed');
    return formatTimestamps({
      success: false,
      action: 'session_end_analysis',
      error: formatError(error),
    });
  }
}
```

**Files to modify for MCP actions:**

- `src/mcp/handlers/hook-learning.handler.ts` - Add `tool_outcome` AND `session_end_analysis` handlers
- `src/mcp/descriptors/memory_capture.ts` - Add both to action enum and examples
- `src/services/learning/hook-learning.service.ts` - Add `recordToolOutcome()` method

**MCP Descriptor Updates (`src/mcp/descriptors/memory_capture.ts`):**

```typescript
// Update action enum (line ~12):
action: 'block_start' | 'block_end' | 'conversation' | 'episode' | 'status' | 'tool_outcome' | 'session_end_analysis'

// Add examples to description:
Example: {"action":"tool_outcome","sessionId":"sess-123","toolName":"Edit","outcome":"success","inputSummary":"..."}
Example: {"action":"session_end_analysis","sessionId":"opencode-sess-123"}
```

**Commit**: YES

- Message: `feat(hooks): record all tool outcomes + MCP actions for OpenCode`
- Files: `src/commands/hook/posttooluse-command.ts`, `src/mcp/handlers/hook-learning.handler.ts`, `src/mcp/descriptors/memory_capture.ts`, `src/services/learning/hook-learning.service.ts`, `src/services/hook-generator.service.ts`
- Pre-commit: `npm test src/commands/hook && npm test src/mcp/handlers/hook-learning`

---

### Task 3: Outcome Analyzer Service (Extended)

**What to do**:

- Rename ErrorAnalyzerService → OutcomeAnalyzerService
- Add success pattern analysis methods
- Implement pattern type detection: best_practice, recovery, sequence, efficiency
- Add new LLM prompts for success analysis

**Method-Level Compatibility Strategy:**

The current `ErrorAnalyzerService` has these public methods:

- `analyzeSessionErrors(sessionId: string)` - used by hook-learning
- `analyzeCrossSessionPatterns(projectId: string, lookbackDays: number)` - used by maintenance

Both rely on stubbed `fetchSessionErrors()` / `fetchProjectErrors()` methods that return `[]`.

**Strategy: Keep old method signatures as wrappers, add new "pass data in" methods**

```typescript
export class OutcomeAnalyzerService {
  // ============ NEW METHODS (preferred, pass data directly) ============

  // Main analysis methods - callers fetch data and pass it in
  async analyzeOutcomes(outcomes: ToolOutcome[]): Promise<OutcomeAnalysisResult>;
  async analyzeOutcomesForPatterns(outcomes: ToolOutcome[]): Promise<ComprehensiveAnalysis>;

  // Pattern-specific analysis (all accept outcomes array)
  async detectBestPractices(outcomes: ToolOutcome[]): Promise<Pattern[]>;
  async detectRecoveryPatterns(outcomes: ToolOutcome[]): Promise<Pattern[]>;
  async detectToolSequences(outcomes: ToolOutcome[]): Promise<Pattern[]>;
  async detectEfficiencyPatterns(outcomes: ToolOutcome[]): Promise<Pattern[]>;

  // Combined analysis
  async analyzeAllPatterns(outcomes: ToolOutcome[]): Promise<ComprehensiveAnalysis>;

  // ============ LEGACY WRAPPERS (backward compat) ============

  // Keep for maintenance orchestrator (src/services/librarian/maintenance/error-analysis.ts)
  // Wrapper that fetches data internally then calls new method
  /** @deprecated Use analyzeOutcomes() with pre-fetched data */
  async analyzeSessionErrors(sessionId: string): Promise<ErrorAnalysisResult> {
    // Still stubbed for now - returns empty result
    // In future: could wire repo and actually fetch, but that's out of scope
    return { patterns: [], errors: [], suggestions: [] };
  }

  /** @deprecated Use analyzeOutcomesForPatterns() with pre-fetched data */
  async analyzeCrossSessionPatterns(
    projectId: string,
    lookbackDays: number
  ): Promise<CrossSessionResult> {
    // Still stubbed for now - returns empty result
    return { patterns: [], projectId, lookbackDays };
  }
}
```

**Why wrappers stay stubbed:**

- Maintenance orchestrator currently calls `analyzeCrossSessionPatterns()` but gets empty results (existing behavior)
- Wiring the repo into the analyzer is additional work beyond this plan's scope
- New code paths (periodic analysis, session-end) use the "pass data in" methods

**Callers and their migration path:**

| Caller                                                 | Current Call                                   | Migration                                          |
| ------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------- |
| `src/services/librarian/maintenance/error-analysis.ts` | `analyzeCrossSessionPatterns(projectId, days)` | Keep using wrapper (returns empty, same as before) |
| `src/services/learning/hook-learning.service.ts`       | (new code)                                     | Use `analyzeAllPatterns(outcomes)` directly        |
| `src/commands/hook/posttooluse-command.ts`             | (new code)                                     | Use `analyzeOutcomes(outcomes)` directly           |

**Note:** The maintenance path getting empty results is EXISTING behavior (stubs return `[]`). This plan doesn't fix that - it's out of scope. The new paths (periodic + session-end) work correctly via the "pass data in" methods.

**LLM Prompt for Success Patterns**:

```
You are analyzing tool execution patterns from an AI coding assistant session.

Tool outcomes from this session:
---
{outcomes_formatted}
---

Analyze these outcomes and identify:
1. Best practices: What approaches consistently succeed?
2. Recovery patterns: What workarounds succeed after failures?
3. Tool sequences: What tool combinations work well together?
4. Efficiency patterns: What approaches are faster/simpler?

Output JSON:
{
  "patterns": [{
    "patternType": "best_practice" | "recovery" | "sequence" | "efficiency",
    "description": "What the pattern is",
    "tools": ["tool1", "tool2"],
    "frequency": number,
    "suggestedKnowledge": {
      "type": "knowledge" | "guideline",
      "title": "Short title",
      "content": "What to remember"
    },
    "confidence": 0.0-1.0
  }],
  "noPatternDetected": boolean
}
```

**Rename & Backward Compatibility Details:**

The rename must preserve backward compatibility. Here are ALL import locations (verified):

| File                                                                 | Import                               | Action                           |
| -------------------------------------------------------------------- | ------------------------------------ | -------------------------------- |
| `[MODIFY]` `src/services/learning/error-analyzer.service.ts`         | Source file                          | Rename class + keep alias export |
| `[MODIFY]` `src/services/learning/hook-learning.service.ts:27`       | `import { getErrorAnalyzerService }` | Update to new name               |
| `[MODIFY]` `src/services/librarian/maintenance/orchestrator.ts:1767` | Dynamic import                       | Update to new name               |
| `[MODIFY]` `src/services/librarian/maintenance/error-analysis.ts:13` | Type import                          | Update to new name               |
| `[MODIFY]` `src/services/learning/error-analyzer.test.ts`            | Test file                            | Rename/update all references     |

**Backward Compatibility Boundary (CRITICAL):**

Compatibility is maintained at TWO levels:

1. **Symbol level**: Keep `ErrorAnalyzerService` and `getErrorAnalyzerService` as deprecated aliases
2. **Module path level**: Keep `src/services/learning/error-analyzer.service.ts` as a re-export wrapper

**Implementation:**

**File 1 (NEW main file):** `src/services/learning/outcome-analyzer.service.ts`

```typescript
// New primary implementation
export class OutcomeAnalyzerService {
  /* ... full implementation ... */
}

export function getOutcomeAnalyzerService(): OutcomeAnalyzerService {
  /* ... singleton getter ... */
}

// Symbol-level aliases for imports that use the new path but old names
/** @deprecated Use OutcomeAnalyzerService */
export const ErrorAnalyzerService = OutcomeAnalyzerService;
/** @deprecated Use getOutcomeAnalyzerService */
export const getErrorAnalyzerService = getOutcomeAnalyzerService;
```

**File 2 (OLD path, re-export wrapper):** `src/services/learning/error-analyzer.service.ts`

```typescript
// Module-path-level compatibility: old import paths still work
// Existing imports like:
//   import { ErrorAnalyzerService } from '../../services/learning/error-analyzer.service.js'
// will continue to work without any changes.

/** @deprecated Import from './outcome-analyzer.service.js' instead */
export {
  OutcomeAnalyzerService,
  OutcomeAnalyzerService as ErrorAnalyzerService,
  getOutcomeAnalyzerService,
  getOutcomeAnalyzerService as getErrorAnalyzerService,
} from './outcome-analyzer.service.js';

// Re-export types if any
export type { OutcomeAnalysisResult, DetectedPattern } from './outcome-analyzer.service.js';
```

**Why both levels:**

- **Symbol aliases** allow gradual migration within the same import path
- **Module re-export** ensures existing imports work without changes
- Both are needed because the 4 verified import sites use the OLD module path

**Import sites that will work unchanged:**
| File | Import Path | Works Because |
|------|-------------|---------------|
| `src/services/learning/hook-learning.service.ts:27` | `./error-analyzer.service.js` | Re-export wrapper |
| `src/services/librarian/maintenance/orchestrator.ts:1767` | Dynamic import | Re-export wrapper |
| `src/services/librarian/maintenance/error-analysis.ts:13` | Type import | Re-export wrapper |
| `src/services/learning/error-analyzer.test.ts` | Test file | Will be renamed/updated |

**Must NOT do**:

- Break existing error analysis
- Remove ErrorAnalyzerService (keep as alias for backward compat)
- Call LLM for every outcome (batch only)
- Miss any of the 5 import locations listed above (causes compile errors)

**Recommended Agent Profile**:

- **Category**: `unspecified-high`
- **Skills**: [`coding-standards`, `backend-patterns`]

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Task 1)
- **Blocks**: Tasks 4, 5, 6
- **Blocked By**: None

**References**:

- `src/services/learning/error-analyzer.service.ts` - Current service to extend
- `src/services/learning/error-analyzer.test.ts` - Test patterns

**Acceptance Criteria**:

```bash
# Tests pass
npm test src/services/learning/outcome-analyzer.test.ts
# Expected: All pattern detection tests pass

# Backward compat
npm test src/services/learning/error-analyzer.test.ts
# Expected: Still works via alias
```

**Commit**: YES

- Message: `feat(learning): extend analyzer for all outcome patterns`
- Files: `src/services/learning/outcome-analyzer.service.ts`, tests
- Pre-commit: `npm test src/services/learning`

---

### Implementation Notes: Analyzer Data Wiring

**Current Problem:**

The existing `ErrorAnalyzerService` has stubbed data fetch methods that return empty arrays:

```typescript
// src/services/learning/error-analyzer.service.ts:294-303
private async fetchSessionErrors(_sessionId: string): Promise<ErrorLogEntry[]> {
  return []; // STUB - never actually fetches data
}

private async fetchProjectErrors(_projectId: string, _lookbackDays: number): Promise<ErrorLogEntry[]> {
  return []; // STUB - never actually fetches data
}
```

**Recommended Solution: Pass Data from Caller**

Change the analyzer's public methods to accept outcomes directly, rather than having internal fetch logic:

```typescript
// BEFORE (current design - broken)
class ErrorAnalyzerService {
  async analyzeSessionErrors(sessionId: string): Promise<ErrorAnalysisResult> {
    const errors = await this.fetchSessionErrors(sessionId); // Always []
    // ...
  }
}

// AFTER (new design - working)
class OutcomeAnalyzerService {
  async analyzeSessionOutcomes(outcomes: ToolOutcome[]): Promise<OutcomeAnalysisResult> {
    // No fetch - data passed in
    if (outcomes.length < this.config.minOutcomes) {
      return { patterns: [], noPatternDetected: true };
    }
    return this.analyzeWithLLM(outcomes);
  }
}
```

**Why pass data instead of injecting repository:**

1. **Testability**: Easy to test with mock outcomes without mock repos
2. **Flexibility**: Caller can filter/transform outcomes before passing
3. **Separation**: Analyzer focuses on analysis, not data fetching
4. **Existing pattern**: `HookLearningService` already queries data and passes it

**Integration in HookLearningService:**

```typescript
// In hook-learning.service.ts:onSessionEnd
async onSessionEnd(sessionId: string): Promise<void> {
  const outcomes = await this.outcomeRepo.getBySession(sessionId);
  if (outcomes.length < this.config.minOutcomes) return;

  const analysis = await this.outcomeAnalyzer.analyzeSessionOutcomes(outcomes);
  // ... store patterns
}
```

**Reference**: `src/services/learning/hook-learning.service.ts` - Shows the caller pattern for analyzer invocation.

---

### Task 4: Periodic Analysis Integration

**What to do**:

- Add periodic analysis trigger (every N tool executions)
- Track tool count per session
- Trigger analysis when threshold reached
- Reset counter after analysis

**Configuration**:

```typescript
interface PeriodicAnalysisConfig {
  enabled: boolean; // default: true
  toolCountThreshold: number; // default: 20
  minSuccessCount: number; // default: 5 (need some successes to analyze)
  analysisTimeoutMs: number; // default: 30000
}
```

**Config Wiring (End-to-End) - Registry Pattern:**

This project uses a registry-based config system (see `src/config/registry/`). Config options MUST be added to the registry.

**Step 1: Add section to registry** (`[NEW]` `src/config/registry/sections/periodicAnalysis.ts`):

```typescript
import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const periodicAnalysisSection: ConfigSectionMeta = {
  name: 'periodicAnalysis',
  description: 'Periodic tool outcome analysis configuration.',
  options: {
    enabled: {
      envKey: 'AGENT_MEMORY_PERIODIC_ANALYSIS_ENABLED',
      defaultValue: true,
      description: 'Enable periodic tool outcome analysis.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    toolCountThreshold: {
      envKey: 'AGENT_MEMORY_PERIODIC_ANALYSIS_THRESHOLD',
      defaultValue: 20,
      description: 'Number of tools before triggering analysis.',
      schema: z.number().int().min(5),
      parse: 'int',
    },
    minSuccessCount: {
      envKey: 'AGENT_MEMORY_PERIODIC_ANALYSIS_MIN_SUCCESS',
      defaultValue: 5,
      description: 'Minimum success count before analysis.',
      schema: z.number().int().min(1),
      parse: 'int',
    },
    analysisTimeoutMs: {
      envKey: 'AGENT_MEMORY_PERIODIC_ANALYSIS_TIMEOUT_MS',
      defaultValue: 30000,
      description: 'Timeout for LLM analysis call.',
      schema: z.number().int().min(1000),
      parse: 'int',
    },
  },
};
```

**Step 2: Register in index** (`[MODIFY]` `src/config/registry/index.ts`):

```typescript
// Add import at top (around line 72, after other section imports):
import { periodicAnalysisSection } from './sections/periodicAnalysis.js';

// Add to configRegistry.sections object (around line 146, before closing brace):
export const configRegistry: ConfigRegistry = {
  topLevel: { ... },
  sections: {
    // ... existing sections like notionSync ...
    periodicAnalysis: periodicAnalysisSection,  // [NEW] Add here
  },
};
```

**Step 3: Add to Config interface** (`[MODIFY]` `src/config/index.ts`):

```typescript
export interface Config {
  // ... existing fields ...
  periodicAnalysis: {
    enabled: boolean;
    toolCountThreshold: number;
    minSuccessCount: number;
    analysisTimeoutMs: number;
  };
}
```

**Step 4: Usage in hooks and MCP:**

```typescript
// In PostToolUse hook (src/commands/hook/posttooluse-command.ts)
// PostToolUse now uses initializeHookContext() which runs buildConfig()
// Config is accessed via the registered context:
import { getContext } from '../../core/container.js';
const ctx = getContext();
const config = ctx.config; // Config is part of AppContext
if (!config.periodicAnalysis.enabled) return;
const threshold = config.periodicAnalysis.toolCountThreshold;

// In MCP/services - same pattern
const threshold = ctx.config.periodicAnalysis.toolCountThreshold;
```

**NOTE: No separate `src/config/learning.ts` file needed.**
Config comes from the registry-based system. The `buildConfig()` function (called during context initialization) automatically includes the new `periodicAnalysis` section because it's registered in `configRegistry.sections`.

**Why registry (not ad-hoc parsing):**

- Consistent with all other config in this project
- Auto-generates documentation via `npm run docs:generate:env`
- Provides Zod validation on startup
- Single source of truth for defaults and env var names

**Counter Storage Location - SQLite (REQUIRED due to process isolation)**:

**CRITICAL**: Hooks run as SEPARATE PROCESSES (`exec agent-memory hook posttooluse`).
An in-memory Map would reset on every hook invocation. Counter MUST use SQLite.

**Add to migration** (`0041_add_tool_outcomes.sql`):

```sql
-- Session tool counter for periodic analysis
CREATE TABLE IF NOT EXISTS session_tool_counter (
  session_id TEXT PRIMARY KEY NOT NULL,
  tool_count INTEGER NOT NULL DEFAULT 0,
  last_analysis_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Counter Operations** (add to `src/db/repositories/tool-outcomes.ts`):

**Uses Drizzle schema + onConflictDoUpdate pattern** (matching repo patterns).

**Add schema (`[NEW] src/db/schema/session-tool-counter.ts`):**

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const sessionToolCounter = sqliteTable('session_tool_counter', {
  sessionId: text('session_id').primaryKey().notNull(),
  toolCount: integer('tool_count').notNull().default(0),
  lastAnalysisCount: integer('last_analysis_count').notNull().default(0),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});
```

**Counter Operations (add to `src/db/repositories/tool-outcomes.ts`):**

```typescript
// Import the schema
import { sessionToolCounter } from '../schema/session-tool-counter.js';
import { eq, sql, and, desc } from 'drizzle-orm';

async incrementAndGetToolCount(sessionId: string): Promise<number> {
  // Step 1: Upsert with onConflictDoUpdate (matches src/db/repositories/embedding-hooks.ts:247)
  const now = new Date().toISOString();
  await this.db
    .insert(sessionToolCounter)
    .values({
      sessionId,
      toolCount: 1,
      lastAnalysisCount: 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: sessionToolCounter.sessionId,
      set: {
        toolCount: sql`${sessionToolCounter.toolCount} + 1`,
        updatedAt: now,
      },
    })
    .run();

  // Step 2: Select to get the new value (Drizzle SQLite doesn't support RETURNING on upsert)
  const row = await this.db
    .select({ toolCount: sessionToolCounter.toolCount })
    .from(sessionToolCounter)
    .where(eq(sessionToolCounter.sessionId, sessionId))
    .get();

  return row?.toolCount ?? 1;
}

async getToolCountSinceLastAnalysis(sessionId: string): Promise<number> {
  const row = await this.db
    .select({
      toolCount: sessionToolCounter.toolCount,
      lastAnalysisCount: sessionToolCounter.lastAnalysisCount,
    })
    .from(sessionToolCounter)
    .where(eq(sessionToolCounter.sessionId, sessionId))
    .get();

  if (!row) return 0;
  return row.toolCount - row.lastAnalysisCount;
}

async markAnalysisComplete(sessionId: string): Promise<void> {
  // Get current count first
  const row = await this.db
    .select({ toolCount: sessionToolCounter.toolCount })
    .from(sessionToolCounter)
    .where(eq(sessionToolCounter.sessionId, sessionId))
    .get();

  if (row) {
    await this.db
      .update(sessionToolCounter)
      .set({ lastAnalysisCount: row.toolCount })
      .where(eq(sessionToolCounter.sessionId, sessionId))
      .run();
  }
}

async deleteCounter(sessionId: string): Promise<void> {
  await this.db
    .delete(sessionToolCounter)
    .where(eq(sessionToolCounter.sessionId, sessionId))
    .run();
}

// Combined read for atomicity (see Concurrency Strategy section)
async getCounterSnapshot(sessionId: string): Promise<{
  toolCount: number;
  lastAnalysisCount: number;
  updatedAt: string;
} | null> {
  return this.db
    .select({
      toolCount: sessionToolCounter.toolCount,
      lastAnalysisCount: sessionToolCounter.lastAnalysisCount,
      updatedAt: sessionToolCounter.updatedAt,
    })
    .from(sessionToolCounter)
    .where(eq(sessionToolCounter.sessionId, sessionId))
    .get();
}

// CAS operation for concurrency control (see Concurrency Strategy section)
async tryClaimAnalysis(
  sessionId: string,
  snapshotLastAnalysisCount: number,
  newLastAnalysisCount: number
): Promise<boolean> {
  const result = await this.db
    .update(sessionToolCounter)
    .set({
      lastAnalysisCount: newLastAnalysisCount,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(sessionToolCounter.sessionId, sessionId),
        eq(sessionToolCounter.lastAnalysisCount, snapshotLastAnalysisCount)
      )
    )
    .run();

  // Returns true if exactly 1 row updated (we won the race)
  return result.changes === 1;
}

// Query most recent N outcomes (used after CAS claim)
// Uses deterministic ordering: createdAt DESC, id DESC (see Timestamp Ordering Rules)
async getRecentOutcomes(sessionId: string, count: number): Promise<ToolOutcome[]> {
  return this.db
    .select()
    .from(toolOutcomes)
    .where(eq(toolOutcomes.sessionId, sessionId))
    .orderBy(desc(toolOutcomes.createdAt), desc(toolOutcomes.id))
    .limit(count)
    .all();
}

// Query outcomes recorded since last analysis
async getOutcomesSinceLastAnalysis(sessionId: string): Promise<ToolOutcome[]> {
  const countSince = await this.getToolCountSinceLastAnalysis(sessionId);
  if (countSince <= 0) return [];

  // Get the N most recent outcomes
  return this.db
    .select()
    .from(toolOutcomes)
    .where(eq(toolOutcomes.sessionId, sessionId))
    .orderBy(desc(toolOutcomes.createdAt), desc(toolOutcomes.id))  // Tie-breaker required
    .limit(countSince)
    .all();
}
```

**Pattern references (verified in codebase):**

- `[EXISTING]` `src/db/repositories/embedding-hooks.ts:247` - `.onConflictDoUpdate()` pattern
- `[EXISTING]` `src/db/repositories/experiences.ts:665` - `sql\`${table.column} + 1\`` increment pattern
- `[EXISTING]` `src/services/voting.service.ts:68` - Another onConflictDoUpdate example

**Why Drizzle schema instead of raw SQL:**

1. **Matches repo patterns** - Uses same `.onConflictDoUpdate()` as other repos
2. **Type-safe** - Column types enforced
3. **Simpler queries** - Standard Drizzle select/update/delete
4. **Schema export** - Add to `src/db/schema/index.ts` for consistency

**Why SQLite counter (not in-memory Map):**

1. **Process isolation**: Hooks run as separate processes; Map resets each invocation
2. **Atomic increments**: SQLite's `ON CONFLICT DO UPDATE` is atomic
3. **Persistence**: Counter survives hook process lifecycle
4. **Cleanup**: Counter rows have bounded lifecycle (see below)

**Counter Update Flow (CRITICAL - Ordering Matters):**

The counter MUST be incremented AFTER successful `tool_outcomes` insert. This ensures:

1. Counter reflects actual persisted outcomes
2. Failed inserts don't inflate the counter
3. Periodic analysis sees correct outcome count

**Fire-and-Forget vs Await Rules (CRITICAL):**

The plan states "NO blocking hook execution on DB writes" as a guardrail, but periodic analysis requires sequential operations. Here's the clarification:

| Operation                                     | Blocking?              | Rationale                                               |
| --------------------------------------------- | ---------------------- | ------------------------------------------------------- |
| `toolOutcomesRepo.record()`                   | **AWAIT**              | Must complete before counter increment (data integrity) |
| `toolOutcomesRepo.incrementAndGetToolCount()` | **AWAIT**              | Must complete before snapshot (ordering)                |
| `toolOutcomesRepo.getCounterSnapshot()`       | **AWAIT**              | Must complete before CAS (atomic check)                 |
| `toolOutcomesRepo.tryClaimAnalysis()`         | **AWAIT**              | Must complete before query (ownership)                  |
| `toolOutcomesRepo.getRecentOutcomes()`        | **AWAIT**              | Must complete before analysis (data)                    |
| `outcomeAnalyzer.analyzeSessionOutcomes()`    | **FIRE-AND-FORGET**    | LLM call can be slow; don't block hook                  |
| `hookLearning.storePatternKnowledge()`        | Inside fire-and-forget | Runs in .then() callback                                |

**Why this is compliant with the guardrail:**

- The guardrail "NO blocking on DB writes" refers to **long-running operations** (specifically LLM calls)
- Fast SQLite operations (insert, increment, select) complete in <1ms and are acceptable to await
- The LLM analysis is the expensive part → that's what gets fire-and-forget treatment
- Total blocking time for DB ops: ~5ms max (5 sequential SQLite calls)
- If any DB op fails before analysis, the hook exits cleanly (no partial state)

**Exact sequence in PostToolUse hook:**

```typescript
// Step 1: Record outcome to tool_outcomes table (AWAIT - fast DB write)
const outcomeId = await toolOutcomesRepo.record({
  id: generateId(),
  sessionId,
  toolName,
  outcome,
  // ... other fields
});
// If this throws, counter NOT incremented (correct behavior)

// Step 2: Increment counter ONLY after successful insert (AWAIT - fast DB write)
const newCount = await toolOutcomesRepo.incrementAndGetToolCount(sessionId);

// Steps 3-6: Snapshot, check threshold, CAS, query (all AWAIT - fast DB reads/writes)
// See Implementation section below for full sequence

// Step 7+: LLM analysis (FIRE-AND-FORGET - slow operation)
outcomeAnalyzer
  .analyzeSessionOutcomes(recentOutcomes)
  .then(async (analysis) => {
    /* store patterns */
  })
  .catch(logWarn);
// Hook returns immediately, doesn't wait for LLM
```

**Implementation in `toolOutcomesRepo.record()`:**

The `record()` method does NOT auto-increment the counter. Counter increment is a SEPARATE call after successful record. This allows:

- Explicit ordering control
- Testability (can test record and counter separately)
- Clear failure semantics

**For MCP clients (OpenCode):** The `HookLearningService.recordToolOutcome()` method handles both:

1. Inserts to `tool_outcomes`
2. Then increments counter

See Task 2's `recordToolOutcome()` implementation which shows: insert → increment sequence.

---

**Counter Cleanup Strategy:**

Counter rows are ephemeral and tied to sessions.

**IN SCOPE (this plan):**

1. **On session end**: Delete counter row when `HookLearningService.onSessionEnd()` completes

```typescript
// Add to HookLearningService.onSessionEnd() - after analysis completes:
await toolOutcomesRepo.deleteCounter(sessionId);

// In tool-outcomes repository:
async deleteCounter(sessionId: string): Promise<void> {
  await this.db
    .delete(sessionToolCounter)
    .where(eq(sessionToolCounter.sessionId, sessionId))
    .run();
}
```

**OUT OF SCOPE (future Librarian task):**

2. **Periodic pruning**: Stale counter cleanup to be added to Librarian maintenance in a follow-up task. For now, orphaned counters from crashed sessions will persist until manually cleaned.

```typescript
// FUTURE TASK (NOT in this plan) - shows intended API for Librarian integration
// Location: src/services/librarian/maintenance/orchestrator.ts (runFullMaintenance)
async pruneStaleCounters(staleDays: number = 7): Promise<number> {
  // ... implementation for future task
}
```

**Lifecycle guarantees (this plan):**

- Counters deleted after successful session-end analysis (normal path)
- Orphaned counters from crashes MAY persist (accepted limitation)
- Future Librarian task will add periodic cleanup as fallback

**Concurrent/Parallel Tool Handling:**

SQLite handles concurrent increments via atomic upsert. If two PostToolUse processes run simultaneously:

- Both get correct incremented counts
- Analysis triggers correctly when threshold crossed

**Concurrency Strategy for Periodic Analysis (CRITICAL):**

**Problem**: Two PostToolUse processes might see the threshold crossed simultaneously and both trigger analysis, causing duplicate pattern storage.

**Solution: Optimistic Locking with Snapshot**

The algorithm must:

1. Capture a snapshot of `last_analysis_count` BEFORE checking threshold
2. Use that snapshot value in the CAS condition
3. Query outcomes by timestamp range (not by count delta which changes after CAS)

**Algorithm (Correct Ordering):**

```
1. SNAPSHOT: Read current (tool_count, last_analysis_count) atomically
2. CHECK: If (tool_count - last_analysis_count) < threshold → exit
3. CAS: Try UPDATE ... SET last_analysis_count = tool_count WHERE last_analysis_count = snapshot_value
4. If CAS fails (0 rows changed) → another process claimed it → exit
5. COUNT QUERY: Query most recent N outcomes where N = (snapshot.tool_count - snapshot.last_analysis_count)
6. If CAS succeeds → we own analysis rights → proceed with LLM analysis
```

**IMPORTANT: Batch Selection is by COUNT, not TIMESTAMP**

The batch is selected by querying the N most recent outcomes (by `ORDER BY created_at DESC, id DESC LIMIT N`), where N is the count delta from the snapshot. This is simpler and safer than timestamp-based ranges because:

- The count N is captured before CAS, so it's immutable for this batch
- No need to track "last analyzed timestamp"
- Naturally handles the case where outcomes are inserted during analysis

1. SNAPSHOT: Read current (tool_count, last_analysis_count) atomically
2. CHECK: If (tool_count - last_analysis_count) < threshold → exit
3. TIMESTAMP QUERY: Query outcomes created AFTER last analysis timestamp
4. CAS: Try UPDATE ... SET last_analysis_count = tool_count WHERE last_analysis_count = snapshot_value
5. If CAS fails (0 rows changed) → another process claimed it → exit
6. If CAS succeeds → we own analysis rights → proceed with LLM analysis

````

**Implementation:**

```typescript
// Add to tool-outcomes repository:

// Combined read for atomicity
async getCounterSnapshot(sessionId: string): Promise<{
  toolCount: number;
  lastAnalysisCount: number;
  updatedAt: string;
} | null> {
  return this.db
    .select({
      toolCount: sessionToolCounter.toolCount,
      lastAnalysisCount: sessionToolCounter.lastAnalysisCount,
      updatedAt: sessionToolCounter.updatedAt,
    })
    .from(sessionToolCounter)
    .where(eq(sessionToolCounter.sessionId, sessionId))
    .get();
}

// CAS: Only update if last_analysis_count matches our snapshot
async tryClaimAnalysis(
  sessionId: string,
  snapshotLastAnalysisCount: number,
  newLastAnalysisCount: number
): Promise<boolean> {
  const result = await this.db
    .update(sessionToolCounter)
    .set({
      lastAnalysisCount: newLastAnalysisCount,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(sessionToolCounter.sessionId, sessionId),
        eq(sessionToolCounter.lastAnalysisCount, snapshotLastAnalysisCount)
      )
    )
    .run();

  // Returns true if exactly 1 row updated (we won the race)
  return result.changes === 1;
}

// Query outcomes by count offset (most recent N)
async getRecentOutcomes(sessionId: string, count: number): Promise<ToolOutcome[]> {
  return this.db
    .select()
    .from(toolOutcomes)
    .where(eq(toolOutcomes.sessionId, sessionId))
    .orderBy(desc(toolOutcomes.createdAt), desc(toolOutcomes.id))  // Tie-breaker required
    .limit(count)
    .all();
}
```

**Usage in PostToolUse (Correct):**

```typescript
// Step 1: SNAPSHOT - Read atomically
const snapshot = await toolOutcomesRepo.getCounterSnapshot(sessionId);
if (!snapshot) return;

// Step 2: CHECK - Threshold not met?
const countSinceAnalysis = snapshot.toolCount - snapshot.lastAnalysisCount;
if (countSinceAnalysis < config.toolCountThreshold) return;

// Step 3: CAS - Try to claim analysis rights
// We set last_analysis_count = current tool_count
const claimed = await toolOutcomesRepo.tryClaimAnalysis(
  sessionId,
  snapshot.lastAnalysisCount, // Expected: what we saw in snapshot
  snapshot.toolCount // New value: claim all outcomes up to this point
);

if (!claimed) {
  // Another process claimed it - exit silently
  return;
}

// Step 4: QUERY - Get outcomes to analyze (by count, not timestamp)
// We analyze exactly (tool_count - last_analysis_count) outcomes
const recentOutcomes = await toolOutcomesRepo.getRecentOutcomes(sessionId, countSinceAnalysis);

// Step 5: ANALYZE - Fire-and-forget
// (Even if analysis fails, we don't "unclaim" - prevents infinite retry loops)
triggerPeriodicAnalysis(recentOutcomes, sessionId).catch(logWarn);
```

**Key Insight**: The CAS happens BEFORE querying outcomes. This means:

- `last_analysis_count` is updated to mark our "claim" to this batch
- Then we query the outcomes that were in that batch
- Even if analysis fails, we don't re-analyze the same batch (prevents duplicate work)

**Why this is correct:**

1. **Snapshot** ensures we see consistent state
2. **CAS** uses the snapshot value as expected, not current value
3. **Query by count** gets exactly the outcomes we claimed (not affected by CAS update)
4. **Claim-then-query** ordering prevents race where two processes query same outcomes

**Alternative considered (NOT used):** Dedupe key on stored patterns. Rejected because it still runs the LLM twice - wasteful.

**Implementation**:

```typescript
// In PostToolUse hook (src/commands/hook/posttooluse-command.ts), after recording outcome:

// Import at top of file (follows existing pattern in hook-learning.service.ts:27)
import { getOutcomeAnalyzerService } from '../../services/learning/outcome-analyzer.service.js';

// Get service instances (same pattern as getHookLearningService() usage in this repo)
const outcomeAnalyzer = getOutcomeAnalyzerService();
const toolOutcomesRepo = getContext().repos.toolOutcomes; // From container

// Step 1: Record outcome (see Counter Update Flow section)
await toolOutcomesRepo.record(outcome);

// Step 2: Increment counter AFTER successful insert
await toolOutcomesRepo.incrementAndGetToolCount(sessionId);

// Step 3: SNAPSHOT - Read atomically (see Concurrency Strategy section)
const snapshot = await toolOutcomesRepo.getCounterSnapshot(sessionId);
if (!snapshot) return;

// Step 4: CHECK - Threshold not met?
const countSinceAnalysis = snapshot.toolCount - snapshot.lastAnalysisCount;
if (countSinceAnalysis < config.toolCountThreshold) return;

// Step 5: CAS - Try to claim analysis rights
// We set last_analysis_count = current tool_count
const claimed = await toolOutcomesRepo.tryClaimAnalysis(
  sessionId,
  snapshot.lastAnalysisCount, // Expected: what we saw in snapshot
  snapshot.toolCount // New value: claim all outcomes up to this point
);

if (!claimed) {
  // Another process claimed it - exit silently
  return;
}

// Step 6: QUERY - Get outcomes to analyze (by count, not timestamp)
// We analyze exactly (tool_count - last_analysis_count) outcomes
const recentOutcomes = await toolOutcomesRepo.getRecentOutcomes(sessionId, countSinceAnalysis);

// Step 7: Check minimum success count
const successCount = recentOutcomes.filter((o) => o.outcome === 'success').length;
if (successCount >= config.minSuccessCount) {
  // Step 8: Trigger periodic analysis (fire-and-forget)
  // NOTE: CAS already updated last_analysis_count, so even if analysis fails,
  // we don't re-analyze the same batch (prevents duplicate work)
  outcomeAnalyzer
    .analyzeSessionOutcomes(recentOutcomes)
    .then(async (analysis) => {
      // Store patterns via HookLearningService (see Pattern Storage Ownership section)
      // NOTE: storePatternKnowledge() is [NEW] - added in this task
      const hookLearning = getHookLearningService();
      for (const pattern of analysis.patterns) {
        if (pattern.confidence >= 0.7) {
          await hookLearning.storePatternKnowledge(pattern, sessionId);
        }
      }
    })
    .catch((err) => {
      logger.warn('Periodic analysis failed', { err });
      // NOTE: We don't "unclaim" - prevents infinite retry loops
    });
}
```

**Service wiring pattern** (verified in codebase):

- `getOutcomeAnalyzerService()` - Singleton getter (same pattern as `getErrorAnalyzerService()` in `src/services/learning/error-analyzer.service.ts:526`)
- `getHookLearningService()` - Existing singleton (used in `src/commands/hook/posttooluse-command.ts:18,383,420` and `src/commands/hook/stop-command.ts:6,172`)

**Must NOT do**:

- Block hook on analysis
- Analyze too frequently (min 20 tools)
- Analyze if no successes yet

**Recommended Agent Profile**:

- **Category**: `quick`
- **Skills**: [`coding-standards`, `backend-patterns`]

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Task 5)
- **Blocks**: Task 6
- **Blocked By**: Tasks 1, 2, 3

**References**:

- `[EXISTING]` `src/services/learning/hook-learning.service.ts` - Integration point
- `[MODIFY]` `src/commands/hook/posttooluse-command.ts` - Trigger point
- `[NEW]` `src/config/registry/sections/periodicAnalysis.ts` - Config registry section (env vars + defaults)
- `[MODIFY]` `src/config/registry/index.ts` - Register new section
- `[MODIFY]` `src/config/index.ts` - Add to Config interface

**Acceptance Criteria**:

```bash
# Periodic analysis triggers
npm test src/services/learning/periodic-analysis.test.ts
# Expected: Analysis triggers at threshold

# Counter uses delta (tool_count - last_analysis_count), NOT reset
# After analysis: last_analysis_count updated to current tool_count
# Expected: getToolCountSinceLastAnalysis() returns 0 immediately after analysis
```

**Commit**: YES

- Message: `feat(learning): add periodic pattern analysis during sessions`
- Files: `src/services/learning/hook-learning.service.ts`, `src/commands/hook/posttooluse-command.ts`
- Pre-commit: `npm test src/services/learning`

---

### Task 5: Session-End Extended Analysis

**PREREQUISITE: Dependency Wiring for onSessionEnd (CRITICAL)**

The current `HookLearningService.onSessionEnd()` method requires `this.errorLogRepo` and checks `errorAnalysisConfig.enabled` (see `src/services/learning/hook-learning.service.ts`). However, the current wiring in `src/core/factory/context-wiring.ts` does NOT pass `errorLogRepo` into `setDependencies()`.

**Current wiring (incomplete):**

```typescript
// src/core/factory/context-wiring.ts:205 (verified)
services.hookLearning.setDependencies({
  experienceRepo: repos.experiences,
  knowledgeRepo: repos.knowledge,
  guidelineRepo: repos.guidelines,
  toolRepo: repos.tools,
  taskRepo: repos.tasks,
  librarianAgent: services.librarianAgent,
});
// NOTE: errorLogRepo is MISSING
```

**Hook-only wiring (also incomplete):**

```typescript
// src/commands/hook.ts:84,127,176 (verified)
learningService.setDependencies({
  experienceRepo: ...,
  knowledgeRepo: ...,
  // NOTE: errorLogRepo also MISSING here
});
```

**This task MUST add the following wiring for onSessionEnd to function:**

1. **Add to `setDependencies` calls** (both locations):
   - `[MODIFY]` `src/core/factory/context-wiring.ts:205` - Add `errorLogRepo: repos.errorLog`
   - `[MODIFY]` `src/commands/hook.ts:84,127,176` - Add `errorLogRepo: context.repos.errorLog`

2. **Also add `toolOutcomesRepo`** (for new outcome-based analysis):
   - `[MODIFY]` `src/core/factory/context-wiring.ts:205` - Add `toolOutcomesRepo: repos.toolOutcomes`
   - `[MODIFY]` `src/commands/hook.ts:84,127,176` - Add `toolOutcomesRepo: context.repos.toolOutcomes`

**WIRING PATHS (3 distinct locations with different patterns):**

There are 3 wiring paths in the codebase, each with different context availability:

**Path 1: Minimal Context (lines 76-85)** - Used by lightweight hooks

```typescript
// src/commands/hook.ts:76-85 (initializeMinimalContext)
// Creates repos DIRECTLY (no ctx object available)
const { createExperienceRepository } = await import('../db/repositories/experiences.js');
const { createKnowledgeRepository } = await import('../db/repositories/knowledge.js');
const { createErrorLogRepository } = await import('../db/repositories/error-log.js'); // [NEW]
const { createToolOutcomesRepository } = await import('../db/repositories/tool-outcomes.js'); // [NEW]
const experienceRepo = createExperienceRepository({ db, sqlite: getSqlite() });
const knowledgeRepo = createKnowledgeRepository({ db, sqlite: getSqlite() });
const errorLogRepo = createErrorLogRepository({ db, sqlite: getSqlite() }); // [NEW]
const toolOutcomesRepo = createToolOutcomesRepository({ db, sqlite: getSqlite() }); // [NEW]
learningService.setDependencies({
  experienceRepo,
  knowledgeRepo,
  errorLogRepo, // [NEW]
  toolOutcomesRepo, // [NEW]
});
```

**Path 2: Full Context (lines 123-132)** - Used by heavier hooks

```typescript
// src/commands/hook.ts:123-132 (initializeFullContext)
// Uses ctx.repos.* (full context available)
learningService.setDependencies({
  experienceRepo: ctx.repos.experiences,
  knowledgeRepo: ctx.repos.knowledge,
  librarianService: ctx.services?.librarian,
  errorLogRepo: ctx.repos.errorLog, // [NEW]
  toolOutcomesRepo: ctx.repos.toolOutcomes, // [NEW]
});
```

**Path 3: App Context Factory (line 205)** - Used by MCP server

```typescript
// src/core/factory/context-wiring.ts:205
// Uses repos from context factory
services.hookLearning.setDependencies({
  experienceRepo: repos.experiences,
  knowledgeRepo: repos.knowledge,
  guidelineRepo: repos.guidelines,
  toolRepo: repos.tools,
  taskRepo: repos.tasks,
  librarianAgent: services.librarianAgent,
  errorLogRepo: repos.errorLog, // [NEW]
  toolOutcomesRepo: repos.toolOutcomes, // [NEW]
});
```

**Which path is used when:**

| Hook Command  | Wiring Path          | File Location                            |
| ------------- | -------------------- | ---------------------------------------- |
| `pretooluse`  | Minimal (Path 1)     | `src/commands/hook.ts:76-85`             |
| `posttooluse` | Full (Path 2)        | `src/commands/hook.ts:123-132`           |
| `session-end` | Full (Path 2)        | `src/commands/hook.ts:123-132`           |
| MCP server    | App Context (Path 3) | `src/core/factory/context-wiring.ts:205` |

**All 3 paths MUST be updated for onSessionEnd and periodic analysis to work.**

**Without this wiring, the session-end analysis call will result in a no-op or error.**

---

**What to do**:

- Extend `onSessionEnd` to analyze ALL patterns (not just errors)
- Include success pattern detection
- Generate both corrective AND best-practice knowledge
- Maintain fire-and-forget pattern
- **Wire missing dependencies (see prerequisite above)**

**Changes to onSessionEnd**:

```typescript
async onSessionEnd(sessionId: string): Promise<void> {
  try {
    // Query outcomes from repo (caller fetches, analyzer receives)
    const outcomes = await this.outcomeRepo.getBySession(sessionId);

    // Skip if too few outcomes
    if (outcomes.length < this.config.minOutcomes) return;

    // Analyze ALL patterns - pass outcomes array (not sessionId)
    // See Task 3 API: analyzeAllPatterns(outcomes: ToolOutcome[])
    const analysis = await this.outcomeAnalyzer.analyzeAllPatterns(outcomes);

    // Store knowledge for each pattern type
    for (const pattern of analysis.patterns) {
      if (pattern.confidence >= this.config.confidenceThreshold) {
        await this.storePatternKnowledge(pattern, sessionId);
      }
    }
  } catch (error) {
    logger.warn('Session-end analysis failed', { sessionId, error });
  }
}
```

**Caller Registration**:

The `onSessionEnd` method must be called from somewhere. Currently it exists but is NOT invoked.

Add invocation in `src/commands/hook/session-end-command.ts`:

**Exact Integration Point** (verified in codebase):

```
File: src/commands/hook/session-end-command.ts

Location: Between lines 455 and 457

Flow:
  Line 384-454: Librarian onSessionEnd processing (try/catch block)
  Line 455: End of librarian block `}`
  >>> INSERT HERE: HookLearningService.onSessionEnd() call <<<
  Line 457: getInjectionTrackerService().clearSession(sessionId)
  Line 458: logger.debug - Cleared injection tracker
  Line 460: return { exitCode: 0, ... }
```

**Code to insert after line 455:**

```typescript
// Import at top of file:
import { getHookLearningService } from '../../services/learning/hook-learning.service.js';

// Insert between librarian block (line 455) and injection tracker clear (line 457):
// Fire-and-forget: don't block session termination on outcome analysis
getHookLearningService()
  .onSessionEnd(sessionId)
  .catch((err) => {
    logger.warn(
      { sessionId, error: err instanceof Error ? err.message : String(err) },
      'Session-end outcome analysis failed (non-fatal)'
    );
  });
```

**Why this location:**

- After librarian processing: Captures all tool outcomes from the session
- Before injection tracker clear: Session data still available
- Fire-and-forget pattern: Matches librarian's non-fatal error handling (lines 443-452)
- Same pattern as other non-blocking calls in this file

**Must NOT do**:

- Block session termination
- Remove error-only analysis (keep as fallback)
- Store at project scope

**Recommended Agent Profile**:

- **Category**: `quick`
- **Skills**: [`coding-standards`, `backend-patterns`]

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Task 4)
- **Blocks**: Task 6
- **Blocked By**: Tasks 1, 2, 3

**References**:

- `[EXISTING]` `src/services/learning/hook-learning.service.ts:onSessionEnd` - Current implementation (method to call)
- `[EXISTING]` `src/commands/hook/session-end-command.ts:455-457` - Integration point (between librarian and injection tracker)
- `[EXISTING]` `src/commands/hook/session-end-command.ts:443-452` - Error handling pattern to follow (non-fatal catch)
- `[MODIFY]` `src/core/factory/context-wiring.ts:205` - Add errorLogRepo + toolOutcomesRepo to setDependencies
- `[MODIFY]` `src/commands/hook.ts:84,127,176` - Add errorLogRepo + toolOutcomesRepo to setDependencies (3 locations)

**Acceptance Criteria**:

```bash
# Extended session-end analysis
npm test src/services/learning/session-end.test.ts
# Expected: Tests for all pattern types

# Knowledge generated for success patterns
sqlite3 data/memory.db "SELECT title, category FROM knowledge WHERE created_by='outcome-analyzer'"
# Expected: Shows both error-corrective and best-practice entries
```

**Commit**: YES

- Message: `feat(learning): extend session-end to analyze all patterns`
- Files: `src/services/learning/hook-learning.service.ts`
- Pre-commit: `npm test src/services/learning`

---

### Task 6: Integration Tests + Edge Cases

**What to do**:

- Create comprehensive integration tests
- Test full pipeline: tool execution → outcome storage → analysis → knowledge
- Test edge cases:
  - All successes (no failures)
  - All failures (no successes)
  - Mixed outcomes
  - Periodic trigger at threshold
  - Sequence detection
  - Recovery pattern detection

**Test Scenarios**:

```typescript
describe('Tool Outcome Tracking Integration', () => {
  describe('Full Pipeline', () => {
    test('success → storage → analysis → best practice knowledge');
    test('failure → success → recovery pattern detected');
    test('tool sequence → sequence pattern detected');
  });

  describe('Periodic Analysis', () => {
    test('triggers at threshold (20 tools)');
    test('does not trigger below threshold');
    test('resets counter after analysis');
  });

  describe('Edge Cases', () => {
    test('all successes: generates best practices only');
    test('all failures: generates corrective knowledge only');
    test('mixed: generates both pattern types');
    test('LLM unavailable: graceful degradation');
  });
});
```

**Must NOT do**:

- Skip edge case testing
- Use real LLM calls (mock required)

**Recommended Agent Profile**:

- **Category**: `unspecified-low`
- **Skills**: [`coding-standards`, `tdd-workflow`]

**Parallelization**:

- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3 (final)
- **Blocks**: None
- **Blocked By**: Tasks 4, 5

**References**:

- `tests/integration/error-learning.test.ts` - Existing integration tests

**Acceptance Criteria**:

```bash
npm test tests/integration/tool-outcome-tracking.test.ts
# Expected: All tests pass

npm run test:coverage -- src/services/learning/outcome-analyzer
# Expected: >80% coverage
```

**Commit**: YES

- Message: `test(learning): add integration tests for tool outcome tracking`
- Files: `tests/integration/tool-outcome-tracking.test.ts`
- Pre-commit: `npm test tests/integration/tool-outcome-tracking`

---

### Task 7: OpenCode Plugin Integration

**Context**:

The OpenCode plugin (`plugins/opencode/agent-memory.ts`) is a **native MCP plugin** that runs in-process (unlike Claude Code hooks which run as separate processes). It already has tool execution tracking via `tool.execute.before` and `tool.execute.after` event handlers, but does NOT persist outcomes to the `tool_outcomes` table or trigger the outcome analyzer.

**What to do**:

1. **Add MCP tool for recording outcomes** (or verify existing tool can be reused)
2. **Update `tool.execute.after` handler** to record outcomes to `tool_outcomes` table
3. **Update `session.deleted` handler** to trigger `HookLearningService.onSessionEnd()`

**Integration Points in OpenCode Plugin**:

```
File: plugins/opencode/agent-memory.ts

Current flow (lines 1249-1364):
  tool.execute.after → logs to episode → tracks errors in memory → done

New flow:
  tool.execute.after → logs to episode → tracks errors → RECORD to tool_outcomes → done

Current session end (lines 403-482):
  session.deleted → end episode → end conversation → end session → extract transcript → librarian analyze

New session end:
  session.deleted → ... existing ... → TRIGGER outcome analysis via MCP → done
```

**SessionId Semantics for MCP Actions (CRITICAL)**

The `sessionId` parameter in `tool_outcome` and `session_end_analysis` actions is treated as a **raw string partition key**, NOT a foreign key to the `sessions` table.

| Aspect          | Behavior                                     |
| --------------- | -------------------------------------------- |
| Validation      | String, non-empty                            |
| FK constraint   | NONE - no sessions table lookup              |
| Counter table   | Creates row on first use (upsert)            |
| Outcome queries | Filter by exact string match                 |
| Cleanup         | Counter deleted on session_end_analysis call |

**Why raw partition key (not FK):**

1. **Process isolation**: OpenCode manages its own session lifecycle; Agent Memory doesn't need to know about it
2. **Simplicity**: No need to create session records before tracking outcomes
3. **Consistency**: Same approach as existing `error_log.session_id` (also raw string)

**Session ID Format Convention:**

- Claude Code hooks: Use Agent Memory session IDs (from `sessions` table)
- OpenCode plugin: Prefix with `opencode-` (e.g., `opencode-${inp.sessionID}`)
- This prefix allows distinguishing session sources in queries without requiring schema changes

---

**Use `tool_outcome` MCP Action (Added in Task 2)**

Task 2 adds a `tool_outcome` action to `memory_capture` MCP tool. Use it:

```typescript
// In tool.execute.after, add after error tracking (around line 1318):
mcpClient
  .callTool('memory_capture', {
    action: 'tool_outcome',
    sessionId: `opencode-${inp.sessionID}`, // Raw partition key with prefix
    toolName: toolName,
    outcome: hasError ? 'failure' : 'success',
    inputSummary:
      typeof toolInput === 'object' ? JSON.stringify(toolInput).slice(0, 500) : undefined,
    outputSummary:
      typeof toolResponse === 'object' ? JSON.stringify(toolResponse).slice(0, 500) : undefined,
  })
  .catch(() => {});
```

**NOTE**: This depends on Task 2 completing the MCP action addition. See Task 2 section "Add MCP Action for External Clients".

**Option B: Create New MCP Tool**

If no existing tool fits, add `memory_tool_outcome` tool:

```typescript
// New MCP tool: memory_tool_outcome
{
  action: 'record',
  sessionId: string,
  toolName: string,
  outcome: 'success' | 'failure' | 'partial',
  inputSummary?: string,
  outputSummary?: string,
}
```

**Session-End Analysis Integration**:

The `session_end_analysis` action must be added to `memory_capture` MCP tool in Task 2 (alongside `tool_outcome`).

**Add to `src/mcp/handlers/hook-learning.handler.ts`:**

```typescript
async session_end_analysis(context: AppContext, params: Record<string, unknown>) {
  const service = context.services.hookLearning;
  if (!service?.isAvailable()) {
    return formatTimestamps({
      success: false,
      message: 'Hook learning service not available',
    });
  }

  const sessionId = getRequiredParam(params, 'sessionId', isString);

  try {
    // This calls the same method as Claude Code's session-end-command.ts
    await service.onSessionEnd(sessionId);

    return formatTimestamps({
      success: true,
      action: 'session_end_analysis',
      sessionId,
      message: 'Session-end outcome analysis triggered',
    });
  } catch (error) {
    logger.error({ error: formatError(error), sessionId }, 'Session-end analysis failed');
    return formatTimestamps({
      success: false,
      action: 'session_end_analysis',
      error: formatError(error),
    });
  }
}

// Add to hookLearningHandlers object export
```

**Add to `src/mcp/descriptors/memory_capture.ts`:**

```typescript
// In action enum:
action: 'block_start' | 'block_end' | 'conversation' | 'episode' | 'status' | 'tool_outcome' | 'session_end_analysis'

// In examples:
Example: {"action":"session_end_analysis","sessionId":"opencode-sess-123"}
```

**OpenCode plugin usage (in session.deleted handler, after line 466):**

```typescript
// Trigger outcome analysis (fire-and-forget, same pattern as librarian)
mcpClient
  .callTool('memory_capture', {
    action: 'session_end_analysis',
    sessionId: `opencode-${sessionId}`,
  })
  .catch(() => {});
```

**NOTE**: This MCP action is added in Task 2 alongside `tool_outcome`. Both actions are required for OpenCode integration (Task 7).

**Must NOT do**:

- Block tool execution on outcome recording
- Block session end on analysis
- Break existing episode/experience tracking
- Duplicate error tracking logic

**Recommended Agent Profile**:

- **Category**: `quick`
- **Skills**: [`coding-standards`, `backend-patterns`]

**Parallelization**:

- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 3 (with Task 6)
- **Blocks**: None
- **Blocked By**: Task 2 (needs `tool_outcome` MCP action from Task 2)

**References**:

- `plugins/opencode/agent-memory.ts:1249-1364` - `tool.execute.after` handler (integration point)
- `plugins/opencode/agent-memory.ts:403-482` - `session.deleted` handler (analysis trigger point)
- `plugins/opencode/agent-memory.ts:281-301` - Existing error tracking (`trackError`, `checkErrorRecovery`)
- `src/mcp/descriptors/memory_capture.ts` - MCP tool descriptor (add `tool_outcome` and `session_end_analysis` actions)
- `src/mcp/handlers/hook-learning.handler.ts` - Handler implementation (add new action handlers)

**Acceptance Criteria**:

```bash
# OpenCode plugin compiles without errors
cd plugins/opencode && npx tsc --noEmit
# Expected: No TypeScript errors

# Manual verification (with OpenCode running):
# 1. Run a tool that succeeds → check tool_outcomes has success entry
# 2. Run a tool that fails → check tool_outcomes has failure entry
# 3. End session → verify outcome analysis triggered

# DB verification after OpenCode session:
sqlite3 ~/.agent-memory/memory.db "SELECT tool_name, outcome FROM tool_outcomes WHERE session_id LIKE 'opencode-%' LIMIT 5"
# Expected: Shows outcomes from OpenCode tool executions
```

**Commit**: YES

- Message: `feat(plugins): add tool outcome tracking to OpenCode plugin`
- Files: `plugins/opencode/agent-memory.ts`
- Pre-commit: `cd plugins/opencode && npx tsc --noEmit`

---

## Commit Strategy

| After Task | Message                                                           | Files                       | Verification                |
| ---------- | ----------------------------------------------------------------- | --------------------------- | --------------------------- |
| 1          | `feat(db): add tool_outcomes event-level table`                   | schema, repo, migration     | `npm test tool-outcomes`    |
| 2          | `feat(hooks): record all tool outcomes + enable PostToolUse hook` | posttooluse, hook-generator | `npm test hook`             |
| 3          | `feat(learning): extend analyzer for all patterns`                | outcome-analyzer            | `npm test outcome-analyzer` |
| 4          | `feat(learning): add periodic pattern analysis`                   | hook-learning               | `npm test learning`         |
| 5          | `feat(learning): extend session-end analysis`                     | hook-learning               | `npm test learning`         |
| 6          | `test(learning): add integration tests`                           | integration test            | `npm test integration`      |
| 7          | `feat(plugins): add tool outcome tracking to OpenCode plugin`     | opencode plugin             | `npx tsc --noEmit`          |

---

## Success Criteria

### Verification Commands

```bash
# Full test suite
npm test src/services/learning/
# Expected: All tests pass

# Get DB path
# - Dev: ./data/memory.db
# - Hooks/Installed: ~/.agent-memory/memory.db (NOT /data/!)
DB_PATH="${AGENT_MEMORY_DB_PATH:-./data/memory.db}"

# DB has tool_outcomes with both outcomes
sqlite3 "$DB_PATH" "SELECT outcome, COUNT(*) FROM tool_outcomes GROUP BY outcome"
# Expected: Shows success and failure counts

# Backward compat: error_log TABLE still exists and is writable
sqlite3 "$DB_PATH" "SELECT * FROM error_log LIMIT 1"
# Expected: Works (table unchanged, PostToolUse writes to both tables)
```

### Final Checklist

- [x] All tool executions recorded (success + failure)
- [x] Input/output summaries captured (truncated)
- [x] Duration tracking works
- [x] Tool sequence tracking works
- [x] Periodic analysis triggers correctly
- [x] Session-end analyzes all patterns
- [x] Best practice patterns detected
- [x] Recovery patterns detected
- [x] Sequence patterns detected
- [x] Efficiency patterns detected
- [x] Backward compatibility maintained
- [x] All tests pass
- [x] Privacy: no raw input/output stored

### Ordering Correctness Verification (CRITICAL)

**Test fixtures follow pattern from `tests/integration/error-learning.test.ts`:**

- Use in-memory SQLite via `createTestDb()` helper
- Apply migrations via `runMigrations()` before each test
- Reset DB state between tests

**Ordering tests to include:**

```typescript
describe('Timestamp and sequence correctness', () => {
  test('precedingToolId is set correctly via getLastOutcomeForSession', async () => {
    // First outcome has no predecessor
    const id1 = await repo.record({
      sessionId: 's1',
      toolName: 'Read',
      outcome: 'success',
      precedingToolId: null, // First in session
    });
    const first = await repo.get(id1);
    expect(first.precedingToolId).toBeNull();

    // Second outcome should reference first
    const lastBefore2 = await repo.getLastOutcomeForSession('s1');
    expect(lastBefore2?.id).toBe(id1);

    const id2 = await repo.record({
      sessionId: 's1',
      toolName: 'Edit',
      outcome: 'success',
      precedingToolId: lastBefore2?.id ?? null, // Caller passes this
    });
    const second = await repo.get(id2);
    expect(second.precedingToolId).toBe(id1);
  });

  test('getRecentOutcomes returns N most recent by timestamp+id order', async () => {
    const sessionId = 's1';

    // Insert 5 outcomes with small delays to ensure different timestamps
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const id = await repo.record({ sessionId, toolName: 'Edit', outcome: 'success' });
      ids.push(id);
      await new Promise((r) => setTimeout(r, 5)); // Small delay for distinct timestamps
    }

    // Query most recent 3
    const recent = await repo.getRecentOutcomes(sessionId, 3);
    expect(recent.length).toBe(3);

    // Should be in reverse insertion order (most recent first)
    // Verify by checking timestamps are descending
    expect(new Date(recent[0].createdAt) >= new Date(recent[1].createdAt)).toBe(true);
    expect(new Date(recent[1].createdAt) >= new Date(recent[2].createdAt)).toBe(true);
  });

  test('periodic batch selection uses count-based limit correctly', async () => {
    const sessionId = 's1';

    // Insert 30 outcomes
    const ids: string[] = [];
    for (let i = 1; i <= 30; i++) {
      const lastOutcome = await repo.getLastOutcomeForSession(sessionId);
      const id = await repo.record({
        sessionId,
        toolName: 'Edit',
        outcome: 'success',
        precedingToolId: lastOutcome?.id ?? null,
      });
      ids.push(id);
      await repo.incrementAndGetToolCount(sessionId);
    }

    // Claim analysis at count=20 (marks first 20 as analyzed)
    await repo.tryClaimAnalysis(sessionId, 0, 20);

    // Insert 5 more
    for (let i = 31; i <= 35; i++) {
      const lastOutcome = await repo.getLastOutcomeForSession(sessionId);
      const id = await repo.record({
        sessionId,
        toolName: 'Edit',
        outcome: 'success',
        precedingToolId: lastOutcome?.id ?? null,
      });
      ids.push(id);
      await repo.incrementAndGetToolCount(sessionId);
    }

    // Next batch should only include 15 outcomes (35 - 20)
    const snapshot = await repo.getCounterSnapshot(sessionId);
    const countSinceAnalysis = snapshot!.toolCount - snapshot!.lastAnalysisCount;
    expect(countSinceAnalysis).toBe(15);

    // getRecentOutcomes returns the N most recent
    const batch = await repo.getRecentOutcomes(sessionId, countSinceAnalysis);
    expect(batch.length).toBe(15);

    // All batch IDs should be from the post-analysis inserts (ids[20] onwards)
    const postAnalysisIds = new Set(ids.slice(20)); // ids[20] to ids[34]
    expect(batch.every((o) => postAnalysisIds.has(o.id))).toBe(true);
  });

  test('same-millisecond ties are deterministic (arbitrary but consistent)', async () => {
    // This test verifies behavior, not insertion-order correlation
    // With UUID v4, same-ms ties are deterministic but arbitrary
    const sessionId = 's1';

    // Insert multiple outcomes as fast as possible
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const id = await repo.record({ sessionId, toolName: 'Edit', outcome: 'success' });
      ids.push(id);
    }

    // Query twice - should get same order both times (deterministic)
    const batch1 = await repo.getRecentOutcomes(sessionId, 10);
    const batch2 = await repo.getRecentOutcomes(sessionId, 10);

    expect(batch1.map((o) => o.id)).toEqual(batch2.map((o) => o.id));
  });
});
```

**Note on API contract:**

- `record()` accepts `Omit<ToolOutcome, 'id' | 'createdAt'>` and returns the generated `id: string`
- `precedingToolId` is passed by the caller (computed via `getLastOutcomeForSession()` before insert)
- Tests use only the public repository API, not direct DB manipulation
- Same-millisecond ordering is deterministic but NOT insertion-order (UUID v4 is random)

**Test Placement Convention:**

| Test Type | Location | Pattern Reference | What to Test |
|-----------|----------|-------------------|--------------|
| **Repository unit tests** | `tests/unit/tool-outcomes.repo.test.ts` | `tests/unit/error-log.repo.test.ts` (doesn't exist, use `tests/unit/knowledge.repo.test.ts`) | CRUD, counter ops, getLastOutcome |
| **Service unit tests** | `tests/unit/outcome-analyzer.service.test.ts` | `src/services/learning/error-analyzer.test.ts` (exists, colocated) | Pattern detection, LLM prompts |
| **Integration tests** | `tests/integration/tool-outcome-tracking.test.ts` | `tests/integration/error-learning.test.ts` | Full pipeline: record → analyze → store |
| **Hook unit tests** | `tests/unit/posttooluse-outcome-recording.test.ts` | N/A (new file) | outcome-utils.ts functions |

**Test scaffolding (use existing pattern from tests/fixtures/test-helpers.ts):**

```typescript
// tests/integration/tool-outcome-tracking.test.ts
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  type TestDb
} from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-tool-outcomes.db';
let testDb: TestDb;

beforeAll(() => {
  // setupTestDb creates file-based SQLite and runs ALL migrations
  // (including new 0041_add_tool_outcomes.sql)
  testDb = setupTestDb(TEST_DB_PATH);
});

afterAll(() => {
  cleanupTestDb(TEST_DB_PATH);
});

// Create repos using test db
const repos = createTestRepositories(testDb);
const toolOutcomesRepo = createToolOutcomesRepository({
  db: testDb.db,
  sqlite: testDb.sqlite
});
```

**Pattern reference:** Copy from `tests/integration/error-learning.test.ts` which uses:
- `setupTestDb(TEST_DB_PATH)` - creates migrated SQLite
- `cleanupTestDb(TEST_DB_PATH)` - removes test DB file
- `createTestRepositories(testDb)` - creates all standard repos

**Colocated vs centralized tests:**
- Analyzer tests are COLOCATED: `src/services/learning/error-analyzer.test.ts`
- Repo tests are CENTRALIZED: `tests/unit/*.repo.test.ts`
- Follow existing patterns when adding new tests
````
