/**
 * Example usage of LLM Summarizer
 *
 * This file demonstrates how to use the hierarchical summarizer
 * at different levels with various configurations.
 */

import { LLMSummarizer } from './llm-summarizer.js';
import type { SummarizationRequest, SummarizationItem } from './types.js';

/**
 * Example 1: Level 0 - Summarize individual entries
 */
async function exampleLevel0() {
  const summarizer = new LLMSummarizer({
    provider: 'openai',
    openaiApiKey: process.env.AGENT_MEMORY_OPENAI_API_KEY,
    maxTokens: 512,
    temperature: 0.3,
  });

  const items: SummarizationItem[] = [
    {
      id: 'kb-001',
      type: 'knowledge',
      title: 'Database Migration Decision',
      content:
        'We decided to migrate from SQLite to PostgreSQL for production. ' +
        'Reasons: better concurrency, JSON support, full-text search capabilities. ' +
        'Timeline: Q1 2024. Risk: data migration complexity.',
      metadata: {
        category: 'decision',
        tags: ['database', 'migration', 'postgresql'],
      },
    },
  ];

  const request: SummarizationRequest = {
    items,
    hierarchyLevel: 0,
    scopeContext: 'Backend Infrastructure',
  };

  const result = await summarizer.summarize(request);

  console.log('Level 0 Summary (Individual Entry):');
  console.log('Title:', result.title);
  console.log('Content:', result.content);
  console.log('Key Terms:', result.keyTerms);
  console.log('Confidence:', result.confidence);
  console.log('---\n');

  return result;
}

/**
 * Example 2: Level 1 - Summarize related topics into theme
 */
async function exampleLevel1() {
  const summarizer = new LLMSummarizer({
    provider: 'openai',
    openaiApiKey: process.env.AGENT_MEMORY_OPENAI_API_KEY,
    maxTokens: 1024,
    temperature: 0.3,
  });

  const items: SummarizationItem[] = [
    {
      id: 'kb-001',
      type: 'knowledge',
      title: 'PostgreSQL Migration',
      content: 'Migrated from SQLite to PostgreSQL for better concurrency and JSON support.',
      metadata: {
        keyTerms: ['postgresql', 'migration', 'concurrency', 'json'],
      },
    },
    {
      id: 'kb-002',
      type: 'knowledge',
      title: 'Database Connection Pooling',
      content: 'Implemented connection pooling with pg-pool. Max 20 connections, idle timeout 30s.',
      metadata: {
        keyTerms: ['connection-pool', 'pg-pool', 'performance'],
      },
    },
    {
      id: 'kb-003',
      type: 'knowledge',
      title: 'Database Backup Strategy',
      content: 'Daily automated backups using pg_dump. Retention: 30 days. Stored in S3.',
      metadata: {
        keyTerms: ['backup', 'pg_dump', 's3', 'automation'],
      },
    },
  ];

  const request: SummarizationRequest = {
    items,
    hierarchyLevel: 1,
    scopeContext: 'Backend Infrastructure',
  };

  const result = await summarizer.summarize(request);

  console.log('Level 1 Summary (Topic/Theme):');
  console.log('Title:', result.title);
  console.log('Content:', result.content);
  console.log('Key Terms:', result.keyTerms);
  console.log('Confidence:', result.confidence);
  console.log('---\n');

  return result;
}

/**
 * Example 3: Level 2 - Summarize themes into domain knowledge
 */
async function exampleLevel2() {
  const summarizer = new LLMSummarizer({
    provider: 'openai',
    openaiApiKey: process.env.AGENT_MEMORY_OPENAI_API_KEY,
    maxTokens: 1536,
    temperature: 0.3,
  });

  const items: SummarizationItem[] = [
    {
      id: 'theme-001',
      type: 'summary',
      title: 'Database Infrastructure',
      content:
        'PostgreSQL deployment with connection pooling and automated backups. ' +
        'Focus on reliability and performance.',
      metadata: {
        keyTerms: ['postgresql', 'connection-pool', 'backup', 'reliability'],
      },
    },
    {
      id: 'theme-002',
      type: 'summary',
      title: 'API Architecture',
      content:
        'RESTful API with Express.js, rate limiting, and JWT authentication. ' +
        'OpenAPI documentation for all endpoints.',
      metadata: {
        keyTerms: ['rest-api', 'express', 'jwt', 'rate-limiting', 'openapi'],
      },
    },
    {
      id: 'theme-003',
      type: 'summary',
      title: 'Caching Strategy',
      content:
        'Redis for session storage and API response caching. TTL-based invalidation. ' +
        'Cache-aside pattern for database queries.',
      metadata: {
        keyTerms: ['redis', 'caching', 'session', 'cache-aside'],
      },
    },
  ];

  const request: SummarizationRequest = {
    items,
    hierarchyLevel: 2,
    scopeContext: 'Backend Architecture',
    focusAreas: ['scalability', 'performance', 'reliability'],
  };

  const result = await summarizer.summarize(request);

  console.log('Level 2 Summary (Domain):');
  console.log('Title:', result.title);
  console.log('Content:', result.content);
  console.log('Key Terms:', result.keyTerms);
  console.log('Confidence:', result.confidence);
  console.log('---\n');

  return result;
}

/**
 * Example 4: Batch summarization
 */
async function exampleBatch() {
  const summarizer = new LLMSummarizer({
    provider: 'openai',
    openaiApiKey: process.env.AGENT_MEMORY_OPENAI_API_KEY,
    enableBatching: true,
  });

  const requests: SummarizationRequest[] = [
    {
      items: [
        {
          id: 'kb-001',
          type: 'knowledge',
          title: 'TypeScript Configuration',
          content: 'Using strict mode with all checks enabled. Target ES2022.',
        },
      ],
      hierarchyLevel: 0,
    },
    {
      items: [
        {
          id: 'kb-002',
          type: 'knowledge',
          title: 'ESLint Setup',
          content: 'ESLint with TypeScript parser, Prettier integration.',
        },
      ],
      hierarchyLevel: 0,
    },
  ];

  const result = await summarizer.summarizeBatch(requests);

  console.log('Batch Summarization:');
  console.log('Total Results:', result.results.length);
  console.log('Total Time:', result.totalProcessingTimeMs, 'ms');
  console.log('Provider:', result.provider);
  console.log('Model:', result.model);
  result.results.forEach((r, i) => {
    console.log(`\nResult ${i + 1}:`);
    console.log('  Title:', r.title);
    console.log('  Content:', r.content.substring(0, 100) + '...');
  });
  console.log('---\n');
}

/**
 * Example 5: Using fallback mode (no LLM)
 */
async function exampleFallback() {
  const summarizer = new LLMSummarizer({
    provider: 'disabled',
  });

  const items: SummarizationItem[] = [
    {
      id: 'kb-001',
      type: 'knowledge',
      title: 'Database Migration',
      content: 'Migrated from SQLite to PostgreSQL for production deployment.',
    },
    {
      id: 'kb-002',
      type: 'knowledge',
      title: 'Connection Pooling',
      content: 'Implemented connection pooling with max 20 connections.',
    },
  ];

  const request: SummarizationRequest = {
    items,
    hierarchyLevel: 1,
  };

  const result = await summarizer.summarize(request);

  console.log('Fallback Summary (No LLM):');
  console.log('Title:', result.title);
  console.log('Content:', result.content);
  console.log('Key Terms:', result.keyTerms);
  console.log('Confidence:', result.confidence);
  console.log('Provider:', result.provider); // Will be 'disabled'
  console.log('---\n');
}

/**
 * Example 6: Using Anthropic provider
 */
async function exampleAnthropic() {
  const summarizer = new LLMSummarizer({
    provider: 'anthropic',
    anthropicApiKey: process.env.AGENT_MEMORY_ANTHROPIC_API_KEY,
    model: 'claude-3-5-haiku-20241022',
    maxTokens: 1024,
    temperature: 0.3,
  });

  const items: SummarizationItem[] = [
    {
      id: 'kb-001',
      type: 'knowledge',
      title: 'API Rate Limiting',
      content:
        'Implemented rate limiting: 100 requests/minute per user, 1000/minute globally. ' +
        'Using sliding window algorithm with Redis backend.',
      metadata: {
        tags: ['api', 'rate-limiting', 'redis'],
      },
    },
  ];

  const request: SummarizationRequest = {
    items,
    hierarchyLevel: 0,
    scopeContext: 'API Security',
  };

  const result = await summarizer.summarize(request);

  console.log('Anthropic Summary:');
  console.log('Title:', result.title);
  console.log('Content:', result.content);
  console.log('Model:', result.model);
  console.log('Provider:', result.provider);
  console.log('---\n');
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('=== LLM Summarizer Examples ===\n');

  try {
    // Check if API keys are available
    const hasOpenAI = !!process.env.AGENT_MEMORY_OPENAI_API_KEY;
    const hasAnthropic = !!process.env.AGENT_MEMORY_ANTHROPIC_API_KEY;

    if (hasOpenAI) {
      await exampleLevel0();
      await exampleLevel1();
      await exampleLevel2();
      await exampleBatch();
    } else {
      console.log('Skipping OpenAI examples (no API key)\n');
    }

    if (hasAnthropic) {
      await exampleAnthropic();
    } else {
      console.log('Skipping Anthropic examples (no API key)\n');
    }

    // Fallback example always works
    await exampleFallback();

    console.log('All examples completed successfully!');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}

export {
  exampleLevel0,
  exampleLevel1,
  exampleLevel2,
  exampleBatch,
  exampleFallback,
  exampleAnthropic,
};
