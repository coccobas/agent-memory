## [2026-01-29 23:59] Architectural Decisions

### AD-1: Event-Level vs Aggregate Storage

**Decision:** Use event-level storage (one row per execution) in tool_outcomes table

**Context:** error_log uses aggregate storage (deduplicated, increment count)

**Rationale:**

- Sequence analysis requires ordered events
- Duration varies per execution (can't aggregate meaningfully)
- Recovery patterns need A→failure→B→success chain
- Aggregation happens at analysis time via LLM

**Consequences:**

- More storage space (not deduplicated)
- Enables richer pattern analysis
- Requires counter table for periodic analysis

### AD-2: Dual-Write Strategy

**Decision:** PostToolUse writes to BOTH error_log and tool_outcomes for failures

**Context:** error_log uses UPSERT, trigger would only fire on first occurrence

**Rationale:**

- Maintains backward compatibility
- Simpler than trigger (no race conditions)
- Clear ownership (PostToolUse is single writer)

**Consequences:**

- Two DB writes for failures (acceptable latency)
- error_log queries continue to work
- No trigger complexity

### AD-3: CAS-Based Concurrency Control

**Decision:** Use Compare-And-Swap pattern for periodic analysis claiming

**Context:** Two PostToolUse processes might see threshold crossed simultaneously

**Rationale:**

- Prevents duplicate LLM analysis
- Snapshot ensures correct batch selection
- Failed CAS means another process won the race

**Consequences:**

- Atomic counter updates required
- Batch selection by count (not timestamp)
- Even if analysis fails, batch is marked claimed (no retry loop)

### AD-4: SQLite Counter (Not In-Memory)

**Decision:** Use SQLite table for session_tool_counter

**Context:** Hooks run as separate processes (exec agent-memory hook posttooluse)

**Rationale:**

- In-memory Map would reset on each invocation
- SQLite provides atomic increment + persistence
- Counter survives process lifecycle

**Consequences:**

- Requires migration
- Cleanup on session end (orphans accepted)
- onConflictDoUpdate pattern for atomic increment

### AD-5: Fire-and-Forget for LLM Analysis

**Decision:** Await DB ops, fire-and-forget LLM analysis

**Context:** LLM calls take 30s+, hook runs after tool execution

**Rationale:**

- Fast DB ops (<5ms) acceptable to await
- LLM analysis non-blocking via .then()
- Total hook latency ~5ms (acceptable)

**Consequences:**

- Analysis failures don't block hook
- Hook returns before patterns stored
- .catch() for graceful error handling

### AD-6: Two Writer Paths with Identical Logic

**Decision:** Claude hooks use direct repo, OpenCode uses MCP actions

**Context:** Hooks run as processes, OpenCode runs in MCP server process

**Rationale:**

- Claude hooks can't call MCP (separate process)
- OpenCode uses MCP for consistency
- Server-side derivation enforces guardrails

**Consequences:**

- Two implementations of same logic
- Server-side redaction ensures privacy
- MCP actions added to memory_capture tool

### AD-7: Session Scope for Pattern Storage

**Decision:** Patterns stored at session scope, require manual promotion

**Context:** Auto-promotion could create noise in project scope

**Rationale:**

- Session scope is safe (ephemeral)
- Human review before promotion
- Confidence threshold (0.7) as gate

**Consequences:**

- User must review and promote patterns
- Librarian can suggest promotions
- Prevents automatic pollution of project scope
