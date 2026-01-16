/**
 * Human Evaluation Runner
 *
 * Interactive CLI for collecting human ratings on benchmark outputs.
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  EvaluableBenchmark,
  EvaluationSession,
  EvaluationItem,
  LikertRating,
  HumanEvalOptions,
  ExtractionRating,
  SummarizationRating,
  QueryRating,
} from './human-eval-types.js';
import { RATING_LABELS, RATING_DIMENSIONS, DIMENSION_DESCRIPTIONS } from './human-eval-types.js';

/**
 * Item to be evaluated
 */
interface EvaluationCandidate {
  testCaseId: string;
  testCaseName: string;
  category: string;
  difficulty: string;
  input: string;
  output: string;
  expectedOutput?: string;
}

/**
 * Create readline interface for CLI interaction
 */
function createRl(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for input
 */
async function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt for a rating (1-5)
 */
async function promptRating(
  rl: readline.Interface,
  dimension: string,
  description: string
): Promise<LikertRating | 'skip'> {
  console.log(`\n  ${dimension}: ${description}`);
  console.log('  [1] Very Poor  [2] Poor  [3] Acceptable  [4] Good  [5] Excellent  [s] Skip');

  while (true) {
    const answer = await prompt(rl, '  Rating: ');
    if (answer.toLowerCase() === 's') return 'skip';
    const rating = parseInt(answer, 10);
    if (rating >= 1 && rating <= 5) return rating as LikertRating;
    console.log('  Invalid input. Enter 1-5 or s to skip.');
  }
}

/**
 * Display a separator line
 */
function separator(): void {
  console.log('\n' + '─'.repeat(80));
}

/**
 * Display item for evaluation
 */
function displayItem(item: EvaluationCandidate, index: number, total: number): void {
  separator();
  console.log(`\nItem ${index + 1}/${total}: [${item.testCaseId}] ${item.testCaseName}`);
  console.log(`Category: ${item.category} | Difficulty: ${item.difficulty}`);
  separator();

  console.log('\n📥 INPUT:');
  // Truncate long inputs
  const inputPreview =
    item.input.length > 500 ? item.input.slice(0, 500) + '\n...(truncated)' : item.input;
  console.log(inputPreview);

  console.log('\n📤 OUTPUT:');
  const outputPreview =
    item.output.length > 500 ? item.output.slice(0, 500) + '\n...(truncated)' : item.output;
  console.log(outputPreview);

  if (item.expectedOutput) {
    console.log('\n✓ EXPECTED:');
    const expectedPreview =
      item.expectedOutput.length > 300
        ? item.expectedOutput.slice(0, 300) + '\n...(truncated)'
        : item.expectedOutput;
    console.log(expectedPreview);
  }
}

/**
 * Collect ratings for a benchmark type
 */
async function collectRatings(
  rl: readline.Interface,
  benchmarkType: EvaluableBenchmark
): Promise<ExtractionRating | SummarizationRating | QueryRating | null> {
  const dimensions = RATING_DIMENSIONS[benchmarkType];
  const ratings: Record<string, LikertRating> = {};

  console.log('\n📊 RATE THIS ITEM:');

  for (const dim of dimensions) {
    const description = DIMENSION_DESCRIPTIONS[dim] || dim;
    const rating = await promptRating(rl, dim, description);
    if (rating === 'skip') return null;
    ratings[dim] = rating;
  }

  return ratings as ExtractionRating | SummarizationRating | QueryRating;
}

/**
 * Load or create evaluation session
 */
function loadOrCreateSession(options: HumanEvalOptions): EvaluationSession {
  const outputDir = options.outputDir || './tests/benchmarks/human-eval/results';

  if (options.resumeSessionId) {
    const sessionPath = path.join(outputDir, `session-${options.resumeSessionId}.json`);
    if (fs.existsSync(sessionPath)) {
      const data = fs.readFileSync(sessionPath, 'utf-8');
      return JSON.parse(data) as EvaluationSession;
    }
    console.log(`Session ${options.resumeSessionId} not found, creating new session.`);
  }

  return {
    id: uuidv4().slice(0, 8),
    benchmarkType: options.benchmark,
    evaluatorId: options.evaluatorId || 'anonymous',
    startedAt: new Date().toISOString(),
    totalItems: 0, // Will be set when items are loaded
    completedItems: 0,
    completedTestCaseIds: [],
    skippedItems: 0,
    skippedTestCaseIds: [],
    evaluations: [],
    status: 'in_progress',
    randomSeed: options.seed,
  };
}

/**
 * Save session to disk
 */
function saveSession(session: EvaluationSession, outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const sessionPath = path.join(outputDir, `session-${session.id}.json`);
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
}

/**
 * Get candidates for evaluation (placeholder - actual implementation depends on benchmark)
 */
async function getCandidates(
  benchmarkType: EvaluableBenchmark,
  _options: HumanEvalOptions
): Promise<EvaluationCandidate[]> {
  // This is a placeholder. In actual implementation, this would:
  // 1. Run the benchmark to get outputs
  // 2. Format them for human evaluation
  console.log(`\n⚠️  Candidate loading for ${benchmarkType} not yet implemented.`);
  console.log('To complete this implementation:');
  console.log('1. Run the benchmark to generate outputs');
  console.log('2. Load and format the outputs for evaluation');

  // Return mock data for testing the CLI
  return [
    {
      testCaseId: 'demo-001',
      testCaseName: 'Demo test case',
      category: 'demo',
      difficulty: 'easy',
      input: 'This is a sample input for demonstration purposes.',
      output: 'This is the system output that would be evaluated.',
      expectedOutput: 'This is what the output should ideally look like.',
    },
    {
      testCaseId: 'demo-002',
      testCaseName: 'Another demo case',
      category: 'demo',
      difficulty: 'medium',
      input: 'Another sample input.',
      output: 'Another output to evaluate.',
    },
  ];
}

/**
 * Run the human evaluation CLI
 */
export async function runHumanEval(options: HumanEvalOptions): Promise<EvaluationSession> {
  const rl = createRl();
  const outputDir = options.outputDir || './tests/benchmarks/human-eval/results';
  const session = loadOrCreateSession(options);

  console.log('\n🧑‍⚖️ HUMAN EVALUATION CLI');
  console.log('═'.repeat(80));
  console.log(`Benchmark: ${options.benchmark}`);
  console.log(`Session ID: ${session.id}`);
  console.log(`Evaluator: ${session.evaluatorId}`);
  if (options.limit) console.log(`Limit: ${options.limit} items`);
  if (options.category) console.log(`Category filter: ${options.category}`);
  if (options.difficulty) console.log(`Difficulty filter: ${options.difficulty}`);

  // Load candidates
  let candidates = await getCandidates(options.benchmark, options);

  // Filter already completed items
  candidates = candidates.filter((c) => !session.completedTestCaseIds.includes(c.testCaseId));
  candidates = candidates.filter((c) => !session.skippedTestCaseIds.includes(c.testCaseId));

  // Apply limit
  if (options.limit && candidates.length > options.limit) {
    candidates = candidates.slice(0, options.limit);
  }

  session.totalItems = candidates.length + session.completedItems + session.skippedItems;

  if (candidates.length === 0) {
    console.log('\n✅ No more items to evaluate!');
    session.status = 'completed';
    session.endedAt = new Date().toISOString();
    saveSession(session, outputDir);
    rl.close();
    return session;
  }

  console.log(`\nItems to evaluate: ${candidates.length}`);
  console.log('\nCommands: [1-5] Rate | [s] Skip | [q] Quit | [n] Add notes');
  separator();

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const startTime = Date.now();

    displayItem(candidate, session.completedItems + i, session.totalItems);

    // Collect ratings
    const ratings = await collectRatings(rl, options.benchmark);

    if (ratings === null) {
      // Skipped
      session.skippedItems++;
      session.skippedTestCaseIds.push(candidate.testCaseId);
      console.log('\n⏭️  Skipped');
      saveSession(session, outputDir);
      continue;
    }

    // Optional notes
    console.log('\n📝 Notes (optional, press Enter to skip):');
    const notes = await prompt(rl, '  > ');

    const evalTimeSeconds = (Date.now() - startTime) / 1000;

    // Record evaluation
    const evalItem: EvaluationItem = {
      testCaseId: candidate.testCaseId,
      testCaseName: candidate.testCaseName,
      benchmarkType: options.benchmark,
      input: candidate.input,
      output: candidate.output,
      expectedOutput: candidate.expectedOutput,
      ratings,
      notes: notes || undefined,
      evaluatedAt: new Date().toISOString(),
      evaluatorId: session.evaluatorId,
      evaluationTimeSeconds: evalTimeSeconds,
    };

    session.evaluations.push(evalItem);
    session.completedItems++;
    session.completedTestCaseIds.push(candidate.testCaseId);

    // Show confirmation
    const avgScore =
      Object.values(ratings).reduce((a, b) => a + b, 0) / Object.values(ratings).length;
    console.log(
      `\n✅ Recorded (avg: ${avgScore.toFixed(1)}/5) | Time: ${evalTimeSeconds.toFixed(0)}s`
    );

    // Save after each evaluation
    saveSession(session, outputDir);

    // Check for quit
    const continuePrompt = await prompt(rl, '\nContinue? [y/n/q]: ');
    if (continuePrompt.toLowerCase() === 'n' || continuePrompt.toLowerCase() === 'q') {
      console.log('\n💾 Session saved. Resume later with: --resume ' + session.id);
      break;
    }
  }

  // Finalize session
  if (session.completedItems + session.skippedItems >= session.totalItems) {
    session.status = 'completed';
    session.endedAt = new Date().toISOString();
  }

  saveSession(session, outputDir);

  // Summary
  separator();
  console.log('\n📊 SESSION SUMMARY');
  console.log(`  Completed: ${session.completedItems}/${session.totalItems}`);
  console.log(`  Skipped: ${session.skippedItems}`);
  console.log(`  Status: ${session.status}`);
  console.log(`  Session saved to: ${outputDir}/session-${session.id}.json`);

  if (session.status === 'completed') {
    console.log('\n🎉 Evaluation complete! Generate report with:');
    console.log(`  npm run bench:human-eval:report -- --session ${session.id}`);
  }

  rl.close();
  return session;
}

/**
 * Display rating labels for reference
 */
export function showRatingGuide(): void {
  console.log('\n📖 RATING GUIDE');
  console.log('═'.repeat(40));
  for (const [rating, label] of Object.entries(RATING_LABELS)) {
    console.log(`  ${rating}: ${label}`);
  }
  console.log();
}
