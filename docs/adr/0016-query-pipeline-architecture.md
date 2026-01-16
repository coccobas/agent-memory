# ADR-0016: Query Pipeline Architecture

## Status

Accepted

## Context

Memory retrieval requires multiple processing steps: scope resolution, query expansion, full-text search, semantic search, filtering, scoring, and re-ranking. These operations have complex interdependencies and need to be configurable per-query. A monolithic query function would be difficult to test, maintain, and extend.

We needed an architecture that:

- Allows stages to be enabled/disabled independently
- Supports both sync and async execution paths
- Makes each stage independently testable
- Enables easy addition of new stages (e.g., cross-encoder re-ranking)
- Provides clear data flow through the query process

## Decision

Decompose memory queries into discrete, composable pipeline stages that transform a shared `PipelineContext` through sequential processing.

### Pipeline Structure

```
Query → [Resolve] → [Rewrite] → [Strategy] → [Semantic] → [FTS] → [Relations]
      → [Fetch] → [Filter] → [Tags] → [Feedback] → [Score] → [Rerank] → [Format] → Results
```

### Core Components

1. **PipelineContext**: Shared state object passed through all stages
   - Contains query parameters, intermediate results, and configuration
   - Accumulates candidates from multiple sources (FTS, semantic, relations)
   - Tracks timing and debugging metadata

2. **Stage Interface**: Each stage is a function `(context) => context`
   - Receives context, transforms it, returns modified context
   - Can short-circuit (return early if no work needed)
   - Can be sync or async depending on pipeline mode

3. **Pipeline Orchestrator**: Composes stages into execution sequence
   - `executeQueryPipelineSync()` for fast, blocking queries
   - `executeQueryPipelineAsync()` for full-featured queries with LLM calls

### Stage Inventory

| Stage         | Purpose                  | Sync | Async |
| ------------- | ------------------------ | ---- | ----- |
| resolve       | Resolve scope chain      | Yes  | Yes   |
| rewrite       | HyDE + query expansion   | No   | Yes   |
| strategy      | Select search strategy   | No   | Yes   |
| semantic      | Vector similarity search | No   | Yes   |
| fts           | Full-text search (FTS5)  | Yes  | Yes   |
| relations     | Graph traversal          | Yes  | Yes   |
| fetch         | Batch load entries       | Yes  | Yes   |
| hierarchical  | Coarse-to-fine retrieval | No   | Yes   |
| filter        | Apply query filters      | Yes  | Yes   |
| tags          | Tag-based filtering      | Yes  | Yes   |
| feedback      | Apply feedback scores    | Yes  | Yes   |
| score         | Multi-factor ranking     | Yes  | Yes   |
| rerank        | Neural re-ranking        | No   | Yes   |
| cross-encoder | LLM-based re-ranking     | No   | Yes   |
| format        | Shape output             | Yes  | Yes   |

### Two-Phase Scoring

The score stage uses two-phase scoring for efficiency:

1. **Light scoring**: Fast score for all candidates
2. **Full scoring**: Detailed score for top 1.5x limit candidates

This avoids expensive scoring on candidates that won't make the cut.

## Consequences

**Positive:**

- Each stage is independently testable with mock contexts
- New stages can be added without modifying existing code
- Performance-sensitive queries can skip expensive stages (async-only)
- Clear data flow makes debugging straightforward
- Stage timing enables performance profiling

**Negative:**

- Context object can grow large with intermediate results
- Stage ordering is implicit (must maintain correct sequence)
- Some stages have hidden dependencies (e.g., fetch requires candidate IDs from FTS/semantic)
- Two pipeline modes (sync/async) require maintaining parallel implementations

## References

- Code locations:
  - `src/services/query/pipeline.ts` - Pipeline orchestration
  - `src/services/query/stages/` - All stage implementations
  - `src/services/query/types.ts` - PipelineContext interface
  - `src/services/query/index.ts` - Public API
- Related ADRs: ADR-0014 (Embedding Async Pattern)
- Principles: A1 (Performance is a Feature), A3 (Layered Enhancement)
