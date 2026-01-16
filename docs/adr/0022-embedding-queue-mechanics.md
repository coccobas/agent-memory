# ADR-0022: Embedding Queue Mechanics

## Status

Accepted

## Context

ADR-0014 established that embeddings are generated asynchronously ("fire-and-forget"). However, it didn't specify the queue mechanics for managing concurrent embedding requests.

Challenges:

- Multiple updates to the same entry should only embed the latest version
- Concurrent embedding requests can overwhelm the embedding service
- Failed embeddings should be recoverable
- Queue state should be observable for debugging

We needed a queue system with:

- Deduplication (skip stale versions)
- Concurrency limiting
- Failure handling with retry
- Dead-letter queue for persistent failures

## Decision

Implement a fire-and-forget async embedding queue with deduplication, concurrency limiting, and a dead-letter queue (DLQ).

### Queue Structure

```typescript
// src/db/repositories/embedding-hooks.ts
interface EmbeddingQueue {
  // Job deduplication: only latest version per entry
  pendingByEntry: Map<string, EmbeddingJob>; // entryKey → latest job

  // FIFO processing order
  queue: string[]; // entryKeys in arrival order

  // Concurrency control
  inFlight: number;
  maxConcurrency: number; // default: 3

  // Version tracking for deduplication
  latestSeqByKey: Map<string, number>; // entryKey → sequence number

  // Failed jobs for manual intervention
  dlq: EmbeddingJob[];
}

interface EmbeddingJob {
  entryType: 'guideline' | 'knowledge' | 'tool';
  entryId: string;
  versionId: string;
  content: string;
  seq: number; // Monotonic sequence for ordering
  attempts: number;
  lastError?: string;
}
```

### Deduplication Strategy

When multiple updates arrive for the same entry before embedding completes:

```typescript
function enqueue(job: EmbeddingJob): void {
  const key = `${job.entryType}:${job.entryId}`;

  // Check if newer version already queued
  const existingSeq = latestSeqByKey.get(key) ?? 0;
  if (job.seq <= existingSeq) {
    // Stale job, skip it
    return;
  }

  // Update latest sequence
  latestSeqByKey.set(key, job.seq);

  // Replace any pending job for this entry
  if (pendingByEntry.has(key)) {
    // Already in queue, just update the job
    pendingByEntry.set(key, job);
  } else {
    // New entry, add to queue
    pendingByEntry.set(key, job);
    queue.push(key);
  }

  processQueue();
}
```

### Concurrency Limiting

```typescript
async function processQueue(): Promise<void> {
  while (queue.length > 0 && inFlight < maxConcurrency) {
    const key = queue.shift()!;
    const job = pendingByEntry.get(key);

    if (!job) continue; // Already processed

    // Check if still latest (might have been superseded)
    if (job.seq < latestSeqByKey.get(key)!) {
      pendingByEntry.delete(key);
      continue; // Skip stale job
    }

    inFlight++;
    pendingByEntry.delete(key);

    processJob(job)
      .catch((error) => handleFailure(job, error))
      .finally(() => {
        inFlight--;
        processQueue(); // Process next
      });
  }
}
```

### Failure Handling

```typescript
async function handleFailure(job: EmbeddingJob, error: Error): Promise<void> {
  job.attempts++;
  job.lastError = error.message;

  if (job.attempts < maxRetries) {
    // Exponential backoff retry
    const delay = Math.min(1000 * Math.pow(2, job.attempts), 30000);
    setTimeout(() => enqueue(job), delay);
  } else {
    // Move to dead-letter queue
    dlq.push(job);
    logger.error('Embedding failed permanently', {
      entryType: job.entryType,
      entryId: job.entryId,
      attempts: job.attempts,
      error: job.lastError,
    });
  }
}
```

### State Machine

```
Job arrives
    │
    ▼
┌─────────────────┐
│ Check sequence  │──── Stale? ──── Discard
└────────┬────────┘
         │ Latest
         ▼
┌─────────────────┐
│ Deduplicate     │──── Already queued? ──── Replace job
└────────┬────────┘
         │ New
         ▼
┌─────────────────┐
│ Add to queue    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Process queue   │──── At capacity? ──── Wait
└────────┬────────┘
         │ Has capacity
         ▼
┌─────────────────┐
│ Generate embed  │──── Failed? ──── Retry (exponential backoff)
└────────┬────────┘                       │
         │ Success                        │ Max retries exceeded
         ▼                                ▼
┌─────────────────┐              ┌─────────────────┐
│ Store embedding │              │ Dead-letter Q   │
└─────────────────┘              └─────────────────┘
```

### Observability

```typescript
function getQueueStats(): QueueStats {
  return {
    pending: queue.length,
    inFlight,
    dlqSize: dlq.length,
    uniqueEntries: pendingByEntry.size,
  };
}
```

## Consequences

**Positive:**

- Only latest version is embedded (saves API calls)
- Concurrent requests don't overwhelm embedding service
- Failed jobs are recoverable via DLQ
- Queue state is observable for debugging
- Memory-efficient (only stores latest job per entry)

**Negative:**

- In-memory queue loses state on restart (acceptable for embeddings)
- DLQ requires manual intervention to retry
- Complexity of deduplication logic
- Eventual consistency (queries may miss very recent embeddings)

## References

- Code locations:
  - `src/db/repositories/embedding-hooks.ts` - Queue implementation
  - `src/services/embedding.service.ts` - Embedding generation
  - `src/config/registry/sections/embedding.ts` - Queue configuration
- Related ADRs: ADR-0014 (Embedding Async Pattern)
- Principles: A6 (Async by Default, Sync When Needed), O2 (Data Durability Over Speed)
