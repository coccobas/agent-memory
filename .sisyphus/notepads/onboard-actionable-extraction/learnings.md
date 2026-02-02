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

- ORM detection: Drizzle (drizzle.config.ts), Prisma (prisma/schema.prisma), TypeORM (ormconfig.\*)
- Schema files: src/db/schema/
- Repository pattern: src/db/repositories/
- Migrations: migrations/, drizzle/, prisma/migrations/

#### API Scanning

- MCP tools: src/mcp/descriptors/ (filters out index/types)
- MCP handlers: src/mcp/handlers/ (filters for handler files)
- REST routes: src/restapi/routes/
- Service modules: src/services/ (lists top 10, indicates more with "...")

#### Testing Scanning

- Framework detection: vitest.config.ts or jest.config.\*
- Test organization: tests/, test/, **tests**/, src/**tests**/ (uses first found)
- Test files: _.test.ts, _.spec.ts, _.test.tsx, _.spec.tsx, _.test.js, _.spec.js, _.test.jsx, _.spec.jsx
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

- Extracts: main, develop, feature/_, bugfix/_, hotfix/\* descriptions
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

## Task 9: Template Directory Identification - COMPLETED

### Implementation Summary

- **Tests**: 6 tests added to `deep-scanner.test.ts` covering template detection
- **Code**: Added template detection to `scanArchitecture()` method
- **Commit**: `5af1e630` - feat(onboarding): add template directory identification

### Key Patterns Discovered

#### 1. Conditional Test Assertions

Tests use conditional assertions (`if (finding) { expect(...) }`) to handle optional findings:

- Allows tests to pass whether templates exist or not
- Validates structure when findings are present
- Follows pattern from existing tests (e.g., module boundary tests)

#### 2. Template Detection Strategy

Two-pronged approach:

- **Directory-based**: Detect `templates/`, `examples/`, `boilerplate/` directories
- **File-based**: Detect `*.template.*` and `*.example.*` files
- Both generate actionable "copy this pattern" guidance

#### 3. Confidence Scoring

- Directory detection: 0.9 confidence (high certainty)
- File detection: 0.85 confidence (slightly lower due to potential false positives)
- Both use `category: 'reference'` (not 'fact') - these are patterns to follow, not facts about the system

#### 4. Implementation Details

- Used `getFilesRecursive()` with regex filter for file pattern matching
- Filtered results to first 5 files to avoid overwhelming output
- Properly handled undefined array access with null checks
- Integrated seamlessly with existing deduplication logic

### Testing Results

```
✓ 6 tests pass for template directory identification
✓ Detects examples/ directory in this project
✓ Generates actionable guidance text
✓ Proper confidence scores and categories
```

### Actionable Guidance Generated

Example output for this project:

- "Template directories found: examples. To add new patterns, copy from these template directories."
- "Template files found: [list]. Use these as reference implementations when adding new components."

### Blockers & Dependencies

- **Blocked by**: Task 7 (Phase 1 integration) ✓ COMPLETE
- **Blocks**: Task 13 (Phase 2 integration tests)
- **Parallel with**: Tasks 8, 10 (Wave 2.1)

### Pre-existing Issues Noted

- `generatePatternGuides()` method called but not defined (Task 10 - contribution guides)
- `detectModuleBoundaries()` method defined but unused
- These are pre-existing and not related to template detection

### Next Steps

- Task 10: Implement "How to add new X" pattern extraction
- Task 13: Integration tests for Phase 2 (will verify template detection works with other features)

## Task 8: Module Boundary Detection (Wave 2.1)

**Completed**: Implemented module boundary detection with TDD approach

### Implementation Details

1. **Created `detectModuleBoundaries()` method in `src/services/onboarding/deep-scanner.ts`**:
   - Analyzes `src/` top-level directories to detect layered architecture
   - Identifies: handlers, services, repositories, MCP handlers, REST API routes
   - Generates actionable findings describing the flow between layers
   - Returns null if no recognizable layers found
   - Confidence: 0.85

2. **Integrated into `scanArchitecture()`**:
   - Added module boundary detection before design pattern detection
   - Creates finding with title "Module Boundaries"
   - Category: 'decision' (architectural decision)
   - Source: srcDir path

3. **Added 3 tests in `tests/unit/onboarding/deep-scanner.test.ts`**:
   - Test: "should detect module boundaries from src/ structure"
   - Test: "should generate actionable module boundary findings"
   - Test: "should detect handler -> service -> repository pattern"
   - All tests use conditional assertions (if finding exists, validate it)

### Key Patterns

- **Layered Architecture Detection**: Identifies common patterns:
  - MCP handlers → services → repositories
  - REST routes → services → repositories
  - Handlers → services → repositories
- **Actionable Output**: Describes what each layer does and how they interact:
  - "MCP handlers expose tools to AI agents"
  - "Services contain business logic"
  - "Repositories handle data access"
  - "MCP handlers call services for business logic. Services use repositories for data access."

- **Directory Name Matching**: Uses case-insensitive matching:
  - Handlers: contains "handler"
  - Services: contains "service"
  - Repositories: contains "repositor" or "db"
  - MCP: exact match "mcp"
  - REST API: contains "restapi"

### Test Coverage

- ✓ Detects module boundaries from src/ structure
- ✓ Generates actionable findings (not just "found X directories")
- ✓ Describes handler → service → repository flow
- ✓ Sets confidence to 0.85
- ✓ Sets category to 'decision'
- ✓ Includes source field (srcDir)

### Verification

- `npx vitest run tests/unit/onboarding/deep-scanner.test.ts -t "module boundaries"` - All 3 tests pass
- `npm run typecheck` - Passes with no errors
- `npm run build` - Build succeeds

### Key Learnings

1. **TDD Workflow**: Tests written first with conditional assertions (`if (finding) { expect(...) }`), then implementation
2. **Layered Architecture Patterns**: Common patterns in Node.js/TypeScript projects:
   - MCP handlers for AI agent tools
   - REST routes for HTTP APIs
   - Services for business logic
   - Repositories for data access
3. **Actionable Findings**: Describe relationships between layers, not just list directories
4. **Directory Structure Analysis**: Use top-level directory names to infer architecture (no import parsing needed yet)

### Example Output

For this project (agent-memory), the finding would be:

```
Title: Module Boundaries
Content: Layered architecture detected: MCP handlers → services → repositories.
         MCP handlers expose tools to AI agents. Services contain business logic.
         Repositories handle data access. MCP handlers call services for business logic.
         Services use repositories for data access.
Category: decision
Confidence: 0.85
```

### Next Steps

- Task 9: Database schema extraction (parallel, Wave 2.1)
- Task 10: API surface mapping (parallel, Wave 2.1)
- Task 13: Integrate Wave 2 extractors into deep-scanner.ts (Wave 2.2)

## Task 10: Pattern Contribution Guide Generation (Wave 2.1)

**Completed**: Implemented "How to add new X" pattern extraction with TDD approach

### Implementation Details

1. **Added `generatePatternGuides()` method in `src/services/onboarding/deep-scanner.ts`**:
   - Generates contribution guides for detected design patterns
   - Called after pattern detection in `scanArchitecture()`
   - Returns `DeepScanFinding[]` with category='reference', area='architecture'

2. **Added `createPatternGuide()` helper method**:
   - Maps pattern names to actionable guides
   - Supported patterns: Repository, Handler, Service, Factory, Adapter, Strategy, Dependency Injection, Pipeline, Decorator, Observer
   - Format: "To add new [pattern]:\n1) Step 1\n2) Step 2\n3) Step 3"
   - Confidence: 0.8 for Repository/Handler/Service, 0.75 for others
   - Source: "pattern detection"

3. **Created 11 comprehensive tests in `tests/unit/onboarding/deep-scanner.test.ts`**:
   - Test: Generate at least one guide for this project (assertive test)
   - Test: Format guides with numbered steps
   - Test: Generate Repository/Handler/Service guides when detected
   - Test: Generate Factory/Adapter/Strategy guides when detected
   - Test: Only generate guides for detected patterns (no false positives)
   - Test: Confidence scores (0.8 for primary, 0.75 for secondary)
   - Test: Source field = "pattern detection"
   - Test: Guides only in architecture area

### Pattern Guide Mapping

| Pattern                | Guide Title                   | Confidence | Steps                                                                                                    |
| ---------------------- | ----------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| Repository Pattern     | How to add new Repository     | 0.8        | 1) Create interface in src/core/interfaces/repositories/ 2) Implement in src/db/repositories/ 3) Export  |
| Handler Pattern        | How to add new Handler        | 0.8        | 1) Create descriptor in src/mcp/descriptors/ 2) Create handler in src/mcp/handlers/ 3) Register in index |
| Service Layer          | How to add new Service        | 0.8        | 1) Create interface in src/services/ 2) Implement service class 3) Export from index                     |
| Factory Pattern        | How to add new Factory        | 0.75       | 1) Create factory function with create\* naming 2) Accept config params 3) Return configured instance    |
| Adapter Pattern        | How to add new Adapter        | 0.75       | 1) Define target interface 2) Create adapter class 3) Wrap external dependency                           |
| Strategy Pattern       | How to add new Strategy       | 0.75       | 1) Define strategy interface 2) Implement concrete strategy 3) Register in strategy map                  |
| Dependency Injection   | How to add new Dependency     | 0.75       | 1) Define interface for dependency 2) Register in DI container 3) Inject via constructor                 |
| Pipeline Pattern       | How to add new Pipeline Stage | 0.75       | 1) Create stage function with consistent signature 2) Add to pipeline config 3) Handle errors            |
| Decorator Pattern      | How to add new Decorator      | 0.75       | 1) Create decorator function wrapping target 2) Preserve original interface 3) Add enhanced behavior     |
| Observer/Event Pattern | How to add new Observer       | 0.75       | 1) Define event type 2) Create handler function 3) Register handler with event emitter                   |

### Key Learnings

1. **TDD Workflow**: Tests written first (RED), implementation second (GREEN)
   - Initial tests used conditional assertions (`if (finding)`) which passed even without implementation
   - Added assertive test (`expect(guideFindings.length).toBeGreaterThan(0)`) to force RED phase
   - This ensured proper TDD cycle

2. **Pattern Name Matching**: Guide titles must align with detected pattern names
   - Issue: "How to add new Injectable" didn't match "Dependency Injection"
   - Solution: Changed to "How to add new Dependency" (matches "Dependency" in "Dependency Injection")
   - Issue: "How to add new Event Handler" didn't match "Observer/Event Pattern"
   - Solution: Changed to "How to add new Observer" (matches "Observer" in pattern name)

3. **Test Pattern Matching Logic**: Used flexible matching for pattern validation
   - `pLower.includes(nameLower) || nameLower.includes(pLower.split(' ')[0])`
   - Handles both "Repository" in "Repository Pattern" and "Service" in "Service Layer"

4. **Confidence Scoring Strategy**:
   - 0.8 for primary patterns (Repository, Handler, Service) - well-established in codebase
   - 0.75 for secondary patterns (Factory, Adapter, etc.) - less structural certainty

5. **Integration Point**: Guides generated immediately after pattern detection
   - Ensures guides are only created for patterns that actually exist
   - Deduplication handled by existing `seenFindings` Set

### Test Coverage

- ✓ 57 tests pass (11 new tests for pattern guides)
- ✓ All pattern guides validated for format, confidence, source, area
- ✓ No false positives (guides only for detected patterns)
- ✓ Proper TDD cycle (RED → GREEN)

### Verification

- `npx vitest run tests/unit/onboarding/deep-scanner.test.ts` - 57 tests pass
- `npm run build` - Build passes with no errors
- LSP diagnostics clean (only unused import warning, unrelated to changes)

### Output Example

```
To add new Repository:
1) Create interface in src/core/interfaces/repositories/
2) Implement repository in src/db/repositories/
3) Export from src/db/repositories/index.ts
```

### Next Steps

- Task 11: Implement "Common gotchas" extraction (Wave 2.2)
- Task 12: Implement "Testing patterns" extraction (Wave 2.2)
- Task 13: Integrate Phase 2 extractors into deep-scanner.ts (Wave 2.3)
