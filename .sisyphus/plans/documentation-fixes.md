# Documentation Fixes Plan

## Context

### Original Request

Analyze the agent-memory codebase and update documentation removing/correcting what is wrong.

### Interview Summary

**Key Research Findings**:

- MCP tool count: README claims "20+ tools" but actual implementation has **50 tool descriptors**
- Missing Docker guide: `docs/guides/docker.md` is referenced but doesn't exist
- Duplicate env vars docs: `env-vars.md` (newer, 348 lines) vs `environment-variables.md` (older, 257 lines)
- Outdated roadmap: Windows/Linux marked "Not tested" but platform guides exist
- Hook description: Implies runtime blocking but is actually IDE hook file generation

### Metis Review

**Identified Gaps** (addressed in plan):

- Need decision on exact tool count to advertise (50 vs 50+)
- Need decision on env vars file consolidation strategy
- Need to find all "20+" occurrences before editing
- Cursor/VS Code hooks confirmed still "In development" - no change needed

---

## Work Objectives

### Core Objective

Fix documentation inaccuracies in README.md and resolve duplicate/missing documentation files.

### Concrete Deliverables

- Updated README.md with correct tool counts and fixed links
- Resolved environment variables documentation (single source of truth)
- All internal documentation links verified working

### Definition of Done

- [x] All tool count references updated from "20+" to "50"
- [x] Docker guide link removed from README.md
- [x] Environment variables documentation consolidated
- [x] Roadmap statuses updated for Windows/Linux
- [x] All internal documentation links verified

### Must Have

- Accurate tool count (50 tools)
- No broken documentation links
- Single source of truth for environment variables

### Must NOT Have (Guardrails)

- DO NOT create new docker.md file (just remove broken link)
- DO NOT change tool visibility logic in mcp-tools.md
- DO NOT modify any TypeScript/JavaScript code
- DO NOT restructure docs folder organization
- DO NOT change hooks behavior description to be less accurate

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: NO (documentation only)
- **User wants tests**: Manual verification
- **QA approach**: Manual link verification

### Manual Verification

Each TODO includes verification that changed links work and content is accurate.

---

## Task Flow

```
Task 1 (Find all "20+" occurrences)
    ↓
Task 2 (Update README.md tool counts)
    ↓
Task 3 (Fix README.md broken Docker link)
    ↓
Task 4 (Update README.md roadmap)
    ↓
Task 5 (Consolidate env vars documentation)
    ↓
Task 6 (Update README.md env vars link)
    ↓
Task 7 (Verify all links)
```

## Parallelization

| Task | Depends On | Reason                         |
| ---- | ---------- | ------------------------------ |
| 1    | None       | Discovery task                 |
| 2    | 1          | Needs list of occurrences      |
| 3    | None       | Independent                    |
| 4    | None       | Independent                    |
| 5    | None       | Independent                    |
| 6    | 5          | Needs final file name          |
| 7    | 2,3,4,5,6  | Verification after all changes |

**Parallelizable**: Tasks 3, 4, 5 can run in parallel after Task 1 completes.

---

## TODOs

- [x] 1. Find all "20+" tool count references

  **What to do**:
  - Search entire codebase for "20+" and "20+ tools" references
  - Document all files and line numbers that need updating
  - Include: README.md, rules files, docs guides, any other markdown
  - Note: `docs/guides/examples.md:265` has "Node.js 20+" which is a version requirement, NOT tool count - exclude from updates

  **Must NOT do**:
  - Do not edit files yet, just discover
  - Do not confuse "Node.js 20+" (version) with "20+ tools" (tool count)

  **Parallelizable**: NO (discovery task, others depend on it)

  **References** (Known occurrences - verify with grep):
  - `README.md:236` - Rules Sync table "All 20+ MCP tools"
  - `README.md:293` - Documentation table "All 20+ tools documented"
  - `docs/guides/rules-sync.md:79` - "Complete reference for all 20+ MCP tools"
  - `rules/auto-memory-reference.md` - Already correct: "Auto-generated from 50 MCP tool descriptors"

  **Acceptance Criteria**:
  - [ ] Run: `grep -rn "20+ MCP\|20+ tools" --include="*.md" .`
  - [ ] Confirm exactly 3 tool count occurrences found (2 in README, 1 in rules-sync.md)
  - [ ] Exclude Node.js version references from updates

  **Commit**: NO (discovery only)

---

- [x] 2. Update tool count references in README.md and docs

  **What to do**:
  - Update `README.md:236`: "All 20+ MCP tools" → "All 50 MCP tools"
  - Update `README.md:293`: "All 20+ tools documented" → "All 50 tools documented"
  - Update `docs/guides/rules-sync.md:79`: "Complete reference for all 20+ MCP tools" → "Complete reference for all 50 MCP tools"

  **Must NOT do**:
  - Do not change the actual tool visibility logic
  - Do not update mcp-tools.md (it uses visibility filtering intentionally)
  - Do not change Node.js version references ("Node.js 20+")

  **Parallelizable**: NO (depends on Task 1)

  **References**:
  - `README.md:236` - Rules Sync table
  - `README.md:293` - Documentation table
  - `docs/guides/rules-sync.md:79` - Rules sync guide description
  - `src/mcp/descriptors/index.ts` - Source of truth: 50 descriptors in allDescriptors array

  **Acceptance Criteria**:
  - [ ] README.md line 236 contains "All 50 MCP tools"
  - [ ] README.md line 293 contains "All 50 tools documented"
  - [ ] docs/guides/rules-sync.md line 79 contains "all 50 MCP tools"
  - [ ] Run: `grep -rn "20+ MCP\|20+ tools" --include="*.md" .` → No results (tool count refs only)

  **Commit**: YES
  - Message: `docs: update MCP tool count from 20+ to 50`
  - Files: `README.md`, `docs/guides/rules-sync.md`

---

- [x] 3. Fix README.md broken Docker link

  **What to do**:
  - Remove line 291: `| [Docker Deployment](docs/guides/docker.md)         | Container deployment      |`
  - The file `docs/guides/docker.md` does not exist

  **Must NOT do**:
  - Do not create a docker.md file
  - Do not add a placeholder

  **Parallelizable**: YES (with 4, 5)

  **References**:
  - `README.md:291` - Broken link row
  - Verified: `docs/guides/docker.md` does NOT exist

  **Acceptance Criteria**:
  - [ ] Docker Deployment row removed from Documentation table
  - [ ] No broken links in README.md documentation section

  **Commit**: YES
  - Message: `docs(readme): remove non-existent Docker guide link`
  - Files: `README.md`

---

- [x] 4. Update README.md roadmap statuses

  **What to do**:
  - Update line 306: Windows `🧪 Not tested` → `📝 Documented`
  - Update line 307: Linux `🧪 Not tested` → `📝 Documented`
  - Keep Cursor/VS Code hooks as "🚧 In development" (confirmed accurate)

  **Must NOT do**:
  - Do not claim "✅ Supported" without CI validation
  - Do not change Cursor/VS Code hook status

  **Parallelizable**: YES (with 3, 5)

  **References**:
  - `README.md:306-307` - Roadmap table
  - `docs/guides/platform/windows.md` - Exists (299 lines)
  - `docs/guides/platform/linux.md` - Exists (370 lines)

  **Acceptance Criteria**:
  - [ ] Windows row shows "📝 Documented"
  - [ ] Linux row shows "📝 Documented"
  - [ ] Cursor/VS Code rows unchanged

  **Commit**: YES
  - Message: `docs(readme): update roadmap status for Windows/Linux`
  - Files: `README.md`

---

- [x] 5. Consolidate environment variables documentation

  **What to do**:
  - Keep `docs/reference/env-vars.md` (newer, more complete: 348 lines)
  - Delete `docs/reference/environment-variables.md` (older, missing vars: 257 lines)
  - Ensure `env-vars.md` has the auto-generated marker preserved

  **Must NOT do**:
  - Do not merge files manually (env-vars.md is already more complete)
  - Do not modify auto-generated content

  **Parallelizable**: YES (with 3, 4)

  **References**:
  - `docs/reference/env-vars.md` - Keep (has PG_SSL_REJECT_UNAUTHORIZED, VECTOR_BACKEND, Capture, RL, QueryRewrite, LoRA sections)
  - `docs/reference/environment-variables.md` - Delete (missing these sections)

  **Acceptance Criteria**:
  - [ ] Only `docs/reference/env-vars.md` exists
  - [ ] `docs/reference/environment-variables.md` is deleted
  - [ ] File contains `<!-- AUTO-GENERATED:ENV-VARS-START -->` marker

  **Commit**: YES
  - Message: `docs: consolidate environment variables to env-vars.md`
  - Files: `docs/reference/environment-variables.md` (deleted)

---

- [x] 6. Update all environment-variables.md links (13 files)

  **What to do**:
  Update ALL references from `environment-variables.md` to `env-vars.md` in these files:

  | File                                   | Line   | Change                                                                   |
  | -------------------------------------- | ------ | ------------------------------------------------------------------------ |
  | `README.md`                            | 282    | `docs/reference/environment-variables.md` → `docs/reference/env-vars.md` |
  | `docs/index.md`                        | 70     | `reference/environment-variables.md` → `reference/env-vars.md`           |
  | `docs/reference/rest-api.md`           | 426    | Update link path                                                         |
  | `docs/reference/mcp-tools.md`          | 572    | Update link path                                                         |
  | `docs/reference/cli.md`                | 625    | Update link path                                                         |
  | `docs/SCALING.md`                      | 626    | Update link path                                                         |
  | `docs/reference/scaling-by-service.md` | 5, 436 | Update link paths (2 occurrences)                                        |
  | `docs/contributing/documentation.md`   | 355    | Update link path                                                         |
  | `docs/guides/postgresql-setup.md`      | 327    | Update link path                                                         |
  | `docs/guides/performance.md`           | 478    | Update link path                                                         |
  | `docs/guides/troubleshooting.md`       | 721    | Update link path                                                         |
  | `docs/explanation/security-model.md`   | 258    | Update link path                                                         |

  **Must NOT do**:
  - Do not change the link text, only the URL paths

  **Parallelizable**: NO (depends on Task 5)

  **References**:
  - Run `grep -rn "environment-variables.md" --include="*.md" .` to verify all 13 occurrences in 12 files
  - Each link should point to `env-vars.md` instead of `environment-variables.md`

  **Acceptance Criteria**:
  - [ ] All 13 references updated across 12 files
  - [ ] Run: `grep -rn "environment-variables.md" --include="*.md" .` → No results
  - [ ] Link text unchanged in all files
  - [ ] Verify with: `grep -rn "env-vars.md" --include="*.md" docs/ | wc -l` → At least 13 results

  **Commit**: YES
  - Message: `docs: update all env vars documentation links`
  - Files: `README.md`, `docs/index.md`, `docs/reference/rest-api.md`, `docs/reference/mcp-tools.md`, `docs/reference/cli.md`, `docs/SCALING.md`, `docs/reference/scaling-by-service.md`, `docs/contributing/documentation.md`, `docs/guides/postgresql-setup.md`, `docs/guides/performance.md`, `docs/guides/troubleshooting.md`, `docs/explanation/security-model.md`

---

- [x] 7. Verify all documentation links

  **What to do**:
  - Check all internal links in README.md resolve correctly
  - Check all links in docs/index.md resolve correctly
  - Verify no broken anchor links
  - Specifically verify the updated env-vars.md links work

  **Must NOT do**:
  - Do not fix links not identified in this plan (out of scope)

  **Parallelizable**: NO (final verification)

  **References**:
  - `README.md` - All `docs/` links
  - `docs/index.md` - Navigation links (key file for docs navigation)

  **Acceptance Criteria**:
  - [ ] All README.md `docs/` links resolve to existing files
  - [ ] All docs/index.md links resolve to existing files
  - [ ] No 404s when following documentation links
  - [ ] Run: `ls docs/reference/env-vars.md` → File exists
  - [ ] Run: `ls docs/reference/environment-variables.md` → File does NOT exist
  - [ ] Run: `grep -l "environment-variables.md" README.md docs/index.md` → No results

  **Commit**: NO (verification only)

---

## Commit Strategy

| After Task | Message                                                  | Files                                | Verification                                      |
| ---------- | -------------------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| 2          | `docs: update MCP tool count from 20+ to 50`             | README.md, docs/guides/rules-sync.md | grep -rn "20+ MCP\|20+ tools" --include="\*.md" . |
| 3          | `docs(readme): remove non-existent Docker guide link`    | README.md                            | N/A                                               |
| 4          | `docs(readme): update roadmap status for Windows/Linux`  | README.md                            | N/A                                               |
| 5          | `docs: consolidate environment variables to env-vars.md` | (delete) environment-variables.md    | ls docs/reference/\*.md                           |
| 6          | `docs: update all env vars documentation links`          | 12 files (see Task 6 details)        | grep -rn "environment-variables.md" .             |

**Alternative**: Combine all into single commit:

- Message: `docs: fix documentation inaccuracies and broken links`
- Files: README.md, docs/guides/rules-sync.md, docs/index.md, docs/reference/environment-variables.md (deleted), plus 10 additional docs files listed in Task 6

---

## Success Criteria

### Verification Commands

```bash
# No "20+" references in README
grep -n "20+" README.md  # Expected: No results

# No broken Docker link
grep -n "docker.md" README.md  # Expected: No results

# Only one env vars file
ls docs/reference/*env*.md  # Expected: env-vars.md only

# README link updated
grep -n "env-vars.md" README.md  # Expected: Line 282

# Roadmap updated
grep -A5 "Roadmap" README.md | grep -E "Windows|Linux"  # Expected: "Documented"
```

### Final Checklist

- [x] Tool counts updated to 50 in README.md (2 occurrences)
- [x] Tool counts updated to 50 in docs/guides/rules-sync.md (1 occurrence)
- [x] Docker guide link removed from README.md
- [x] Windows/Linux roadmap shows "📝 Documented"
- [x] Single env vars file exists (env-vars.md only)
- [x] All 13 environment-variables.md links updated across 12 files
- [x] All documentation links verified working
- [x] `grep -rn "environment-variables.md" --include="*.md" .` returns no results
