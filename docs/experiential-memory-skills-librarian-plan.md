# Experiential Memory & Librarian Agent

## Status

| Component | Status |
|-----------|--------|
| **Experiences Entity** | ✅ IMPLEMENTED (Case → Strategy → Tool) |
| **Query Pipeline Integration** | ✅ IMPLEMENTED (FTS5, all stages) |
| **Promotion via Relations** | ✅ IMPLEMENTED (entry_relations with promoted_to) |
| **Unified Capture Service** | ✅ IMPLEMENTED |
| ↳ Session-end (experiences) | ✅ IMPLEMENTED (ExperienceCaptureModule) |
| ↳ Turn-based (knowledge) | ✅ IMPLEMENTED (KnowledgeCaptureModule) |
| ↳ Deduplication | ✅ IMPLEMENTED (SharedState with content hashing) |
| ↳ MCP Actions | ✅ IMPLEMENTED (record_case, capture_from_transcript) |
| ↳ Handler Hooks | ✅ IMPLEMENTED (session end, turn complete) |
| **Librarian Agent** | ✅ IMPLEMENTED |
| ↳ Math Utilities | ✅ IMPLEMENTED (Jaccard, LCS, Cosine, Edit Distance) |
| ↳ Trajectory Similarity | ✅ IMPLEMENTED (14 action categories, 5 components) |
| ↳ Pattern Detector | ✅ IMPLEMENTED (embedding + trajectory validation) |
| ↳ Recommendations Schema | ✅ IMPLEMENTED (migration 0015) |
| ↳ Quality Gate | ✅ IMPLEMENTED (auto-promote, review, reject thresholds) |
| ↳ Librarian Service | ✅ IMPLEMENTED (scheduler, analyzer, recommender) |
| ↳ MCP Handler | ✅ IMPLEMENTED (memory_librarian tool) |
| **CLI & REST Extensions** | ✅ IMPLEMENTED (experience, librarian commands) |

---

## Overview

Add experiential learning capabilities to Agent Memory through:
1. **Experiences** - Two-level abstraction: Case (concrete) → Strategy (abstract) → Tool (skill) ✅
2. **Unified Capture Service** - Modular capture with shared state and deduplication
   - Session-end: Extract experiences with trajectories
   - Turn-based: Extract knowledge/guidelines based on dynamic thresholds
3. **Librarian Agent** - Background service that detects patterns and recommends promotions

### Key Design Decisions

**Skills are Tools promoted from Experiences** (not a separate entity)
- Tools already have capability semantics (description, parameters, examples)
- Avoids 4th entity type that would require duplicating infrastructure
- Consistent with codebase patterns (Tools, Guidelines, Knowledge)
- Promotion chain provides full provenance tracking

**Hybrid Pattern Detection**
- Stage 1: Embedding similarity on scenario+outcome text
- Stage 2: Trajectory validation comparing action sequences

**High-Confidence Auto-Promote**
- Auto-promote if confidence >= 0.9
- Queue for review if 0.7 <= confidence < 0.9
- Reject if confidence < 0.7

**Experiences Included by Default** in context queries (prefer `strategy`-level and/or apply a configurable limit to avoid overly long context).

---

## Phase 1: Fix Promotion Mechanism

### Files to Modify
- `src/db/schema/meta.ts` - Add relation types: `promoted_to`, `derived_from` (inverse queried via target)
- `src/db/schema/types.ts` - Update `RelationType` enum
- `src/db/migrations/0013_migrate_promotions_to_relations.sql` - Migrate embedded FKs
- `src/db/repositories/experiences.ts` - Update `promote()` to use `entryRelations`

*Relation direction note*: Only record the `promoted_to` relation; infer the inverse `derived_from` during `SELECT` via the relation target to avoid duplicated data in the migration.

---

## Phase 2: Query Pipeline Integration

### Goal
Make experiences discoverable in context/search queries (included by default).

### Files to Create
- `src/db/migrations/0014_add_experiences_fts.sql` - FTS5 table with triggers

### Files to Modify

| File | Changes |
|------|---------|
| `src/services/query/type-maps.ts` | Add `experiences: 'experience'` mappings |
| `src/services/query/types.ts` | Add `ExperienceQueryResult`, update unions |
| `src/services/query/pipeline.ts` | Add experience to context, result types |
| `src/services/query/stages/resolve.ts` | Add `'experiences'` to `DEFAULT_TYPES` |
| `src/services/query/stages/fetch.ts` | Add `FETCH_CONFIGS.experiences` |
| `src/services/query/stages/filter.ts` | Add experience filtering |
| `src/services/query/stages/score.ts` | Add experience scoring |
| `src/services/query/stages/format.ts` | Add experience compact formatting |
| `src/services/query/stages/tags.ts` | Load experience tags |
| `src/services/query/stages/fts.ts` | Initialize `experience` in `ftsMatchIds` |
| `src/services/query/stages/relations.ts` | Add experience to relation traversal |
| `src/services/query/fts-search.ts` | Add experience FTS5 queries |
| `src/services/fts.service.ts` | Add experience case in `searchFTS` |
| `src/mcp/handlers/query.handler.ts` | Include experiences in context response |

### FTS5 Schema
```sql
CREATE VIRTUAL TABLE experiences_fts USING fts5(
  experience_id UNINDEXED,
  title, content, scenario, outcome, pattern, applicability,
  tokenize = 'porter unicode61'
);
-- Triggers for INSERT/UPDATE/DELETE on experiences and experience_versions

*FTS trigger note*
- Mirror `tools_fts`/`guidelines_fts`/`knowledge_fts` triggers: update `experiences_fts` whenever `experiences.current_version_id` changes or its current `experience_versions` row updates, so FTS never diverges.
```

---

## Phase 3: Unified Capture Service

### Architecture

The capture system uses a **hybrid architecture** with a coordinator managing modular capture modules:

```
                         ┌─────────────────────────────────┐
                         │        CaptureService           │
                         │         (coordinator)           │
                         └───────────────┬─────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
              ▼                          ▼                          ▼
┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
│  ExperienceCaptureModule │  │  KnowledgeCaptureModule  │  │      SharedState        │
│    (session-end)         │  │    (turn-based)          │  │                         │
├─────────────────────────┤  ├─────────────────────────┤  ├─────────────────────────┤
│ • Extract experiences    │  │ • Extract knowledge      │  │ • capturedContentHashes │
│ • Trajectory extraction  │  │ • Extract guidelines     │  │ • sessionTranscript     │
│ • record_case action     │  │ • Dynamic thresholds     │  │ • turnMetrics           │
└─────────────────────────┘  └─────────────────────────┘  │ • deduplication cache   │
              │                          │                 └─────────────────────────┘
              └──────────────────────────┴──────────────────────────┘
                                         │
                                         ▼
                              memory_observe.extract()
```

**Why Hybrid?**
- **Modules** handle their specific extraction logic and LLM prompts
- **Coordinator** manages shared state and prevents duplication
- Session-end module **skips content already captured** by turn-based module
- Single config file with nested sections for each module

### Files to Create

| File | Purpose |
|------|---------|
| `src/services/capture/index.ts` | CaptureService coordinator |
| `src/services/capture/types.ts` | Shared types and interfaces |
| `src/services/capture/state.ts` | SharedState management |
| `src/services/capture/experience.module.ts` | Experience extraction (session-end) |
| `src/services/capture/knowledge.module.ts` | Knowledge extraction (turn-based) |
| `src/config/registry/sections/capture.ts` | Unified configuration |

### Files to Modify

| File | Changes |
|------|---------|
| `src/mcp/handlers/scopes.handler.ts` | Hook capture into `sessionEnd` |
| `src/mcp/handlers/experiences.handler.ts` | Add `capture_from_transcript`, `record_case` |
| `src/mcp/handlers/conversation.handler.ts` | Hook turn-based capture after messages |
| `src/mcp/descriptors/memory_experience.ts` | Add new actions |
| `src/core/context.ts` | Add `capture` service |

### New MCP Actions
```typescript
// Automatic capture from transcript (session-end)
{ action: 'capture_from_transcript', sessionId: 'sess_123', transcript: '...' }

// Explicit recording
{ action: 'record_case', title: 'Fixed bug', scenario: '...', outcome: '...', success: true }

// Manual turn-based trigger (optional)
{ action: 'capture_knowledge', sessionId: 'sess_123', context: '...' }
```

### Coordinator Logic

```typescript
// src/services/capture/index.ts

export class CaptureService {
  private state: SharedState;
  private experienceModule: ExperienceCaptureModule;
  private knowledgeModule: KnowledgeCaptureModule;

  /**
   * Called after each conversation turn.
   * Checks thresholds and triggers knowledge capture if needed.
   */
  async onTurnComplete(turn: TurnData): Promise<CaptureResult | null> {
    this.state.updateMetrics(turn);

    if (!this.shouldTriggerTurnCapture()) {
      return null;
    }

    const result = await this.knowledgeModule.capture({
      context: this.state.getRecentContext(),
      excludeHashes: this.state.capturedContentHashes,
    });

    this.state.recordCapture(result);
    return result;
  }

  /**
   * Called when session ends.
   * Extracts experiences from full transcript, skipping already-captured content.
   */
  async onSessionEnd(session: Session, transcript: string): Promise<CaptureResult> {
    // Get content hashes of what was already captured mid-session
    const alreadyCaptured = this.state.capturedContentHashes;

    const result = await this.experienceModule.capture({
      transcript,
      session,
      excludeHashes: alreadyCaptured,  // Skip duplicates
    });

    return result;
  }

  /**
   * Explicit case recording (no deduplication needed).
   */
  async recordCase(params: RecordCaseParams): Promise<Experience> {
    return this.experienceModule.recordCase(params);
  }
}
```

### Deduplication Strategy

```typescript
// src/services/capture/state.ts

export class SharedState {
  // Content hashes of captured entries (for deduplication)
  capturedContentHashes: Set<string> = new Set();

  // Recent transcript chunks for turn-based capture
  private transcriptChunks: TranscriptChunk[] = [];

  // Metrics for threshold evaluation
  turnMetrics: TurnMetrics = {
    turnsSinceLastCapture: 0,
    tokensSinceLastCapture: 0,
    toolCallsSinceLastCapture: 0,
    lastCaptureAt: null,
  };

  /**
   * Generate content hash for deduplication.
   * Uses scenario/title + first 1000 chars of content.
   * Store the hash (truncated to 16 hex chars) only for session-local deduping,
   * persist the list/metrics to session metadata to survive restarts and other processes.
   */
  static hashContent(content: { title?: string; scenario?: string; content: string }): string {
    const normalized = [
      content.title?.toLowerCase().trim(),
      content.scenario?.toLowerCase().trim(),
      content.content.slice(0, 1000).toLowerCase().trim(),
    ].filter(Boolean).join('|');

    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }

  /**
   * Check if similar content was already captured this session.
   * When running with multiple processes or after restarts the deduplication
   * metadata should be rehydrated from session metadata/state to avoid repeats.
   */
  isDuplicate(content: { title?: string; scenario?: string; content: string }): boolean {
    return this.capturedContentHashes.has(SharedState.hashContent(content));
  }

  /**
   * Record that content was captured.
   */
  recordCapture(result: CaptureResult): void {
    for (const entry of result.entries) {
      this.capturedContentHashes.add(SharedState.hashContent(entry));
    }
    this.turnMetrics.turnsSinceLastCapture = 0;
    this.turnMetrics.tokensSinceLastCapture = 0;
    this.turnMetrics.toolCallsSinceLastCapture = 0;
    this.turnMetrics.lastCaptureAt = new Date();
  }
}
```

### LLM Extraction Prompts

**Experience Extraction** (session-end):
- Identify complete problem-solution cycles
- Extract: title, category, scenario, outcome, success, steps
- Each step: action, observation, reasoning, toolUsed, success
- Confidence score (0-1) for each extracted task
- Skip trivial/incomplete tasks

*Safety note*: Redact secrets/credentials from transcripts before extraction and persist only the derived entries plus hashes—never store the raw transcript content.

**Knowledge Extraction** (turn-based):
- Identify decisions, facts, and rules worth remembering
- Extract: title, content, category (decision/fact/context)
- Confidence score (0-1) for each entry
- Skip trivial observations

### Configuration
```typescript
capture: {
  enabled: boolean;                  // Default: true

  // Session-end experience capture
  sessionEnd: {
    enabled: boolean;                // Default: true
    extractExperiences: boolean;     // Default: true
    confidenceThreshold: number;     // Default: 0.7
    minSteps: number;                // Default: 2
    maxExperiencesPerSession: number;// Default: 10
    markForReview: boolean;          // Default: true
  };

  // Turn-based knowledge capture
  turnBased: {
    enabled: boolean;                // Default: true
    thresholds: {
      turns: number;                 // Default: 5
      tokens: number;                // Default: 4000
      complexity: number;            // Default: 3 (tool calls/turn avg)
    };
    cooldownSeconds: number;         // Default: 60
    captureTypes: ('knowledge' | 'guideline')[];  // Default: ['knowledge']
    confidenceThreshold: number;     // Default: 0.8
    autoStore: boolean;              // Default: true
  };

  // Deduplication
  deduplication: {
    enabled: boolean;                // Default: true
    hashAlgorithm: 'sha256' | 'xxhash'; // Default: 'sha256'
  };
}

---

## Phase 4: Librarian Agent Service

### Architecture
```
Triggers: Cron Schedule | Session End
              ↓
LibrarianService.analyze()
              ↓
Pipeline:
  1. CaseCollector → Gather case experiences
  2. PatternDetector (Hybrid)
     ├── Stage 1: Embedding similarity (semantic grouping)
     └── Stage 2: Trajectory validation (action sequence matching)
  3. QualityGate → Filter by confidence thresholds
  4. Recommender → Generate promotion recommendations
              ↓
Auto-promote (≥0.9) | Queue for review (0.7-0.9) | Reject (<0.7)
```

### Files to Create

| File | Purpose |
|------|---------|
| `src/services/librarian/index.ts` | Main service |
| `src/services/librarian/scheduler.service.ts` | Cron scheduler |
| `src/services/librarian/types.ts` | Type definitions |
| `src/services/librarian/pipeline/collector.ts` | Case collection |
| `src/services/librarian/pipeline/pattern-detector.ts` | Hybrid detection |
| `src/services/librarian/pipeline/trajectory-similarity.ts` | Sequence comparison |
| `src/services/librarian/pipeline/quality-gate.ts` | Threshold filtering |
| `src/services/librarian/pipeline/recommender.ts` | Recommendation generation |
| `src/services/librarian/pipeline/trajectory-similarity.test.ts` | Unit tests for similarity |
| `src/services/librarian/utils/math.ts` | LCS and Jaccard implementations |
| `src/services/librarian/recommendations/recommendation-store.ts` | CRUD for recommendations |
| `src/mcp/handlers/librarian.handler.ts` | MCP handler |
| `src/mcp/descriptors/memory_librarian.ts` | Tool descriptor |
| `src/config/registry/sections/librarian.ts` | Configuration |
| `src/db/schema/recommendations.ts` | Recommendations table |
| `src/db/migrations/0015_add_recommendations.sql` | Migration |

### Hybrid Pattern Detection Algorithm

**Stage 1: Semantic Similarity**
```typescript
// Use embedding service on "scenario + outcome" text
const embedding = await services.embedding.embed(experienceText);
const similar = await services.vector.searchSimilar(embedding, ['experience'], 20);
// Group cases with similarity >= threshold (default 0.75)
```

**Stage 2: Trajectory Validation**
```typescript
interface TrajectorySimilarityResult {
  score: number;              // Combined 0-1
  actionTypeOverlap: number;  // Jaccard similarity of action types
  toolOverlap: number;        // Jaccard similarity of tools used
  sequenceAlignment: number;  // LCS-based alignment score
  successPatternMatch: number;// Correlation of success flags
}

// Weights for combined score
const weights = {
  actionType: 0.30,
  toolUsage: 0.25,
  sequence: 0.30,
  success: 0.15
};
```

**Action Type Normalization**
```typescript
// Canonical action types for comparison
'read' | 'write' | 'modify' | 'delete' | 'search' | 'execute' | 'debug' | 'other'
```

### Recommendations Schema
```sql
CREATE TABLE librarian_recommendations (
  id TEXT PRIMARY KEY,
  source_experience_id TEXT NOT NULL,
  source_level TEXT NOT NULL,  -- 'case' | 'strategy'
  target_level TEXT NOT NULL,  -- 'strategy' | 'skill'
  pattern_group_size INTEGER,
  member_experience_ids TEXT,  -- JSON array (Note: handle cleanup manually on experience deletion)
  semantic_similarity REAL,
  trajectory_similarity REAL,
  combined_confidence REAL,
  suggested_title TEXT,
  suggested_pattern TEXT,
  status TEXT DEFAULT 'pending',  -- pending|approved|rejected|skipped|expired
  promoted_to_id TEXT,
  created_at TEXT,
  decided_at TEXT,
  decided_by TEXT,
  scope_type TEXT,
  scope_id TEXT
);
```

### MCP Actions
```typescript
// Analysis
{ action: 'analyze', scopeType: 'project', scopeId: 'proj-123' }

// Recommendations
{ action: 'list_recommendations', status: 'pending' }
{ action: 'show_recommendation', id: 'rec-456' }
{ action: 'approve', id: 'rec-456', agentId: 'claude' }
{ action: 'reject', id: 'rec-456', reason: '...' }
{ action: 'skip', id: 'rec-456' }

// Status
{ action: 'status' }
```

### Configuration
```typescript
librarian: {
  enabled: boolean;                    // Default: false
  schedule: string;                    // Cron, e.g., "0 2 * * *"
  triggerOnSessionEnd: boolean;        // Default: true

  // Pattern detection
  minCasesForPattern: number;          // Default: 3
  patternSimilarityThreshold: number;  // Default: 0.75
  trajectoryThreshold: number;         // Default: 0.6
  semanticWeight: number;              // Default: 0.5
  trajectoryWeight: number;            // Default: 0.5

  // Promotion
  autoPromoteEnabled: boolean;         // Default: false
  autoPromoteThreshold: number;        // Default: 0.9
  reviewThreshold: number;             // Default: 0.7

  // Maintenance
  lookbackDays: number;                // Default: 30
  recommendationTTLDays: number;       // Default: 14
}
```

---

## Phase 5: CLI & REST Extensions

### CLI Commands
```bash
# Experiences
agent-memory experience list --project-id <id> --level case
agent-memory experience promote <id> --to strategy
agent-memory experience trajectory <id>
agent-memory experience capture --session-id <id> --transcript <file>

# Librarian
agent-memory librarian analyze --project-id <id>
agent-memory librarian status
agent-memory librarian recommendations --status pending
agent-memory librarian approve <id>
agent-memory librarian reject <id> --reason "..."
```

### REST Endpoints
```
GET  /v1/experiences
GET  /v1/experiences/:id
GET  /v1/experiences/:id/trajectory
POST /v1/experiences/:id/promote
POST /v1/experiences/:id/outcome
POST /v1/experiences/capture

POST /v1/librarian/analyze
GET  /v1/librarian/status
GET  /v1/librarian/recommendations
POST /v1/librarian/recommendations/:id/approve
POST /v1/librarian/recommendations/:id/reject
```

---

## Implementation Order

### Week 1: Phase 1 + Phase 2 (Foundations)
1. Migrate promotions to entryRelations
2. Add experiences to query pipeline
3. Create FTS5 table and triggers
4. Update all pipeline stages

### Week 2: Phase 3 (Unified Capture Service)
1. Create CaptureService coordinator and SharedState
2. Implement ExperienceCaptureModule with LLM prompts
3. Implement KnowledgeCaptureModule with threshold logic
4. Add deduplication strategy (content hashing)
5. Add MCP actions (capture_from_transcript, record_case, capture_knowledge)
6. Integrate with session-end and conversation handlers

### Week 3-4: Phase 4 (Librarian Core)
1. Create trajectory similarity algorithm and `src/services/librarian/utils/math.ts`
2. **Write unit tests for similarity algorithms**
3. Implement hybrid pattern detector
4. Build recommendation system
5. Create MCP handler and scheduler
6. Add configuration section

### Week 5: Phase 5 (CLI & REST)
1. Add CLI commands
2. Add REST endpoints
3. Documentation and integration tests

---

## Critical Files Summary

### To Create
- `src/services/capture/index.ts` (CaptureService coordinator)
- `src/services/capture/types.ts` (shared types)
- `src/services/capture/state.ts` (SharedState + deduplication)
- `src/services/capture/experience.module.ts` (session-end extraction)
- `src/services/capture/knowledge.module.ts` (turn-based extraction)
- `src/services/librarian/` (full directory)
- `src/config/registry/sections/capture.ts` (unified capture config)
- `src/config/registry/sections/librarian.ts`
- `src/db/schema/recommendations.ts`
- `src/db/migrations/0013_migrate_promotions_to_relations.sql`
- `src/db/migrations/0014_add_experiences_fts.sql`
- `src/db/migrations/0015_add_recommendations.sql`
- `src/mcp/handlers/librarian.handler.ts`
- `src/mcp/descriptors/memory_librarian.ts`

### To Modify
- `src/db/schema/meta.ts` - Add relation types
- `src/db/repositories/experiences.ts` - Use relations for promotion
- `src/services/query/type-maps.ts` - Add experiences mappings
- `src/services/query/pipeline.ts` - Add ExperienceQueryResult
- `src/services/query/stages/*.ts` - Handle experience type
- `src/services/query/fts-search.ts` - Add experience FTS
- `src/mcp/handlers/scopes.handler.ts` - Hook CaptureService.onSessionEnd()
- `src/mcp/handlers/experiences.handler.ts` - Add capture actions
- `src/mcp/handlers/query.handler.ts` - Include experiences
- `src/mcp/handlers/conversation.handler.ts` - Hook CaptureService.onTurnComplete()
- `src/core/context.ts` - Add unified `capture` service

### Reference Patterns
- `src/services/backup-scheduler.service.ts` - Scheduler pattern
- `src/services/consolidation/discovery.ts` - Similarity detection
- `src/services/extraction.service.ts` - LLM extraction pattern
- `src/mcp/handlers/review.handler.ts` - Approval workflow

---

## Appendix A: Trajectory Similarity Algorithm (Full Detail)

### A.1 Core Algorithm

```typescript
// src/services/librarian/pipeline/trajectory-similarity.ts

export interface TrajectoryStep {
  action: string;
  toolUsed: string | null;
  success: boolean | null;
  reasoning: string | null;
  observation: string | null;
}

export interface TrajectorySimilarityResult {
  score: number;               // Final combined score 0-1
  actionTypeOverlap: number;   // Jaccard on canonical action types
  toolOverlap: number;         // Jaccard on tools used
  sequenceAlignment: number;   // LCS normalized score
  successPatternMatch: number; // Success flag correlation
}

/**
 * Calculate similarity between two trajectories using multiple signals.
 * Returns combined score weighted by configurable weights.
 */
export function calculateTrajectorySimilarity(
  trajectory1: TrajectoryStep[],
  trajectory2: TrajectoryStep[],
  weights = { actionType: 0.30, tool: 0.25, sequence: 0.30, success: 0.15 }
): TrajectorySimilarityResult {
  // Handle empty trajectories
  if (trajectory1.length === 0 || trajectory2.length === 0) {
    return { score: 0, actionTypeOverlap: 0, toolOverlap: 0,
             sequenceAlignment: 0, successPatternMatch: 0 };
  }

  // 1. Action Type Overlap (Jaccard)
  const types1 = new Set(trajectory1.map(s => normalizeActionType(s.action)));
  const types2 = new Set(trajectory2.map(s => normalizeActionType(s.action)));
  const actionTypeOverlap = jaccardSimilarity(types1, types2);

  // 2. Tool Usage Overlap (Jaccard)
  const tools1 = new Set(trajectory1.map(s => s.toolUsed).filter(Boolean));
  const tools2 = new Set(trajectory2.map(s => s.toolUsed).filter(Boolean));
  const toolOverlap = (tools1.size === 0 && tools2.size === 0)
    ? 0 // Avoid giving full similarity when nothing happened
    : jaccardSimilarity(tools1, tools2);

  // 3. Sequence Alignment (LCS)
  const seq1 = trajectory1.map(s => normalizeActionType(s.action));
  const seq2 = trajectory2.map(s => normalizeActionType(s.action));
  const lcsLen = longestCommonSubsequence(seq1, seq2);
  const sequenceAlignment = lcsLen / Math.max(seq1.length, seq2.length);

  // 4. Success Pattern Match
  const successPatternMatch = calculateSuccessCorrelation(trajectory1, trajectory2);

  // Combined score
  const score =
    weights.actionType * actionTypeOverlap +
    weights.tool * toolOverlap +
    weights.sequence * sequenceAlignment +
    weights.success * successPatternMatch;

  return { score, actionTypeOverlap, toolOverlap, sequenceAlignment, successPatternMatch };
}
```

### A.2 Action Type Normalization

```typescript
// Canonical action types for cross-experience comparison
type CanonicalActionType =
  | 'read'     // Read, view, inspect, examine, check, look
  | 'write'    // Write, create, add, insert, new
  | 'modify'   // Update, edit, change, modify, fix, patch
  | 'delete'   // Delete, remove, drop, clear
  | 'search'   // Search, find, grep, locate, query
  | 'execute'  // Run, execute, test, build, compile, deploy
  | 'debug'    // Debug, log, trace, inspect, profile
  | 'navigate' // Open, goto, navigate, switch
  | 'config'   // Configure, setup, install, initialize
  | 'other';   // Fallback

const ACTION_PATTERNS: [RegExp, CanonicalActionType][] = [
  [/\b(read|view|inspect|examine|check|look|get|fetch|retrieve|load)\b/i, 'read'],
  [/\b(write|create|add|insert|new|generate|make|produce)\b/i, 'write'],
  [/\b(update|edit|change|modify|fix|patch|refactor|rename|replace)\b/i, 'modify'],
  [/\b(delete|remove|drop|clear|clean|purge|destroy)\b/i, 'delete'],
  [/\b(search|find|grep|locate|query|discover|scan|match)\b/i, 'search'],
  [/\b(run|execute|test|build|compile|deploy|launch|start|invoke)\b/i, 'execute'],
  [/\b(debug|log|trace|inspect|profile|diagnose|troubleshoot)\b/i, 'debug'],
  [/\b(open|goto|navigate|switch|select|focus)\b/i, 'navigate'],
  [/\b(configure|setup|install|initialize|set|enable|disable)\b/i, 'config'],
];

export function normalizeActionType(action: string): CanonicalActionType {
  for (const [pattern, type] of ACTION_PATTERNS) {
    if (pattern.test(action)) {
      return type;
    }
  }
  return 'other';
}
```

### A.3 LCS Algorithm (Dynamic Programming)

```typescript
/**
 * Longest Common Subsequence using DP
 * Returns length of LCS between two sequences
 */
function longestCommonSubsequence<T>(seq1: T[], seq2: T[]): number {
  const m = seq1.length;
  const n = seq2.length;

  const dp: number[][] = Array.from(
    { length: m + 1 },
    () => Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (seq1[i - 1] === seq2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[m][n];
}

function jaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function calculateSuccessCorrelation(
  traj1: TrajectoryStep[],
  traj2: TrajectoryStep[]
): number {
  const aligned: [TrajectoryStep, TrajectoryStep][] = [];
  const used2 = new Set<number>();

  for (const step1 of traj1) {
    const type1 = normalizeActionType(step1.action);
    for (let j = 0; j < traj2.length; j++) {
      if (used2.has(j)) continue;
      if (normalizeActionType(traj2[j].action) === type1) {
        aligned.push([step1, traj2[j]]);
        used2.add(j);
        break;
      }
    }
  }

  if (aligned.length === 0) return 0;

  let matches = 0;
  let compared = 0;
  for (const [s1, s2] of aligned) {
    if (s1.success == null || s2.success == null) {
      continue;
    }
    if (s1.success === s2.success) {
      matches++;
    }
    compared++;
  }

  if (compared === 0) {
    return 0;
  }

  return matches / compared;
}
```

---

## Appendix B: LLM Extraction Prompts (Full Detail)

### B.1 System Prompt

```typescript
export const EXPERIENCE_EXTRACTION_SYSTEM_PROMPT = `You are an AI that analyzes conversation transcripts to extract case experiences for an experiential learning system.

## What is a Case Experience?

A "case experience" represents a complete problem-solution cycle that can be learned from:
- SCENARIO: The initial problem, question, or task that triggered the work
- TRAJECTORY: The sequence of actions taken to solve it (what was tried, in order)
- OUTCOME: The final result - success or failure with details

## Your Task

Analyze the transcript and extract EACH distinct problem-solution cycle as a separate case experience.

## Extraction Rules

### 1. Task Identification
For each case, extract:
- **title**: Concise summary of what was solved (e.g., "Fix authentication token expiry bug")
- **category**: One of: debugging, refactoring, feature, documentation, testing, configuration, research, api-design, performance, security

### 2. Scenario (The Problem)
Describe:
- What triggered this task? (error, request, question)
- What was the initial context?
- What needed to be accomplished?

### 3. Trajectory (The Steps)
For EACH step in the solution process:
- **action**: What was done (verb phrase, e.g., "Read error log", "Modified config file")
- **observation**: What was observed as a result (can be null if not mentioned)
- **reasoning**: Why this action was taken (if discernible, else null)
- **toolUsed**: Tool or command used if any (e.g., "Bash", "Read", "Edit", "Grep", null)
- **success**: Did this specific step succeed? (true/false/null if unclear)

### 4. Outcome
- **success**: Did the overall task succeed? (true/false)
- **outcome**: Description of the final result

### 5. Confidence Score
Rate how clearly this task was defined in the transcript:
- 0.9-1.0: Very clear problem/solution cycle with explicit success/failure
- 0.7-0.9: Clear task but some ambiguity in outcome
- 0.5-0.7: Partial task, may be incomplete or unclear
- <0.5: Don't include (too unclear)

## What to Skip
- Trivial tasks (single-step responses, simple questions)
- Tasks abandoned without resolution
- Greetings, chitchat, clarifying questions without action
- Tasks with fewer than 2 meaningful steps

## Output Format
Return valid JSON:
{
  "tasks": [
    {
      "title": "string",
      "category": "string",
      "scenario": "string (1-3 sentences describing the problem)",
      "outcome": "string (1-2 sentences describing the result)",
      "success": boolean,
      "steps": [
        {
          "action": "string (verb phrase)",
          "observation": "string|null",
          "reasoning": "string|null",
          "toolUsed": "string|null",
          "success": boolean|null
        }
      ],
      "confidence": number (0-1)
    }
  ]
}

If no complete tasks found, return: {"tasks": []}`;
```

### B.2 User Prompt Builder

```typescript
export function buildExperienceExtractionPrompt(params: {
  transcript: string;
  projectName?: string;
  sessionPurpose?: string;
  language?: string;
  maxTasks?: number;
}): string {
  const parts: string[] = [];

  parts.push('Analyze the following conversation transcript and extract case experiences.');
  parts.push('');

  if (params.projectName) {
    parts.push(`Project: ${params.projectName}`);
  }
  if (params.sessionPurpose) {
    parts.push(`Session Purpose: ${params.sessionPurpose}`);
  }
  if (params.language) {
    parts.push(`Primary Language: ${params.language}`);
  }
  if (params.projectName || params.sessionPurpose || params.language) {
    parts.push('');
  }

  if (params.maxTasks) {
    parts.push(`Extract up to ${params.maxTasks} most significant tasks.`);
    parts.push('');
  }

  parts.push('TRANSCRIPT:');
  parts.push('```');
  parts.push(params.transcript);
  parts.push('```');
  parts.push('');
  parts.push('Extract all complete problem-solution cycles as case experiences.');
  parts.push('Return JSON with a "tasks" array. If no complete tasks found, return {"tasks": []}.');

  return parts.join('\n');
}
```

---

## Appendix C: Recommendation Workflow (Full Detail)

### C.1 State Machine

```
                    ┌─────────────┐
    Librarian       │   PENDING   │
    creates   ───►  │  (initial)  │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ APPROVED │    │ REJECTED │    │ SKIPPED  │
    │          │    │          │    │ (defer)  │
    └────┬─────┘    └──────────┘    └──────────┘
         │
         ▼
  Creates promoted
  experience/tool

  ┌──────────────────────────────────────────────┐
  │               TTL Expiration                 │
  │  PENDING ──(14 days)──► EXPIRED              │
  └──────────────────────────────────────────────┘
```

### C.2 State Transitions

```typescript
export type RecommendationStatus =
  | 'pending'   // Awaiting decision
  | 'approved'  // Promotion executed
  | 'rejected'  // Declined with reason
  | 'skipped'   // Deferred for later
  | 'expired';  // TTL exceeded

export const VALID_TRANSITIONS: StateTransition[] = [
  { from: 'pending', to: 'approved', action: 'approve', requires: ['agentId'] },
  { from: 'pending', to: 'rejected', action: 'reject', requires: ['agentId'] },
  { from: 'pending', to: 'skipped', action: 'skip', requires: [] },
  { from: 'pending', to: 'expired', action: 'expire', requires: [] },
  { from: 'skipped', to: 'pending', action: 'requeue', requires: [] },
  { from: 'skipped', to: 'rejected', action: 'reject', requires: ['agentId'] },
];
```

### C.3 Outcome Tracking

```typescript
// Track outcomes to improve future recommendations
export interface RecommendationOutcome {
  recommendationId: string;
  promotedToId: string;
  promotedToType: 'experience' | 'tool';
  useCount: number;
  successCount: number;
  lastUsedAt: string | null;
  userFeedback: 'positive' | 'negative' | 'neutral' | null;
  effectivenessScore: number; // 0-1 based on usage success rate
}
```

---

## Appendix D: Database Schemas (Full Detail)

### D.1 Recommendations Table

```sql
CREATE TABLE librarian_recommendations (
  id TEXT PRIMARY KEY,
  source_experience_id TEXT NOT NULL,
  source_level TEXT NOT NULL CHECK (source_level IN ('case', 'strategy')),
  target_level TEXT NOT NULL CHECK (target_level IN ('strategy', 'skill')),
  pattern_group_size INTEGER NOT NULL DEFAULT 1,
  member_experience_ids TEXT NOT NULL DEFAULT '[]',
  semantic_similarity REAL NOT NULL,
  trajectory_similarity REAL NOT NULL,
  combined_confidence REAL NOT NULL,
  suggested_title TEXT NOT NULL,
  suggested_pattern TEXT NOT NULL,
  suggested_applicability TEXT,
  suggested_contraindications TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reasoning TEXT NOT NULL,
  promoted_to_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  decided_by TEXT,
  decision_reason TEXT,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  metadata TEXT DEFAULT '{}',
  FOREIGN KEY (source_experience_id) REFERENCES experiences(id) ON DELETE CASCADE
);

CREATE INDEX idx_rec_status ON librarian_recommendations(status);
CREATE INDEX idx_rec_scope ON librarian_recommendations(scope_type, scope_id);
CREATE INDEX idx_rec_confidence ON librarian_recommendations(combined_confidence DESC);
```

### D.2 FTS5 for Experiences

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS experiences_fts USING fts5(
  experience_id UNINDEXED,
  title,
  content,
  scenario,
  outcome,
  pattern,
  applicability,
  tokenize = 'porter unicode61'
);

-- Triggers for INSERT/UPDATE/DELETE omitted for brevity
-- See full implementation in migrations
```

### D.3 Promotion Relations Migration

```sql
-- Migrate promotedToToolId and promotedFromId to entryRelations
-- Use relation types: promoted_to, derived_from
-- See full migration in src/db/migrations/0013_migrate_promotions_to_relations.sql
```

---

## Appendix E: Workflow Triggers (Full Detail)

### E.1 Trigger Types

```
┌─────────────────────────────────────────────────────────────┐
│                    TRIGGER SOURCES                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. SCHEDULED (Cron)                                        │
│     └─ LibrarianScheduler runs on configured schedule       │
│        e.g., "0 2 * * *" = daily at 2 AM                    │
│                                                             │
│  2. SESSION END (Event) → CaptureService.onSessionEnd()     │
│     └─ When session ends with status='completed'            │
│        └─ ExperienceCaptureModule: Extract from transcript  │
│        └─ Deduplication: Skip already-captured content      │
│        └─ Librarian Analyze: Check for new patterns         │
│                                                             │
│  3. TURN-BASED (Dynamic) → CaptureService.onTurnComplete()  │
│     └─ After conversation turns when thresholds exceeded    │
│        └─ KnowledgeCaptureModule: Extract knowledge/rules   │
│        └─ SharedState: Track captured content hashes        │
│                                                             │
│  4. MANUAL (MCP/CLI)                                        │
│     └─ memory_librarian action=analyze                      │
│     └─ memory_experience action=capture_from_transcript     │
│     └─ memory_experience action=capture_knowledge           │
│     └─ agent-memory librarian analyze                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### E.2 Unified CaptureService Integration

The CaptureService coordinates both capture modules through a single entry point:

```typescript
// Integration points in MCP handlers

// 1. Session-end hook (src/mcp/handlers/scopes.handler.ts)
async function sessionEnd(context: AppContext, params: SessionEndParams) {
  const session = await context.repos.sessions.end(params.id, params.status);

  if (params.status === 'completed' && context.services.capture) {
    // CaptureService handles deduplication internally
    const result = await context.services.capture.onSessionEnd(
      session,
      params.transcript
    );

    // Also trigger librarian if enabled
    if (context.config.librarian.triggerOnSessionEnd) {
      await context.services.librarian.analyze({
        scopeType: 'project',
        scopeId: session.projectId,
        trigger: 'session_end',
      });
    }
  }

  return { success: true, session };
}

// 2. Turn-based hook (src/mcp/handlers/conversation.handler.ts)
async function addMessage(context: AppContext, params: AddMessageParams) {
  const message = await context.repos.conversations.addMessage(params);

  if (context.services.capture) {
    // CaptureService checks thresholds and captures if needed
    const result = await context.services.capture.onTurnComplete({
      tokens: params.tokens ?? estimateTokens(params.content),
      toolCalls: params.toolsUsed?.length ?? 0,
      content: params.content,
    });

    if (result) {
      // Knowledge was captured - result contains new entries
      message.metadata = {
        ...message.metadata,
        capturedEntryIds: result.entries.map(e => e.id),
      };
    }
  }

  return message;
}
```

*Transcript sourcing & safety notes*
- `sessionEnd` should either receive a trimmed transcript payload (chunked to avoid token bloat) or rebuild the transcript from stored conversation entries keyed by `sessionId` before passing it to `CaptureService`.
- Before handing transcripts to the experience extractor, run a redaction pass to strip secrets/credentials and persist only the derived experience/knowledge entries plus dedup hashes; transcripts themselves are not stored.

### E.3 Threshold Evaluation

```typescript
// src/services/capture/knowledge.module.ts

function shouldTriggerCapture(
  metrics: TurnMetrics,
  config: CaptureConfig['turnBased']
): { trigger: boolean; reason: string } {
  // Check cooldown first
  if (metrics.lastCaptureAt) {
    const secondsSince = (Date.now() - metrics.lastCaptureAt.getTime()) / 1000;
    if (secondsSince < config.cooldownSeconds) {
      return { trigger: false, reason: 'cooldown' };
    }
  }

  // OR logic - any threshold triggers capture
  if (metrics.turnsSinceLastCapture >= config.thresholds.turns) {
    return { trigger: true, reason: 'turn_threshold' };
  }
  if (metrics.tokensSinceLastCapture >= config.thresholds.tokens) {
    return { trigger: true, reason: 'token_threshold' };
  }

  const avgToolCalls = metrics.toolCallsSinceLastCapture /
                       Math.max(1, metrics.turnsSinceLastCapture);
  if (avgToolCalls >= config.thresholds.complexity) {
    return { trigger: true, reason: 'complexity_threshold' };
  }

  return { trigger: false, reason: 'below_thresholds' };
}
```

### E.4 Configuration Summary

```bash
# Unified Capture Service
AGENT_MEMORY_CAPTURE_ENABLED=true

# Session-end (experience capture)
AGENT_MEMORY_CAPTURE_SESSION_END_ENABLED=true
AGENT_MEMORY_CAPTURE_SESSION_END_CONFIDENCE_THRESHOLD=0.7
AGENT_MEMORY_CAPTURE_SESSION_END_MIN_STEPS=2
AGENT_MEMORY_CAPTURE_SESSION_END_MAX_EXPERIENCES=10

# Turn-based (knowledge capture)
AGENT_MEMORY_CAPTURE_TURN_BASED_ENABLED=true
AGENT_MEMORY_CAPTURE_TURN_BASED_TURNS=5
AGENT_MEMORY_CAPTURE_TURN_BASED_TOKENS=4000
AGENT_MEMORY_CAPTURE_TURN_BASED_COMPLEXITY=3
AGENT_MEMORY_CAPTURE_TURN_BASED_COOLDOWN=60
AGENT_MEMORY_CAPTURE_TURN_BASED_CONFIDENCE=0.8

# Deduplication
AGENT_MEMORY_CAPTURE_DEDUPLICATION_ENABLED=true

# Librarian
AGENT_MEMORY_LIBRARIAN_ENABLED=true
AGENT_MEMORY_LIBRARIAN_SCHEDULE="0 2 * * *"
AGENT_MEMORY_LIBRARIAN_TRIGGER_ON_SESSION_END=true
AGENT_MEMORY_LIBRARIAN_AUTO_PROMOTE_ENABLED=true
AGENT_MEMORY_LIBRARIAN_AUTO_PROMOTE_THRESHOLD=0.9
```

---

## Design Principles Enforced

1. **Entity + Version pattern** ✅ - Experiences already follows this
2. **Polymorphic relations** 🔧 - Migration needed from embedded FKs
3. **Query pipeline integration** 🔧 - Add experiences to discoverable types
4. **Scope inheritance** ✅ - Already implemented correctly
5. **Consolidation compatibility** ✅ - EntryType includes 'experience'

---

## Appendix F: Knowledge Graph & Temporal Reasoning (Moved)

Moved to separate RFC: docs/knowledge-graph-plan.md
