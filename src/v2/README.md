# V2 Clean Architecture Skeleton

This folder is a clean-start skeleton for memory ingestion and retrieval.

## Design

The architecture has three planes with strict responsibilities:

1. Write plane

- Normalize all ingestion lanes into canonical contracts.
- Persist entry/relation mutations and append outbox events in one transaction.

2. Index plane

- Consume outbox events.
- Project into read indexes: FTS, vector, entity index, graph, cache invalidation.

3. Read plane

- Resolve strategy.
- Collect candidates from index sources.
- Load canonical entries.
- Filter, rank, paginate.

## Core Files

- Contracts: `src/v2/contracts/`
- Write service and transaction ports: `src/v2/write/`
- Index projection runner: `src/v2/indexing/`
- Read pipeline and stage interfaces: `src/v2/read/`
- Composition root: `src/v2/bootstrap.ts`

## Implementation Order

1. Implement `WriteUnitOfWork` and `WriteTransaction` against your DB layer.
2. Add an outbox table and wire `appendOutbox`.
3. Implement one index projector at a time:

- FTS projector
- Vector projector
- Entity projector
- Graph projector
- Cache invalidation projector

4. Implement `CandidateSource` adapters (FTS + semantic first).
5. Implement `EntryReader` + `EntryRanker` with your preferred scoring model.
6. Swap current query entrypoint to `ReadPipeline.execute`.
