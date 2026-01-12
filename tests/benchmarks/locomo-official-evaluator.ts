/**
 * LoCoMo Official Evaluation Methodology
 *
 * Implements the official LoCoMo benchmark evaluation as used by Mem0:
 * 1. Retrieve relevant context for each question
 * 2. Generate an answer using an LLM with retrieved context
 * 3. Evaluate the answer using LLM-as-Judge
 *
 * Metrics:
 * - F1: Lexical overlap between generated and gold answer
 * - BLEU-1: Token-level similarity
 * - J (LLM-as-Judge): Semantic accuracy (binary correct/incorrect)
 *
 * Reference: https://arxiv.org/html/2504.19413v1
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { LoCoMoQAPair, LoCoMoSession } from './locomo-types.js';
import { LOCOMO_CATEGORIES } from './locomo-types.js';

// LLM provider configuration
// Set AGENT_MEMORY_LOCOMO_PROVIDER=anthropic to use Claude (recommended for accurate results)
const LLM_PROVIDER = process.env.AGENT_MEMORY_LOCOMO_PROVIDER || 'openai'; // 'openai' or 'anthropic'
const LLM_BASE_URL = process.env.AGENT_MEMORY_EXTRACTION_OPENAI_BASE_URL || process.env.AGENT_MEMORY_EXTRACTION_BASE_URL || process.env.OPENAI_BASE_URL || 'http://localhost:1234/v1';
const LLM_API_KEY = process.env.AGENT_MEMORY_EXTRACTION_API_KEY || process.env.OPENAI_API_KEY || 'lm-studio';

// Separate models for generation and judging
// Generation model: smaller/faster model for answering questions
// Judge model: should be larger/more capable for accurate evaluation
const DEFAULT_GENERATION_MODEL = process.env.AGENT_MEMORY_EXTRACTION_OPENAI_MODEL || (LLM_PROVIDER === 'anthropic' ? 'claude-3-5-haiku-20241022' : 'qwen2.5-7b-instruct');
const DEFAULT_JUDGE_MODEL = process.env.AGENT_MEMORY_LOCOMO_JUDGE_MODEL || DEFAULT_GENERATION_MODEL;
const LLM_GENERATION_MODEL = process.env.AGENT_MEMORY_LOCOMO_GENERATION_MODEL || DEFAULT_GENERATION_MODEL;
const LLM_JUDGE_MODEL = process.env.AGENT_MEMORY_LOCOMO_JUDGE_MODEL || DEFAULT_JUDGE_MODEL;

// ============================================================================
// Types
// ============================================================================

export interface OfficialQAResult {
  sessionId: string;
  question: string;
  goldAnswer: string;
  generatedAnswer: string;
  category: number;
  categoryName: string;
  retrievedContext: string[];
  /** F1 score (lexical overlap) */
  f1: number;
  /** BLEU-1 score */
  bleu1: number;
  /** LLM-as-Judge score (1 = correct, 0 = incorrect) */
  judgeScore: number;
  /** Judge's reasoning */
  judgeReasoning: string;
}

export interface OfficialMetrics {
  totalQueries: number;
  avgF1: number;
  avgBleu1: number;
  avgJudgeScore: number;
  /** Standard deviation for J score */
  judgeScoreStd?: number;
}

export interface OfficialBenchmarkResults {
  timestamp: string;
  config: {
    model: string;
    judgeModel: string;
    sessionsRun: number;
    totalQAPairs: number;
    topK: number;
  };
  overall: OfficialMetrics;
  byCategory: Record<string, OfficialMetrics>;
  bySession: Record<string, OfficialMetrics>;
  details?: OfficialQAResult[];
}

// ============================================================================
// Metric Calculations
// ============================================================================

/**
 * Tokenize text into words (simple whitespace + punctuation split)
 */
function tokenize(text: string | null | undefined): string[] {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/**
 * Calculate F1 score between generated and gold answer
 * F1 = 2 * (precision * recall) / (precision + recall)
 */
export function calculateF1(generated: string, gold: string): number {
  const genTokens = tokenize(generated);
  const goldTokens = tokenize(gold);

  if (genTokens.length === 0 || goldTokens.length === 0) {
    return genTokens.length === 0 && goldTokens.length === 0 ? 1 : 0;
  }

  const goldSet = new Set(goldTokens);
  const genSet = new Set(genTokens);

  // Count matches
  let matches = 0;
  for (const token of genTokens) {
    if (goldSet.has(token)) matches++;
  }

  const precision = matches / genTokens.length;
  const recall = matches / goldTokens.length;

  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/**
 * Calculate BLEU-1 score (unigram precision with brevity penalty)
 */
export function calculateBleu1(generated: string, gold: string): number {
  const genTokens = tokenize(generated);
  const goldTokens = tokenize(gold);

  if (genTokens.length === 0) return 0;

  // Count unigram matches
  const goldCounts = new Map<string, number>();
  for (const token of goldTokens) {
    goldCounts.set(token, (goldCounts.get(token) || 0) + 1);
  }

  let matches = 0;
  const usedCounts = new Map<string, number>();
  for (const token of genTokens) {
    const goldCount = goldCounts.get(token) || 0;
    const usedCount = usedCounts.get(token) || 0;
    if (usedCount < goldCount) {
      matches++;
      usedCounts.set(token, usedCount + 1);
    }
  }

  const precision = matches / genTokens.length;

  // Brevity penalty
  const bp = genTokens.length >= goldTokens.length
    ? 1
    : Math.exp(1 - goldTokens.length / genTokens.length);

  return bp * precision;
}

// ============================================================================
// LLM Integration (supports both OpenAI-compatible and Anthropic)
// ============================================================================

let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      baseURL: LLM_BASE_URL,
      apiKey: LLM_API_KEY,
    });
  }
  return openaiClient;
}

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

/**
 * Generate an answer given question and retrieved context
 */
export async function generateAnswer(
  question: string,
  context: string[],
  model: string = LLM_GENERATION_MODEL
): Promise<string> {
  const contextText = context.length > 0
    ? context.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')
    : 'No relevant context found.';

  const systemPrompt = 'You are a helpful assistant that answers questions based on conversation context. Always respond with plain text answers, never JSON or structured data.';
  const userPrompt = `Based on the following conversation history, answer this question in plain text.

CONVERSATION HISTORY:
${contextText}

QUESTION: ${question}

Provide a brief, direct answer in plain text (not JSON). If you cannot determine the answer from the conversation, say "I don't know".`;

  if (LLM_PROVIDER === 'anthropic') {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text?.trim() || '';
  } else {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model,
      max_tokens: 500,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });
    return response.choices[0]?.message?.content?.trim() || '';
  }
}

/**
 * LLM-as-Judge evaluation
 *
 * Based on Mem0's methodology from the paper:
 * "You should be generous with your grading - as long as it touches on the same topic
 * as the gold answer, it should be counted as CORRECT."
 */
export async function judgeAnswer(
  question: string,
  goldAnswer: string,
  generatedAnswer: string,
  model: string = LLM_JUDGE_MODEL
): Promise<{ score: number; reasoning: string }> {
  const prompt = `You are evaluating whether a generated answer correctly addresses a question compared to a gold (reference) answer.

You should be generous with your grading - as long as the generated answer touches on the same topic as the gold answer and provides correct information, it should be counted as CORRECT.

For temporal questions, accept relative time references (like "last Tuesday" or "next month") as long as they refer to the same date or time period as the gold answer.

Question: ${question}

Gold Answer: ${goldAnswer}

Generated Answer: ${generatedAnswer}

Evaluate the generated answer. First provide brief reasoning, then give your verdict.

Format your response as:
Reasoning: [Your brief reasoning]
Verdict: [CORRECT or INCORRECT]`;

  let text: string;

  if (LLM_PROVIDER === 'anthropic') {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });
    const textBlock = response.content.find(b => b.type === 'text');
    text = textBlock?.text || '';
  } else {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });
    text = response.choices[0]?.message?.content || '';
  }

  // Parse verdict
  const verdictMatch = text.match(/Verdict:\s*(CORRECT|INCORRECT)/i);
  const score = verdictMatch && verdictMatch[1]?.toUpperCase() === 'CORRECT' ? 1 : 0;

  // Extract reasoning
  const reasoningMatch = text.match(/Reasoning:\s*(.+?)(?=Verdict:|$)/is);
  const reasoning = reasoningMatch?.[1]?.trim() || text;

  return { score, reasoning };
}

// ============================================================================
// Evaluation Functions
// ============================================================================

/**
 * Query function signature for retrieval
 */
type QueryFn = (question: string) => Promise<Array<{ id: string; content?: string }>>;

/**
 * Evaluate a single QA pair using official methodology
 */
export async function evaluateQAPairOfficial(
  qa: LoCoMoQAPair,
  sessionId: string,
  queryFn: QueryFn,
  config: {
    topK?: number;
    generationModel?: string;
    judgeModel?: string;
  } = {}
): Promise<OfficialQAResult> {
  const {
    topK = 5,
    generationModel = LLM_GENERATION_MODEL,
    judgeModel = LLM_JUDGE_MODEL
  } = config;

  // 1. Retrieve context
  const results = await queryFn(qa.question);
  const retrievedContext = results
    .slice(0, topK)
    .map(r => r.content || '')
    .filter(c => c.length > 0);

  // 2. Generate answer
  let generatedAnswer: string;
  try {
    generatedAnswer = await generateAnswer(qa.question, retrievedContext, generationModel);
    if (typeof generatedAnswer !== 'string') {
      generatedAnswer = String(generatedAnswer || '');
    }
  } catch (err) {
    console.error(`  [ERROR] Answer generation failed: ${err instanceof Error ? err.message : String(err)}`);
    generatedAnswer = '';
  }

  // 3. Calculate lexical metrics
  const f1 = calculateF1(generatedAnswer, qa.answer);
  const bleu1 = calculateBleu1(generatedAnswer, qa.answer);

  // 4. LLM-as-Judge evaluation
  let judgeResult: { score: number; reasoning: string };
  try {
    judgeResult = await judgeAnswer(qa.question, qa.answer, generatedAnswer, judgeModel);
  } catch (err) {
    console.error(`  [ERROR] Judge evaluation failed: ${err instanceof Error ? err.message : String(err)}`);
    judgeResult = { score: 0, reasoning: 'Evaluation error' };
  }

  return {
    sessionId,
    question: qa.question,
    goldAnswer: qa.answer,
    generatedAnswer,
    category: qa.category,
    categoryName: LOCOMO_CATEGORIES[qa.category] || `unknown-${qa.category}`,
    retrievedContext,
    f1,
    bleu1,
    judgeScore: judgeResult.score,
    judgeReasoning: judgeResult.reasoning,
  };
}

/**
 * Aggregate official metrics from results
 */
export function aggregateOfficialMetrics(results: OfficialQAResult[]): OfficialMetrics {
  if (results.length === 0) {
    return {
      totalQueries: 0,
      avgF1: 0,
      avgBleu1: 0,
      avgJudgeScore: 0,
    };
  }

  const n = results.length;
  const avgJudgeScore = results.reduce((sum, r) => sum + r.judgeScore, 0) / n;

  // Calculate std dev for judge score
  const variance = results.reduce((sum, r) => sum + Math.pow(r.judgeScore - avgJudgeScore, 2), 0) / n;
  const judgeScoreStd = Math.sqrt(variance);

  return {
    totalQueries: n,
    avgF1: results.reduce((sum, r) => sum + r.f1, 0) / n,
    avgBleu1: results.reduce((sum, r) => sum + r.bleu1, 0) / n,
    avgJudgeScore,
    judgeScoreStd,
  };
}

/**
 * Evaluate a full session using official methodology
 */
export async function evaluateSessionOfficial(
  session: LoCoMoSession,
  queryFn: QueryFn,
  config: {
    topK?: number;
    generationModel?: string;
    judgeModel?: string;
  } = {},
  onProgress?: (completed: number, total: number) => void
): Promise<OfficialQAResult[]> {
  const results: OfficialQAResult[] = [];
  const total = session.qaPairs.length;

  for (let i = 0; i < session.qaPairs.length; i++) {
    const qa = session.qaPairs[i]!;

    // Skip adversarial questions (category 5) as per Mem0 methodology
    if (qa.category === 5) {
      if (onProgress) onProgress(i + 1, total);
      continue;
    }

    const result = await evaluateQAPairOfficial(qa, session.sessionId, queryFn, config);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, total);
    }
  }

  return results;
}

/**
 * Compile full benchmark results
 */
export function compileOfficialResults(
  allResults: OfficialQAResult[],
  config: {
    model: string;
    judgeModel: string;
    sessionsRun: number;
    topK: number;
  }
): OfficialBenchmarkResults {
  // Group by category
  const byCategory: Record<string, OfficialQAResult[]> = {};
  for (const result of allResults) {
    const cat = result.categoryName;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(result);
  }

  // Group by session
  const bySession: Record<string, OfficialQAResult[]> = {};
  for (const result of allResults) {
    const sess = result.sessionId;
    if (!bySession[sess]) bySession[sess] = [];
    bySession[sess].push(result);
  }

  // Aggregate
  const categoryMetrics: Record<string, OfficialMetrics> = {};
  for (const [cat, results] of Object.entries(byCategory)) {
    categoryMetrics[cat] = aggregateOfficialMetrics(results);
  }

  const sessionMetrics: Record<string, OfficialMetrics> = {};
  for (const [sess, results] of Object.entries(bySession)) {
    sessionMetrics[sess] = aggregateOfficialMetrics(results);
  }

  return {
    timestamp: new Date().toISOString(),
    config: {
      ...config,
      totalQAPairs: allResults.length,
    },
    overall: aggregateOfficialMetrics(allResults),
    byCategory: categoryMetrics,
    bySession: sessionMetrics,
  };
}

/**
 * Print official benchmark results
 */
export function printOfficialResults(results: OfficialBenchmarkResults): void {
  console.log('\n========================================');
  console.log('LoCoMo OFFICIAL Benchmark Results');
  console.log('(Mem0 Methodology: Retrieval + Generation + LLM-as-Judge)');
  console.log('========================================');
  console.log(`Sessions: ${results.config.sessionsRun}`);
  console.log(`QA Pairs: ${results.config.totalQAPairs}`);
  console.log(`Top-K Context: ${results.config.topK}`);
  console.log(`Generation Model: ${results.config.model}`);
  console.log(`Judge Model: ${results.config.judgeModel}`);
  console.log('========================================\n');

  const o = results.overall;
  console.log('OVERALL METRICS:');
  console.log(`  F1:           ${(o.avgF1 * 100).toFixed(1)}%`);
  console.log(`  BLEU-1:       ${(o.avgBleu1 * 100).toFixed(1)}%`);
  console.log(`  J (Judge):    ${(o.avgJudgeScore * 100).toFixed(1)}%${o.judgeScoreStd ? ` ± ${(o.judgeScoreStd * 100).toFixed(1)}%` : ''}`);

  // Per-category breakdown
  console.log('\nBY CATEGORY:');
  console.log('Category      | Count |   F1   | BLEU-1 |   J    ');
  console.log('--------------|-------|--------|--------|--------');

  const categoryOrder = ['single-hop', 'multi-hop', 'temporal', 'commonsense'];
  for (const cat of categoryOrder) {
    const m = results.byCategory[cat];
    if (m) {
      console.log(
        `${cat.padEnd(13)} | ${m.totalQueries.toString().padStart(5)} | ` +
        `${(m.avgF1 * 100).toFixed(1).padStart(5)}% | ` +
        `${(m.avgBleu1 * 100).toFixed(1).padStart(5)}% | ` +
        `${(m.avgJudgeScore * 100).toFixed(1).padStart(5)}%`
      );
    }
  }

  // Comparison to Mem0
  console.log('\n----------------------------------------');
  console.log('COMPARISON TO MEM0 (66.9% J-score on LoCoMo):');
  console.log(`  Your J-score: ${(o.avgJudgeScore * 100).toFixed(1)}%`);
  const gap = 66.9 - o.avgJudgeScore * 100;
  if (gap <= 0) {
    console.log('  Status: ✅ MATCHES OR EXCEEDS Mem0');
  } else if (gap < 10) {
    console.log(`  Status: ⚠️  ${gap.toFixed(1)}% below target`);
  } else {
    console.log(`  Status: ❌ ${gap.toFixed(1)}% below target`);
  }
  console.log('----------------------------------------\n');
}
