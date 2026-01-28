# ADR-001: Intent System Unification Strategy

## Status

**Accepted** - 2026-01-28

## Context

The agent-memory codebase has three separate intent detection systems that evolved independently:

1. **Intent** (`src/services/intent-detection/patterns.ts`) - 15 types for action routing
   - `store`, `retrieve`, `session_start`, `session_end`, `forget`, `list`, `list_episodes`, `list_sessions`, `status`, `update`, `episode_begin`, `episode_log`, `episode_complete`, `episode_query`, `learn_experience`, `unknown`

2. **QueryIntent** (`src/services/query-rewrite/types.ts`) - 6 types for search optimization
   - `lookup`, `how_to`, `debug`, `explore`, `compare`, `configure`

3. **PolicyType** (`src/services/rl/policy-types.ts`) - 3 types for RL policies (now centralized)
   - `extraction`, `retrieval`, `consolidation`

The original bug that exposed this issue: User tried `"learn experience: Fixed todowrite error..."` which mixed structured syntax (memory_experience `learn` action) with the natural language interface (memory tool). This revealed that the intent systems were not coordinated.

## Decision

**Option A: Full Merge** - Merge Intent and QueryIntent into a single unified taxonomy.

### Options Considered

#### Option A: Full Merge (SELECTED)

Merge Intent and QueryIntent into a single `UnifiedIntent` type.

**Pros:**

- Single source of truth for all intent types
- Eliminates confusion about which system to use
- Simplifies maintenance and testing
- Enables consistent behavior across all entry points

**Cons:**

- Larger type union (18-20 types)
- Requires careful migration to avoid breaking changes
- Some intents are action-oriented (store) while others are query-oriented (lookup)

#### Option B: Bridge Layer

Keep both systems but add a mapping layer between them.

**Pros:**

- Minimal code changes
- Preserves existing behavior exactly
- Lower risk of regressions

**Cons:**

- Adds complexity (another layer to maintain)
- Doesn't solve the fundamental inconsistency
- Two systems still need to be kept in sync

#### Option C: Separate with Explicit Mapping

Keep systems separate but document explicit mappings.

**Pros:**

- No code changes needed
- Clear separation of concerns

**Cons:**

- Doesn't solve the original bug
- Confusion persists for developers
- Mapping documentation can drift from implementation

### Why Option A

1. **User confirmed full merge** during planning discussion
2. **Single source of truth** is a core architectural principle
3. **QueryIntent's memory type prioritization** can be preserved via a mapping function
4. **Breaking changes are acceptable** (semver major version bump)

## Implementation

### Unified Intent Type

```typescript
export type UnifiedIntent =
  // Action intents (from Intent)
  | 'store'
  | 'retrieve'
  | 'session_start'
  | 'session_end'
  | 'forget'
  | 'list'
  | 'list_episodes'
  | 'list_sessions'
  | 'status'
  | 'update'
  | 'episode_begin'
  | 'episode_log'
  | 'episode_complete'
  | 'episode_query'
  | 'learn_experience'
  // Query intents (from QueryIntent)
  | 'lookup'
  | 'how_to'
  | 'debug'
  | 'explore'
  | 'compare'
  | 'configure'
  // Fallback
  | 'unknown';
```

### Preserving QueryIntent Behavior

The `getMemoryTypesForIntent()` function will be preserved as `getSearchContextForIntent()`:

```typescript
export function getSearchContextForIntent(intent: UnifiedIntent): {
  types: MemoryType[];
  weights: Map<string, number>;
} {
  // Map action intents to query intents for search context
  const queryIntent = mapToQueryIntent(intent);

  // Return the same prioritization as before
  return {
    types: getMemoryTypesForQueryIntent(queryIntent),
    weights: getMemoryTypeWeights(queryIntent),
  };
}

function mapToQueryIntent(intent: UnifiedIntent): QueryIntent {
  switch (intent) {
    case 'retrieve':
    case 'list':
      return 'lookup';
    case 'store':
    case 'update':
      return 'configure';
    case 'episode_query':
      return 'explore';
    // ... etc
    default:
      return 'explore';
  }
}
```

### Deprecation Plan

1. **Phase 1** (this PR): Create `UnifiedIntent` type, mark `QueryIntent` as `@deprecated`
2. **Phase 2** (next release): Update all internal usages to `UnifiedIntent`
3. **Phase 3** (major release): Remove `QueryIntent` type

### Migration Path for External Consumers

External consumers using `QueryIntent` should:

1. Import `UnifiedIntent` instead of `QueryIntent`
2. Use `getSearchContextForIntent()` instead of `getMemoryTypesForIntent()`
3. Update any switch statements to handle new intent types

## Consequences

### Positive

- Single, consistent intent taxonomy across the codebase
- Clearer mental model for developers
- Enables future intent-based features (e.g., intent-specific UI)
- Fixes the original "learn experience:" bug

### Negative

- Breaking change requiring semver major bump
- Migration effort for any external consumers
- Larger type union may be harder to reason about

### Neutral

- PolicyType remains separate (it's for RL policies, not user intents)
- Confidence thresholds will be standardized in a separate task

## References

- Original bug: "learn experience:" pattern not recognized
- Intent patterns: `src/services/intent-detection/patterns.ts`
- QueryIntent: `src/services/query-rewrite/types.ts`
- Memory type prioritization: `src/services/query-rewrite/classifier.ts:189-218`
