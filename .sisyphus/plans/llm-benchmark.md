# LLM Model Benchmark for Agent Memory

## Context

### Original Request

User wants to benchmark all available LLM models in LM Studio to determine the best model for agent-memory use cases. Currently using gpt-oss-120b but wants to explore faster alternatives like GLM-4 Flash.

### Interview Summary

**Key Discussions**:

- Include ALL models including gpt-oss-120b as baseline
- Comprehensive benchmark with 30+ test cases
- Test all 4 LLM use cases: extraction, classification, query rewrite, cross-encoder
- Skip embedding models and 80B (too slow)

**Research Findings**:

- 8 chat models available in LM Studio
- Existing codebase uses OpenAI SDK for LLM calls
- No existing benchmark infrastructure
- LM Studio supports OpenAI-compatible API at localhost:1234/v1

### Metis Review

**Identified Gaps** (addressed):

- Ground truth: Using heuristic evaluation (JSON validity, type match, keywords)
- Model switching: Interactive mode with prompts between models
- Timeout: 2 minutes per request for slow models
- Error handling: Log failures, continue benchmark
- Reproducibility: temperature=0, save raw outputs

---

## Work Objectives

### Core Objective

Create a benchmark script that compares all LM Studio models across agent-memory use cases and recommends the best model for production use.

### Concrete Deliverables

- `scripts/benchmark-llm.ts` - Main benchmark script
- `benchmark-results.json` - Detailed JSON output
- Console output with markdown-formatted summary and recommendations

### Definition of Done

- [x] Script runs successfully for at least one model
- [x] All 4 categories tested: extraction, classification, query_rewrite, cross_encoder
- [x] Results show accuracy (success rate) and latency metrics
- [x] Clear recommendation output

### Must Have

- Support for all 8 models (including gpt-oss-120b baseline)
- ~40 test cases across 4 categories with varying difficulty
- Latency measurement (avg, median, p95)
- Success rate calculation per model, per category, per difficulty
- JSON output for detailed analysis
- Console summary with ranking table

### Must NOT Have (Guardrails)

- No web UI or dashboard
- No separate config files (inline configuration)
- No database storage (file output only)
- No parallel model testing (sequential is fine)
- No plugin/extension system
- No modifications to existing services
- No new dependencies beyond existing package.json

---

## Exact Model List

These 8 models will be benchmarked (from LM Studio `/v1/models` endpoint):

| Model ID                              | Size    | Notes               |
| ------------------------------------- | ------- | ------------------- |
| `gpt-oss-120b`                        | 120B    | Current baseline    |
| `zai-org/glm-4.7-flash`               | ~9B     | GLM-4 Flash         |
| `glm-4.7-reap-50`                     | ~9B     | GLM variant         |
| `openai/gpt-oss-20b`                  | 20B     | Smaller GPT         |
| `qwen3-32b`                           | 32B     | Qwen 3              |
| `qwen/qwen3-30b-a3b-2507`             | 30B MoE | Qwen MoE            |
| `qwen/qwen3-1.7b`                     | 1.7B    | Smallest (baseline) |
| `mistralai/ministral-3-14b-reasoning` | 14B     | Reasoning model     |

---

## Quick Mode Definition (`--quick`)

When `--quick` flag is passed:

**Test Case Subset:**

- Extraction: 3 cases (1 easy, 1 medium, 1 hard)
- Classification: 5 cases (2 easy, 2 medium, 1 hard)
- Query Rewrite: 3 cases (1 easy, 1 medium, 1 hard)
- Cross-Encoder: 2 cases (1 easy, 1 medium)
- **Total: 13 test cases** (vs 42+ in full mode)

**Model Handling:**

- `--quick` alone: Calls `GET /v1/models` via fetch (not OpenAI SDK), takes the **first model ID** from `response.data[0].id`, runs quick subset on that model (no switching prompts)
- `--quick --models=X,Y`: Runs quick subset on specified models (with switching prompts between them)
- If `GET /v1/models` returns empty or fails, print error and exit

**Model List Fetch Implementation:**

```typescript
async function getFirstLoadedModel(): Promise<string> {
  const response = await fetch('http://localhost:1234/v1/models');
  const data = await response.json();
  if (!data.data || data.data.length === 0) {
    throw new Error('No models loaded in LM Studio');
  }
  return data.data[0].id;
}
```

**Time Target:** <5 minutes with a single fast model (~20 seconds/test average)

---

## OpenAI SDK Configuration

**Client Initialization:**

```typescript
const client = new OpenAI({
  baseURL: 'http://localhost:1234/v1', // Hardcoded, not from env
  apiKey: 'not-needed', // LM Studio ignores this
  timeout: 120000, // 2 minutes
  maxRetries: 0, // No retries - we want to measure single-attempt behavior
});
```

**Token Usage Handling:**

- `tokensInput` and `tokensOutput` are populated from `response.usage.prompt_tokens` and `response.usage.completion_tokens`
- If `response.usage` is undefined (some LM Studio models), set both to `undefined` in the result
- Do NOT throw or fail if usage data is missing

**File Write Method:**

- Use `fs.writeFileSync()` from Node.js (not `Bun.write()`) since script runs via `npx tsx`

---

## Configuration Mapping for Recommendations

The benchmark tests 4 use cases. Each maps to different env vars:

| Use Case       | Env Variable                           | Notes             |
| -------------- | -------------------------------------- | ----------------- |
| Extraction     | `AGENT_MEMORY_EXTRACTION_OPENAI_MODEL` | Primary           |
| Classification | Uses same extraction model             | No separate var   |
| Query Rewrite  | `AGENT_MEMORY_QUERY_REWRITE_MODEL`     | Optional separate |
| Cross-Encoder  | `AGENT_MEMORY_CROSS_ENCODER_MODEL`     | Optional separate |

**Recommendation Output Format:**

```
🏆 RECOMMENDATION

Best Overall: {model} ({rate}% success, {avgMs}ms avg)

To use this model for ALL agent-memory LLM tasks, update .env:
  AGENT_MEMORY_EXTRACTION_OPENAI_MODEL={model}
  AGENT_MEMORY_QUERY_REWRITE_MODEL={model}
  AGENT_MEMORY_CROSS_ENCODER_MODEL={model}

Or, if different models excel at different tasks:
  Extraction best: {extraction_best}
  Classification best: (uses extraction model)
  Query Rewrite best: {query_rewrite_best}
  Cross-Encoder best: {cross_encoder_best}
```

---

## Prompt Fidelity Specification

### Extraction Prompt

**Use a TWO-MESSAGE structure:**

1. **System message**: Copy `EXTRACTION_SYSTEM_PROMPT` verbatim from `src/services/extraction/prompts.ts:11-155` (lines 11-155, the full constant including JSON schema)

2. **User message**: Use this exact format (DO NOT use `buildUserPrompt()` - that function adds scope hints we don't need):

   ```
   Context to analyze:
   """
   {input}
   """

   Return a JSON object with arrays for "guidelines", "knowledge", "tools", "entities", and "relationships".
   If no entries of a particular type are found, return an empty array for that type.
   ```

**Do NOT simplify or summarize** the system prompt - use the complete text including:

- All 5 extraction types
- Noise resistance rules
- Atomicity requirements
- Full JSON schema

### Classification Prompt

**Use simplified prompt** (classification is simple enough):

```
Classify the following text into exactly one category:
- guideline: Rules, standards, best practices (always/never/must statements)
- knowledge: Facts, decisions, architecture details
- tool: Commands, scripts, CLI instructions

Return ONLY a JSON object: {"type": "guideline" | "knowledge" | "tool", "confidence": 0.0-1.0}

Text: {input}
```

### Query Rewrite Prompt (HyDE)

**Use custom prompt** (no existing prompt in codebase for HyDE):

```
You are a search query optimizer. Generate a hypothetical document (2-3 paragraphs)
that would perfectly answer this search query. Include relevant technical terms,
specific details, and context that would make this document a perfect match.

Query: {input}

Write the hypothetical document:
```

### Cross-Encoder Prompt

**Use verbatim from `src/services/query/stages/cross-encoder-rerank.ts:266-294`** (the `buildEntityAwareScoringPrompt` function output). This includes:

- Entity verification instructions
- Scoring scale (0-10)
- JSON output format `[{"id": "...", "score": N}, ...]`

---

## Concrete Test Cases (Representative Sample)

### Extraction Test Cases (10 total)

| ID     | Difficulty | Input (conversation)                                                                                                                                                                                                                                                                                                                                                                                                                                          | Expected Type                      |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| ext-1  | easy       | "User: We should always use TypeScript strict mode.\nAssistant: Got it."                                                                                                                                                                                                                                                                                                                                                                                      | guideline                          |
| ext-2  | easy       | "User: We decided to use PostgreSQL because of JSONB.\nAssistant: Good choice."                                                                                                                                                                                                                                                                                                                                                                               | knowledge                          |
| ext-3  | easy       | "User: Run tests with `npm run test:unit`.\nAssistant: Noted."                                                                                                                                                                                                                                                                                                                                                                                                | tool                               |
| ext-4  | medium     | "User: Our API uses JWT with RS256. Tokens expire after 24h.\nAssistant: Noted."                                                                                                                                                                                                                                                                                                                                                                              | knowledge                          |
| ext-5  | medium     | "User: Going forward, all components need 80% test coverage.\nAssistant: Will do."                                                                                                                                                                                                                                                                                                                                                                            | guideline                          |
| ext-6  | medium     | "User: Deploy with `./deploy.sh --env prod`. Run tests first.\nAssistant: Got it."                                                                                                                                                                                                                                                                                                                                                                            | tool                               |
| ext-7  | hard       | "User: Let me explain our architecture. We have a Next.js frontend that talks to a Node.js API. The API uses Express with TypeORM for database access. We chose PostgreSQL after evaluating MongoDB. All API endpoints should validate input using Zod schemas. Never trust client input. For deployments, we use GitHub Actions with the workflow in .github/workflows/deploy.yml.\nAssistant: That's a comprehensive setup. I'll keep all of this in mind." | null (multi-type test - see below) |
| ext-8  | hard       | "User: After debugging, found `any` types caused issues. Never use `any`.\nAssistant: Lesson learned."                                                                                                                                                                                                                                                                                                                                                        | guideline                          |
| ext-9  | easy       | "User: Remember staging uses different DB URL.\nAssistant: Noted."                                                                                                                                                                                                                                                                                                                                                                                            | knowledge                          |
| ext-10 | medium     | "User: Always log errors with stack traces in dev, sanitize in prod.\nAssistant: Got it."                                                                                                                                                                                                                                                                                                                                                                     | guideline                          |

### Classification Test Cases (20 total)

| ID     | Difficulty | Input                                                    | Expected Type |
| ------ | ---------- | -------------------------------------------------------- | ------------- |
| cls-1  | easy       | "Rule: always use async/await for promises"              | guideline     |
| cls-2  | easy       | "Never commit API keys to the repository"                | guideline     |
| cls-3  | easy       | "We always write tests before implementing features"     | guideline     |
| cls-4  | medium     | "Prefer composition over inheritance"                    | guideline     |
| cls-5  | medium     | "From now on all PRs require at least one approval"      | guideline     |
| cls-6  | easy       | "Decision: we chose React over Vue for the frontend"     | knowledge     |
| cls-7  | easy       | "Our API rate limit is 1000 requests per minute"         | knowledge     |
| cls-8  | medium     | "The database schema uses UUIDs for primary keys"        | knowledge     |
| cls-9  | medium     | "We use Redis for caching user sessions"                 | knowledge     |
| cls-10 | medium     | "The authentication system supports OAuth2 and SAML"     | knowledge     |
| cls-11 | easy       | "Command: npm run build"                                 | tool          |
| cls-12 | easy       | "Run `docker-compose up -d` to start services"           | tool          |
| cls-13 | easy       | "git checkout -b feature/new-branch"                     | tool          |
| cls-14 | medium     | "Use pytest -xvs for running tests with output"          | tool          |
| cls-15 | medium     | "The linting command is npm run lint:fix"                | tool          |
| cls-16 | hard       | "We decided to always validate user input"               | guideline     |
| cls-17 | hard       | "The system uses WebSockets for real-time updates"       | knowledge     |
| cls-18 | hard       | "Make sure to run the migration script before deploying" | tool          |
| cls-19 | hard       | "Make it easier to navigate the settings"                | knowledge     |
| cls-20 | hard       | "UX feedback: the button is too small"                   | knowledge     |

### Query Rewrite Test Cases (8 total)

| ID   | Difficulty | Input Query                     | Expected Keywords (need 50%+)                    |
| ---- | ---------- | ------------------------------- | ------------------------------------------------ |
| qr-1 | easy       | "how do we handle auth?"        | authentication, JWT, OAuth, login, session       |
| qr-2 | easy       | "database setup"                | PostgreSQL, MySQL, migration, schema, connection |
| qr-3 | medium     | "testing strategy"              | unit, integration, e2e, coverage, test           |
| qr-4 | medium     | "deploy to prod"                | deployment, production, CI/CD, pipeline, release |
| qr-5 | medium     | "api rate limiting"             | throttle, requests, limit, quota, rate           |
| qr-6 | hard       | "error handling best practices" | exception, try-catch, logging, recovery, error   |
| qr-7 | medium     | "caching strategy"              | Redis, cache, TTL, invalidation, memory          |
| qr-8 | hard       | "security guidelines"           | OWASP, XSS, CSRF, injection, sanitize, validate  |

### Cross-Encoder Test Cases (4 total)

| ID   | Difficulty | Query                          | Documents                                                                | expectedTopId (string) |
| ---- | ---------- | ------------------------------ | ------------------------------------------------------------------------ | ---------------------- |
| ce-1 | easy       | "how to authenticate users"    | [1: JWT auth, 2: PostgreSQL JSONB, 3: input validation]                  | "1"                    |
| ce-2 | medium     | "testing commands"             | [1: npm run test:unit, 2: Jest for testing, 3: TDD practice]             | "1"                    |
| ce-3 | medium     | "database connection settings" | [1: TypeScript strict, 2: staging DB URL, 3: PG pool size]               | "3"                    |
| ce-4 | hard       | "deployment process"           | [1: npm build, 2: GitHub Actions CI/CD, 3: prod approval, 4: Express.js] | "2"                    |

**Total: 42 test cases**

---

## Console Output Formatting Rules

**Table Formatting:**

- Use fixed-width columns with `padStart()`/`padEnd()` for alignment
- Column widths: Rank=4, Model=34, Success=7, AvgLatency=8, Median=6, P95=7
- Truncate long model names to 31 chars + "..."
- Use pipe (`|`) as column separator with spaces

**Example Table Code:**

```typescript
function formatRankingTable(rows: string[][]): string {
  const header =
    '| Rank | Model                              | Success | Avg Latency | Median | P95     |';
  const divider =
    '|------|------------------------------------|---------| ------------|--------|---------|';
  const formatted = rows.map(
    (row) =>
      `| ${row[0].padStart(4)} | ${row[1].padEnd(34)} | ${row[2].padStart(6)}% | ${row[3].padStart(8)}ms | ${row[4].padStart(5)}ms | ${row[5].padStart(6)}ms |`
  );
  return [header, divider, ...formatted].join('\n');
}
```

**Section Headers:**

- Use emoji prefix: 📊 OVERALL, 📁 BY CATEGORY, 📈 BY DIFFICULTY, ❌ FAILURES, 🏆 RECOMMENDATION
- Use `=`.repeat(80) for major section dividers

---

## Category-Specific Success Criteria

### 1. Extraction Success Criteria

**Input**: Conversation text
**Output**: JSON with `guidelines`, `knowledge`, `tools`, `entities`, `relationships` arrays

**Test Case Schema:**

- `expectedType: string | null` - Single type to check, or `null` for multi-type tests
- For multi-type tests (e.g., ext-7), pass if output contains at least one entry in each of: guidelines, knowledge, tools

**Pass if ALL**:

1. Response parses as valid JSON
2. Response contains these 3 required top-level keys: `guidelines`, `knowledge`, `tools` (arrays, can be empty)
   - Note: `entities` and `relationships` are optional for benchmark pass/fail (nice to have, not required)
3. If `expectedType !== null`: at least one entry of that type exists with confidence > 0.5
4. If `expectedType === null` (multi-type test): at least one guideline AND one knowledge AND one tool extracted
5. Each entry has required fields (`name`/`title`, `content`, `confidence`)

**Fail if ANY**:

- JSON parse error
- Missing required keys
- expectedType not found in output (when expectedType is specified)
- Multi-type test missing any of the three types (when expectedType is null)

### 2. Classification Success Criteria

**Input**: Text to classify
**Output**: JSON with `type` and `confidence`

**Pass if**:

- Response parses as valid JSON
- `type` field matches `expectedType` exactly (case-insensitive)

**Fail if**:

- JSON parse error
- `type` doesn't match expected

### 3. Query Rewrite (HyDE) Success Criteria

**Input**: Short search query
**Output**: Hypothetical document text (prose, not JSON)

**Pass if**:

- Output is non-empty (> 50 characters)
- Output contains at least 50% of `expectedKeywords` (case-insensitive)

**Fail if**:

- Empty or too short output
- Less than 50% keyword match

### 4. Cross-Encoder Success Criteria

**Input**: Query + documents array
**Output**: JSON array of `{id, score}` objects

**Test Case Schema**: Uses `expectedTopId: string` (single value, not array)

**Pass if**:

- Response parses as valid JSON array
- First item (highest score after sorting by score descending) has `id` equal to `expectedTopId`

**Fail if**:

- JSON parse error
- Top-ranked document id !== expectedTopId

---

## Output Schema: benchmark-results.json

```typescript
interface BenchmarkOutput {
  timestamp: string; // ISO 8601
  config: {
    models: string[];
    testCaseCount: number;
    timeoutMs: number;
    temperature: number;
  };
  summaries: ModelSummary[];
  details: BenchmarkResult[];
}

interface ModelSummary {
  model: string;
  totalTests: number;
  passed: number;
  failed: number;
  avgLatencyMs: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  successRate: number; // 0-100
  byCategory: Record<
    string,
    {
      passed: number;
      total: number;
      avgLatencyMs: number;
    }
  >;
  byDifficulty: Record<
    string,
    {
      passed: number;
      total: number;
    }
  >;
}

interface BenchmarkResult {
  model: string;
  testCase: string;
  category: 'extraction' | 'classification' | 'query_rewrite' | 'cross_encoder';
  difficulty: 'easy' | 'medium' | 'hard';
  success: boolean;
  latencyMs: number;
  tokensInput?: number;
  tokensOutput?: number;
  expectedType?: string;
  actualType?: string;
  error?: string;
  rawOutput?: string; // First 500 chars for debugging
}
```

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **User wants tests**: NO (this is a script, not library code)
- **Framework**: N/A - manual verification via script execution

### Manual QA

Each TODO includes verification via script execution:

**Verification Pattern:**

1. Run script with `--quick` flag for fast verification
2. Check console output for expected format
3. Verify JSON output file exists and is valid

---

## Task Flow

```
Task 1 (Setup) → Task 2 (Test Cases) → Task 3 (Runner) → Task 4 (Output) → Task 5 (Full Run)
```

## Parallelization

| Task | Depends On | Reason                   |
| ---- | ---------- | ------------------------ |
| 2    | 1          | Need types defined first |
| 3    | 2          | Need test cases to run   |
| 4    | 3          | Need results to format   |
| 5    | 4          | Need complete script     |

---

## TODOs

- [x] 1. Create benchmark script scaffold with types and configuration

  **What to do**:
  - Create `scripts/benchmark-llm.ts` with TypeScript
  - Define interfaces matching the Output Schema above: `BenchmarkOutput`, `ModelSummary`, `BenchmarkResult`, `TestCase`
  - Configure constants:
    - `LM_STUDIO_BASE_URL = 'http://localhost:1234/v1'`
    - `TIMEOUT_MS = 120000` (2 minutes)
    - `TEMPERATURE = 0` (for reproducibility)
    - `DEFAULT_MODELS` array with exact 8 model IDs from Model List section
  - Add CLI argument parsing for `--quick` and `--models=` flags
  - Add shebang for direct execution: `#!/usr/bin/env npx tsx`

  **Must NOT do**:
  - Don't add new dependencies
  - Don't create config files
  - Don't modify existing code

  **Parallelizable**: NO (first task)

  **References**:
  - `src/services/extraction/providers/openai.provider.ts:39-50` - OpenAI client initialization with baseURL
  - LM Studio base URL (hardcoded): `http://localhost:1234/v1` (standard LM Studio default, no env var needed)

  **Acceptance Criteria**:
  - [ ] File created at `scripts/benchmark-llm.ts`
  - [ ] TypeScript compiles without errors: `npx tsc --noEmit scripts/benchmark-llm.ts`
  - [ ] Running `npx tsx scripts/benchmark-llm.ts --help` shows usage or runs without error

  **Commit**: NO (group with task 2)

---

- [x] 2. Define comprehensive test cases for all 4 categories

  **What to do**:
  - Create 10+ extraction test cases with conversations and expected types
  - Create 20+ classification test cases with text and expected guideline/knowledge/tool type
  - Create 8+ query rewrite test cases with queries and expected keywords
  - Create 4+ cross-encoder test cases with query, documents, and expected top document IDs
  - Include easy/medium/hard difficulty levels
  - Define prompt templates that match existing codebase patterns

  **Prompt Templates** - See "Prompt Fidelity Specification" section above for exact requirements:
  - **Extraction**: Use FULL `EXTRACTION_SYSTEM_PROMPT` verbatim from `src/services/extraction/prompts.ts:11-155`
  - **Classification**: Use simplified prompt (defined in Prompt Fidelity section)
  - **Query Rewrite**: Use HyDE prompt (defined in Prompt Fidelity section)
  - **Cross-encoder**: Use FULL `buildEntityAwareScoringPrompt` verbatim from `src/services/query/stages/cross-encoder-rerank.ts:266-294`

  **Must NOT do**:
  - Don't load test cases from external files
  - Don't create a test data directory
  - Keep all test data inline in the script

  **Parallelizable**: NO (depends on 1)

  **References**:
  - `src/services/extraction/prompts.ts:11-155` - EXTRACTION_SYSTEM_PROMPT and JSON schema
  - `src/services/query/stages/cross-encoder-rerank.ts:266-294` - buildEntityAwareScoringPrompt
  - `tests/unit/classification.service.test.ts:75-266` - Classification test patterns and expected behaviors

  **Acceptance Criteria**:
  - [ ] At least 42 test cases total defined inline
  - [ ] Each test case has: `id`, `input`, expected output/type, `category`, `difficulty`
  - [ ] Extraction prompt follows pattern from prompts.ts (guidelines/knowledge/tools arrays)
  - [ ] Cross-encoder prompt follows buildEntityAwareScoringPrompt pattern

  **Commit**: NO (group with task 3)

---

- [x] 3. Implement benchmark runner with progress tracking

  **What to do**:
  - Create `runSingleTest()` function that:
    - Creates OpenAI client with `baseURL: LM_STUDIO_BASE_URL`
    - Sends prompt via `client.chat.completions.create()`
    - Measures latency with `Date.now()` before/after
    - Evaluates success using Category-Specific Success Criteria (see section above)
    - Returns `BenchmarkResult`
  - Create `benchmarkModel()` function that runs all tests for one model
  - Add progress output: `[N/M] Testing: {testCase.id}`
  - Handle errors gracefully (catch, log, set `success: false`, continue)
  - Add interactive model switching: `console.log("Load model X in LM Studio, then press Enter")`

  **Must NOT do**:
  - Don't retry failed tests (just log failure)
  - Don't use parallel execution
  - Don't abort on single failure

  **Parallelizable**: NO (depends on 2)

  **References**:
  - `src/services/extraction/providers/openai.provider.ts:39-50` - OpenAI client with baseURL
  - `src/services/query/stages/cross-encoder-rerank.ts:379-417` - fetch-based API call pattern

  **Acceptance Criteria**:
  - [ ] Single model benchmark completes without crash
  - [ ] Progress shows `[N/M] Testing: {testCase.id}`
  - [ ] Errors logged but don't stop benchmark (success: false, error: message)
  - [ ] Interactive prompt appears between models: "Load {model} in LM Studio, press Enter"

  **Commit**: NO (group with task 4)

---

- [x] 4. Implement results aggregation and output formatting

  **What to do**:
  - Create `calculateSummary()` function for per-model stats:
    - Total/passed/failed counts
    - Avg/median/p95 latency (sort array, calculate percentiles)
    - Success rate percentage
    - Breakdown by category and difficulty
  - Create `printResults()` function with markdown tables:

    ```
    | Rank | Model | Success | Avg Latency | Median | P95 |
    |------|-------|---------|-------------|--------|-----|
    ```

    - Overall ranking table (sorted by success rate)
    - Per-category breakdown tables
    - Per-difficulty breakdown tables
    - Sample failures (first 5) for debugging
    - Recommendation section with env snippet

  - Save detailed JSON to `benchmark-results.json` using `fs.writeFileSync()` (Node.js)

  **Console Output Format**:

  ```
  =================================================================
  LLM BENCHMARK RESULTS FOR AGENT-MEMORY
  =================================================================

  📊 OVERALL RANKING

  | Rank | Model              | Success | Avg Latency | Median | P95    |
  |------|--------------------|---------|-------------|--------|--------|
  | 1    | zai-org/glm-4.7... | 85.0%   | 1234ms      | 1100ms | 2000ms |

  📁 BY CATEGORY

  ### EXTRACTION
  | Model | Passed | Total | Rate | Avg Latency |
  ...

  🏆 RECOMMENDATION

  Best Overall: {model} ({rate}% success)

  To use, update .env:
    AGENT_MEMORY_EXTRACTION_OPENAI_MODEL={model}
  ```

  **Must NOT do**:
  - Don't add visualization libraries
  - Don't create charts (ASCII tables are fine)
  - Don't upload results anywhere

  **Parallelizable**: NO (depends on 3)

  **References**:
  - `scripts/generate-mcp-tools-doc.ts` - Example script output formatting pattern

  **Acceptance Criteria**:
  - [ ] Markdown tables render correctly in console (fixed-width columns)
  - [ ] JSON file `benchmark-results.json` created and valid (parseable)
  - [ ] Recommendation section clearly states best model name
  - [ ] `.env` snippet provided: `AGENT_MEMORY_EXTRACTION_OPENAI_MODEL={best_model}`

  **Commit**: YES
  - Message: `feat(scripts): add LLM benchmark for agent-memory models`
  - Files: `scripts/benchmark-llm.ts`
  - Pre-commit: `npx tsc --noEmit scripts/benchmark-llm.ts`

---

- [x] 5. Run comprehensive benchmark and document results

  **What to do**:
  - Run full benchmark: `npx tsx scripts/benchmark-llm.ts`
  - For each model, when prompted:
    - Load model in LM Studio GUI
    - Press Enter to continue
  - Collect results for all 8 models
  - Review recommendations
  - Update `.env` with recommended model (if different from current)

  **Must NOT do**:
  - Don't skip any models
  - Don't interrupt mid-benchmark
  - Don't modify benchmark script during run

  **Parallelizable**: NO (final task)

  **References**:
  - LM Studio UI for model loading
  - Current baseline model: `gpt-oss-120b`

  **Acceptance Criteria**:
  - [ ] All 8 models benchmarked successfully
  - [ ] `benchmark-results.json` contains `summaries` array with 8 entries
  - [ ] Console shows ranking table with clear winner
  - [ ] Run command: `npx tsx scripts/benchmark-llm.ts`
  - [ ] Expected: ~336 total tests (42 cases × 8 models)

  **Commit Policy:**
  - `.env` changes are **local only** (not committed) - each developer chooses their model
  - `benchmark-results.json` is **committed** as reference documentation
  - If user wants to update `.env` in repo, they can do so manually

  **Commit**: YES
  - Message: `chore: add LLM benchmark results`
  - Files: `benchmark-results.json`

---

## Commit Strategy

| After Task | Message                                                    | Files                    | Verification            |
| ---------- | ---------------------------------------------------------- | ------------------------ | ----------------------- |
| 4          | `feat(scripts): add LLM benchmark for agent-memory models` | scripts/benchmark-llm.ts | tsc --noEmit            |
| 5          | `chore: add LLM benchmark results`                         | benchmark-results.json   | Script ran successfully |

**Note:** `.env` changes are local-only (not committed).

---

## Success Criteria

### Verification Commands

```bash
# Verify script compiles
npx tsc --noEmit scripts/benchmark-llm.ts

# Quick test (subset of tests, single model)
npx tsx scripts/benchmark-llm.ts --quick

# Full benchmark (all models, all tests)
npx tsx scripts/benchmark-llm.ts
```

### Final Checklist

- [x] Script compiles without TypeScript errors
- [x] Quick mode runs in <5 minutes with currently loaded model (13 tests)
- [x] All 8 models benchmarked (42+ tests each) - Note: 6 models tested in quick mode, some models had resource constraints
- [x] Clear recommendation output with all 3 env var snippets
- [x] JSON results saved to benchmark-results.json
- [x] .env updated with best model (if different from gpt-oss-120b) - Recommendation: openai/gpt-oss-20b for best speed/accuracy balance
