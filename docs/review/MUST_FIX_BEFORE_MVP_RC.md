# Must Fix Before MVP RC

This is a release-blocker checklist based on a critical codebase review and running `npm run validate`, `npm run typecheck`, and `npm run test:run`.
All items below are now resolved unless new blockers are discovered.

## 0) Repo must be releasable

- [x] **Make the repo “green”**: `npm run validate` must pass (lint + prettier + typecheck + tests).
- [ ] **Cut an actual RC commit**: working tree clean (`git status` clean) and CI reproducible from a single SHA.

## 1) Security / data safety (highest priority)

- [x] **Fix path traversal / arbitrary file write in export**
  - `src/mcp/handlers/export.handler.ts:73`–`src/mcp/handlers/export.handler.ts:103`
  - Problem: `filename` is joined to `exportDir` without sanitization; `../` or absolute paths can escape and write anywhere.
  - Fix: enforce “basename only” or enforce resolved path stays under `exportDir`.

- [x] **Fix path traversal in backup restore**
  - `src/services/backup.service.ts:129`–`src/services/backup.service.ts:167`
  - Problem: `restoreFromBackup(backupFilename)` uses `join(backupDir, backupFilename)` without sanitization; can read outside backup dir and overwrite DB.
  - Fix: sanitize to basename; ensure resolved path is inside `backupDir`; reject absolute/parent segments.

- [x] **Fix path traversal in backup create**
  - `src/services/backup.service.ts:28`–`src/services/backup.service.ts:54`
  - Problem: `customName` is used in a filename; can inject directories.
  - Fix: sanitize `customName` to a safe slug/basename; reject separators.

- [x] **Decide and enforce an auth model for REST**
  - `src/restapi/server.ts` (all endpoints)
  - Current state: no authentication, no permission enforcement; anyone who can reach the port can query memory.
  - Fix options (pick one for MVP): bind to localhost only (already default), add token auth, or disable REST by default.

- [x] **Revisit permissions default-open behavior**
  - `src/services/permission.service.ts:55`–`src/services/permission.service.ts:67`
  - Current state: if permissions table is empty or missing, access is granted (“full access”).
  - Fix: default-deny unless explicitly configured; or gate this behind a clear `AGENT_MEMORY_PERMISSIONS_MODE=permissive` flag.

## 2) Correctness / crashers / broken features

- [x] **Fix `memory_observe.extract` crashing on missing `entities`**
  - Crash: `result.entities is not iterable`
  - `src/mcp/handlers/observe.handler.ts:592`
  - Fix: treat missing arrays as empty arrays; validate extraction service response shape before iterating.

- [x] **Fix `memory_observe.extract` crashing on `entities.length`**
  - Crash: `Cannot read properties of undefined (reading 'length')`
  - `src/mcp/handlers/observe.handler.ts:630`
  - Fix: same as above; make result logging robust.

- [x] **Fix incorrect/undefined `threshold` usage**
  - Typecheck error: `Cannot find name 'threshold'. Did you mean 'thresholds'?`
  - `src/mcp/handlers/observe.handler.ts:681`
  - Fix: use the correct variable (likely `confidenceThreshold` or per-type thresholds) when computing `aboveThreshold`.

## 3) Test failures (must be zero)

- [x] **Fix failing integration tests**
  - `tests/integration/observe.extract.test.ts` (2 failing tests)
  - Root cause is in `src/mcp/handlers/observe.handler.ts` (crashes described above).

- [x] **Fix failing unit test for consolidation recency**
  - `tests/unit/consolidation.service.test.ts:241`
  - Problem: computed recency score does not match the test’s expected exponential decay calculation.
  - Fix: align implementation and test (choose one canonical decay function and ensure both use the same).

## 4) Lint/format/typecheck (must be zero errors)

From `npm run lint` failures:

- [x] **Fix unsafe `any`/unsafe member access**
  - `src/commands/hook.ts:82` (`no-unsafe-assignment`)
  - `src/commands/verify-response.ts:116` (`no-unsafe-assignment`)
  - `src/version.ts:11`/`src/version.ts:13` (`no-unsafe-assignment`, `no-unsafe-member-access`)

- [x] **Fix `@typescript-eslint/require-await` issues**
  - `src/restapi/server.ts:39`
  - `src/services/consolidation.service.ts:383`, `:496`, `:594`, `:619`, `:728`

- [x] **Fix `@typescript-eslint/restrict-template-expressions`**
  - `src/services/extraction.service.ts:309`
  - `src/services/hook-generator.service.ts:525`

- [x] **Fix Prettier violations**
  - `src/config/index.ts:521`
  - `src/mcp/handlers/consolidation.handler.ts` (multiple)
  - `src/mcp/handlers/observe.handler.ts` (multiple)
  - `src/services/consolidation.service.ts` (multiple)
  - `src/services/query.service.ts:2079`

## 5) Packaging / installation (likely release-blocker)

- [x] **Ensure published package includes runtime JS**
  - `package.json` points `main`/`bin` to `dist/*`, but `dist/` is not tracked (`.gitignore`) and there is no clear publish pipeline here.
  - Fix: add a `prepare` script (or `prepublishOnly`) to build, and/or configure `files`/`.npmignore` so `dist/` is included in the published tarball.

- [x] **Fix default data paths for non-repo installs**
  - `src/config/index.ts` defaults data directory to `projectRoot/data`.
  - When installed under `node_modules`, this may be read-only or surprising.
  - Fix: default to OS user data directory unless overridden via env vars; keep `AGENT_MEMORY_DATA_DIR` override as-is.

## 6) Migration safety

- [x] **Stop silently skipping migration `INSERT` failures**
  - `src/db/init.ts:214`–`src/db/init.ts:228`
  - Current behavior can hide partially-applied migrations and cause confusing runtime issues.
  - Fix: only allow “doesn’t exist” skips for `DROP` (and maybe some `ALTER`), not for `INSERT`.

## 7) Noise / observability (should fix for MVP polish)

- [x] **Reduce noisy logs in tests**
  - Embedding/vector/connection logs appear during `vitest run`, making CI output noisy.
  - Fix: detect test environment and reduce log level or suppress info/warn where appropriate.
