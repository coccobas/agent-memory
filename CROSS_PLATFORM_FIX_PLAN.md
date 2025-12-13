# Cross-Platform and IDE Compatibility Fix Plan

## Executive Summary

This document outlines a comprehensive plan to make the Agent Memory MCP server fully compatible across all operating systems (Windows, macOS, Linux) and IDEs (Cursor, VSCode, IntelliJ, Antigravity, Neovim, Emacs, Sublime, and others).

**Project**: Agent Memory v0.7.3
**Goal**: Universal IDE and OS compatibility
**Estimated Impact**: 50+ code locations across 15+ files

---

## Table of Contents

1. [Critical Issues](#1-critical-issues)
2. [High Priority Issues](#2-high-priority-issues)
3. [Medium Priority Issues](#3-medium-priority-issues)
4. [Low Priority Issues](#4-low-priority-issues)
5. [Implementation Plan by File](#5-implementation-plan-by-file)
6. [Testing Strategy](#6-testing-strategy)
7. [Rollback Plan](#7-rollback-plan)

---

## 1. Critical Issues

### 1.1 Debug Telemetry Breaking MCP Protocol

**Severity**: CRITICAL
**Impact**: Causes agent execution failures in Antigravity IDE and potentially other IDEs
**Files Affected**:

- `src/db/repositories/scopes.ts` (7 instances, lines 260-377)
- `src/mcp/handlers/scopes.handler.ts` (7 instances, lines 147-264)

**Current Code Pattern**:

```typescript
fetch('http://127.0.0.1:7242/ingest/ed4dad30-4ac8-4940-ab0c-6f851ddd4464', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ... }),
}).catch(() => {});
```

**Problem**: Even with `.catch(() => {})`, these async fetch calls:

1. Create untracked promises that can interfere with Node.js event loop
2. May cause timing issues with MCP protocol responses
3. Violate the principle of no side-effects in MCP handlers

**Fix**: Remove all debug telemetry code blocks marked with `#region agent log`. These appear to be development debugging code that should not be in production.

**Action Items**:

- [ ] Remove all 7 fetch calls in `scopes.ts` (lines 260-377)
- [ ] Remove all 7 fetch calls in `scopes.handler.ts` (lines 147-264)
- [ ] Search for any other instances of this pattern

---

### 1.2 Excessive console.error Output Breaking IDEs

**Severity**: CRITICAL
**Impact**: Pollutes stderr stream, can break MCP JSON-RPC in some IDEs
**Files Affected**:

- `src/mcp/server.ts` (40+ console.error calls)
- `src/index.ts` (4 console.error calls)
- `src/services/ide-export.service.ts` (1 console.error)
- `src/services/ide-import.service.ts` (2 console.error)

**Problem**: MCP uses stdio for communication. While stderr is technically separate from stdout:

1. Some IDEs merge stdout/stderr streams
2. Excessive logging creates performance overhead
3. Some IDEs parse stderr for errors and may misinterpret logging
4. Not using the structured pino logger means missing log levels and filtering

**Current Pattern in server.ts**:

```typescript
console.error('[MCP] Creating server...');
console.error('[MCP] Server instance created');
console.error('[MCP] Initializing database...');
// ... 40+ more calls
```

**Fix**: Replace all console.error calls with the structured pino logger.

**Action Items**:

- [ ] Replace console.error with logger in `server.ts` (40+ locations)
- [ ] Replace console.error with logger in `index.ts` (4 locations)
- [ ] Replace console.error with logger in `ide-export.service.ts` (1 location, line 749)
- [ ] Replace console.error with logger in `ide-import.service.ts` (2 locations, lines 169, 279)
- [ ] Add environment variable `AGENT_MEMORY_DEBUG` to control verbose logging

---

### 1.3 Process Exit Without Database Cleanup

**Severity**: CRITICAL
**Impact**: Can leave database locks, WAL files, and corrupt state
**File**: `src/mcp/server.ts` (lines 1537-1550)

**Current Code**:

```typescript
process.on('uncaughtException', (error) => {
  console.error('[MCP] UNCAUGHT EXCEPTION:', error);
  process.exit(1); // NO closeDb() call!
});

process.on('unhandledRejection', (reason) => {
  console.error('[MCP] UNHANDLED REJECTION:', reason);
  process.exit(1); // NO closeDb() call!
});
```

**Problem**:

- `uncaughtException` and `unhandledRejection` handlers exit without calling `closeDb()`
- This can leave SQLite WAL files (.db-wal, .db-shm) in inconsistent state
- Windows is especially sensitive to file lock issues

**Fix**: Add proper cleanup before exit in all error handlers.

**Action Items**:

- [ ] Add `closeDb()` call in `uncaughtException` handler
- [ ] Add `closeDb()` call in `unhandledRejection` handler
- [ ] Add `closeDb()` call in startup failure catch block (line 1550)
- [ ] Consider adding a small delay after closeDb() before exit

---

## 2. High Priority Issues

### 2.1 Cross-Platform Path Detection in Logger

**Severity**: HIGH
**Impact**: MCP server detection may fail on Windows
**File**: `src/utils/logger.ts` (line 38)

**Current Code**:

```typescript
const isMcpServer =
  process.stdin.isTTY === false ||
  process.argv[1]?.endsWith('index.js') ||
  process.argv[1]?.endsWith('index.ts') ||
  process.argv[1]?.includes('/dist/index.js'); // Hardcoded forward slash!
```

**Problem**: Windows paths use backslashes (`\`), so `includes('/dist/index.js')` will never match on Windows.

**Fix**: Normalize path separators before comparison.

**Action Items**:

- [ ] Import `sep` from `node:path` or use `path.normalize()`
- [ ] Replace `/dist/index.js` with platform-agnostic pattern
- [ ] Consider using `path.basename()` for more robust comparison

**Corrected Code**:

```typescript
import { sep, normalize } from 'node:path';

const normalizedArg = process.argv[1] ? normalize(process.argv[1]) : '';
const isMcpServer =
  process.stdin.isTTY === false ||
  normalizedArg.endsWith('index.js') ||
  normalizedArg.endsWith('index.ts') ||
  normalizedArg.includes(`${sep}dist${sep}index.js`) ||
  (normalizedArg.includes(`${sep}dist${sep}`) && normalizedArg.endsWith('index.js'));
```

---

### 2.2 Inconsistent Main Module Detection

**Severity**: HIGH
**Impact**: Entry point detection differs between files
**Files**:

- `src/utils/logger.ts` (lines 34-38)
- `src/index.ts` (lines 14-17)

**Problem**: Two different detection patterns exist:

**logger.ts**:

```typescript
const isMcpServer =
  process.stdin.isTTY === false ||
  process.argv[1]?.endsWith('index.js') ||
  process.argv[1]?.endsWith('index.ts') ||
  process.argv[1]?.includes('/dist/index.js');
```

**index.ts**:

```typescript
const isMainModule =
  process.argv[1]?.endsWith('index.js') ||
  process.argv[1]?.endsWith('index.ts') ||
  process.argv[1]?.includes('agent-memory');
```

**Fix**: Create a unified utility function for module detection.

**Action Items**:

- [ ] Create `src/utils/runtime.ts` with shared detection logic
- [ ] Export `isMcpServer()` and `isMainModule()` functions
- [ ] Update both `logger.ts` and `index.ts` to use shared utility
- [ ] Handle Windows path separators in all patterns

---

### 2.3 Debug Log File in Project Root

**Severity**: HIGH
**Impact**: Creates unwanted files, potential security issue
**File**: `src/utils/logger.ts` (lines 41-62)

**Current Code**:

```typescript
const debugLogPath = join(process.cwd(), '.ide-debug.log');
appendFileSync(debugLogPath, logEntry);
```

**Problem**:

1. Writes to project root on every logger initialization
2. May fail in read-only environments
3. Creates file that could leak internal state
4. Silent error handling hides failures

**Fix**: Make debug logging optional and use a better location.

**Action Items**:

- [ ] Gate debug logging behind `AGENT_MEMORY_DEBUG=1` environment variable
- [ ] Write to temp directory instead of project root
- [ ] Or remove this debug code entirely for production

---

### 2.4 Native Module Error Handling

**Severity**: HIGH
**Impact**: Unhelpful errors when better-sqlite3 fails to load
**Files**:

- `src/db/connection.ts` (line 18)
- `src/services/file-sync.service.ts` (line 11)

**Problem**: `better-sqlite3` is a native module that requires compilation. If the native binding fails:

1. No helpful error message is shown
2. User doesn't know to run `npm rebuild`
3. Different architectures (x64 vs ARM) may have issues

**Fix**: Add try-catch around native module import with helpful error message.

**Action Items**:

- [ ] Wrap Database import in try-catch
- [ ] Provide helpful error messages for common failures:
  - Missing native binding
  - Architecture mismatch
  - Node version mismatch
- [ ] Suggest `npm rebuild better-sqlite3` in error message

---

## 3. Medium Priority Issues

### 3.1 Cursor Database Lock Handling

**Severity**: MEDIUM
**Impact**: Sync to Cursor fails if Cursor is running
**File**: `src/services/file-sync.service.ts` (lines 545-651)

**Current Code**:

```typescript
const db = new Database(dbPath); // No lock detection or timeout
```

**Problem**:

1. No detection if database is locked by running Cursor
2. No timeout configuration
3. Error message could be more helpful

**Fix**: Add lock detection and better error handling.

**Action Items**:

- [ ] Check if database is locked before attempting to open
- [ ] Add timeout option for database operations
- [ ] Improve error message to explain Cursor must be closed
- [ ] Consider using `readonly: true` with `PRAGMA wal_checkpoint` approach

---

### 3.2 Silent Error Swallowing

**Severity**: MEDIUM
**Impact**: Debugging becomes difficult
**Files**: Multiple

**Patterns Found**:

```typescript
// Pattern 1: Empty catch
.catch(() => {})

// Pattern 2: Silent continue
} catch {
  // Ignore JSON parse errors
}

// Pattern 3: Log but continue
} catch (error) {
  console.error(`Failed to export:`, error);
  // Continue with other IDEs if one fails
}
```

**Fix**: Replace with proper error handling or structured logging.

**Action Items**:

- [ ] Replace `.catch(() => {})` with `.catch(err => logger.debug('...', err))`
- [ ] Add context to silent catches with `logger.trace()`
- [ ] For critical operations, propagate errors instead of swallowing

---

### 3.3 IDE Environment Variable Detection

**Severity**: MEDIUM
**Impact**: Missing some IDE-specific environment variables
**File**: `src/utils/ide-detector.ts` (lines 151-170)

**Current Variables Checked**:

```typescript
const envHints: Record<string, string> = {
  CURSOR: 'cursor',
  VSCODE: 'vscode',
  INTELLIJ_IDEA: 'intellij',
  // ... etc
};
```

**Missing Variables**:

- `TERM_PROGRAM` (common on macOS)
- `VSCODE_GIT_ASKPASS_NODE` (VSCode specific)
- `CURSOR_AGENT_ID` (Cursor specific)
- `ANTIGRAVITY_*` variables
- `JETBRAINS_IDE` (IntelliJ family)

**Action Items**:

- [ ] Add additional environment variable checks
- [ ] Add `TERM_PROGRAM` detection for macOS
- [ ] Add VSCode-specific variable detection
- [ ] Document which environment variables each IDE sets

---

## 4. Low Priority Issues

### 4.1 Test File console Usage

**Severity**: LOW
**Impact**: Only affects test output
**File**: `src/test-init.ts` (lines 10-56)

**Note**: This is a test utility file, not production code. Lower priority but should still be cleaned up for consistency.

**Action Items**:

- [ ] Consider converting to logger or keeping console for test output
- [ ] Mark as intentional if keeping console

---

### 4.2 Windows-Specific Path Considerations

**Severity**: LOW
**Impact**: Edge cases on Windows
**Files**: Various

**Potential Issues**:

1. Path length limits (MAX_PATH = 260 on older Windows)
2. Reserved filenames (CON, PRN, AUX, NUL, etc.)
3. Case sensitivity differences

**Action Items**:

- [ ] Add path length validation for Windows
- [ ] Add reserved filename check for Windows
- [ ] Document Windows-specific limitations

---

## 5. Implementation Plan by File

### Phase 1: Critical Fixes (Day 1)

| File                                 | Changes                                | Priority |
| ------------------------------------ | -------------------------------------- | -------- |
| `src/db/repositories/scopes.ts`      | Remove 7 debug telemetry blocks        | CRITICAL |
| `src/mcp/handlers/scopes.handler.ts` | Remove 7 debug telemetry blocks        | CRITICAL |
| `src/mcp/server.ts`                  | Fix process.exit cleanup (3 locations) | CRITICAL |

### Phase 2: Logging Cleanup (Day 2)

| File                                 | Changes                               | Priority |
| ------------------------------------ | ------------------------------------- | -------- |
| `src/mcp/server.ts`                  | Replace 40+ console.error with logger | HIGH     |
| `src/index.ts`                       | Replace 4 console.error with logger   | HIGH     |
| `src/services/ide-export.service.ts` | Replace 1 console.error with logger   | HIGH     |
| `src/services/ide-import.service.ts` | Replace 2 console.error with logger   | HIGH     |

### Phase 3: Path Compatibility (Day 3)

| File                   | Changes                      | Priority |
| ---------------------- | ---------------------------- | -------- |
| `src/utils/logger.ts`  | Fix Windows path detection   | HIGH     |
| `src/utils/runtime.ts` | Create new shared utility    | HIGH     |
| `src/index.ts`         | Use shared runtime detection | HIGH     |

### Phase 4: Error Handling (Day 4)

| File                                | Changes                            | Priority |
| ----------------------------------- | ---------------------------------- | -------- |
| `src/db/connection.ts`              | Add native module error handling   | HIGH     |
| `src/services/file-sync.service.ts` | Add Cursor lock detection          | MEDIUM   |
| Multiple files                      | Replace empty catches with logging | MEDIUM   |

### Phase 5: Enhancements (Day 5)

| File                        | Changes                          | Priority |
| --------------------------- | -------------------------------- | -------- |
| `src/utils/ide-detector.ts` | Add more environment variables   | MEDIUM   |
| `src/utils/logger.ts`       | Make debug logging optional      | HIGH     |
| Various                     | Add Windows-specific validations | LOW      |

---

## 6. Testing Strategy

### 6.1 Unit Tests Required

| Test                 | Description                          |
| -------------------- | ------------------------------------ |
| `runtime.test.ts`    | Test new runtime detection utility   |
| `logger.test.ts`     | Test Windows path handling in logger |
| `connection.test.ts` | Test native module error handling    |
| `file-sync.test.ts`  | Test Cursor lock detection           |

### 6.2 Integration Tests Required

| Test                  | Description                                  |
| --------------------- | -------------------------------------------- |
| MCP stdio test        | Verify no unexpected output to stdout/stderr |
| Windows path test     | Test with backslash paths                    |
| Database cleanup test | Verify WAL files cleaned on exit             |

### 6.3 Manual Testing Checklist

- [ ] Test on macOS with Cursor
- [ ] Test on macOS with VSCode
- [ ] Test on Windows with Cursor
- [ ] Test on Windows with VSCode
- [ ] Test on Linux with Cursor
- [ ] Test on Linux with VSCode
- [ ] Test on Antigravity IDE
- [ ] Test database recovery after crash

---

## 7. Rollback Plan

### 7.1 Git Tags

Before starting, create a tag:

```bash
git tag -a v0.7.3-pre-compat -m "Before cross-platform compatibility changes"
```

### 7.2 Incremental Commits

Make changes in small, atomic commits:

1. One commit per file or related group
2. Each commit should be independently revertable
3. Include clear commit messages

### 7.3 Feature Flags

For risky changes, consider adding feature flags:

```typescript
const ENABLE_NEW_LOGGING = process.env.AGENT_MEMORY_NEW_LOGGING === '1';
```

---

## Appendix A: Full File List

| File                                 | Issue Count | Critical |
| ------------------------------------ | ----------- | -------- |
| `src/mcp/server.ts`                  | 45+         | Yes      |
| `src/db/repositories/scopes.ts`      | 7           | Yes      |
| `src/mcp/handlers/scopes.handler.ts` | 7           | Yes      |
| `src/index.ts`                       | 5           | Yes      |
| `src/utils/logger.ts`                | 3           | Yes      |
| `src/services/file-sync.service.ts`  | 2           | No       |
| `src/services/ide-export.service.ts` | 1           | No       |
| `src/services/ide-import.service.ts` | 2           | No       |
| `src/db/connection.ts`               | 1           | No       |
| `src/utils/ide-detector.ts`          | 1           | No       |

---

## Appendix B: Environment Variables

### Current Variables

| Variable                 | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `AGENT_MEMORY_DB_PATH`   | Custom database path                               |
| `AGENT_MEMORY_PERF`      | Enable performance logging                         |
| `AGENT_MEMORY_CACHE`     | Enable query caching                               |
| `AGENT_MEMORY_SKIP_INIT` | Skip auto-initialization                           |
| `LOG_LEVEL`              | Log level (fatal, error, warn, info, debug, trace) |

### Proposed New Variables

| Variable               | Purpose                    |
| ---------------------- | -------------------------- |
| `AGENT_MEMORY_DEBUG`   | Enable debug file logging  |
| `AGENT_MEMORY_VERBOSE` | Enable verbose MCP logging |

---

## Appendix C: Code Snippets for Fixes

### C.1 Unified Runtime Detection

Create `src/utils/runtime.ts`:

```typescript
/**
 * Runtime detection utilities
 * Cross-platform compatible detection for MCP server mode
 */

import { normalize, sep } from 'node:path';

/**
 * Normalize a path for cross-platform comparison
 */
function normalizePath(path: string | undefined): string {
  if (!path) return '';
  return normalize(path).toLowerCase();
}

/**
 * Check if running as MCP server (stdio mode)
 */
export function isMcpServerMode(): boolean {
  // stdin not a TTY means piped/stdio mode
  if (process.stdin.isTTY === false) {
    return true;
  }

  const scriptPath = normalizePath(process.argv[1]);

  // Check for index.js or index.ts entry point
  if (scriptPath.endsWith('index.js') || scriptPath.endsWith('index.ts')) {
    return true;
  }

  // Check for dist directory pattern (cross-platform)
  const distPattern = `${sep}dist${sep}`.toLowerCase();
  if (scriptPath.includes(distPattern) && scriptPath.endsWith('index.js')) {
    return true;
  }

  return false;
}

/**
 * Check if this is the main module being executed
 */
export function isMainModule(): boolean {
  const scriptPath = normalizePath(process.argv[1]);

  return (
    scriptPath.endsWith('index.js') ||
    scriptPath.endsWith('index.ts') ||
    scriptPath.includes('agent-memory')
  );
}

/**
 * Get platform-specific path separator info
 */
export function getPlatformInfo(): { sep: string; isWindows: boolean; isMac: boolean } {
  return {
    sep,
    isWindows: process.platform === 'win32',
    isMac: process.platform === 'darwin',
  };
}
```

### C.2 Fixed Logger Configuration

Update `src/utils/logger.ts`:

```typescript
import pino from 'pino';
import { isMcpServerMode } from './runtime.js';

// Only write debug logs if explicitly enabled
const DEBUG_ENABLED = process.env.AGENT_MEMORY_DEBUG === '1';

function getLogLevel(): pino.Level {
  const envLevel = process.env.LOG_LEVEL;
  if (envLevel && ['fatal', 'error', 'warn', 'info', 'debug', 'trace'].includes(envLevel)) {
    return envLevel as pino.Level;
  }
  return 'info';
}

const logLevel = getLogLevel();
const isMcpServer = isMcpServerMode();

// Conditional debug logging to temp file
if (DEBUG_ENABLED) {
  try {
    const { tmpdir } = await import('node:os');
    const { appendFileSync } = await import('node:fs');
    const { join } = await import('node:path');

    const debugLogPath = join(tmpdir(), 'agent-memory-debug.log');
    const logEntry =
      JSON.stringify({
        timestamp: Date.now(),
        isMcpServer,
        argv1: process.argv[1],
        platform: process.platform,
      }) + '\n';
    appendFileSync(debugLogPath, logEntry);
  } catch {
    // Ignore debug log errors
  }
}

export const logger = isMcpServer
  ? pino({ level: logLevel }, pino.destination({ dest: 2, sync: false }))
  : pino({
      level: logLevel,
      ...(process.env.NODE_ENV !== 'production' && {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      }),
    });

export function createComponentLogger(component: string): pino.Logger {
  return logger.child({ component });
}
```

### C.3 Fixed Process Exit Handlers

Update `src/mcp/server.ts`:

```typescript
// Graceful shutdown helper
function gracefulShutdown(code: number, reason: string): never {
  try {
    logger.info({ code, reason }, 'Shutting down MCP server');
    closeDb();
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
  }
  process.exit(code);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  gracefulShutdown(0, 'Received SIGINT');
});

process.on('SIGTERM', () => {
  gracefulShutdown(0, 'Received SIGTERM');
});

// Log unhandled errors - now with cleanup!
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  gracefulShutdown(1, 'Uncaught exception');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  gracefulShutdown(1, 'Unhandled rejection');
});
```

---

## Appendix D: Verification Commands

After implementing fixes, run these commands:

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Unit tests
npm run test:run

# Full validation
npm run validate

# Build and test
npm run ci:test

# Test on Windows (if available)
# Cross-compile or use CI
```

---

## Sign-off

| Role        | Name         | Date       | Status   |
| ----------- | ------------ | ---------- | -------- |
| Author      | AI Assistant | 2025-12-13 | Complete |
| Reviewer    |              |            | Pending  |
| Implementer |              |            | Pending  |

---

_Document Version: 1.0_
_Last Updated: 2025-12-13_
