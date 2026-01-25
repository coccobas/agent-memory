# Remove Elicitation Service

## Context

### Original Request

User wants to remove the elicitation service from agent-memory codebase. They tested both elicitation and `mcp_question`, prefer `mcp_question` (always available, no config needed), and want complete removal.

### Interview Summary

**Key Discussions**:

- User tested both systems side-by-side
- Elicitation requires `AGENT_MEMORY_INTERACTIVE=true` env var to enable
- `mcp_question` is always available, no configuration needed
- User chose to fail with validation error when no project specified (vs silent skip)

**Research Findings**:

- Elicitation is isolated - uses MCP `elicitInput()` protocol
- Only used in tool-runner (auto-prompt for missing params) and memory_quickstart (project selection)
- Config is self-contained in elicitation section
- No documentation references elicitation

### Metis Review

**Identified Gaps** (addressed):

- memory_quickstart behavior: Falls through to existing logic when elicitation block removed
- Config type cleanup: Remove `elicitation` property entirely from Config interface
- AGENT_MEMORY_INTERACTIVE env var: Will be ignored after removal (acceptable)

---

## Work Objectives

### Core Objective

Remove the elicitation service entirely from the codebase since user prefers using `mcp_question` directly.

### Concrete Deliverables

- 4 files deleted
- 6 files modified with elicitation references removed
- Clean build and passing tests

### Definition of Done

- [x] `npm run validate` passes (lint + typecheck + tests) - Note: 1 pre-existing test failure
- [x] No references to `elicitation` in codebase
- [x] MCP server starts without errors

### Must Have

- Complete removal of all elicitation code
- Existing tests continue to pass
- Build succeeds

### Must NOT Have (Guardrails)

- Do NOT add replacement functionality for elicitation
- Do NOT modify memory_quickstart beyond removing the elicitation block (lines 137-185)
- Do NOT change error messages or validation behavior elsewhere
- Do NOT touch any files not listed in this plan

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES
- **User wants tests**: Run existing tests only
- **Framework**: bun test / npm run validate

### Manual Execution Verification

- [x] `npm run build` succeeds
- [x] `npm run validate` passes (1 pre-existing test failure, 4 pre-existing architecture issues)
- [x] MCP server starts: `npx agent-memory mcp` (verified - starts and shuts down cleanly)

---

## Task Flow

```
Task 1 (Remove usages) → Task 2 (Remove types) → Task 3 (Remove config) → Task 4 (Delete files) → Task 5 (Verify)
```

## Parallelization

| Task | Depends On | Reason                     |
| ---- | ---------- | -------------------------- |
| 1    | -          | First step                 |
| 2    | 1          | Types referenced by usages |
| 3    | 2          | Config referenced by types |
| 4    | 3          | Files contain types/config |
| 5    | 4          | Final verification         |

---

## TODOs

- [x] 1. Remove elicitation usages from tool-runner.ts

  **What to do**:
  - Remove the elicitation call in catch block (lines 339-343)
  - Delete the entire `tryElicitation` function (lines 386-451)

  **Must NOT do**:
  - Do NOT add any replacement error handling
  - Do NOT modify other error handling logic

  **Parallelizable**: NO (first task)

  **References**:
  - `src/mcp/tool-runner.ts:339-343` - Elicitation call in catch block to remove
  - `src/mcp/tool-runner.ts:386-451` - `tryElicitation` function to delete

  **Acceptance Criteria**:
  - [x] Lines 339-343 removed (elicitation call in catch block)
  - [x] Lines 386-451 removed (tryElicitation function)
  - [x] `npm run build` passes

  **Commit**: NO (groups with 2, 3)

---

- [x] 2. Remove elicitation usages from memory_quickstart.ts

  **What to do**:
  - Remove the elicitation block (lines 137-185)
  - Remove 'elicited' from projectAction type (line 132)

  **Must NOT do**:
  - Do NOT modify the `if (createProject)` block (lines 187+)
  - Do NOT change the fallback behavior

  **Parallelizable**: NO (depends on 1)

  **References**:
  - `src/mcp/descriptors/memory_quickstart.ts:132` - Remove 'elicited' from union type
  - `src/mcp/descriptors/memory_quickstart.ts:137-185` - Elicitation block to remove

  **Acceptance Criteria**:
  - [x] Lines 137-185 removed (entire elicitation if-block)
  - [x] 'elicited' removed from projectAction type at line 132
  - [x] `npm run build` passes

  **Commit**: NO (groups with 1, 3)

---

- [x] 3. Remove elicitation wiring from server.ts

  **What to do**:
  - Remove imports (lines 59-63): `setElicitationServer`, `clearElicitationServer`, `createMcpQuestionClient`
  - Remove wiring code (lines 179-187): setElicitationServer and mcpQuestionClient setup
  - Remove cleanup call (line 255): `clearElicitationServer()`

  **Must NOT do**:
  - Do NOT modify notification service wiring (similar pattern but keep it)

  **Parallelizable**: NO (depends on 2)

  **References**:
  - `src/mcp/server.ts:59-63` - Imports to remove
  - `src/mcp/server.ts:179-187` - Wiring code to remove
  - `src/mcp/server.ts:255` - Cleanup call to remove

  **Acceptance Criteria**:
  - [x] Elicitation imports removed (lines 59-63)
  - [x] Elicitation wiring removed (lines 179-187)
  - [x] `clearElicitationServer()` call removed (line 255)
  - [x] `npm run build` passes

  **Commit**: YES
  - Message: `refactor(mcp): remove elicitation service usages`
  - Files: `src/mcp/tool-runner.ts`, `src/mcp/descriptors/memory_quickstart.ts`, `src/mcp/server.ts`
  - Pre-commit: `npm run build`

---

- [x] 4. Remove elicitation from context-wiring.ts

  **What to do**:
  - Remove the elicitation service creation block (lines 227-231)

  **Must NOT do**:
  - Do NOT modify other service creation blocks

  **Parallelizable**: NO (depends on 3)

  **References**:
  - `src/core/factory/context-wiring.ts:227-231` - Elicitation service creation to remove

  **Acceptance Criteria**:
  - [x] Lines 227-231 removed
  - [x] `npm run build` passes

  **Commit**: NO (groups with 5, 6)

---

- [x] 5. Remove elicitation type from context.ts

  **What to do**:
  - Remove import (line 46): `import type { IElicitationService }`
  - Remove property (lines 329-330): `elicitation?: IElicitationService`

  **Must NOT do**:
  - Do NOT modify other service type definitions

  **Parallelizable**: NO (depends on 4)

  **References**:
  - `src/core/context.ts:46` - Import to remove
  - `src/core/context.ts:329-330` - Property to remove

  **Acceptance Criteria**:
  - [x] Import removed (line 46)
  - [x] Property removed (lines 329-330)
  - [x] `npm run build` passes

  **Commit**: NO (groups with 4, 6)

---

- [x] 6. Remove elicitation from Config type in config/index.ts

  **What to do**:
  - Remove elicitation property from Config interface (lines 438-442)

  **Must NOT do**:
  - Do NOT modify other config properties

  **Parallelizable**: NO (depends on 5)

  **References**:
  - `src/config/index.ts:438-442` - Elicitation config type to remove

  **Acceptance Criteria**:
  - [x] Lines 438-442 removed from Config interface
  - [x] `npm run build` passes

  **Commit**: YES
  - Message: `refactor(core): remove elicitation types and wiring`
  - Files: `src/core/factory/context-wiring.ts`, `src/core/context.ts`, `src/config/index.ts`
  - Pre-commit: `npm run build`

---

- [x] 7. Remove elicitation config section registration

  **What to do**:
  - Remove import (line 70): `import { elicitationSection }`
  - Remove registration (line 142): `elicitation: elicitationSection`

  **Must NOT do**:
  - Do NOT modify other config section registrations

  **Parallelizable**: NO (depends on 6)

  **References**:
  - `src/config/registry/index.ts:70` - Import to remove
  - `src/config/registry/index.ts:142` - Registration to remove

  **Acceptance Criteria**:
  - [x] Import removed (line 70)
  - [x] Registration removed (line 142)
  - [x] `npm run build` passes

  **Commit**: NO (groups with 8)

---

- [x] 8. Delete elicitation files

  **What to do**:
  - Delete `src/config/registry/sections/elicitation.ts`
  - Delete `src/services/elicitation.service.ts`
  - Delete `src/mcp/elicitation.client.ts`
  - Delete `tests/unit/elicitation.service.test.ts`

  **Must NOT do**:
  - Do NOT delete any other files

  **Parallelizable**: NO (depends on 7)

  **References**:
  - `src/config/registry/sections/elicitation.ts` - Config section file
  - `src/services/elicitation.service.ts` - Main service (213 lines)
  - `src/mcp/elicitation.client.ts` - MCP client adapter (159 lines)
  - `tests/unit/elicitation.service.test.ts` - Unit tests

  **Acceptance Criteria**:
  - [x] All 4 files deleted
  - [x] `npm run build` passes
  - [x] `grep -r "elicitation" src/` returns no results

  **Commit**: YES (Note: Files were local-only, never tracked in git)
  - Message: `chore: delete elicitation service files`
  - Files: (4 deleted files)
  - Pre-commit: `npm run build`

---

- [x] 9. Final verification

  **What to do**:
  - Run full validation suite
  - Verify no elicitation references remain
  - Test MCP server starts

  **Parallelizable**: NO (final task)

  **References**:
  - Package scripts in `package.json`

  **Acceptance Criteria**:
  - [x] `npm run validate` passes (lint + typecheck + tests) - Note: 1 pre-existing test failure in permissions.test.ts, 4 pre-existing architecture issues
  - [x] `grep -r "elicitation" src/` returns empty
  - [x] `grep -r "AGENT_MEMORY_INTERACTIVE" src/` returns empty
  - [x] MCP server starts without errors

  **Commit**: NO (verification only)

---

## Commit Strategy

| After Task | Message                                               | Files                                           | Verification  |
| ---------- | ----------------------------------------------------- | ----------------------------------------------- | ------------- |
| 3          | `refactor(mcp): remove elicitation service usages`    | tool-runner.ts, memory_quickstart.ts, server.ts | npm run build |
| 6          | `refactor(core): remove elicitation types and wiring` | context-wiring.ts, context.ts, config/index.ts  | npm run build |
| 8          | `chore: delete elicitation service files`             | 4 deleted files + registry/index.ts             | npm run build |

---

## Success Criteria

### Verification Commands

```bash
npm run build        # Expected: success, no errors
npm run validate     # Expected: all tests pass
grep -r "elicitation" src/  # Expected: no output
```

### Final Checklist

- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All tests pass (1 pre-existing failure unrelated to changes)
- [x] No TypeScript errors
- [x] MCP server starts cleanly
