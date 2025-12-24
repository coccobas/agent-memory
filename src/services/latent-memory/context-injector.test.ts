/**
 * Quick verification tests for ContextInjectorService
 *
 * Run with: npx tsx src/services/latent-memory/context-injector.test.ts
 */

import { ContextInjectorService, type LatentMemoryWithScore } from './context-injector.js';

const testMemories: LatentMemoryWithScore[] = [
  {
    id: 'test-1',
    sourceType: 'knowledge',
    sourceId: 'k-1',
    textPreview: 'Test memory one with some content',
    similarityScore: 0.95,
  },
  {
    id: 'test-2',
    sourceType: 'guideline',
    sourceId: 'g-1',
    textPreview: 'Test memory two with different content',
    similarityScore: 0.85,
  },
  {
    id: 'test-3',
    sourceType: 'tool',
    sourceId: 't-1',
    textPreview: 'Test memory three',
    similarityScore: 0.75,
  },
];

function testJsonFormat(): boolean {
  const service = new ContextInjectorService();
  const result = service.buildContext(testMemories, {
    format: 'json',
    maxTokens: 1000,
    maxMemories: 10,
    includeScores: true,
  });

  const parsed = JSON.parse(result.content);
  const pass =
    Array.isArray(parsed) &&
    parsed.length === 3 &&
    parsed[0].type === 'knowledge' &&
    parsed[0].relevance === 0.95;

  console.log(`✓ JSON format test: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

function testMarkdownFormat(): boolean {
  const service = new ContextInjectorService();
  const result = service.buildContext(testMemories, {
    format: 'markdown',
    maxTokens: 1000,
    maxMemories: 10,
    includeScores: false,
  });

  const pass =
    result.content.includes('## Relevant Context from Memory') &&
    result.content.includes('### Knowledge') &&
    result.content.includes('Test memory one');

  console.log(`✓ Markdown format test: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

function testNaturalLanguageFormat(): boolean {
  const service = new ContextInjectorService();
  const result = service.buildContext(testMemories, {
    format: 'natural_language',
    maxTokens: 1000,
    maxMemories: 10,
  });

  const pass =
    result.content.includes('Based on memory') &&
    result.content.includes('- Test memory one') &&
    result.memoriesUsed.length === 3;

  console.log(`✓ Natural language format test: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

function testTokenBudget(): boolean {
  const service = new ContextInjectorService();

  // Use very tight budget - first memory is ~8 tokens, so budget of 10 should only fit one
  const result = service.buildContext(testMemories, {
    format: 'natural_language',
    maxTokens: 10, // Very tight budget - should fit only 1 memory
    maxMemories: 10,
  });

  const lines = result.content.split('\n').filter(line => line.startsWith('- '));
  // Very tight budget should limit to 1-2 memories max
  const pass = lines.length <= 2;

  console.log(`✓ Token budget test: ${pass ? 'PASS' : 'FAIL'} (${result.tokensUsed} tokens, ${lines.length} memories, budget: 10)`);
  return pass;
}

function testRelevanceFiltering(): boolean {
  const service = new ContextInjectorService();
  const result = service.buildContext(testMemories, {
    format: 'json',
    maxTokens: 1000,
    maxMemories: 10,
    minRelevance: 0.8,
  });

  const parsed = JSON.parse(result.content);
  const pass = parsed.length === 2; // Only first two should pass

  console.log(`✓ Relevance filtering test: ${pass ? 'PASS' : 'FAIL'} (${parsed.length} memories)`);
  return pass;
}

function testMaxMemories(): boolean {
  const service = new ContextInjectorService();
  const result = service.buildContext(testMemories, {
    format: 'json',
    maxTokens: 10000,
    maxMemories: 2,
  });

  const parsed = JSON.parse(result.content);
  const pass = parsed.length === 2;

  console.log(`✓ Max memories test: ${pass ? 'PASS' : 'FAIL'} (${parsed.length} memories)`);
  return pass;
}

function testTokenEstimation(): boolean {
  const service = new ContextInjectorService();
  const text1 = 'hello world';
  const text2 = 'The quick brown fox jumps over the lazy dog';

  const tokens1 = service.estimateTokens(text1);
  const tokens2 = service.estimateTokens(text2);

  const pass = tokens1 > 0 && tokens2 > tokens1 && tokens2 === 12; // 9 words * 1.3 = 11.7 -> 12

  console.log(`✓ Token estimation test: ${pass ? 'PASS' : 'FAIL'} ("${text1}" = ${tokens1} tokens, "${text2}" = ${tokens2} tokens)`);
  return pass;
}

function testEmptyMemories(): boolean {
  const service = new ContextInjectorService();
  const result = service.buildContext([], {
    format: 'natural_language',
    maxTokens: 1000,
    maxMemories: 10,
  });

  const pass =
    result.content === 'No relevant context found in memory.' &&
    result.memoriesUsed.length === 0 &&
    result.tokensUsed > 0;

  console.log(`✓ Empty memories test: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

function testGroupByType(): boolean {
  const service = new ContextInjectorService();
  const result = service.buildContext(testMemories, {
    format: 'markdown',
    maxTokens: 1000,
    maxMemories: 10,
    groupByType: true,
  });

  const pass =
    result.content.includes('### Knowledge') &&
    result.content.includes('### Guideline') &&
    result.content.includes('### Tool');

  console.log(`✓ Group by type test: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

function runAllTests(): boolean {
  console.log('\n=== ContextInjectorService Verification Tests ===\n');

  const results = [
    testJsonFormat(),
    testMarkdownFormat(),
    testNaturalLanguageFormat(),
    testTokenBudget(),
    testRelevanceFiltering(),
    testMaxMemories(),
    testTokenEstimation(),
    testEmptyMemories(),
    testGroupByType(),
  ];

  const passed = results.filter((r) => r).length;
  const total = results.length;

  console.log(`\n=== Results: ${passed}/${total} tests passed ===\n`);

  return passed === total;
}

// Run tests
const success = runAllTests();
process.exit(success ? 0 : 1);
