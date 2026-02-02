# Onboard Actionable Knowledge Extraction

**STATUS: COMPLETE** ✅ (All 17 tasks finished - 2026-02-02)

## TL;DR

> **Quick Summary**: Transform the `memory_onboard` deep scan from extracting useless structural facts ("Found 33 repository files") to actionable knowledge that helps AI agents contribute correctly ("To add a new MCP tool: create descriptor, create handler, register in index").
>
> **Deliverables**:
>
> - Enhanced `deep-scanner.ts` that extracts contribution patterns, workflows, and conventions
> - Parsed package.json scripts stored as Tool entries
> - ADR decisions extracted with context, not just file counts
> - Module boundary detection from import analysis
> - Template directory identification for "copy this for new X" patterns
>
> **Estimated Effort**: Large (3 phases, ~15-20 tasks)
> **Parallel Execution**: YES - 3 waves per phase
> **Critical Path**: Tests setup -> Core extraction -> Integration

---

## Context

### Original Request

User observed that the current `memory_onboard` deep scan extracts useless facts like "Found 33 repository files" instead of actionable knowledge like "Repositories follow `{entity}.repository.ts` pattern". The goal is to make extracted knowledge actually help AI agents work on the codebase.

### Interview Summary

**Key Discussions**:

- Current deep scan bypasses the extraction intelligence layer entirely
- The "usefulness" framework in `prompts.ts` should be applied to codebase analysis
- Actionable = "Would a new team member need this to contribute correctly?"

**Research Findings**:

- `deep-scanner.ts` (587 lines) does filename-only pattern matching, no content reading
- `DeepScanFinding.category` only supports `'fact' | 'decision' | 'reference'` - no `'tool'`
- No tests exist for `deep-scanner.ts`
- Doc import dumps raw content without parsing
- 5 scan areas: architecture, database, api, testing, documentation

### Metis Review

**Identified Gaps** (addressed):

- Schema needs `'tool'` category for parsed scripts
- Package.json scripts need allowlist (not all 50+ scripts)
- ADR parsing needs status filter (only `accepted`)
- Re-run deduplication strategy needed
- LLM features need explicit opt-in flag
- No tests exist - TDD required

---

## Work Objectives

### Core Objective

Transform deep scan output from structural facts to actionable contribution patterns that pass the usefulness test: "Will this help an AI agent contribute correctly in a future session?"

### Concrete Deliverables

- `src/services/onboarding/deep-scanner.ts` - Enhanced with content-aware extraction
- `src/services/onboarding/types.ts` - Extended `DeepScanFinding` category
- `src/services/onboarding/script-extractor.ts` - New: package.json script parsing
- `src/services/onboarding/adr-parser.ts` - New: ADR decision extraction
- `src/services/onboarding/workflow-extractor.ts` - New: CONTRIBUTING.md parsing
- `tests/unit/onboarding/deep-scanner.test.ts` - Comprehensive test coverage

### Definition of Done

- [ ] `bun test tests/unit/onboarding/` - All tests pass (0 failures)
- [ ] `bun test tests/integration/onboarding-flow.test.ts` - Integration tests verify no raw file counts in output
- [ ] Integration tests verify actionable "To do X, run Y" patterns are present
- [ ] Schema supports `'tool'` category for findings

**Note**: The `memory_onboard` MCP tool is invoked via MCP protocol, not CLI. All verification uses unit/integration tests that directly call `DeepScannerService.scan()`.

### Must Have

- Tests written BEFORE implementation (TDD)
- Package.json script extraction with allowlist filter
- ADR parsing with status filter (`accepted` only)
- Deduplication on re-run (upsert or skip existing)
- No LLM calls without explicit `--useLlm` flag

### Must NOT Have (Guardrails)

- Raw file counts stored as knowledge (e.g., "Found 33 files")
- Parsing of `node_modules/`, `dist/`, `.git/`
- All 50+ package.json scripts - only allowlist: `build`, `test`, `start`, `dev`, `lint`, `typecheck`, `format`
- Full ADR content verbatim - only title, status, decision, rationale (1st paragraph)
- LLM calls without explicit flag
- Duplicate entries on re-run
- "User manually tests..." acceptance criteria

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **User wants tests**: YES (TDD)
- **Framework**: Vitest

### TDD Workflow

Each TODO follows RED-GREEN-REFACTOR:

**Task Structure:**

1. **RED**: Write failing test first
   - Test file: `tests/unit/onboarding/deep-scanner.test.ts`
   - Test command: `bun test tests/unit/onboarding/`
   - Expected: FAIL (test exists, implementation doesn't)
2. **GREEN**: Implement minimum code to pass
   - Command: `bun test tests/unit/onboarding/`
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green
   - Command: `bun test tests/unit/onboarding/`
   - Expected: PASS (still)

---

## Execution Strategy

### Parallel Execution Waves

```
PHASE 1: Foundation & Quick Wins
================================
Wave 1.1 (Start Immediately):
├── Task 1: Characterization tests for current behavior
├── Task 2: Extend DeepScanFinding type with 'tool' category
└── Task 3: Create test fixtures (sample package.json, ADR, CONTRIBUTING.md)

Wave 1.2 (After Wave 1.1):
├── Task 4: Package.json script extraction with allowlist
├── Task 5: ADR parser with status filter
└── Task 6: CONTRIBUTING.md workflow extraction

Wave 1.3 (After Wave 1.2):
└── Task 7: Integration tests for Phase 1

PHASE 2: Content-Aware Analysis
===============================
Wave 2.1 (After Phase 1):
├── Task 8: Module boundary detection from top-level dirs
├── Task 9: Template directory identification
└── Task 10: "How to add new X" pattern extraction

Wave 2.2 (After Wave 2.1):
├── Task 11: Import pattern analysis (top-level only)
└── Task 12: Naming convention extraction

Wave 2.3 (After Wave 2.2):
└── Task 13: Integration tests for Phase 2

PHASE 3: LLM-Assisted (Optional, Feature-Flagged)
=================================================
Wave 3.1 (After Phase 2):
├── Task 14: Add --useLlm flag to onboard command
├── Task 15: Integrate extraction prompts for codebase context
└── Task 16: LLM-assisted contribution guide generation

Wave 3.2 (After Wave 3.1):
└── Task 17: End-to-end tests with mocked LLM

Critical Path: Task 1 -> Task 4 -> Task 7 -> Task 8 -> Task 13
```

### Dependency Matrix

| Task | Depends On | Blocks            | Can Parallelize With |
| ---- | ---------- | ----------------- | -------------------- |
| 1    | None       | 4, 5, 6, 8, 9, 10 | 2, 3                 |
| 2    | None       | 4, 5, 6           | 1, 3                 |
| 3    | None       | 4, 5, 6           | 1, 2                 |
| 4    | 1, 2, 3    | 7                 | 5, 6                 |
| 5    | 1, 2, 3    | 7                 | 4, 6                 |
| 6    | 1, 2, 3    | 7                 | 4, 5                 |
| 7    | 4, 5, 6    | 8, 9, 10          | None                 |
| 8    | 7          | 13                | 9, 10                |
| 9    | 7          | 13                | 8, 10                |
| 10   | 7          | 13                | 8, 9                 |
| 11   | 8          | 13                | 12                   |
| 12   | 8          | 13                | 11                   |
| 13   | 11, 12     | 14                | None                 |
| 14   | 13         | 17                | 15, 16               |
| 15   | 13         | 17                | 14, 16               |
| 16   | 13         | 17                | 14, 15               |
| 17   | 14, 15, 16 | None              | None                 |

---

## TODOs

### PHASE 1: Foundation & Quick Wins

---

- [x] 1. Write characterization tests for current deep scanner behavior

  **What to do**:
  - Create `tests/unit/onboarding/deep-scanner.test.ts`
  - Write tests capturing CURRENT behavior (what it does today)
  - Cover all 5 scan areas: architecture, database, api, testing, documentation
  - These tests document existing behavior before changes

  **Must NOT do**:
  - Modify `deep-scanner.ts` yet
  - Write tests for new features (that's later tasks)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test file creation is straightforward, no architectural decisions
  - **Skills**: [`tdd-workflow`]
    - `tdd-workflow`: Ensures proper test structure and coverage patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1.1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6, 8, 9, 10
  - **Blocked By**: None

  **References**:
  - `src/services/onboarding/deep-scanner.ts` - Implementation to characterize
  - `tests/unit/onboarding/guideline-seeder.test.ts` - Test structure pattern to follow
  - `vitest.config.ts` - Test configuration

  **Acceptance Criteria**:
  - [ ] Test file created: `tests/unit/onboarding/deep-scanner.test.ts`
  - [ ] Tests cover all 5 scan areas (architecture, database, api, testing, documentation)
  - [ ] `bun test tests/unit/onboarding/deep-scanner.test.ts` -> PASS (characterizes current behavior)

  **Automated Verification**:

  ```bash
  bun test tests/unit/onboarding/deep-scanner.test.ts
  # Assert: Exit code 0
  # Assert: Output contains "5 passed" or more
  ```

  **Commit**: YES
  - Message: `test(onboarding): add characterization tests for deep-scanner`
  - Files: `tests/unit/onboarding/deep-scanner.test.ts`
  - Pre-commit: `bun test tests/unit/onboarding/deep-scanner.test.ts`

---

- [x] 2. Extend DeepScanFinding type to support 'tool' category

  **What to do**:
  - Modify `src/services/onboarding/types.ts`
  - Add `'tool'` to the `DeepScanFinding.category` union type
  - Add optional `command?: string` field for tool entries
  - Update any type guards or validators

  **Must NOT do**:
  - Change runtime behavior yet
  - Add new files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple type extension, no complex logic
  - **Skills**: [`coding-standards`]
    - `coding-standards`: TypeScript type patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1.1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None

  **References**:
  - `src/services/onboarding/types.ts:147-154` - Current `DeepScanFinding` type definition
  - `src/services/onboarding/types.ts` - Full types file for context

  **Acceptance Criteria**:
  - [ ] `DeepScanFinding.category` includes `'tool'` option
  - [ ] Optional `command?: string` field added
  - [ ] `bun run typecheck` -> PASS (no type errors)

  **Automated Verification**:

  ```bash
  bun run typecheck
  # Assert: Exit code 0

  grep -n "'tool'" src/services/onboarding/types.ts
  # Assert: Output shows 'tool' in category union
  ```

  **Commit**: YES
  - Message: `feat(onboarding): extend DeepScanFinding type with tool category`
  - Files: `src/services/onboarding/types.ts`
  - Pre-commit: `bun run typecheck`

---

- [x] 3. Create test fixtures for extraction tests

  **What to do**:
  - Create `tests/fixtures/onboarding/sample-package.json` with various scripts
  - Create `tests/fixtures/onboarding/sample-adr.md` with standard ADR format
  - Create `tests/fixtures/onboarding/sample-contributing.md` with workflow sections
  - Create `tests/fixtures/onboarding/sample-project/` directory structure

  **Must NOT do**:
  - Create overly complex fixtures
  - Use real project files (could have sensitive info)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Fixture creation is straightforward
  - **Skills**: [`tdd-workflow`]
    - `tdd-workflow`: Test fixture patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1.1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None

  **References**:
  - `tests/fixtures/` - Existing fixtures directory structure
  - `docs/adr/0001-record-template.md` - ADR format to replicate
  - Any real `package.json` for script examples

  **Acceptance Criteria**:
  - [ ] `tests/fixtures/onboarding/sample-package.json` exists with `build`, `test`, `start`, `dev`, `lint` scripts
  - [ ] `tests/fixtures/onboarding/sample-adr.md` exists with title, status, decision, rationale
  - [ ] `tests/fixtures/onboarding/sample-contributing.md` exists with branch strategy and PR sections
  - [ ] Files are valid (JSON parses, markdown is well-formed)

  **Automated Verification**:

  ```bash
  # Verify fixtures exist
  ls tests/fixtures/onboarding/
  # Assert: Shows sample-package.json, sample-adr.md, sample-contributing.md

  # Verify JSON is valid
  bun -e "JSON.parse(require('fs').readFileSync('tests/fixtures/onboarding/sample-package.json'))"
  # Assert: Exit code 0 (valid JSON)
  ```

  **Commit**: YES
  - Message: `test(onboarding): add fixtures for actionable extraction tests`
  - Files: `tests/fixtures/onboarding/*`
  - Pre-commit: None (fixtures only)

---

- [x] 4. Implement package.json script extraction with allowlist

  **What to do**:
  - Create `src/services/onboarding/script-extractor.ts`
  - Define allowlist: `['build', 'test', 'start', 'dev', 'lint', 'typecheck', 'format']`
  - Extract matching scripts as `DeepScanFinding` with `category: 'tool'`
  - Format as actionable: "To run tests: `npm run test`"
  - Write tests FIRST (TDD)

  **Must NOT do**:
  - Extract all scripts (use allowlist)
  - Store raw script content without "To do X" framing

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: New module creation with clear spec
  - **Skills**: [`tdd-workflow`, `coding-standards`]
    - `tdd-workflow`: Write tests first
    - `coding-standards`: Follow existing onboarding module patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1.2 (with Tasks 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `src/services/onboarding/tech-stack-detector.ts` - Pattern for reading package.json
  - `src/services/onboarding/types.ts` - DeepScanFinding type
  - `tests/fixtures/onboarding/sample-package.json` - Test fixture
  - `src/services/onboarding/doc-scanner.ts` - Similar extraction service pattern

  **Acceptance Criteria**:
  - [ ] Test file created: `tests/unit/onboarding/script-extractor.test.ts`
  - [ ] Tests pass: `bun test tests/unit/onboarding/script-extractor.test.ts`
  - [ ] Extracts only allowlisted scripts (not all)
  - [ ] Output format: "To run tests: `npm run test`" (actionable framing)
  - [ ] Returns `DeepScanFinding[]` with `category: 'tool'`

  **Automated Verification**:

  ```bash
  bun test tests/unit/onboarding/script-extractor.test.ts
  # Assert: Exit code 0, tests pass

  # Verify allowlist filtering
  bun test tests/unit/onboarding/script-extractor.test.ts --grep "allowlist"
  # Assert: Test exists and passes
  ```

  **Commit**: YES
  - Message: `feat(onboarding): add package.json script extraction with allowlist`
  - Files: `src/services/onboarding/script-extractor.ts`, `tests/unit/onboarding/script-extractor.test.ts`
  - Pre-commit: `bun test tests/unit/onboarding/script-extractor.test.ts`

---

- [x] 5. Implement ADR parser with status filter

  **What to do**:
  - Create `src/services/onboarding/adr-parser.ts`
  - Parse ADR markdown files in `docs/adr/`
  - Extract: title, status, decision text, rationale (first paragraph only)
  - Filter: only `accepted` status (skip `superseded`, `deprecated`)
  - Write tests FIRST (TDD)

  **Must NOT do**:
  - Store full ADR content verbatim
  - Include superseded or deprecated ADRs
  - Parse non-ADR markdown files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Markdown parsing with clear structure
  - **Skills**: [`tdd-workflow`, `coding-standards`]
    - `tdd-workflow`: Write tests first
    - `coding-standards`: Follow existing patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1.2 (with Tasks 4, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `docs/adr/0001-record-template.md` - ADR format to parse
  - `docs/adr/0020-hybrid-di-container.md` - Real ADR example
  - `tests/fixtures/onboarding/sample-adr.md` - Test fixture
  - `src/services/onboarding/doc-scanner.ts` - File scanning pattern

  **Acceptance Criteria**:
  - [ ] Test file created: `tests/unit/onboarding/adr-parser.test.ts`
  - [ ] Tests pass: `bun test tests/unit/onboarding/adr-parser.test.ts`
  - [ ] Extracts title, status, decision, rationale (1st paragraph)
  - [ ] Filters out non-`accepted` status ADRs
  - [ ] Returns `DeepScanFinding[]` with `category: 'decision'`

  **Automated Verification**:

  ```bash
  bun test tests/unit/onboarding/adr-parser.test.ts
  # Assert: Exit code 0, tests pass

  # Verify status filtering
  bun test tests/unit/onboarding/adr-parser.test.ts --grep "status filter"
  # Assert: Test exists and passes
  ```

  **Commit**: YES
  - Message: `feat(onboarding): add ADR parser with status filtering`
  - Files: `src/services/onboarding/adr-parser.ts`, `tests/unit/onboarding/adr-parser.test.ts`
  - Pre-commit: `bun test tests/unit/onboarding/adr-parser.test.ts`

---

- [x] 6. Implement CONTRIBUTING.md workflow extraction

  **What to do**:
  - Create `src/services/onboarding/workflow-extractor.ts`
  - Parse CONTRIBUTING.md for specific sections: branch strategy, PR process, commit conventions
  - Extract actionable workflow knowledge (not raw dump)
  - Write tests FIRST (TDD)

  **Must NOT do**:
  - Dump entire CONTRIBUTING.md as one entry
  - Extract sections without summarizing to actionable format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Markdown section parsing
  - **Skills**: [`tdd-workflow`, `coding-standards`]
    - `tdd-workflow`: Write tests first
    - `coding-standards`: Follow existing patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1.2 (with Tasks 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `tests/fixtures/onboarding/sample-contributing.md` - Test fixture
  - `src/services/onboarding/doc-scanner.ts` - Current (raw) doc import
  - Existing CONTRIBUTING.md files in open source projects for section patterns

  **Acceptance Criteria**:
  - [ ] Test file created: `tests/unit/onboarding/workflow-extractor.test.ts`
  - [ ] Tests pass: `bun test tests/unit/onboarding/workflow-extractor.test.ts`
  - [ ] Extracts branch strategy, PR process, commit conventions as separate entries
  - [ ] Returns `DeepScanFinding[]` with `category: 'reference'`

  **Automated Verification**:

  ```bash
  bun test tests/unit/onboarding/workflow-extractor.test.ts
  # Assert: Exit code 0, tests pass
  ```

  **Commit**: YES
  - Message: `feat(onboarding): add CONTRIBUTING.md workflow extraction`
  - Files: `src/services/onboarding/workflow-extractor.ts`, `tests/unit/onboarding/workflow-extractor.test.ts`
  - Pre-commit: `bun test tests/unit/onboarding/workflow-extractor.test.ts`

---

- [x] 7. Integrate Phase 1 extractors into deep scanner + integration tests

  **What to do**:
  - Modify `deep-scanner.ts` to call new extractors
  - Add script extraction to `scanArchitecture()` or new method
  - Add ADR parsing to `scanDocumentation()`
  - Add workflow extraction to `scanDocumentation()`
  - Write integration tests covering full flow
  - Handle deduplication on re-run

  **Must NOT do**:
  - Remove existing scan functionality (enhance, don't replace)
  - Skip deduplication logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration across multiple modules
  - **Skills**: [`tdd-workflow`, `coding-standards`]
    - `tdd-workflow`: Integration test patterns
    - `coding-standards`: Module integration

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 1.3)
  - **Blocks**: Tasks 8, 9, 10
  - **Blocked By**: Tasks 4, 5, 6

  **References**:
  - `src/services/onboarding/deep-scanner.ts` - Main file to modify
  - `src/services/onboarding/script-extractor.ts` - New extractor (Task 4)
  - `src/services/onboarding/adr-parser.ts` - New parser (Task 5)
  - `src/services/onboarding/workflow-extractor.ts` - New extractor (Task 6)
  - `tests/integration/onboarding-flow.test.ts` - Existing integration test pattern

  **Acceptance Criteria**:
  - [ ] Integration tests pass: `bun test tests/integration/onboarding-flow.test.ts`
  - [ ] Deep scan output includes script tools, ADR decisions, workflow knowledge
  - [ ] Re-running deep scan doesn't create duplicates (upsert or skip)
  - [ ] All Phase 1 tests pass: `bun test tests/unit/onboarding/`

  **Automated Verification**:

  ```bash
  bun test tests/unit/onboarding/
  # Assert: Exit code 0, all tests pass

  bun test tests/integration/onboarding-flow.test.ts
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `feat(onboarding): integrate Phase 1 extractors into deep scanner`
  - Files: `src/services/onboarding/deep-scanner.ts`, `tests/integration/onboarding-flow.test.ts`
  - Pre-commit: `bun test tests/unit/onboarding/ && bun test tests/integration/onboarding-flow.test.ts`

---

### PHASE 2: Content-Aware Analysis

---

- [x] 8. Implement module boundary detection

  **What to do**:
  - Add method to detect top-level module boundaries from `src/` structure
  - Generate findings like "services/ contains business logic, handlers call services"
  - Use directory structure + README analysis (not import parsing yet)
  - Write tests FIRST (TDD)

  **Must NOT do**:
  - Deep import graph analysis (that's Task 11)
  - Parse every file for imports

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Directory structure analysis
  - **Skills**: [`tdd-workflow`, `coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2.1 (with Tasks 9, 10)
  - **Blocks**: Task 13
  - **Blocked By**: Task 7

  **References**:
  - `src/services/onboarding/deep-scanner.ts:109-123` - Current module structure detection
  - `src/` directory structure - What to analyze

  **Acceptance Criteria**:
  - [ ] Tests pass: `bun test tests/unit/onboarding/deep-scanner.test.ts --grep "module boundary"`
  - [ ] Detects layered architecture patterns (handlers -> services -> repositories)
  - [ ] Output is actionable: "Services handle business logic. Call from handlers, never directly from routes."

  **Commit**: YES
  - Message: `feat(onboarding): add module boundary detection`
  - Files: `src/services/onboarding/deep-scanner.ts`, `tests/unit/onboarding/deep-scanner.test.ts`
  - Pre-commit: `bun test tests/unit/onboarding/deep-scanner.test.ts`

---

- [x] 9. Implement template directory identification

  **What to do**:
  - Detect directories named `templates/`, `examples/`, `boilerplate/`, or containing `*.template.*` files
  - Generate "Copy this pattern" knowledge entries
  - Identify reference implementations by naming conventions
  - Write tests FIRST (TDD)

  **Must NOT do**:
  - Parse file contents for template patterns
  - Identify templates based on code structure (filename only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple pattern matching
  - **Skills**: [`tdd-workflow`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2.1 (with Tasks 8, 10)
  - **Blocks**: Task 13
  - **Blocked By**: Task 7

  **References**:
  - `src/services/onboarding/deep-scanner.ts` - Add to existing scanner

  **Acceptance Criteria**:
  - [ ] Tests pass for template detection
  - [ ] Detects `templates/`, `examples/`, `boilerplate/` directories
  - [ ] Output: "To add new X, copy the template from templates/X/"

  **Commit**: YES
  - Message: `feat(onboarding): add template directory identification`
  - Files: `src/services/onboarding/deep-scanner.ts`, `tests/unit/onboarding/deep-scanner.test.ts`
  - Pre-commit: `bun test tests/unit/onboarding/deep-scanner.test.ts`

---

- [x] 10. Implement "How to add new X" pattern extraction

  **What to do**:
  - For detected patterns (Repository, Handler, Service), generate contribution guides
  - Example: "To add a new MCP tool: 1) Create descriptor in descriptors/, 2) Create handler in handlers/, 3) Register in index"
  - Use existing pattern detection + directory structure
  - Write tests FIRST (TDD)

  **Must NOT do**:
  - Read file contents to understand patterns
  - Generate guides for patterns not detected

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Pattern-to-guide mapping
  - **Skills**: [`tdd-workflow`, `coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2.1 (with Tasks 8, 9)
  - **Blocks**: Task 13
  - **Blocked By**: Task 7

  **References**:
  - `src/services/onboarding/deep-scanner.ts:539-581` - Current pattern detection
  - Codebase structure for real examples

  **Acceptance Criteria**:
  - [ ] Tests pass for pattern guide generation
  - [ ] Generates actionable guides for: Repository, Handler, Service patterns
  - [ ] Output format: "To add new [pattern]: 1) ... 2) ... 3) ..."

  **Commit**: YES
  - Message: `feat(onboarding): add contribution guide generation for patterns`
  - Files: `src/services/onboarding/deep-scanner.ts`, `tests/unit/onboarding/deep-scanner.test.ts`
  - Pre-commit: `bun test tests/unit/onboarding/deep-scanner.test.ts`

---

- [x] 11. Implement import pattern analysis (top-level only)

  **What to do**:
  - Analyze import statements in top-level index.ts files of each module
  - Detect allowed/forbidden import patterns
  - Generate module boundary guidelines
  - Depth limit: 1 level (no transitive analysis)
  - Write tests FIRST (TDD)

  **Must NOT do**:
  - Transitive import analysis
  - Parse every file (only index.ts files)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: AST or regex parsing of imports
  - **Skills**: [`tdd-workflow`, `coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2.2 (with Task 12)
  - **Blocks**: Task 13
  - **Blocked By**: Task 8

  **References**:
  - TypeScript import syntax patterns
  - `src/*/index.ts` - Files to analyze

  **Acceptance Criteria**:
  - [ ] Tests pass for import analysis
  - [ ] Detects cross-module imports (services importing from mcp)
  - [ ] Generates guidelines: "services/ should not import from mcp/"

  **Commit**: YES
  - Message: `feat(onboarding): add import pattern analysis for module boundaries`
  - Files: `src/services/onboarding/deep-scanner.ts`, `tests/unit/onboarding/deep-scanner.test.ts`
  - Pre-commit: `bun test tests/unit/onboarding/deep-scanner.test.ts`

---

- [x] 12. Implement naming convention extraction

  **What to do**:
  - Detect file naming patterns per directory
  - Generate conventions like "Repositories: {entity}.repository.ts"
  - Use regex on filenames (not content)
  - Write tests FIRST (TDD)

  **Must NOT do**:
  - Parse file contents
  - Invent conventions not present

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Regex pattern matching on filenames
  - **Skills**: [`tdd-workflow`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2.2 (with Task 11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 8

  **References**:
  - `src/db/repositories/` - Example naming pattern
  - `src/mcp/handlers/` - Another naming pattern

  **Acceptance Criteria**:
  - [ ] Tests pass for naming convention detection
  - [ ] Detects patterns: `*.repository.ts`, `*.service.ts`, `*.handler.ts`
  - [ ] Output: "Naming convention: Repositories are named {entity}.repository.ts"

  **Commit**: YES
  - Message: `feat(onboarding): add naming convention extraction`
  - Files: `src/services/onboarding/deep-scanner.ts`, `tests/unit/onboarding/deep-scanner.test.ts`
  - Pre-commit: `bun test tests/unit/onboarding/deep-scanner.test.ts`

---

- [x] 13. Integration tests for Phase 2

  **What to do**:
  - Write integration tests covering Phase 2 features
  - Test full deep scan with Phase 1 + Phase 2 extractors
  - Verify output quality (no raw file counts, only actionable knowledge)
  - Test deduplication on re-run

  **Must NOT do**:
  - Skip verification of Phase 1 features

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Integration test writing
  - **Skills**: [`tdd-workflow`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 2.3)
  - **Blocks**: Tasks 14, 15, 16
  - **Blocked By**: Tasks 11, 12

  **References**:
  - `tests/integration/onboarding-flow.test.ts` - Existing integration tests

  **Acceptance Criteria**:
  - [x] All integration tests pass
  - [x] Deep scan output has ZERO raw file counts
  - [x] Deep scan output has actionable patterns and guides

  **Automated Verification**:

  ```bash
  bun test tests/integration/onboarding-flow.test.ts
  # Assert: Exit code 0
  # Assert: Tests include assertion that no finding.content matches /Found \d+ files/
  # Assert: Tests include assertion that findings contain actionable patterns
  ```

  **Commit**: YES
  - Message: `test(onboarding): add Phase 2 integration tests`
  - Files: `tests/integration/onboarding-flow.test.ts`
  - Pre-commit: `bun test tests/integration/`

---

### PHASE 3: LLM-Assisted (Optional, Feature-Flagged)

---

- [x] 14. Add --useLlm flag to onboard command

  **What to do**:
  - Add `--useLlm` (or `useLlm: boolean`) option to `memory_onboard`
  - Default: false (no LLM without explicit opt-in)
  - Validate: error if flag set but no API key configured
  - Write tests

  **Must NOT do**:
  - Enable LLM by default
  - Call LLM without flag

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Flag addition is straightforward
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3.1 (with Tasks 15, 16)
  - **Blocks**: Task 17
  - **Blocked By**: Task 13

  **References**:
  - `src/mcp/descriptors/memory_onboard.ts` - Add flag here
  - Existing flag patterns in other descriptors

  **Acceptance Criteria**:
  - [x] `--useLlm` flag added to onboard command
  - [x] Error thrown if flag set without API key
  - [x] No LLM calls when flag is false

  **Commit**: YES
  - Message: `feat(onboarding): add --useLlm flag for LLM-assisted extraction`
  - Files: `src/mcp/descriptors/memory_onboard.ts`
  - Pre-commit: `bun run typecheck`

---

- [x] 15. Integrate extraction prompts for codebase context

  **What to do**:
  - Reuse prompts from `src/services/extraction/prompts.ts`
  - Create codebase-specific prompt variant for "contribution patterns"
  - Define token budget (max 2000 tokens per LLM call)
  - Write tests with mocked LLM

  **Must NOT do**:
  - Create entirely new prompt system
  - Exceed token budget

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Prompt engineering + LLM integration
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3.1 (with Tasks 14, 16)
  - **Blocks**: Task 17
  - **Blocked By**: Task 13

  **References**:
  - `src/services/extraction/prompts.ts` - Existing prompts to extend
  - `src/services/extraction/index.ts` - Extraction service

  **Acceptance Criteria**:
  - [x] Codebase-specific prompt created
  - [x] Token budget enforced (max 2000)
  - [x] Tests pass with mocked LLM responses

  **Commit**: YES
  - Message: `feat(onboarding): add codebase extraction prompts for LLM mode`
  - Files: `src/services/onboarding/llm-extractor.ts`, `src/services/extraction/prompts.ts`
  - Pre-commit: `bun test tests/unit/onboarding/`

---

- [x] 16. LLM-assisted contribution guide generation

  **What to do**:
  - When `--useLlm` is set, use LLM to generate contribution guides
  - Input: sample files from detected patterns
  - Output: "How to add new X" with detailed steps
  - Store with confidence score from LLM
  - Write tests with mocked LLM

  **Must NOT do**:
  - Call LLM for every file (sample only)
  - Generate guides for all detected patterns (limit to top 5)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: LLM integration with sampling
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3.1 (with Tasks 14, 15)
  - **Blocks**: Task 17
  - **Blocked By**: Task 13

  **References**:
  - `src/services/extraction/` - Existing LLM patterns
  - Task 10 output - Non-LLM guides to enhance

  **Acceptance Criteria**:
  - [x] LLM generates detailed contribution guides
  - [x] Limited to top 5 patterns
  - [x] Confidence scores attached to findings
  - [x] Tests pass with mocked LLM

  **Commit**: YES
  - Message: `feat(onboarding): add LLM-assisted contribution guide generation`
  - Files: `src/services/onboarding/llm-extractor.ts`, `tests/unit/onboarding/llm-extractor.test.ts`
  - Pre-commit: `bun test tests/unit/onboarding/llm-extractor.test.ts`

---

- [x] 17. End-to-end tests for LLM mode

  **What to do**:
  - Write E2E tests covering full LLM-assisted onboard flow
  - Use mocked LLM responses
  - Verify token budget enforcement
  - Verify flag opt-in behavior

  **Must NOT do**:
  - Use real LLM calls in tests
  - Skip opt-in verification

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: E2E test writing
  - **Skills**: [`tdd-workflow`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 3.2)
  - **Blocks**: None
  - **Blocked By**: Tasks 14, 15, 16

  **References**:
  - `tests/e2e/` - E2E test patterns
  - `tests/integration/onboarding-flow.test.ts` - Integration test patterns

  **Acceptance Criteria**:
  - [x] E2E tests pass with mocked LLM
  - [x] Token budget is enforced
  - [x] Flag opt-in is verified
  - [x] Full flow works: onboard --deepScan --useLlm

  **Automated Verification**:

  ```bash
  bun test tests/e2e/onboarding-llm.test.ts
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `test(onboarding): add E2E tests for LLM-assisted onboarding`
  - Files: `tests/e2e/onboarding-llm.test.ts`
  - Pre-commit: `bun test tests/e2e/onboarding-llm.test.ts`

---

## Commit Strategy

| After Task | Message                                                               | Files                                      | Verification      |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------ | ----------------- |
| 1          | `test(onboarding): add characterization tests for deep-scanner`       | tests/unit/onboarding/deep-scanner.test.ts | bun test          |
| 2          | `feat(onboarding): extend DeepScanFinding type with tool category`    | types.ts                                   | bun run typecheck |
| 3          | `test(onboarding): add fixtures for actionable extraction tests`      | tests/fixtures/onboarding/\*               | ls                |
| 4          | `feat(onboarding): add package.json script extraction with allowlist` | script-extractor.ts + test                 | bun test          |
| 5          | `feat(onboarding): add ADR parser with status filtering`              | adr-parser.ts + test                       | bun test          |
| 6          | `feat(onboarding): add CONTRIBUTING.md workflow extraction`           | workflow-extractor.ts + test               | bun test          |
| 7          | `feat(onboarding): integrate Phase 1 extractors into deep scanner`    | deep-scanner.ts + integration test         | bun test          |
| 8-12       | Phase 2 commits (individual per task)                                 | Various                                    | bun test          |
| 13         | `test(onboarding): add Phase 2 integration tests`                     | integration tests                          | bun test          |
| 14-16      | Phase 3 commits (individual per task)                                 | Various                                    | bun test          |
| 17         | `test(onboarding): add E2E tests for LLM-assisted onboarding`         | E2E tests                                  | bun test          |

---

## Success Criteria

### Verification Commands

```bash
# All unit tests pass
bun test tests/unit/onboarding/

# All integration tests pass
bun test tests/integration/onboarding-flow.test.ts

# Type check passes
bun run typecheck

# Deep scan produces actionable output (not file counts)
# Verified via integration tests - see Task 17 for E2E verification
bun test tests/integration/onboarding-flow.test.ts -- --grep "actionable"
```

### Final Checklist

- [ ] All "Must Have" present (TDD, allowlist, status filter, dedup, no LLM without flag)
- [ ] All "Must NOT Have" absent (no raw counts, no node_modules, no all-scripts, no verbatim ADR)
- [ ] All tests pass
- [ ] Deep scan output is ACTIONABLE (passes usefulness test)
