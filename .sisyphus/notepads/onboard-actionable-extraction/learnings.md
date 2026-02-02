# Learnings - Onboard Actionable Extraction

Conventions, patterns, and best practices discovered during execution.

---

## Task 3: Test Fixtures Created

### Fixtures Created
- `tests/fixtures/onboarding/sample-package.json` - 596 bytes
  - Includes all allowlisted scripts: build, test, start, dev, lint, typecheck, format
  - Valid JSON, parses correctly
  - Realistic but minimal (no sensitive data)

- `tests/fixtures/onboarding/sample-adr.md` - 960 bytes
  - Follows ADR-0001 template exactly
  - Includes all required sections: Status, Context, Decision, Consequences, References
  - Uses realistic but sample content (ADR-0042)

- `tests/fixtures/onboarding/sample-contributing.md` - 1781 bytes
  - Includes Branch Strategy section with naming conventions
  - Includes Pull Request Process section with PR title format
  - Includes Code Style and Testing Requirements sections
  - Realistic workflow documentation

### Key Patterns Observed
1. ADR template is strict: Status, Context, Decision, Consequences, References
2. Package.json scripts should be realistic but simple (7 scripts is good)
3. Contributing guide should include both process and standards
4. All fixtures are valid and parseable (JSON, Markdown)

### Validation Results
✓ All 3 files created successfully
✓ JSON syntax valid
✓ Markdown well-formed
✓ All allowlisted scripts present in package.json
✓ ADR follows template format
✓ Contributing guide has required sections


## Task 2: Extend DeepScanFinding Type for Tool Category

**Completed**: Extended `DeepScanFinding` type to support 'tool' category

### Changes Made
1. Modified `src/services/onboarding/types.ts`:
   - Added `'tool'` to `DeepScanFinding.category` union type
   - Added optional `command?: string` field for tool entries

2. Fixed type compatibility in `src/mcp/descriptors/memory_onboard.ts`:
   - Added mapping logic to convert `'tool'` category to `'fact'` when storing as knowledge entries
   - Knowledge entries use different category enum: `'decision' | 'fact' | 'context' | 'reference'`
   - Tool findings are semantically facts about the codebase, so mapping to 'fact' is appropriate

### Key Learning
- Type system constraint: `DeepScanFinding` and knowledge entry categories don't align
- Solution: Map at the storage boundary rather than changing the knowledge schema
- This allows deep scan to discover tools without modifying the core knowledge type system

### Verification
- `bun run typecheck` passes with no errors
- Type safety maintained across the codebase

## Deep Scanner Characterization Tests (Wave 1.1)

### Test Coverage
- Created `tests/unit/onboarding/deep-scanner.test.ts` with 36 passing tests
- All 5 scan areas fully characterized: architecture, database, api, testing, documentation
- Tests document CURRENT behavior (not new features)

### Key Findings

#### Architecture Scanning
- Detects entry points from: src/index.ts, src/main.ts, src/cli.ts, index.ts, main.ts
- Identifies module structure from src/ top-level directories
- Finds core abstractions in src/core/
- Detects design patterns via file naming: Repository, Factory, Adapter, Strategy, Handler, Service, DI, Pipeline, Decorator, Observer/Event

#### Database Scanning
- ORM detection: Drizzle (drizzle.config.ts), Prisma (prisma/schema.prisma), TypeORM (ormconfig.*)
- Schema files: src/db/schema/
- Repository pattern: src/db/repositories/
- Migrations: migrations/, drizzle/, prisma/migrations/

#### API Scanning
- MCP tools: src/mcp/descriptors/ (filters out index/types)
- MCP handlers: src/mcp/handlers/ (filters for handler files)
- REST routes: src/restapi/routes/
- Service modules: src/services/ (lists top 10, indicates more with "...")

#### Testing Scanning
- Framework detection: vitest.config.ts or jest.config.*
- Test organization: tests/, test/, __tests__/, src/__tests__/ (uses first found)
- Test files: *.test.ts, *.spec.ts, *.test.tsx, *.spec.tsx, *.test.js, *.spec.js, *.test.jsx, *.spec.jsx
- Test fixtures: tests/fixtures/

#### Documentation Scanning
- Markdown files: all .md files (excludes node_modules, .git)
- ADRs: docs/adr/
- Docs structure: docs/ subdirectories
- Rules/guidelines: rules/ directory

### Test Patterns Used
- Conditional assertions: `if (finding) { expect(...) }` for optional findings
- Confidence score validation: 0.7-0.95 range per area
- Category validation: fact, decision, reference
- Metadata validation: area, title, content, category, confidence, source (optional)

### Confidence Levels by Area
- ORM detection: 0.95 (highest)
- Entry points: 0.9
- Module structure: 0.85
- Design patterns: 0.75 (lowest, pattern-based)

### Next Steps
- Tests are ready for implementation changes
- Can now modify deep-scanner.ts with confidence that tests will catch regressions
- Tests serve as living documentation of scanner behavior

## Task 4: Package.json Script Extraction (Wave 1.2)

**Completed**: Implemented script extractor service with TDD approach

### Implementation Details

1. **Created `src/services/onboarding/script-extractor.ts`**:
   - Allowlist: `['build', 'test', 'start', 'dev', 'lint', 'typecheck', 'format']`
   - Action mapping: Each script maps to human-readable action (e.g., "build" → "build the project")
   - Output format: "To {action}: `npm run {script}`"
   - Returns `DeepScanFinding[]` with `category: 'tool'`, `area: 'testing'`
   - Confidence: 0.9 for all extracted scripts
   - Source: "package.json scripts"
   - Command field: `npm run {script}` for execution

2. **Created `tests/unit/onboarding/script-extractor.test.ts`**:
   - 20 tests, all passing
   - Tests cover: allowlist filtering, actionable framing, command field, confidence scores
   - Tests verify: DeepScanFinding structure, error handling (missing file, invalid JSON)
   - Tests validate: all 7 allowlisted scripts extracted, non-allowlisted scripts ignored

3. **Extended `src/services/onboarding/types.ts`**:
   - Added `IScriptExtractorService` interface
   - Method: `extractScripts(packageJsonPath: string): Promise<DeepScanFinding[]>`

### Key Patterns

- **TDD Workflow**: Tests written first (RED), implementation second (GREEN)
- **Service Pattern**: Follows existing onboarding service structure (doc-scanner, tech-stack-detector)
- **Error Handling**: Returns empty array for missing/invalid files (graceful degradation)
- **Actionable Framing**: Scripts formatted as "To {action}: `npm run {script}`" for user clarity
- **Type Safety**: Full TypeScript types, interface-based design

### Test Coverage

- ✓ Extracts only allowlisted scripts (7 scripts)
- ✓ Formats with actionable framing
- ✓ Includes command field with npm run syntax
- ✓ Sets confidence scores (0.9)
- ✓ Includes source field ("package.json scripts")
- ✓ Returns empty array for non-existent/invalid files
- ✓ Ignores non-allowlisted scripts
- ✓ Maps each script to appropriate action
- ✓ Returns proper DeepScanFinding structure

### Verification

- `bun test tests/unit/onboarding/script-extractor.test.ts` - 20 tests pass
- `bun run build` - Build passes with no errors
- LSP diagnostics clean (no errors)

### Next Steps

- Task 5: ADR extraction (parallel, Wave 1.2)
- Task 6: Contributing guide extraction (parallel, Wave 1.2)
- Task 7: Integrate all extractors into deep-scanner.ts (Wave 1.3)


## Task 5: ADR Parser Implementation (Wave 1.2)

**Completed**: Implemented ADR parser service with TDD approach

### Implementation Details

1. **Created `src/services/onboarding/adr-parser.ts`**:
   - Parses ADR markdown files in `docs/adr/` directory
   - Extracts: title (from `# Title`), status (from `## Status`), decision (from `## Decision`), rationale (first paragraph of `## Context`)
   - Status filter: Only includes ADRs with status `accepted` (case-insensitive)
   - Returns `DeepScanFinding[]` with `category: 'decision'`, `area: 'documentation'`
   - Confidence: 0.9 for all extracted ADRs
   - Source: ADR filename (e.g., "0020-hybrid-di-container.md")
   - Content format: "Decision: {decision}\n\nRationale: {rationale}"

2. **Created `tests/unit/onboarding/adr-parser.test.ts`**:
   - 22 tests, all passing
   - Tests cover: title extraction, status extraction, decision extraction, rationale extraction (first paragraph only)
   - Tests verify: status filtering (accepted only), error handling (missing file, invalid markdown)
   - Tests validate: DeepScanFinding structure, confidence scores, source field
   - Real ADR parsing: Tests against actual ADRs in `docs/adr/` (0001, 0020)

3. **Extended `src/services/onboarding/types.ts`**:
   - Added `IAdrParserService` interface
   - Methods: `parseAdr(adrPath: string)`, `parseAdrDirectory(adrDir: string)`

### Key Patterns

- **TDD Workflow**: Tests written first (RED), implementation second (GREEN)
- **Regex Parsing**: Used regex to extract sections from markdown (title, status, decision, context)
- **Status Filtering**: Only `accepted` status included (lowercase comparison for robustness)
- **Rationale Extraction**: Only first paragraph of Context section (avoids verbosity)
- **Error Handling**: Returns empty array for missing/invalid files (graceful degradation)
- **Type Safety**: Full TypeScript types, optional chaining for null safety

### ADR Format Observed

- Title: `# ADR-NNNN: Title`
- Status: `## Status` followed by `Accepted | Deprecated | Superseded by ADR-XXXX`
- Context: `## Context` (first paragraph = rationale)
- Decision: `## Decision` (full section = decision text)
- Consequences: `## Consequences` (not extracted)
- References: `## References` (not extracted)

### Test Coverage

- ✓ Extracts title from `# Title` heading
- ✓ Extracts status from `## Status` section
- ✓ Extracts decision from `## Decision` section
- ✓ Extracts rationale from first paragraph of `## Context`
- ✓ Filters out non-accepted status ADRs
- ✓ Returns empty array for non-existent files
- ✓ Returns empty array for invalid markdown
- ✓ Sets category to 'decision'
- ✓ Sets area to 'documentation'
- ✓ Sets confidence score to 0.9
- ✓ Includes source field with filename
- ✓ Formats content with "Decision:" and "Rationale:" labels
- ✓ Parses all ADR files in directory
- ✓ Skips non-markdown files
- ✓ Returns proper DeepScanFinding structure
- ✓ Parses real ADRs (0001, 0020)

### Verification

- `bun test tests/unit/onboarding/adr-parser.test.ts` - 22 tests pass
- `bun run build` - Build passes with no errors
- LSP diagnostics clean (no errors)

### Next Steps

- Task 4: Package.json script extraction (parallel, Wave 1.2) - COMPLETE
- Task 6: Contributing guide extraction (parallel, Wave 1.2)
- Task 7: Integrate all extractors into deep-scanner.ts (Wave 1.3)


## Task 6: Workflow Extractor Implementation (Wave 1.2)

**Completed**: Implemented workflow extractor service with TDD approach

### Implementation Details

1. **Created `src/services/onboarding/workflow-extractor.ts`**:
   - Extracts 3 workflow sections: Branch Strategy, PR Process, Commit Messages
   - Section detection via regex: `/##\s+Section\s+Name\s*\n([\s\S]*?)(?=\n##\s+|\n#\s+|$)/i`
   - Summarization: Extracts key details, not raw dump
   - Output format: `DeepScanFinding[]` with `category: 'reference'`, `area: 'documentation'`
   - Confidence scores: 0.9 (Branch Strategy, PR Process), 0.85 (Commit Messages)
   - Source: "CONTRIBUTING.md"

2. **Created `tests/unit/onboarding/workflow-extractor.test.ts`**:
   - 24 tests, all passing
   - Tests cover: section detection, content extraction, confidence scoring, error handling
   - Tests verify: DeepScanFinding structure, actionable summaries, graceful degradation
   - Tests validate: all 3 sections extracted, content summarized (not raw dump)

3. **Extended `src/services/onboarding/types.ts`**:
   - Added `IWorkflowExtractorService` interface
   - Method: `extractWorkflows(contributingPath: string): Promise<DeepScanFinding[]>`

### Key Patterns

- **TDD Workflow**: Tests written first (RED), implementation second (GREEN)
- **Regex Parsing**: Section headers detected via regex, subsections extracted
- **Summarization Strategy**: Extract key details (branch names, PR steps, commit format) instead of dumping entire sections
- **Null Safety**: Optional chaining (`?.[1]`) for all regex match results
- **Error Handling**: Returns empty array for missing/invalid files (graceful degradation)
- **Type Safety**: Full TypeScript types, interface-based design

### Section Extraction Patterns

#### Branch Strategy
- Extracts: main, develop, feature/*, bugfix/*, hotfix/* descriptions
- Extracts: Branch naming conventions (first 3 examples)
- Format: "branch: description" lines + "Naming conventions:" section

#### Pull Request Process
- Extracts: Numbered workflow steps (1. Create branch, 2. Make changes, etc.)
- Extracts: PR title format and types
- Format: "PR Workflow:" + indented steps + "PR Title Format:" section

#### Commit Messages
- Detects: "conventional commits" mention
- Extracts: Format template from code blocks
- Extracts: Example commit message (first line only)
- Format: "Follow conventional commits format" + "Format:" section + "Example:" line

### Test Coverage

- ✓ Extracts 3+ workflow sections (Branch Strategy, PR Process, Commit Messages)
- ✓ All findings have category='reference', area='documentation'
- ✓ Confidence scores in 0.7-0.95 range
- ✓ Source field = "CONTRIBUTING.md"
- ✓ Returns empty array for non-existent/empty files
- ✓ Content is summarized (< 1000 chars), not raw dump
- ✓ Titles are descriptive (not generic)
- ✓ Preserves key workflow details (branch names, PR steps, commit format)

### Verification

- `bun test tests/unit/onboarding/workflow-extractor.test.ts` - 24 tests pass
- `bun run build` - Build passes with no errors
- LSP diagnostics clean (no errors, only unused import hint)

### Key Learnings

1. **Regex for Markdown Sections**: Use `/##\s+Section\s+Name\s*\n([\s\S]*?)(?=\n##\s+|\n#\s+|$)/i` to extract section content
2. **Null Safety with Regex**: Always use optional chaining (`?.[1]`) when accessing regex match groups
3. **Summarization vs Raw Dump**: Extract specific details (branch names, steps, formats) rather than dumping entire sections
4. **Confidence Scoring**: Higher confidence (0.9) for well-structured sections, lower (0.85) for more variable sections
5. **Test Patterns**: Use conditional assertions for optional findings, validate structure and content separately

### Next Steps

- Task 5: ADR extraction (parallel, Wave 1.2) - COMPLETE
- Task 7: Integrate all extractors into deep-scanner.ts (Wave 1.3)


## Task 7: Integrate Phase 1 Extractors into Deep Scanner (Wave 1.3)

**Completed**: All 3 Phase 1 extractors integrated into deep scanner with deduplication

### Implementation Details

1. **Modified `src/services/onboarding/deep-scanner.ts`**:
   - Added imports for all 3 extractor services
   - Created instance properties for extractors and deduplication set
   - Integrated script extractor into `scanArchitecture()` - extracts npm scripts as tools
   - Integrated ADR parser into `scanDocumentation()` - parses accepted ADRs as decisions
   - Integrated workflow extractor into `scanDocumentation()` - extracts workflow reference docs
   - Added deduplication via content hash (area:title:content prefix)

2. **Updated `tests/unit/onboarding/deep-scanner.test.ts`**:
   - Changed category assertion to include 'tool' alongside 'fact', 'decision', 'reference'

3. **Added integration tests in `tests/integration/onboarding-flow.test.ts`**:
   - Test: Extract npm scripts as tools (validates allowlist filtering, command field)
   - Test: Extract ADRs with accepted status as decisions (validates status filtering)
   - Test: Extract workflow knowledge from CONTRIBUTING.md (validates reference extraction)
   - Test: No duplicates on re-scan (validates deduplication)
   - Test: Handle missing files gracefully (validates error handling)
   - Test: Include all extractor findings in full scan (validates full integration)

### Deduplication Strategy

- Content hash: `${finding.area}:${finding.title}:${finding.content.slice(0, 100)}`
- `seenFindings` Set cleared at start of each scan (allows fresh scans on re-run)
- Deduplication applied in `scanArchitecture()` and `scanDocumentation()`

### Key Learnings

1. **Vitest vs Bun Test**: Project uses vitest, not bun's native test runner. Always use `npx vitest run` or `npm test` instead of `bun test`.

2. **Extractor Integration Points**:
   - Script extractor → `scanArchitecture()` (project tooling)
   - ADR parser → `scanDocumentation()` (documentation)
   - Workflow extractor → `scanDocumentation()` (documentation)

3. **Category Mapping**: Deep scan findings now use 4 categories:
   - `fact`: General codebase facts
   - `decision`: Architecture decisions (ADRs)
   - `reference`: Reference documentation (workflows)
   - `tool`: Executable commands (npm scripts)

### Verification Results

- ✓ All 186 Phase 1 unit tests pass (npx vitest run tests/unit/onboarding/)
- ✓ All 19 integration tests pass (npx vitest run tests/integration/onboarding-flow.test.ts)
- ✓ LSP diagnostics clean (no errors)
- ✓ Build passes (bun run build)
- ✓ Deep scan output includes script tools, ADR decisions, workflow knowledge
- ✓ Re-running deep scan doesn't create duplicates (within same scan)

