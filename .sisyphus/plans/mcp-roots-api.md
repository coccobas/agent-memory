# MCP Roots API Implementation

## Context

### Original Request

Implement the MCP Roots API to enable the agent-memory server to properly detect the client's working directory without relying on environment variables.

### Problem Statement

The MCP server currently relies on environment variables (`CLAUDE_CWD`, `AGENT_MEMORY_CWD`) to know the client's working directory. This:

- Requires manual user configuration
- Falls back to `process.cwd()` which is often wrong for MCP servers
- Doesn't follow the MCP specification's standard mechanism

### Research Findings

- MCP has a built-in **Roots API** for this purpose
- Client declares `roots` capability during initialization
- Server can call `roots/list` to get filesystem roots from client
- Client sends `notifications/roots/list_changed` when directories change
- Current server declares `capabilities: { tools: {} }` but not roots

---

## Work Objectives

### Core Objective

Implement MCP Roots API support so the server can receive working directory information directly from the client using the standard MCP mechanism.

### Concrete Deliverables

- New `src/mcp/roots.service.ts` - Service to manage MCP roots
- Updated `src/utils/working-directory.ts` - Integrate roots as highest priority source
- Updated `src/mcp/server.ts` - Add roots notification handling
- Unit tests for all new functionality
- Updated documentation

### Definition of Done

- [x] Server requests `roots/list` when client supports it
- [x] Working directory detection uses roots as primary source
- [x] Env var fallback works when roots not available
- [x] Roots change notification clears caches
- [x] All existing tests pass
- [x] New unit tests pass

### Must Have

- Backward compatibility with environment variable approach
- Graceful handling of clients that don't support roots capability
- Cache invalidation when roots change

### Must NOT Have (Guardrails)

- Breaking changes to existing env var detection
- Removal of CLAUDE_CWD/AGENT_MEMORY_CWD support
- Hard dependency on roots capability (must fall back gracefully)

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **User wants tests**: YES (unit tests)
- **Framework**: vitest

---

## Task Flow

```
Phase 1 (Roots Service) → Phase 2 (Working Dir) → Phase 3 (Server Integration)
                                                           ↓
Phase 7 (Docs) ← Phase 6 (Tests) ← Phase 5 (Exports) ← Phase 4 (Context Detection)
```

## Parallelization

| Group | Tasks    | Reason                 |
| ----- | -------- | ---------------------- |
| A     | 6.1, 6.2 | Independent test files |

| Task | Depends On | Reason                            |
| ---- | ---------- | --------------------------------- |
| 2    | 1          | Uses roots.service exports        |
| 3    | 1, 2       | Integrates both components        |
| 4    | 3          | Needs server integration complete |
| 6    | 1, 2       | Tests require implementations     |

---

## TODOs

- [x] 1. Create Roots Service

  **What to do**:
  - Create `src/mcp/roots.service.ts`
  - Implement `initializeRootsService(server, options)` - Initialize with MCP server instance
  - Implement `checkRootsCapability()` - Check if client supports roots
  - Implement `fetchRoots()` - Request roots from client via `server.listRoots()`
  - Implement `handleRootsChanged()` - Handle `notifications/roots/list_changed`
  - Implement `getCurrentRoots()` - Get cached roots
  - Implement `getRootWorkingDirectory()` - Parse first root's file:// URI to path
  - Implement `hasRootsCapability()` - Check if roots are available
  - Implement `clearRootsState()` - Reset state for testing/shutdown
  - Implement `fileUriToPath(uri)` - Convert file:// URI to filesystem path (handle Unix/Windows)

  **Must NOT do**:
  - Import from context-detection.service (avoid circular deps)
  - Use synchronous blocking calls for listRoots

  **Parallelizable**: NO (first task)

  **References**:
  - `src/mcp/notification.service.ts` - Pattern for MCP service modules
  - `@modelcontextprotocol/sdk/server/index.js` - Server.listRoots(), getClientCapabilities()
  - `@modelcontextprotocol/sdk/types.js` - Root, ListRootsResult types

  **Acceptance Criteria**:
  - [ ] `src/mcp/roots.service.ts` created with all functions
  - [ ] TypeScript compiles without errors: `npm run typecheck`
  - [ ] File URI parsing handles both Unix (`/home/user`) and Windows (`C:/Users`) paths
  - [ ] Decodes URI-encoded characters (spaces as `%20`)

  **Commit**: YES
  - Message: `feat(mcp): add roots service for MCP roots API support`
  - Files: `src/mcp/roots.service.ts`

---

- [x] 2. Update Working Directory Utility

  **What to do**:
  - Update `src/utils/working-directory.ts`
  - Import `getRootWorkingDirectory`, `hasRootsCapability` from roots.service
  - Add roots as Priority 1 in detection (before CLAUDE_CWD)
  - Add `WorkingDirectorySource` type: `'roots' | 'CLAUDE_CWD' | 'AGENT_MEMORY_CWD' | 'process.cwd'`
  - Add `getWorkingDirectoryInfo()` returning `{ path, source }`
  - Update `hasClientWorkingDirectory()` to include roots check
  - Add `getWorkingDirectorySource()` for diagnostics

  **Must NOT do**:
  - Remove existing env var support
  - Change the signature of `getWorkingDirectory()`

  **Parallelizable**: NO (depends on 1)

  **References**:
  - `src/utils/working-directory.ts:29-71` - Current implementation to modify
  - `src/mcp/roots.service.ts` - New roots functions to import

  **Acceptance Criteria**:
  - [ ] Priority order: roots > CLAUDE_CWD > AGENT_MEMORY_CWD > process.cwd()
  - [ ] `getWorkingDirectory()` returns string (unchanged API)
  - [ ] `getWorkingDirectoryInfo()` returns `{ path, source }`
  - [ ] TypeScript compiles: `npm run typecheck`

  **Commit**: YES
  - Message: `feat(utils): integrate MCP roots in working directory detection`
  - Files: `src/utils/working-directory.ts`

---

- [x] 3. Integrate with MCP Server

  **What to do**:
  - Update `src/mcp/server.ts`
  - Import `RootsListChangedNotificationSchema` from MCP SDK types
  - Import roots service functions
  - Import `clearWorkingDirectoryCache` from working-directory utility
  - Call `initializeRootsService(server, { onRootsChanged })` in `createServer()`
  - Set `onRootsChanged` callback to clear working directory and context detection caches
  - Add `server.setNotificationHandler(RootsListChangedNotificationSchema, handleRootsChanged)`
  - Add `server.oninitialized` callback to check roots capability and fetch initial roots
  - Call `clearRootsState()` in shutdown function

  **Must NOT do**:
  - Change server capabilities (roots is client capability, not server)
  - Block server startup on roots fetch

  **Parallelizable**: NO (depends on 1, 2)

  **References**:
  - `src/mcp/server.ts:76-177` - createServer function to modify
  - `src/mcp/server.ts:232-266` - shutdown function to update
  - `@modelcontextprotocol/sdk/types.js` - RootsListChangedNotificationSchema

  **Acceptance Criteria**:
  - [ ] Server initializes roots service on creation
  - [ ] Server handles `notifications/roots/list_changed`
  - [ ] Server fetches roots after client initialization (in oninitialized callback)
  - [ ] Server clears roots state on shutdown
  - [ ] TypeScript compiles: `npm run typecheck`
  - [ ] Server starts successfully: `npm run mcp` (verify no crash)

  **Commit**: YES
  - Message: `feat(mcp): integrate roots API in server lifecycle`
  - Files: `src/mcp/server.ts`

---

- [x] 4. Update Context Detection Service

  **What to do**:
  - Update `src/services/context-detection.service.ts`
  - Add `refresh()` method to interface and implementation
  - Method should clear cache and call detect()

  **Must NOT do**:
  - Change existing detection logic
  - Import roots.service directly (use callback from server)

  **Parallelizable**: NO (depends on 3)

  **References**:
  - `src/services/context-detection.service.ts:115-157` - Interface to extend
  - `src/services/context-detection.service.ts:380-383` - clearCache implementation

  **Acceptance Criteria**:
  - [ ] `refresh()` method added to interface
  - [ ] `refresh()` implementation clears cache and returns fresh detection
  - [ ] TypeScript compiles: `npm run typecheck`

  **Commit**: NO (groups with 3)

---

- [x] 5. Add Exports

  **What to do**:
  - Create or update `src/mcp/index.ts` to export roots.service
  - Export key functions for testing

  **Must NOT do**:
  - Export internal implementation details

  **Parallelizable**: YES (with 6.1, 6.2)

  **References**:
  - `src/mcp/notification.service.ts` - Pattern for exports

  **Acceptance Criteria**:
  - [ ] `src/mcp/index.ts` exports roots.service functions
  - [ ] Can import from `'../mcp/index.js'` in tests

  **Commit**: NO (groups with 6)

---

- [x] 6.1. Create Roots Service Tests

  **What to do**:
  - Create `tests/unit/roots.service.test.ts`
  - Test `initializeRootsService` - no errors on init
  - Test `checkRootsCapability` - returns true/false based on client caps
  - Test `fetchRoots` - fetches and stores roots
  - Test `getRootWorkingDirectory` - parses file:// URIs correctly
  - Test `handleRootsChanged` - refetches and calls callback
  - Mock MCP server and logger

  **Must NOT do**:
  - Integration tests (save for E2E)

  **Parallelizable**: YES (with 6.2)

  **References**:
  - `tests/unit/*.test.ts` - Existing test patterns
  - Plan appendix for mock server structure

  **Acceptance Criteria**:
  - [ ] Test file created
  - [ ] All tests pass: `npm test -- tests/unit/roots.service.test.ts`
  - [ ] Tests cover: init, capability check, fetch, URI parsing, change notification

  **Commit**: NO (groups with 6.2)

---

- [x] 6.2. Create Working Directory Tests

  **What to do**:
  - Create `tests/unit/working-directory.test.ts`
  - Test priority order: roots > CLAUDE_CWD > AGENT_MEMORY_CWD > process.cwd()
  - Test caching behavior
  - Test `hasClientWorkingDirectory` with various configs
  - Mock roots.service and logger

  **Must NOT do**:
  - Integration tests

  **Parallelizable**: YES (with 6.1)

  **References**:
  - `tests/unit/*.test.ts` - Existing test patterns

  **Acceptance Criteria**:
  - [ ] Test file created
  - [ ] All tests pass: `npm test -- tests/unit/working-directory.test.ts`
  - [ ] Tests cover: priority order, caching, cache clearing

  **Commit**: YES
  - Message: `test: add unit tests for roots service and working directory`
  - Files: `tests/unit/roots.service.test.ts`, `tests/unit/working-directory.test.ts`

---

- [x] 7. Update Documentation

  **What to do**:
  - Update `docs/guides/ide-setup.md` or similar
  - Document the priority order for working directory detection
  - Explain MCP Roots API support
  - Keep env var documentation for backward compatibility

  **Must NOT do**:
  - Remove env var documentation

  **Parallelizable**: NO (last task)

  **References**:
  - `docs/guides/ide-setup.md` - Existing IDE setup guide
  - `README.md` - May need brief mention

  **Acceptance Criteria**:
  - [ ] Documentation updated with roots API info
  - [ ] Priority order clearly explained
  - [ ] Env var fallback documented

  **Commit**: YES
  - Message: `docs: add MCP roots API documentation`
  - Files: `docs/guides/ide-setup.md`

---

## Commit Strategy

| After Task  | Message                                                           | Files                                                            | Verification                       |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| 1           | `feat(mcp): add roots service for MCP roots API support`          | `src/mcp/roots.service.ts`                                       | `npm run typecheck`                |
| 2           | `feat(utils): integrate MCP roots in working directory detection` | `src/utils/working-directory.ts`                                 | `npm run typecheck`                |
| 3, 4        | `feat(mcp): integrate roots API in server lifecycle`              | `src/mcp/server.ts`, `src/services/context-detection.service.ts` | `npm run typecheck && npm run mcp` |
| 5, 6.1, 6.2 | `test: add unit tests for roots service and working directory`    | `src/mcp/index.ts`, `tests/unit/*.test.ts`                       | `npm test`                         |
| 7           | `docs: add MCP roots API documentation`                           | `docs/guides/ide-setup.md`                                       | N/A                                |

---

## Success Criteria

### Verification Commands

```bash
npm run typecheck      # TypeScript compiles
npm test               # All tests pass
npm run mcp            # Server starts without errors
```

### Final Checklist

- [x] Server requests `roots/list` when client supports it
- [x] Working directory detection uses roots as primary source
- [x] Env var fallback works when roots not available
- [x] Roots change notification clears caches
- [x] All existing tests pass
- [x] New unit tests pass
- [x] Documentation updated
