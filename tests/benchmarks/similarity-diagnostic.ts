#!/usr/bin/env npx tsx
/**
 * Quick Similarity Diagnostic
 *
 * Takes 5 failed single-hop questions, finds the gold evidence,
 * embeds both, and checks cosine similarity.
 *
 * If similarity < 0.7, confirms semantic mismatch hypothesis.
 */

import 'dotenv/config';

const { config: appConfig } = await import('../../src/config/index.js');
const { createRuntime, extractRuntimeConfig, shutdownRuntime } = await import('../../src/core/runtime.js');
const { EmbeddingService } = await import('../../src/services/embedding.service.js');
const { loadLoCoMoDataset } = await import('./locomo-adapter.js');
const pino = (await import('pino')).default;

const logger = pino({ level: 'warn' });

console.log('\n========================================');
console.log('SIMILARITY DIAGNOSTIC');
console.log('========================================\n');

// Setup embedding service
const config = appConfig;
const runtime = createRuntime(extractRuntimeConfig(config));
const embeddingService = new EmbeddingService(config, logger);

if (!embeddingService.isAvailable()) {
  console.error('Embedding service not available');
  process.exit(1);
}

// Load dataset
const sessions = await loadLoCoMoDataset();
const session = sessions[0]!;

// Get dialogues by ID
const dialogueById = new Map(session.dialogues.map(d => [d.dia_id, d]));

// Filter to single-hop questions (category 1) with evidence
const singleHopQAs = session.qaPairs.filter(qa =>
  qa.category === 1 &&
  qa.evidence.length > 0 &&
  qa.evidence.every(eId => dialogueById.has(eId))
);

console.log(`Found ${singleHopQAs.length} single-hop questions with evidence\n`);

// Take first 10 for analysis
const testQAs = singleHopQAs.slice(0, 10);

// Cosine similarity function
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

console.log('Embedding questions and their gold evidence...\n');

type ResultEntry = {
  question: string;
  evidence: string;
  similarity: number;
  goldAnswer: string;
};

// Test both with and without instruction prefixes
const resultsNoPrefix: ResultEntry[] = [];
const resultsWithPrefix: ResultEntry[] = [];

console.log('=== WITHOUT INSTRUCTION PREFIX ===\n');

for (const qa of testQAs) {
  const evidenceId = qa.evidence[0]!;
  const dialogue = dialogueById.get(evidenceId)!;
  const evidenceText = `${dialogue.speaker}: ${dialogue.text}`;

  const [questionEmbed, evidenceEmbed] = await Promise.all([
    embeddingService.embed(qa.question),
    embeddingService.embed(evidenceText),
  ]);

  const similarity = cosineSimilarity(questionEmbed.embedding, evidenceEmbed.embedding);

  resultsNoPrefix.push({
    question: qa.question,
    evidence: evidenceText,
    similarity,
    goldAnswer: qa.answer,
  });

  console.log(`Q: ${qa.question.substring(0, 60)}...`);
  console.log(`Similarity: ${similarity.toFixed(4)} ${similarity < 0.7 ? '⚠️ LOW' : '✓'}`);
}

console.log('\n=== WITH INSTRUCTION PREFIX ===\n');

for (const qa of testQAs) {
  const evidenceId = qa.evidence[0]!;
  const dialogue = dialogueById.get(evidenceId)!;
  const evidenceText = `${dialogue.speaker}: ${dialogue.text}`;

  // Add instruction prefixes for asymmetric retrieval
  const queryWithPrefix = `Instruct: Retrieve memories that answer this question\nQuery: ${qa.question}`;
  const docWithPrefix = `Instruct: Represent this memory for retrieval\nDocument: ${evidenceText}`;

  const [questionEmbed, evidenceEmbed] = await Promise.all([
    embeddingService.embed(queryWithPrefix),
    embeddingService.embed(docWithPrefix),
  ]);

  const similarity = cosineSimilarity(questionEmbed.embedding, evidenceEmbed.embedding);

  resultsWithPrefix.push({
    question: qa.question,
    evidence: evidenceText,
    similarity,
    goldAnswer: qa.answer,
  });

  console.log(`Q: ${qa.question.substring(0, 60)}...`);
  console.log(`Similarity: ${similarity.toFixed(4)} ${similarity < 0.7 ? '⚠️ LOW' : '✓'}`);
}

// Test with gold answer as document (simulating perfect fact extraction)
console.log('\n=== GOLD ANSWER AS DOCUMENT (perfect extraction) ===\n');
const resultsGoldAnswer: ResultEntry[] = [];

for (const qa of testQAs) {
  // Use the gold answer as if it were the stored memory
  const queryWithPrefix = `Instruct: Retrieve memories that answer this question\nQuery: ${qa.question}`;
  const docWithPrefix = `Instruct: Represent this memory for retrieval\nDocument: ${qa.answer}`;

  const [questionEmbed, evidenceEmbed] = await Promise.all([
    embeddingService.embed(queryWithPrefix),
    embeddingService.embed(docWithPrefix),
  ]);

  const similarity = cosineSimilarity(questionEmbed.embedding, evidenceEmbed.embedding);

  resultsGoldAnswer.push({
    question: qa.question,
    evidence: qa.answer,
    similarity,
    goldAnswer: qa.answer,
  });

  console.log(`Q: ${qa.question.substring(0, 60)}...`);
  console.log(`A: ${qa.answer.substring(0, 50)}...`);
  console.log(`Similarity: ${similarity.toFixed(4)} ${similarity < 0.7 ? '⚠️ LOW' : '✓'}`);
}

// Summary - compare all approaches
const avgNoPrefix = resultsNoPrefix.reduce((s, r) => s + r.similarity, 0) / resultsNoPrefix.length;
const avgWithPrefix = resultsWithPrefix.reduce((s, r) => s + r.similarity, 0) / resultsWithPrefix.length;
const avgGoldAnswer = resultsGoldAnswer.reduce((s, r) => s + r.similarity, 0) / resultsGoldAnswer.length;
const lowNoPrefix = resultsNoPrefix.filter(r => r.similarity < 0.7).length;
const lowWithPrefix = resultsWithPrefix.filter(r => r.similarity < 0.7).length;
const lowGoldAnswer = resultsGoldAnswer.filter(r => r.similarity < 0.7).length;

console.log('\n========================================');
console.log('RESULTS COMPARISON');
console.log('========================================');
console.log(`                     | Raw Conv | +Prefix | Gold Answer`);
console.log(`---------------------|----------|---------|------------`);
console.log(`Average similarity   | ${avgNoPrefix.toFixed(4)}   | ${avgWithPrefix.toFixed(4)}  | ${avgGoldAnswer.toFixed(4)}`);
console.log(`Low similarity (<0.7)| ${lowNoPrefix}/10     | ${lowWithPrefix}/10    | ${lowGoldAnswer}/10`);
console.log(`vs Raw Conv          |          | +${((avgWithPrefix - avgNoPrefix) * 100).toFixed(1)}%   | +${((avgGoldAnswer - avgNoPrefix) * 100).toFixed(1)}%`);
console.log('========================================');

console.log('\nDIAGNOSIS:');
if (avgGoldAnswer > 0.7) {
  console.log('✓ Question-to-answer similarity is HIGH (>' + avgGoldAnswer.toFixed(2) + ')');
  console.log('  → If we extract facts like the gold answer, retrieval would work!');
} else {
  console.log('⚠️  Even gold answers have low similarity - model limitation');
}

if (avgWithPrefix > avgNoPrefix + 0.05) {
  console.log('✓ Instruction prefixes help (+' + ((avgWithPrefix - avgNoPrefix) * 100).toFixed(1) + '%)');
  console.log('  → Apply asymmetric prefixes to queries and documents');
}

if (avgNoPrefix < 0.5) {
  console.log('⚠️  Raw conversation storage is severely misaligned');
  console.log('  → Must extract facts, not store raw dialogue');
}

// Cleanup
await shutdownRuntime(runtime);
