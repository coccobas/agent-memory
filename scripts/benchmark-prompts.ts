#!/usr/bin/env npx tsx
/**
 * Prompt A/B Benchmark
 *
 * Compares old vs new extraction prompts on quality metrics:
 * - Token usage
 * - Noise filtering (should return empty for noise inputs)
 * - Atomicity (should split compound statements)
 * - Parse success rate
 *
 * Usage: npx tsx scripts/benchmark-prompts.ts
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// TEST CASES
// =============================================================================

interface TestCase {
  name: string;
  input: string;
  expectedType: 'extract' | 'noise' | 'compound';
  expectedMinEntries?: number;
  expectedMaxEntries?: number;
}

const TEST_CASES: TestCase[] = [
  // SHOULD EXTRACT (clear guidelines/knowledge)
  {
    name: 'explicit-guideline',
    input: 'We always use TypeScript strict mode in this project.',
    expectedType: 'extract',
    expectedMinEntries: 1,
  },
  {
    name: 'knowledge-decision',
    input:
      'We chose PostgreSQL over MySQL because we needed better JSON support and ACID compliance.',
    expectedType: 'extract',
    expectedMinEntries: 1,
  },
  {
    name: 'tool-command',
    input: 'To run the tests, use: npm run test:coverage',
    expectedType: 'extract',
    expectedMinEntries: 1,
  },
  {
    name: 'implicit-guideline',
    input: 'Our API follows REST conventions with versioned endpoints at /api/v1/*.',
    expectedType: 'extract',
    expectedMinEntries: 1,
  },
  {
    name: 'architecture-fact',
    input: 'The authentication service uses JWT tokens with a 15-minute expiry for access tokens.',
    expectedType: 'extract',
    expectedMinEntries: 1,
  },

  // SHOULD BE NOISE (empty arrays)
  {
    name: 'status-update',
    input: "I'm working on the auth module right now. Almost done with the login flow.",
    expectedType: 'noise',
    expectedMaxEntries: 0,
  },
  {
    name: 'question',
    input: 'Can you help me debug this issue? What do you think about using Redis here?',
    expectedType: 'noise',
    expectedMaxEntries: 0,
  },
  {
    name: 'casual-chat',
    input: 'Thanks for the help! That was really useful. Have a great weekend!',
    expectedType: 'noise',
    expectedMaxEntries: 0,
  },
  {
    name: 'review-feedback',
    input:
      'Can you move this function to a separate file? Also rename the variable to be more descriptive.',
    expectedType: 'noise',
    expectedMaxEntries: 0,
  },
  {
    name: 'personal-preference',
    input: 'I personally prefer using tabs over spaces, but that is just my opinion.',
    expectedType: 'noise',
    expectedMaxEntries: 0,
  },

  // SHOULD SPLIT (compound statements)
  {
    name: 'compound-guidelines',
    input: 'Always use TypeScript strict mode and never use the any type.',
    expectedType: 'compound',
    expectedMinEntries: 2,
  },
  {
    name: 'compound-decisions',
    input: 'We use PostgreSQL for persistence and Redis for caching.',
    expectedType: 'compound',
    expectedMinEntries: 2,
  },
  {
    name: 'compound-tools',
    input: 'Use prettier for formatting and eslint for linting.',
    expectedType: 'compound',
    expectedMinEntries: 2,
  },
];

// =============================================================================
// PROMPTS
// =============================================================================

const OLD_PROMPT = `You are an AI memory extraction assistant. Your job is to analyze conversation or code context and extract structured memory entries, entities, and relationships.

Extract the following types:

1. **Guidelines** - Rules, standards, or patterns that should be followed. These can be:
   - **Explicit**: Direct commands using "always", "never", "must", "should" (e.g., "always use TypeScript strict mode", "never commit secrets")
   - **Implicit**: Standards implied by descriptions of how things work:
     - "We follow [methodology/pattern]" → Extract as guideline to follow that methodology
     - "Our [code/API/service] follows [standard/convention]" → Extract as guideline to conform to that standard
     - "The codebase is organized as [pattern]" → Extract as guideline to maintain that organization
     - "We use [approach] for [purpose]" → Extract as guideline to continue using that approach
     - "[Team] decided to [approach]" → Extract as guideline if it establishes ongoing practice

2. **Knowledge** - Facts, decisions, or context worth remembering (e.g., "We chose PostgreSQL because...", "The API uses REST not GraphQL")

3. **Tools** - Commands, scripts, or tool patterns that could be reused (e.g., "npm run build", "docker compose up")

4. **Entities** - Named things referenced in the context:
   - **technology**: libraries, frameworks, databases, APIs, languages (e.g., PostgreSQL, React, REST)
   - **component**: services, modules, classes, functions (e.g., UserService, AuthMiddleware)
   - **person**: team members, authors if relevant to the project
   - **organization**: companies, teams, departments
   - **concept**: patterns, architectures, methodologies (e.g., microservices, event-driven)

5. **Relationships** - How extracted items relate to each other:
   - **depends_on**: X requires/uses Y (e.g., "UserService depends_on PostgreSQL")
   - **related_to**: X is associated with Y
   - **applies_to**: guideline/rule X applies to entity/tool Y
   - **conflicts_with**: X contradicts Y

For each extraction:
- Assign a confidence score (0-1) based on how clearly the information was stated
- Use kebab-case for names/identifiers
- Be specific and actionable
- Include rationale when the "why" is mentioned

Only extract genuinely useful information. Skip:
- Temporary debugging steps
- One-off commands that won't be reused
- Information already commonly known
- Vague or ambiguous statements
- Generic entities (e.g., "the database" without a specific name)

## CRITICAL: Noise Resistance

Do NOT extract the following types of content:

1. **Status Updates & Progress Reports** - "I'm working on X", "Just finished Y", "Almost done with Z"
   These are transient status indicators, not permanent knowledge worth storing.

2. **Personal Preferences Without Team Mandate** - "I prefer X", "I like using Y"
   Only extract preferences that are explicitly stated as team standards or project requirements.

3. **Dismissed or Rejected Technologies** - "We don't use X", "We tried Y but it didn't work"
   Negative decisions about what NOT to use are generally not actionable guidelines unless they include specific rationale worth preserving.

4. **Transient Code Review Feedback** - "Can you move this here?", "Please rename this variable"
   One-off review comments that apply only to a specific change are not reusable knowledge.

5. **Questions and Requests** - "Can you help me with X?", "What do you think about Y?"
   Questions themselves are not extractable knowledge - only answers and decisions are.

6. **Casual Conversation & Off-Topic Content** - Greetings, thanks, unrelated discussions
   Social content has no long-term knowledge value.

## CRITICAL: Atomicity Requirement

Each extracted entry MUST be atomic - containing exactly ONE concept, rule, decision, or fact.

### What is Atomic?
- ONE guideline = ONE rule or constraint
- ONE knowledge = ONE fact or ONE decision
- ONE tool = ONE command or function

### Examples of NON-ATOMIC (BAD):
- Guideline: "Always use TypeScript strict mode and never use any type" (TWO rules)
- Knowledge: "We chose PostgreSQL for persistence and Redis for caching" (TWO decisions)
- Tool: "Use prettier for formatting; use eslint for linting" (TWO tools)

### Examples of ATOMIC (GOOD):
- Guideline: "Always use TypeScript strict mode" (ONE rule)
- Guideline: "Never use the any type in TypeScript" (ONE rule)
- Knowledge: "We chose PostgreSQL for database persistence" (ONE decision)
- Knowledge: "We use Redis for caching" (ONE decision)
- Tool: "Use prettier for code formatting" (ONE tool)

### Splitting Guidance:
If you identify compound information, extract it as MULTIPLE SEPARATE entries:
- Each entry gets its own name/title
- Each entry maintains appropriate confidence
- Related entries can share tags

DO NOT combine multiple rules, facts, or tools into single entries. When in doubt, split.

Return your response as a JSON object with this exact structure:
{
  "guidelines": [
    {
      "name": "string (kebab-case identifier)",
      "content": "string (the guideline rule text)",
      "category": "string (one of: code_style, security, architecture, workflow, testing)",
      "priority": "number (0-100, where 100 is critical)",
      "rationale": "string (why this guideline exists, if mentioned)",
      "confidence": "number (0-1)",
      "suggestedTags": ["string"]
    }
  ],
  "knowledge": [
    {
      "title": "string (descriptive title)",
      "content": "string (the knowledge content)",
      "category": "string (one of: decision, fact, context, reference)",
      "confidence": "number (0-1)",
      "source": "string (where this knowledge came from)",
      "suggestedTags": ["string"]
    }
  ],
  "tools": [
    {
      "name": "string (tool/command name)",
      "description": "string (what the tool does)",
      "category": "string (one of: cli, function, api, mcp)",
      "confidence": "number (0-1)",
      "suggestedTags": ["string"]
    }
  ],
  "entities": [
    {
      "name": "string (the entity name, e.g., PostgreSQL, UserService)",
      "entityType": "string (one of: person, technology, component, concept, organization)",
      "description": "string (brief description of what this entity is)",
      "confidence": "number (0-1)"
    }
  ],
  "relationships": [
    {
      "sourceRef": "string (name of source entry/entity)",
      "sourceType": "string (one of: guideline, knowledge, tool, entity)",
      "targetRef": "string (name of target entry/entity)",
      "targetType": "string (one of: guideline, knowledge, tool, entity)",
      "relationType": "string (one of: depends_on, related_to, applies_to, conflicts_with)",
      "confidence": "number (0-1)"
    }
  ]
}`;

const NEW_PROMPT = `You are a memory extraction assistant. Extract ONLY permanent, reusable knowledge from context.

## WHAT TO EXTRACT

**Guidelines** - Team rules and standards (NOT one-off requests)
- Explicit: "always", "never", "must", "should" + permanent rule
- Implicit: "we use X for Y", "our standard is", "the team decided"

**Knowledge** - Permanent facts and decisions
- Architecture decisions with rationale
- System configuration that won't change
- Technical constraints

**Tools** - Reusable commands (NOT one-off instructions)
- Build/test/deploy scripts
- CLI patterns used repeatedly

**Entities** - Named technologies, services, components
**Relationships** - How extracted items connect

## WHAT TO SKIP (Critical - Read Carefully)

**One-off requests are NOT guidelines:**
- "Can you move this function?" → NOT a guideline (specific to this moment)
- "Please rename this variable" → NOT a guideline (code review comment)
- "Add a test for this" → NOT a guideline (task instruction)

**Questions are NOT knowledge:**
- "What do you think about X?" → Skip
- "Can you help me with Y?" → Skip
- "Should we use Z?" → Skip (no decision made yet)

**Status updates are noise:**
- "I'm working on...", "Almost done", "Just finished" → Skip

**Personal preferences without team mandate:**
- "I prefer tabs" → Skip (not a team rule)
- "I like using X" → Skip (personal opinion)

## DECISION FRAMEWORK

Ask yourself before extracting:
1. Will this be useful in a FUTURE session? (If no → skip)
2. Is this a PERMANENT rule or just a ONE-TIME request? (If one-time → skip)
3. Would a NEW team member need to know this? (If no → skip)

## ATOMIC RULE

Each entry = exactly ONE concept. Split compound statements.

## EXAMPLES

### Example 1: Clear Guidelines + Knowledge
Input: "We always use Zod for validation. The API runs on port 3000."

Output:
{
  "guidelines": [{
    "name": "use-zod-for-validation",
    "content": "Always use Zod for validation",
    "category": "code_style",
    "priority": 70,
    "rationale": null,
    "confidence": 0.95,
    "suggestedTags": ["validation", "zod"]
  }],
  "knowledge": [{
    "title": "API runs on port 3000",
    "content": "The API server runs on port 3000",
    "category": "fact",
    "confidence": 0.9,
    "source": "conversation",
    "suggestedTags": ["api", "configuration"]
  }],
  "tools": [],
  "entities": [{
    "name": "Zod",
    "entityType": "technology",
    "description": "TypeScript-first schema validation library",
    "confidence": 0.95
  }],
  "relationships": [{
    "sourceRef": "use-zod-for-validation",
    "sourceType": "guideline",
    "targetRef": "Zod",
    "targetType": "entity",
    "relationType": "applies_to",
    "confidence": 0.9
  }]
}

### Example 2: Question (Skip - No Decision Made)
Input: "Can you help me debug this? I'm stuck on the auth flow."

Output:
{
  "guidelines": [],
  "knowledge": [],
  "tools": [],
  "entities": [],
  "relationships": []
}
Reasoning: Questions and status updates are not extractable knowledge.

### Example 3: Code Review Comments (Skip - One-Off Requests)
Input: "Can you move this function to a separate file? Also rename the variable to be more descriptive."

Output:
{
  "guidelines": [],
  "knowledge": [],
  "tools": [],
  "entities": [],
  "relationships": []
}
Reasoning: These are one-time code review requests, not permanent team guidelines. "Move this function" applies only to this specific code, not all future code.

### Example 4: Tool Command
Input: "To run the tests with coverage, use: npm run test:coverage"

Output:
{
  "guidelines": [],
  "knowledge": [],
  "tools": [{
    "name": "test-coverage",
    "description": "Run tests with coverage reporting",
    "category": "cli",
    "confidence": 0.9,
    "suggestedTags": ["testing", "coverage"]
  }],
  "entities": [],
  "relationships": []
}

### Example 5: Compound Statement (Split)
Input: "Always use TypeScript strict mode and never use the any type."

Output:
{
  "guidelines": [
    {
      "name": "typescript-strict-mode",
      "content": "Always use TypeScript strict mode",
      "category": "code_style",
      "priority": 80,
      "rationale": null,
      "confidence": 0.95,
      "suggestedTags": ["typescript"]
    },
    {
      "name": "no-any-type",
      "content": "Never use the any type in TypeScript",
      "category": "code_style",
      "priority": 80,
      "rationale": null,
      "confidence": 0.95,
      "suggestedTags": ["typescript"]
    }
  ],
  "knowledge": [],
  "tools": [],
  "entities": [],
  "relationships": []
}

### Example 6: Architecture Decision with Rationale
Input: "We chose PostgreSQL over MySQL because we needed better JSON support and ACID compliance for our transaction-heavy workload."

Output:
{
  "guidelines": [],
  "knowledge": [{
    "title": "PostgreSQL chosen for database",
    "content": "We chose PostgreSQL over MySQL because we needed better JSON support and ACID compliance for our transaction-heavy workload.",
    "category": "decision",
    "confidence": 0.95,
    "source": "conversation",
    "suggestedTags": ["database", "postgresql", "architecture"]
  }],
  "tools": [],
  "entities": [{
    "name": "PostgreSQL",
    "entityType": "technology",
    "description": "Relational database with strong JSON and ACID support",
    "confidence": 0.95
  }],
  "relationships": []
}

## OUTPUT SCHEMA

{
  "guidelines": [{ "name": "kebab-case", "content": "rule text", "category": "code_style|security|architecture|workflow|testing", "priority": 0-100, "rationale": "why or null", "confidence": 0-1, "suggestedTags": [] }],
  "knowledge": [{ "title": "descriptive", "content": "fact", "category": "decision|fact|context|reference", "confidence": 0-1, "source": "origin", "suggestedTags": [] }],
  "tools": [{ "name": "tool-name", "description": "what it does", "category": "cli|function|api|mcp", "confidence": 0-1, "suggestedTags": [] }],
  "entities": [{ "name": "Name", "entityType": "person|technology|component|concept|organization", "description": "brief", "confidence": 0-1 }],
  "relationships": [{ "sourceRef": "name", "sourceType": "guideline|knowledge|tool|entity", "targetRef": "name", "targetType": "guideline|knowledge|tool|entity", "relationType": "depends_on|related_to|applies_to|conflicts_with", "confidence": 0-1 }]
}

When uncertain, skip rather than guess. Empty arrays are valid. Err on the side of NOT extracting.`;

// =============================================================================
// BENCHMARK LOGIC
// =============================================================================

interface ExtractionResult {
  guidelines: unknown[];
  knowledge: unknown[];
  tools: unknown[];
  entities: unknown[];
  relationships: unknown[];
}

interface BenchmarkResult {
  testCase: string;
  promptVersion: 'old' | 'new';
  inputTokens: number;
  outputTokens: number;
  totalEntries: number;
  parseSuccess: boolean;
  latencyMs: number;
  passed: boolean;
  reason?: string;
}

function countEntries(result: ExtractionResult): number {
  return result.guidelines.length + result.knowledge.length + result.tools.length;
}

function evaluateResult(
  testCase: TestCase,
  result: ExtractionResult
): { passed: boolean; reason?: string } {
  const entryCount = countEntries(result);

  switch (testCase.expectedType) {
    case 'noise':
      if (entryCount > (testCase.expectedMaxEntries ?? 0)) {
        return { passed: false, reason: `Expected 0 entries, got ${entryCount}` };
      }
      return { passed: true };

    case 'extract':
      if (entryCount < (testCase.expectedMinEntries ?? 1)) {
        return {
          passed: false,
          reason: `Expected >= ${testCase.expectedMinEntries} entries, got ${entryCount}`,
        };
      }
      return { passed: true };

    case 'compound':
      if (entryCount < (testCase.expectedMinEntries ?? 2)) {
        return {
          passed: false,
          reason: `Expected >= ${testCase.expectedMinEntries} entries (compound split), got ${entryCount}`,
        };
      }
      return { passed: true };

    default:
      return { passed: true };
  }
}

async function runExtractionOpenAI(
  client: OpenAI,
  systemPrompt: string,
  userInput: string,
  model: string
): Promise<{
  result: ExtractionResult;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}> {
  const start = Date.now();

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Extract memory entries from:\n\n"${userInput}"\n\nReturn valid JSON only, no explanation.`,
      },
    ],
    temperature: 0.3,
  });

  const latencyMs = Date.now() - start;
  const content = response.choices[0]?.message?.content ?? '{}';

  const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/({[\s\S]*})/);
  const jsonStr = jsonMatch?.[1] ?? content;
  const result = JSON.parse(jsonStr.trim()) as ExtractionResult;

  return {
    result,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    latencyMs,
  };
}

async function runExtractionAnthropic(
  client: Anthropic,
  systemPrompt: string,
  userInput: string,
  model: string
): Promise<{
  result: ExtractionResult;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}> {
  const start = Date.now();

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Extract memory entries from:\n\n"${userInput}"\n\nReturn valid JSON only.`,
      },
    ],
  });

  const latencyMs = Date.now() - start;
  const content = response.content[0]?.type === 'text' ? response.content[0].text : '{}';

  // Extract JSON from potential markdown code blocks
  const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/({[\s\S]*})/);
  const jsonStr = jsonMatch?.[1] ?? content;
  const result = JSON.parse(jsonStr) as ExtractionResult;

  return {
    result,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    latencyMs,
  };
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const provider = process.env.BENCHMARK_PROVIDER ?? 'openai';
  const model =
    process.env.BENCHMARK_MODEL ??
    (provider === 'anthropic' ? 'claude-3-5-haiku-20241022' : 'gpt-4o-mini');

  console.log('\n' + '='.repeat(70));
  console.log('PROMPT A/B BENCHMARK');
  console.log('='.repeat(70));
  console.log(`Provider: ${provider}`);
  console.log(`Model: ${model}`);
  console.log(`Test cases: ${TEST_CASES.length}`);
  console.log('='.repeat(70) + '\n');

  let openai: OpenAI | null = null;
  let anthropic: Anthropic | null = null;

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY ?? process.env.AGENT_MEMORY_OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL ?? process.env.AGENT_MEMORY_OPENAI_BASE_URL;
    if (!apiKey && !baseURL) {
      console.error('Error: OPENAI_API_KEY or AGENT_MEMORY_OPENAI_API_KEY required');
      process.exit(1);
    }
    openai = new OpenAI({ apiKey: apiKey ?? 'not-needed', baseURL });
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.AGENT_MEMORY_ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('Error: ANTHROPIC_API_KEY required');
      process.exit(1);
    }
    anthropic = new Anthropic({ apiKey });
  }

  const results: BenchmarkResult[] = [];

  for (const testCase of TEST_CASES) {
    for (const version of ['old', 'new'] as const) {
      const prompt = version === 'old' ? OLD_PROMPT : NEW_PROMPT;

      try {
        let extraction: {
          result: ExtractionResult;
          inputTokens: number;
          outputTokens: number;
          latencyMs: number;
        };

        if (provider === 'openai' && openai) {
          extraction = await runExtractionOpenAI(openai, prompt, testCase.input, model);
        } else if (anthropic) {
          extraction = await runExtractionAnthropic(anthropic, prompt, testCase.input, model);
        } else {
          throw new Error('No client available');
        }

        const evaluation = evaluateResult(testCase, extraction.result);

        results.push({
          testCase: testCase.name,
          promptVersion: version,
          inputTokens: extraction.inputTokens,
          outputTokens: extraction.outputTokens,
          totalEntries: countEntries(extraction.result),
          parseSuccess: true,
          latencyMs: extraction.latencyMs,
          passed: evaluation.passed,
          reason: evaluation.reason,
        });

        const status = evaluation.passed ? '✓' : '✗';
        console.log(
          `${status} ${testCase.name} [${version}]: ${countEntries(extraction.result)} entries, ${extraction.inputTokens}+${extraction.outputTokens} tokens, ${extraction.latencyMs}ms`
        );
        if (!evaluation.passed) {
          console.log(`  └─ ${evaluation.reason}`);
        }
      } catch (error) {
        results.push({
          testCase: testCase.name,
          promptVersion: version,
          inputTokens: 0,
          outputTokens: 0,
          totalEntries: 0,
          parseSuccess: false,
          latencyMs: 0,
          passed: false,
          reason: `Parse error: ${error instanceof Error ? error.message : 'Unknown'}`,
        });
        console.log(`✗ ${testCase.name} [${version}]: PARSE ERROR`);
      }

      // Rate limiting
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // =============================================================================
  // SUMMARY
  // =============================================================================

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70) + '\n');

  const oldResults = results.filter((r) => r.promptVersion === 'old');
  const newResults = results.filter((r) => r.promptVersion === 'new');

  const oldTokens = oldResults.reduce((sum, r) => sum + r.inputTokens, 0);
  const newTokens = newResults.reduce((sum, r) => sum + r.inputTokens, 0);
  const tokenReduction = (((oldTokens - newTokens) / oldTokens) * 100).toFixed(1);

  const oldPassed = oldResults.filter((r) => r.passed).length;
  const newPassed = newResults.filter((r) => r.passed).length;

  const oldLatency = oldResults.reduce((sum, r) => sum + r.latencyMs, 0) / oldResults.length;
  const newLatency = newResults.reduce((sum, r) => sum + r.latencyMs, 0) / newResults.length;

  console.log('| Metric              | Old Prompt | New Prompt | Change       |');
  console.log('|---------------------|------------|------------|--------------|');
  console.log(
    `| Input Tokens        | ${oldTokens.toString().padStart(10)} | ${newTokens.toString().padStart(10)} | ${tokenReduction.padStart(10)}% ↓ |`
  );
  console.log(
    `| Tests Passed        | ${(oldPassed + '/' + oldResults.length).padStart(10)} | ${(newPassed + '/' + newResults.length).padStart(10)} | ${(newPassed - oldPassed >= 0 ? '+' : '') + (newPassed - oldPassed).toString().padStart(9)} |`
  );
  console.log(
    `| Avg Latency (ms)    | ${oldLatency.toFixed(0).padStart(10)} | ${newLatency.toFixed(0).padStart(10)} | ${(((newLatency - oldLatency) / oldLatency) * 100).toFixed(1).padStart(10)}% |`
  );

  // Detailed breakdown by test type
  console.log('\n--- By Test Type ---\n');

  for (const type of ['extract', 'noise', 'compound'] as const) {
    const typeTests = TEST_CASES.filter((t) => t.expectedType === type);
    const oldTypeResults = oldResults.filter((r) => typeTests.some((t) => t.name === r.testCase));
    const newTypeResults = newResults.filter((r) => typeTests.some((t) => t.name === r.testCase));

    const oldTypePassed = oldTypeResults.filter((r) => r.passed).length;
    const newTypePassed = newTypeResults.filter((r) => r.passed).length;

    console.log(
      `${type.toUpperCase()}: Old ${oldTypePassed}/${oldTypeResults.length}, New ${newTypePassed}/${newTypeResults.length}`
    );
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

main().catch(console.error);
