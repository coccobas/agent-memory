# ADR-0014: Embedding Async Pattern

## Status

Accepted

## Context

Memory entries benefit from vector embeddings for semantic search:

- Finding similar entries
- Semantic deduplication
- Context-aware retrieval

Embedding generation is slow (external API call or local model):

- OpenAI API: ~100-500ms per embedding
- Local models: ~50-200ms per embedding

Blocking on embedding generation would severely degrade write performance.

## Decision

Implement fire-and-forget async embedding generation:

**Pattern:**

```typescript
// In repository create/update
const result = createEntry(data);

// Fire-and-forget embedding generation
generateEmbeddingAsync({
  entryType: 'guideline',
  entryId: result.id,
  versionId: versionId,
  text: extractTextForEmbedding(entry),
});

return result; // Returns immediately without waiting for embedding
```

**Implementation Details:**

1. `generateEmbeddingAsync()` is non-blocking (returns immediately)
2. Embedding job queued for background processing
3. Embeddings stored in `embeddings` table linked to entry/version
4. Queries gracefully handle missing embeddings
5. Backfill service can regenerate missing embeddings

**Text Extraction:**
`extractTextForEmbedding()` combines relevant fields:

- Guidelines: name + content + rationale
- Knowledge: title + content
- Tools: name + description

## Consequences

**Positive:**

- Write operations complete immediately
- No user-facing latency from embedding generation
- Graceful degradation (search works without embeddings)
- Backfill capability for bulk embedding generation

**Negative:**

- Eventual consistency (embedding not immediately available)
- Requires monitoring for failed embedding jobs
- Vector search may miss recently created entries

## References

- Embedding hooks: `src/db/repositories/embedding-hooks.ts`
- Vector store: `src/services/embedding/vector-store.ts`
- Backfill service: `src/services/backfill.service.ts`
- Text extraction: `extractTextForEmbedding()` in embedding-hooks.ts
