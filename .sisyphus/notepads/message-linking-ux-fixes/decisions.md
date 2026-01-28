# Task 1: Episode Scope Detection - Architectural Decisions

## Date: 2025-01-28

### Decision 1: Auto-populate scopeId in Handler (Not in Service)

**Location**: `src/mcp/handlers/episodes.handler.ts` (addHandler function)

**Rationale**:

- Handler is the right place for parameter normalization and auto-population
- Follows existing pattern: projectId is auto-populated in handler (line 166-172)
- Keeps service layer focused on business logic, not parameter preparation
- Easier to test and reason about

**Alternative Considered**: Auto-populate in service layer

- ❌ Would require passing additional context to service
- ❌ Breaks separation of concerns
- ❌ Harder to test

### Decision 2: Use scopeType to Determine Which ID to Use

**Pattern**:

```
scopeType='session' → use sessionId as scopeId
scopeType='project' → use projectId as scopeId
```

**Rationale**:

- Aligns with hierarchical scope model (session is child of project)
- scopeType already indicates the scope level
- Prevents mismatches between scopeType and scopeId
- Makes queries predictable and consistent

### Decision 3: Respect Explicitly Provided scopeId

**Implementation**: Only auto-populate if `!scopeId`

**Rationale**:

- Allows explicit override when needed
- Doesn't break existing code that provides scopeId
- Follows principle of least surprise
- Maintains backward compatibility

### Decision 4: No Changes to Repository Layer

**Why**: `episodes.ts` list method already filters correctly by scopeId

**Verification**:

- List method checks `if (filter.scopeId !== undefined)` (line 159)
- Filters by `eq(episodes.scopeId, filter.scopeId)` (line 160)
- Works correctly once scopeId is populated

### Decision 5: TDD Approach with Unit Tests

**Test File**: `tests/unit/episode-scope-detection.test.ts`

**Coverage**:

- Test 1: Auto-population from projectId (default scopeType)
- Test 2: Auto-population from sessionId (explicit scopeType='session')
- Test 3: Explicit scopeId preservation
- Test 4: List query with sessionId filter

**Rationale**:

- Ensures fix works as intended
- Prevents regressions
- Documents expected behavior
- Follows project's TDD workflow
