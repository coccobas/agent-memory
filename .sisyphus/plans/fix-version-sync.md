# Fix CLI Version Sync

## TL;DR

> **Quick Summary**: Fix hardcoded version in CLI to read from package.json dynamically
>
> **Deliverables**:
>
> - Updated `src/cli/index.ts` to read version from package.json
> - Rebuilt dist/ with correct version
>
> **Estimated Effort**: Quick (5 minutes)
> **Parallel Execution**: NO - sequential

---

## Context

### Problem

- `package.json` version: **0.9.16**
- `dist/cli/index.js` hardcoded: **0.9.15**
- Version in source `src/cli/index.ts:42` is manually maintained, causing drift

### Root Cause

Line 42 in `src/cli/index.ts`:

```typescript
const VERSION = '0.9.15';
```

This should read from package.json dynamically.

---

## Work Objectives

### Core Objective

Make CLI version automatically sync with package.json

### Must Have

- Version read from package.json at runtime
- `agent-memory --version` shows correct version after rebuild

### Must NOT Have

- Breaking changes to CLI behavior
- Additional dependencies

---

## TODOs

- [x] 1. Update src/cli/index.ts to read version dynamically

  **What to do**:
  Replace hardcoded VERSION constant with dynamic read from package.json:

  ```typescript
  // Add at top of file, after commander import:
  import { readFileSync } from 'fs';
  import { fileURLToPath } from 'url';
  import { dirname, join } from 'path';

  // Read version from package.json
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const packageJsonPath = join(__dirname, '..', '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const VERSION = packageJson.version;
  ```

  Then DELETE line 42: `const VERSION = '0.9.15';`

  **References**:
  - `src/cli/index.ts:7` - Where to add imports
  - `src/cli/index.ts:42` - Line to replace

  **Acceptance Criteria**:
  - [ ] No hardcoded version string in src/cli/index.ts
  - [ ] `npm run build` completes without errors
  - [ ] `agent-memory --version` outputs `0.9.16`

  **Commit**: YES
  - Message: `fix(cli): read version from package.json dynamically`
  - Files: `src/cli/index.ts`

---

- [x] 2. Rebuild and verify

  **What to do**:

  ```bash
  npm run build
  agent-memory --version  # Should show 0.9.16
  ```

  **Acceptance Criteria**:
  - [ ] Build completes without errors
  - [ ] `agent-memory --version` outputs `0.9.16`
  - [ ] `grep -r "0.9.15" dist/` returns no matches

  **Commit**: NO (build artifacts not committed)

---

## Success Criteria

### Verification Commands

```bash
agent-memory --version  # Expected: 0.9.16
grep "VERSION = '0.9" src/cli/index.ts  # Expected: no hardcoded version
```
