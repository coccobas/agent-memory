/**
 * Example usage of ContextInjectorService
 *
 * Demonstrates how to format latent memories for LLM context injection
 * in various formats with token budget management.
 */

import {
  ContextInjectorService,
  createContextInjector,
  type LatentMemoryWithScore,
  type ContextInjectionOptions,
} from './context-injector.js';

/**
 * Sample latent memories for demonstration
 */
const sampleMemories: LatentMemoryWithScore[] = [
  {
    id: 'mem-001',
    sourceType: 'knowledge',
    sourceId: 'k-postgres-001',
    textPreview: 'The system uses PostgreSQL as the primary database with pgvector extension for vector similarity search.',
    similarityScore: 0.92,
  },
  {
    id: 'mem-002',
    sourceType: 'guideline',
    sourceId: 'g-typescript-001',
    textPreview: 'Always use strict TypeScript mode with all compiler flags enabled. Enable noUncheckedIndexedAccess and exactOptionalPropertyTypes.',
    similarityScore: 0.88,
  },
  {
    id: 'mem-003',
    sourceType: 'knowledge',
    sourceId: 'k-vector-001',
    textPreview: 'Vector embeddings are generated using OpenAI text-embedding-3-small model with 1536 dimensions.',
    similarityScore: 0.85,
  },
  {
    id: 'mem-004',
    sourceType: 'tool',
    sourceId: 't-cli-001',
    textPreview: 'Use npm run test:integration to run integration tests. Requires DATABASE_URL environment variable.',
    similarityScore: 0.82,
  },
  {
    id: 'mem-005',
    sourceType: 'experience',
    sourceId: 'e-issue-001',
    textPreview: 'When switching embedding providers, clear the vector database to prevent dimension mismatch errors.',
    similarityScore: 0.79,
  },
  {
    id: 'mem-006',
    sourceType: 'guideline',
    sourceId: 'g-error-001',
    textPreview: 'Use typed error creators from core/errors.ts instead of throwing raw Error objects.',
    similarityScore: 0.75,
  },
  {
    id: 'mem-007',
    sourceType: 'knowledge',
    sourceId: 'k-architecture-001',
    textPreview: 'The system follows a layered architecture: MCP/REST handlers -> Services -> Repositories -> Database.',
    similarityScore: 0.71,
  },
];

/**
 * Example 1: Format as JSON with scores
 */
function exampleJsonFormat(): void {
  console.log('\n=== Example 1: JSON Format with Scores ===\n');

  const injector = createContextInjector();

  const options: ContextInjectionOptions = {
    format: 'json',
    maxTokens: 500,
    maxMemories: 5,
    minRelevance: 0.7,
    includeScores: true,
    groupByType: false,
  };

  const context = injector.buildContext(sampleMemories, options);

  console.log('Context Content:');
  console.log(context.content);
  console.log('\nMetadata:');
  console.log(`- Tokens used: ${context.tokensUsed}`);
  console.log(`- Memories used: ${context.memoriesUsed.length}`);
  console.log('- Memory IDs:', context.memoriesUsed.map((m) => m.id).join(', '));
}

/**
 * Example 2: Format as Markdown without grouping
 */
function exampleMarkdownBasic(): void {
  console.log('\n=== Example 2: Markdown Format (Basic) ===\n');

  const injector = createContextInjector();

  const options: ContextInjectionOptions = {
    format: 'markdown',
    maxTokens: 1000,
    maxMemories: 10,
    includeScores: true,
    groupByType: false,
  };

  const context = injector.buildContext(sampleMemories, options);

  console.log('Context Content:');
  console.log(context.content);
  console.log('\nMetadata:');
  console.log(`- Tokens used: ${context.tokensUsed}`);
  console.log(`- Memories used: ${context.memoriesUsed.length}`);
}

/**
 * Example 3: Format as Markdown with grouping by type
 */
function exampleMarkdownGrouped(): void {
  console.log('\n=== Example 3: Markdown Format (Grouped by Type) ===\n');

  const injector = createContextInjector();

  const options: ContextInjectionOptions = {
    format: 'markdown',
    maxTokens: 1000,
    maxMemories: 10,
    includeScores: false,
    groupByType: true,
  };

  const context = injector.buildContext(sampleMemories, options);

  console.log('Context Content:');
  console.log(context.content);
  console.log('\nMetadata:');
  console.log(`- Tokens used: ${context.tokensUsed}`);
  console.log(`- Memories used: ${context.memoriesUsed.length}`);
}

/**
 * Example 4: Format as natural language
 */
function exampleNaturalLanguage(): void {
  console.log('\n=== Example 4: Natural Language Format ===\n');

  const injector = createContextInjector();

  const options: ContextInjectionOptions = {
    format: 'natural_language',
    maxTokens: 800,
    maxMemories: 6,
    minRelevance: 0.75,
  };

  const context = injector.buildContext(sampleMemories, options);

  console.log('Context Content:');
  console.log(context.content);
  console.log('\nMetadata:');
  console.log(`- Tokens used: ${context.tokensUsed}`);
  console.log(`- Memories used: ${context.memoriesUsed.length}`);
}

/**
 * Example 5: Token budget constraint
 */
function exampleTokenBudget(): void {
  console.log('\n=== Example 5: Token Budget Constraint ===\n');

  const injector = createContextInjector();

  // Very tight token budget - should only include top memories
  const options: ContextInjectionOptions = {
    format: 'markdown',
    maxTokens: 200, // Tight budget
    maxMemories: 10,
    minRelevance: 0.8,
    includeScores: true,
  };

  const context = injector.buildContext(sampleMemories, options);

  console.log('Context Content:');
  console.log(context.content);
  console.log('\nMetadata:');
  console.log(`- Tokens used: ${context.tokensUsed} (max: ${options.maxTokens})`);
  console.log(`- Memories used: ${context.memoriesUsed.length} (max: ${options.maxMemories})`);
  console.log('- Relevance scores:', context.memoriesUsed.map((m) => m.score.toFixed(2)).join(', '));
}

/**
 * Example 6: Minimum relevance filtering
 */
function exampleRelevanceFiltering(): void {
  console.log('\n=== Example 6: Relevance Filtering ===\n');

  const injector = createContextInjector();

  // Only include highly relevant memories (>= 0.85)
  const options: ContextInjectionOptions = {
    format: 'json',
    maxTokens: 1000,
    maxMemories: 20,
    minRelevance: 0.85, // High threshold
    includeScores: true,
  };

  const context = injector.buildContext(sampleMemories, options);

  console.log('Context Content:');
  console.log(context.content);
  console.log('\nMetadata:');
  console.log(`- Tokens used: ${context.tokensUsed}`);
  console.log(`- Memories used: ${context.memoriesUsed.length}`);
  console.log('- All scores >= 0.85:', context.memoriesUsed.every((m) => m.score >= 0.85));
}

/**
 * Example 7: Token estimation demonstration
 */
function exampleTokenEstimation(): void {
  console.log('\n=== Example 7: Token Estimation ===\n');

  const injector = new ContextInjectorService();

  const testTexts = [
    'Short text',
    'This is a longer piece of text with multiple words.',
    'The quick brown fox jumps over the lazy dog. This is a classic pangram used for testing.',
  ];

  console.log('Token Estimation Examples:');
  for (const text of testTexts) {
    const tokens = injector.estimateTokens(text);
    const wordCount = text.split(/\s+/).length;
    console.log(`\nText: "${text}"`);
    console.log(`Words: ${wordCount}, Estimated tokens: ${tokens}, Ratio: ${(tokens / wordCount).toFixed(2)}`);
  }
}

/**
 * Example 8: Empty memories handling
 */
function exampleEmptyMemories(): void {
  console.log('\n=== Example 8: Empty Memories ===\n');

  const injector = createContextInjector();

  const options: ContextInjectionOptions = {
    format: 'natural_language',
    maxTokens: 1000,
    maxMemories: 10,
  };

  const context = injector.buildContext([], options);

  console.log('Context Content:');
  console.log(context.content);
  console.log('\nMetadata:');
  console.log(`- Tokens used: ${context.tokensUsed}`);
  console.log(`- Memories used: ${context.memoriesUsed.length}`);
}

/**
 * Example 9: Practical usage - Building LLM prompt
 */
function exampleLlmPrompt(): void {
  console.log('\n=== Example 9: Practical LLM Prompt Building ===\n');

  const injector = createContextInjector();

  // User query
  const userQuery = 'How do I run the integration tests?';

  // Build context from relevant memories
  const context = injector.buildContext(sampleMemories, {
    format: 'natural_language',
    maxTokens: 500,
    maxMemories: 5,
    minRelevance: 0.7,
  });

  // Construct full LLM prompt
  const llmPrompt = `You are a helpful assistant with access to the project's memory system.

${context.content}

User Question: ${userQuery}

Please answer the user's question using the context provided above.`;

  console.log('Full LLM Prompt:');
  console.log(llmPrompt);
  console.log('\nPrompt Stats:');
  console.log(`- Context tokens: ${context.tokensUsed}`);
  console.log(`- Memories referenced: ${context.memoriesUsed.length}`);
  console.log(`- Total prompt tokens (estimated): ${injector.estimateTokens(llmPrompt)}`);
}

/**
 * Run all examples
 */
function runAllExamples(): void {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       Context Injector Service - Usage Examples             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  exampleJsonFormat();
  exampleMarkdownBasic();
  exampleMarkdownGrouped();
  exampleNaturalLanguage();
  exampleTokenBudget();
  exampleRelevanceFiltering();
  exampleTokenEstimation();
  exampleEmptyMemories();
  exampleLlmPrompt();

  console.log('\n✓ All examples completed successfully!\n');
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  exampleJsonFormat,
  exampleMarkdownBasic,
  exampleMarkdownGrouped,
  exampleNaturalLanguage,
  exampleTokenBudget,
  exampleRelevanceFiltering,
  exampleTokenEstimation,
  exampleEmptyMemories,
  exampleLlmPrompt,
  runAllExamples,
};
