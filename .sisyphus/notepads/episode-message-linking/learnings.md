# Episode-Message Linking Implementation Learnings

## 2026-01-25 Implementation Complete

### Key Design Decisions

1. **Episode-driven, not message-driven**: We only look up the active episode when adding a message (cheap single DB query), NOT by subscribing to all message events. This minimizes overhead.

2. **Nullable foreign key**: The `episodeId` column is nullable with `ON DELETE SET NULL`, allowing messages to exist without episodes and gracefully handling episode deletion.

3. **Cross-repository dependency**: The episode service now depends on the conversation repository for `whatHappened` queries. This was wired through `context-wiring.ts`.

### Implementation Patterns

1. **Handler-level episode lookup**: The `addMessage` handler in `conversations.handler.ts` looks up the active episode before calling the repository. This keeps the repository layer simple.

2. **Message summary in experiences**: When an episode completes, the last 5 messages (truncated to 200 chars) are included in the experience content for richer context.

3. **Test database migrations**: Tests require the migration `0034_add_episode_id_to_messages.sql` to be applied. The test helper's `applyMigrations` handles this automatically.

### Files Modified

- Schema: `src/db/schema/conversations.ts`, `src/db/schema/postgresql/conversations.ts`
- Repository: `src/db/repositories/conversations.ts`
- Interfaces: `src/core/interfaces/repositories/conversations.ts`
- Handlers: `src/mcp/handlers/conversations.handler.ts`, `src/mcp/handlers/episodes.handler.ts`
- Services: `src/services/episode/index.ts`, `src/services/capture/index.ts`
- Wiring: `src/core/factory/context-wiring.ts`
- Descriptor: `src/mcp/descriptors/memory_episode.ts`
- Migration: `src/db/migrations/0034_add_episode_id_to_messages.sql`
- Tests: `tests/integration/episode-message-linking.test.ts`

### Gotchas

1. **PostgreSQL schema parity**: Don't forget to update both SQLite and PostgreSQL schemas when adding columns.

2. **Test infrastructure**: The test helpers use `better-sqlite3` which doesn't work with `bun test` directly - use `npm test` instead.

3. **Pre-existing test failures**: Some tests in the codebase have pre-existing failures unrelated to this feature (e.g., `permissions.test.ts`).
