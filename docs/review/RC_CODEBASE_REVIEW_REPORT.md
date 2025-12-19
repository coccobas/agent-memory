# MVP Release Candidate Codebase Review (Critical)

Scope: code-first review (documentation intentionally de-prioritized initially), focused on MVP RC risks: security, correctness, reliability, and release readiness.

## Executive summary

All previously identified release blockers are now resolved. The repository passes its quality gates (`npm run validate`), filesystem safety checks are in place, and REST authentication/permission enforcement has been added. This report is now kept as a record of the prior risks and their fixes.

## What looks good

- The project has a clear architecture split: `src/mcp/*` (MCP server), `src/restapi/*` (Fastify REST), `src/db/*` (Drizzle + migrations), `src/services/*` (business logic), `src/utils/*` (shared utilities).
- Strong TypeScript compiler settings (`strict`, `noUnusedLocals`, `noImplicitReturns`, `noUncheckedIndexedAccess`).
- Good attempt at log safety: `src/utils/sanitize.ts` plus pino redaction in `src/utils/logger.ts`.
- Query caching and memory coordination exist (LRU + coordinator), and rate limiting exists for MCP tool calls.

## Release blockers found (with evidence)

### 1) CI is red (lint/typecheck/tests)

- `npm run validate` fails lint with many errors (unsafe `any`, prettier, `require-await`, `restrict-template-expressions`).
- `npm run typecheck` fails: `src/mcp/handlers/observe.handler.ts:681` uses an undefined `threshold`.
- `npm run test:run` fails 3 tests:
  - `tests/integration/observe.extract.test.ts` (2 failures): `result.entities` is undefined and treated as iterable/array.
  - `tests/unit/consolidation.service.test.ts` (1 failure): recency scoring mismatch.

Status: Resolved. `npm run validate` now passes.

### 2) Arbitrary file write / path traversal via MCP export (high severity)

In `src/mcp/handlers/export.handler.ts`, a user-controlled `filename` is written to disk by joining it to the export directory, without any enforcement that the final resolved path stays within that directory.

Impact: callers can write outside `config.paths.export` using `../` or absolute paths.

Status: Resolved. Filename validation and resolved-path checks prevent escaping the export directory.

### 3) Path traversal / arbitrary overwrite via backup restore (high severity)

In `src/services/backup.service.ts`, `restoreFromBackup(backupFilename)` joins `backupDir` and `backupFilename` without path validation.

Impact: callers can potentially restore from arbitrary paths and overwrite the active DB path.

Status: Resolved. Backup filenames are validated and resolved paths are constrained to the backup directory.

### 4) Permissions default-open behavior (high severity in multi-agent / networked contexts)

`src/services/permission.service.ts` grants full access if:
- the permissions table exists but is empty, or
- the permissions table doesn’t exist yet.

If this is intended for backwards compatibility, it needs to be explicit and gated behind an opt-in flag for any deployment where untrusted agents may connect.

Status: Resolved. Default is now deny; permissive mode requires explicit env opt-in.

### 5) REST API has no auth and does not enforce permissions

`src/restapi/server.ts` exposes query/context endpoints without authentication or permission checks. Even if it binds to localhost by default, this is still risky in shared environments, containers, or misconfigured hosts.

Status: Resolved. REST now requires an API key (unless explicitly disabled) and enforces read permissions.

### 6) Migration system can hide broken states

`src/db/init.ts` can skip statements on “no such table/column” not only for `DROP/ALTER` but also for `INSERT`. This can lead to partially-applied migrations that appear “successful” while leaving the schema inconsistent.

Status: Resolved. Missing-table errors are only tolerated for `DROP`/`ALTER` statements.

### 7) Packaging/publishing is likely broken

`package.json` points runtime entry points to `dist/*`, but `dist/` is not tracked and there is no clear publish-time build enforcement (no `prepare`/`prepublishOnly` building and no `files` allowlist ensuring `dist/` is included).

Net effect: a published package may not run.

Status: Resolved. Build is enforced via `prepare`/`prepublishOnly`.

### 8) Defaults write data under the package directory

Config defaults to `projectRoot/data` (resolved relative to the installed package). Under `node_modules`, that path may be read-only or surprising. MVP should default to a user-writable OS data directory unless configured.

Status: Resolved. When installed under `node_modules`, defaults now point to `~/.agent-memory/data`.

## Recommendation

Proceed with RC labeling once you confirm any remaining non-code checklist items in `docs/review/MUST_FIX_BEFORE_MVP_RC.md`.
