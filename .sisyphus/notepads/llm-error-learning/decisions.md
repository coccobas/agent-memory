# Decisions - LLM Error Learning

> Architectural choices and rationale

---

## [2026-01-29] Task 3: Error Analyzer Service

### 1. LLM Provider Architecture

**Decision**: Cascade OpenAI → Anthropic → Ollama → disabled
**Rationale**:

- OpenAI most reliable for structured JSON output
- Anthropic good alternative with similar capabilities
- Ollama for local/offline scenarios
- Disabled mode for testing and environments without LLM access
  **Alternative considered**: Allow config to specify exact provider - rejected for complexity

### 2. Timeout Strategy

**Decision**: 30-second fire-and-forget with Promise.race()
**Rationale**:

- LLM analysis is non-critical (opportunistic learning)
- Don't block session end or Librarian maintenance
- 30s sufficient for most LLM calls, excessive waits are wasteful
  **Alternative considered**: Retry with backoff - rejected as too slow

### 3. Error Storage Scope

**Decision**: Store corrective entries at session scope only
**Rationale**:

- Avoid polluting project scope with unverified patterns
- Let Librarian review and promote high-confidence patterns
- Session scope serves as staging area for review
  **Alternative considered**: Auto-promote to project - rejected as too aggressive

### 4. DB Integration Approach

**Decision**: Stub fetch methods, implement later when schema ready
**Rationale**:

- Task focused on service structure and LLM integration
- Error log schema may change based on requirements
- Service interface stable regardless of DB implementation
  **Alternative considered**: Implement inline - rejected as out of scope

### 5. Test Strategy

**Decision**: Mock LLM clients, test service behavior not responses
**Rationale**:

- LLM responses non-deterministic, hard to test
- Service logic (filtering, timeout, error handling) is deterministic
- Test what we control, not external API behavior
  **Alternative considered**: Integration tests with real LLM - documented but optional

### 6. Error Normalization

**Decision**: Strip paths, line numbers, timestamps, PIDs
**Rationale**:

- Focus on error pattern, not specific occurrences
- Enables cross-session pattern detection
- Reduces noise in LLM analysis
  **Alternative considered**: Send raw errors - rejected as too noisy

## [2026-01-29T19:00:00Z] Task 5: Librarian Integration Decisions

### Why Opt-In (enabled: false)?

- Cross-session error analysis requires LLM calls (cost/latency)
- Not all projects need automated error pattern detection
- Users should explicitly enable when they want learning from errors
- Follows pattern of other LLM-heavy tasks (toolTagAssignment)

### Why Project Scope Only?

- Cross-session analysis needs multiple sessions to compare
- Session scope: only one session, no cross-session patterns
- Global scope: too broad, errors are project-specific
- Project scope: right level for detecting systemic issues

### Why Recommendations Instead of Auto-Storage?

- LLM-generated corrections need human review
- Prevents polluting memory with incorrect guidance
- Follows pattern from Librarian pattern detection
- Recommendations table provides review workflow

### Why Graceful Degradation?

- ErrorAnalyzerService might be disabled (no API key)
- ErrorLogRepository might not have data yet
- Maintenance should continue even if one task fails
- Return executed=false instead of throwing errors

### Integration Strategy

- Dynamic imports to avoid circular dependencies
- Singleton services (getErrorAnalyzerService)
- Factory functions for repositories (createErrorLogRepository)
- Consistent with other maintenance tasks
