/**
 * Comprehensive Stress Test Suite for Agent Memory
 *
 * Tests:
 * 1. Concurrent MCP calls - parallel operations
 * 2. Large data volume - 1000+ entries
 * 3. Semantic search load - embedding and vector search
 * 4. Memory remember stress - natural language storage
 *
 * Run with: npx tsx tests/stress/stress-test.ts
 */

import {
  setupTestDb,
  cleanupTestDb,
  createTestContext,
  type TestDb,
} from '../fixtures/test-helpers.js';
import { guidelineHandlers } from '../../src/mcp/handlers/guidelines.handler.js';
import { knowledgeHandlers } from '../../src/mcp/handlers/knowledge.handler.js';
import { toolHandlers } from '../../src/mcp/handlers/tools.handler.js';
import { queryHandlers } from '../../src/mcp/handlers/query.handler.js';
import { scopeHandlers } from '../../src/mcp/handlers/scopes.handler.js';
import type { AppContext } from '../../src/core/context.js';

// Set permissive mode for stress testing
process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

// Default agent ID for stress testing
const STRESS_TEST_AGENT_ID = 'stress-test-agent';

// =============================================================================
// CONFIGURATION
// =============================================================================

const STRESS_CONFIG = {
  // Concurrent test config
  concurrent: {
    parallelBatches: 10,
    operationsPerBatch: 50,
  },
  // Large data volume config
  volume: {
    guidelinesCount: 500,
    knowledgeCount: 500,
    toolsCount: 200,
    batchSize: 50,
  },
  // Semantic search config
  semantic: {
    queryCount: 100,
    parallelQueries: 20,
  },
  // Remember stress config
  remember: {
    count: 100,
  },
  // Multi-agent config
  multiAgent: {
    agentCount: 5,
    operationsPerAgent: 50,
  },
  // Memory pressure config
  memoryPressure: {
    largeEntryCount: 100,
    entrySize: 50000, // 50KB per entry
  },
  // Complex query config
  complexQuery: {
    queryCount: 50,
    maxFilters: 5,
  },
  // Embedding backpressure config
  embeddingBackpressure: {
    batchCount: 10,
    entriesPerBatch: 20,
  },
};

// =============================================================================
// UTILITIES
// =============================================================================

interface StressResult {
  name: string;
  duration: number;
  operations: number;
  opsPerSecond: number;
  errors: number;
  errorRate: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function printResult(result: StressResult) {
  const status = result.errorRate > 0.05 ? '❌' : '✅';
  console.log(`
${status} ${result.name}
   Duration: ${formatDuration(result.duration)}
   Operations: ${result.operations}
   Throughput: ${result.opsPerSecond.toFixed(2)} ops/sec
   Errors: ${result.errors} (${(result.errorRate * 100).toFixed(2)}%)
`);
}

// =============================================================================
// TEST 1: CONCURRENT MCP CALLS
// =============================================================================

async function testConcurrentMcpCalls(ctx: AppContext, projectId: string): Promise<StressResult> {
  console.log('\n🔥 Test 1: Concurrent MCP Calls');
  console.log('================================');

  const { parallelBatches, operationsPerBatch } = STRESS_CONFIG.concurrent;
  const totalOps = parallelBatches * operationsPerBatch;
  let errors = 0;
  let firstError: string | null = null;

  const logError = (e: unknown) => {
    errors++;
    if (!firstError) {
      firstError = (e as Error).message || String(e);
    }
  };

  const start = performance.now();

  // Run batches of parallel operations
  for (let batch = 0; batch < parallelBatches; batch++) {
    const operations: Promise<unknown>[] = [];

    for (let i = 0; i < operationsPerBatch; i++) {
      const opType = i % 4;

      switch (opType) {
        case 0:
          // Add guideline
          operations.push(
            guidelineHandlers
              .add(ctx, {
                name: `stress-guideline-${batch}-${i}`,
                content: `Stress test guideline content for batch ${batch} operation ${i}. This contains enough text to be meaningful.`,
                category: 'testing',
                scopeType: 'project',
                scopeId: projectId,
                agentId: STRESS_TEST_AGENT_ID,
              })
              .catch(logError)
          );
          break;
        case 1:
          // Add knowledge
          operations.push(
            knowledgeHandlers
              .add(ctx, {
                title: `Stress knowledge ${batch}-${i}`,
                content: `Stress test knowledge entry for batch ${batch} operation ${i}. Contains factual information for testing.`,
                category: 'fact',
                scopeType: 'project',
                scopeId: projectId,
                agentId: STRESS_TEST_AGENT_ID,
              })
              .catch(logError)
          );
          break;
        case 2:
          // Query search
          operations.push(
            queryHandlers
              .query(ctx, {
                search: `stress test batch ${batch}`,
                scopeType: 'project',
                scopeId: projectId,
                limit: 10,
              })
              .catch(logError)
          );
          break;
        case 3:
          // Query context
          operations.push(
            queryHandlers
              .context(ctx, {
                scopeType: 'project',
                scopeId: projectId,
                limit: 5,
              })
              .catch(logError)
          );
          break;
      }
    }

    await Promise.all(operations);
    process.stdout.write(`\r   Batch ${batch + 1}/${parallelBatches} complete`);
  }

  const duration = performance.now() - start;
  console.log('');
  if (firstError) {
    console.error(`   First error: ${firstError}`);
  }

  return {
    name: 'Concurrent MCP Calls',
    duration,
    operations: totalOps,
    opsPerSecond: (totalOps / duration) * 1000,
    errors,
    errorRate: errors / totalOps,
  };
}

// =============================================================================
// TEST 2: LARGE DATA VOLUME
// =============================================================================

async function testLargeDataVolume(ctx: AppContext, projectId: string): Promise<StressResult> {
  console.log('\n📦 Test 2: Large Data Volume');
  console.log('============================');

  const { guidelinesCount, knowledgeCount, toolsCount, batchSize } = STRESS_CONFIG.volume;
  const totalOps = guidelinesCount + knowledgeCount + toolsCount;
  let errors = 0;
  let created = 0;

  const start = performance.now();

  // Create guidelines in batches
  console.log(`\n   Creating ${guidelinesCount} guidelines...`);
  for (let i = 0; i < guidelinesCount; i += batchSize) {
    const batch = Math.min(batchSize, guidelinesCount - i);
    const entries = Array.from({ length: batch }, (_, j) => ({
      name: `volume-guideline-${i + j}`,
      content: `Volume test guideline ${i + j}. Follow this pattern for code style consistency. Always use TypeScript strict mode.`,
      category: 'code-style',
      priority: 50 + (j % 50),
    }));

    try {
      await guidelineHandlers.bulk_add(ctx, {
        scopeType: 'project',
        scopeId: projectId,
        entries,
        agentId: STRESS_TEST_AGENT_ID,
      });
      created += batch;
    } catch (e) {
      if (errors === 0) console.error('\n   First guideline error:', (e as Error).message);
      errors += batch;
    }
    process.stdout.write(
      `\r   Guidelines: ${Math.min(i + batchSize, guidelinesCount)}/${guidelinesCount}`
    );
  }

  // Create knowledge in batches
  console.log(`\n   Creating ${knowledgeCount} knowledge entries...`);
  for (let i = 0; i < knowledgeCount; i += batchSize) {
    const batch = Math.min(batchSize, knowledgeCount - i);
    const entries = Array.from({ length: batch }, (_, j) => ({
      title: `Volume knowledge entry ${i + j}`,
      content: `This is knowledge entry ${i + j} containing important factual information about the system architecture and design decisions.`,
      category: 'fact',
    }));

    try {
      await knowledgeHandlers.bulk_add(ctx, {
        scopeType: 'project',
        scopeId: projectId,
        entries,
        agentId: STRESS_TEST_AGENT_ID,
      });
      created += batch;
    } catch (e) {
      if (errors === 0 || errors - Math.floor(errors / 50) * 50 === 0)
        console.error('\n   Knowledge error:', (e as Error).message);
      errors += batch;
    }
    process.stdout.write(
      `\r   Knowledge: ${Math.min(i + batchSize, knowledgeCount)}/${knowledgeCount}`
    );
  }

  // Create tools in batches
  console.log(`\n   Creating ${toolsCount} tools...`);
  for (let i = 0; i < toolsCount; i += batchSize) {
    const batch = Math.min(batchSize, toolsCount - i);
    const entries = Array.from({ length: batch }, (_, j) => ({
      name: `volume-tool-${i + j}`,
      description: `Volume test tool ${i + j} for running automated tasks`,
      category: 'cli' as const,
    }));

    try {
      await toolHandlers.bulk_add(ctx, {
        scopeType: 'project',
        scopeId: projectId,
        entries,
        agentId: STRESS_TEST_AGENT_ID,
      });
      created += batch;
    } catch (e) {
      if (errors === 0 || errors === 500) console.error('\n   Tool error:', (e as Error).message);
      errors += batch;
    }
    process.stdout.write(`\r   Tools: ${Math.min(i + batchSize, toolsCount)}/${toolsCount}`);
  }

  const duration = performance.now() - start;
  console.log('');

  // Now test querying this large dataset
  console.log('\n   Testing queries on large dataset...');
  const queryStart = performance.now();

  // Test pagination through all results
  let offset = 0;
  let totalResults = 0;
  while (true) {
    const result = (await queryHandlers.query(ctx, {
      scopeType: 'project',
      scopeId: projectId,
      limit: 100,
      offset,
    })) as { results: unknown[]; meta: { hasMore: boolean } };
    totalResults += result.results.length;
    if (!result.meta.hasMore) break;
    offset += 100;
  }

  const queryDuration = performance.now() - queryStart;
  console.log(`   Paginated through ${totalResults} results in ${formatDuration(queryDuration)}`);

  // Test context retrieval
  const contextStart = performance.now();
  const contextResult = (await queryHandlers.context(ctx, {
    scopeType: 'project',
    scopeId: projectId,
  })) as { tools: unknown[]; guidelines: unknown[]; knowledge: unknown[]; experiences: unknown[] };
  const contextDuration = performance.now() - contextStart;
  const contextCount =
    contextResult.tools.length +
    contextResult.guidelines.length +
    contextResult.knowledge.length +
    contextResult.experiences.length;
  console.log(
    `   Context retrieval: ${contextCount} entries in ${formatDuration(contextDuration)}`
  );

  return {
    name: 'Large Data Volume',
    duration,
    operations: totalOps,
    opsPerSecond: (totalOps / duration) * 1000,
    errors,
    errorRate: errors / totalOps,
  };
}

// =============================================================================
// TEST 3: SEMANTIC SEARCH LOAD
// =============================================================================

async function testSemanticSearchLoad(ctx: AppContext, projectId: string): Promise<StressResult> {
  console.log('\n🔍 Test 3: Semantic Search Load');
  console.log('================================');

  const { queryCount, parallelQueries } = STRESS_CONFIG.semantic;
  let errors = 0;

  // Sample queries to test semantic similarity
  const sampleQueries = [
    'authentication and login security',
    'database connection pooling',
    'error handling best practices',
    'API rate limiting configuration',
    'caching strategies for performance',
    'logging and monitoring setup',
    'testing methodology guidelines',
    'deployment automation process',
    'code review standards',
    'documentation requirements',
  ];

  const start = performance.now();

  // Run queries in parallel batches
  const batches = Math.ceil(queryCount / parallelQueries);
  let completed = 0;

  for (let batch = 0; batch < batches; batch++) {
    const batchSize = Math.min(parallelQueries, queryCount - completed);
    const operations: Promise<unknown>[] = [];

    for (let i = 0; i < batchSize; i++) {
      const query = sampleQueries[(completed + i) % sampleQueries.length];

      operations.push(
        queryHandlers
          .query(ctx, {
            search: query,
            scopeType: 'project',
            scopeId: projectId,
            semanticSearch: true,
            limit: 20,
          })
          .catch(() => {
            errors++;
          })
      );
    }

    await Promise.all(operations);
    completed += batchSize;
    process.stdout.write(`\r   Queries: ${completed}/${queryCount}`);
  }

  const duration = performance.now() - start;
  console.log('');

  // Test semantic context retrieval
  console.log('\n   Testing semantic context retrieval...');
  const contextStart = performance.now();

  for (const query of sampleQueries.slice(0, 5)) {
    await queryHandlers.context(ctx, {
      scopeType: 'project',
      scopeId: projectId,
      search: query,
    });
  }

  const contextDuration = performance.now() - contextStart;
  console.log(`   5 semantic context queries in ${formatDuration(contextDuration)}`);

  return {
    name: 'Semantic Search Load',
    duration,
    operations: queryCount,
    opsPerSecond: (queryCount / duration) * 1000,
    errors,
    errorRate: errors / queryCount,
  };
}

// =============================================================================
// TEST 4: RAPID SINGLE ENTRY CREATION
// =============================================================================

async function testRapidEntryCreation(ctx: AppContext, projectId: string): Promise<StressResult> {
  console.log('\n🧠 Test 4: Rapid Single Entry Creation');
  console.log('======================================');

  const entryCount = STRESS_CONFIG.remember.count;
  let errors = 0;

  const sampleContents = [
    'We decided to use PostgreSQL for the production database due to its reliability',
    'The API rate limit is set to 1000 requests per minute per user',
    'Always use TypeScript strict mode for new projects',
    'Error messages should include error codes for debugging',
    'Use npm run build:all to compile the entire project',
    'The config system uses Zod for validation',
    'Sessions are stored in Redis for horizontal scaling',
    'Vector embeddings use 1024 dimensions with LM Studio',
  ];

  const start = performance.now();

  // Create entries one at a time (simulating real-world single insertions)
  for (let i = 0; i < entryCount; i++) {
    const content = `${sampleContents[i % sampleContents.length]} (iteration ${i})`;
    const entryType = i % 3; // Rotate between guideline, knowledge, tool

    try {
      switch (entryType) {
        case 0:
          await guidelineHandlers.add(ctx, {
            name: `rapid-guideline-${i}`,
            content,
            category: 'workflow',
            scopeType: 'project',
            scopeId: projectId,
            agentId: STRESS_TEST_AGENT_ID,
          });
          break;
        case 1:
          await knowledgeHandlers.add(ctx, {
            title: `Rapid knowledge ${i}`,
            content,
            category: 'fact',
            scopeType: 'project',
            scopeId: projectId,
            agentId: STRESS_TEST_AGENT_ID,
          });
          break;
        case 2:
          await toolHandlers.add(ctx, {
            name: `rapid-tool-${i}`,
            description: content,
            category: 'cli',
            scopeType: 'project',
            scopeId: projectId,
            agentId: STRESS_TEST_AGENT_ID,
          });
          break;
      }
    } catch (e) {
      if (errors === 0) console.error('\n   Rapid entry error:', (e as Error).message);
      errors++;
    }

    if ((i + 1) % 10 === 0) {
      process.stdout.write(`\r   Entries created: ${i + 1}/${entryCount}`);
    }
  }

  const duration = performance.now() - start;
  console.log('');

  return {
    name: 'Rapid Single Entry Creation',
    duration,
    operations: entryCount,
    opsPerSecond: (entryCount / duration) * 1000,
    errors,
    errorRate: errors / entryCount,
  };
}

// =============================================================================
// TEST 5: MULTI-AGENT CONCURRENT ACCESS
// =============================================================================

async function testMultiAgentAccess(ctx: AppContext, projectId: string): Promise<StressResult> {
  console.log('\n👥 Test 5: Multi-Agent Concurrent Access');
  console.log('=========================================');

  const { agentCount, operationsPerAgent } = STRESS_CONFIG.multiAgent;
  const totalOps = agentCount * operationsPerAgent;
  let errors = 0;
  let firstError: string | null = null;

  const logError = (e: unknown) => {
    errors++;
    if (!firstError) {
      firstError = (e as Error).message || String(e);
    }
  };

  const start = performance.now();

  // Simulate multiple agents working concurrently
  const agentOperations: Promise<void>[] = [];

  for (let agentNum = 0; agentNum < agentCount; agentNum++) {
    const agentId = `multi-agent-${agentNum}`;

    const agentWork = async () => {
      for (let i = 0; i < operationsPerAgent; i++) {
        const opType = i % 5;

        try {
          switch (opType) {
            case 0:
              // Each agent creates guidelines
              await guidelineHandlers.add(ctx, {
                name: `multiagent-guideline-${agentNum}-${i}`,
                content: `Guideline from agent ${agentNum}, operation ${i}`,
                category: 'workflow',
                scopeType: 'project',
                scopeId: projectId,
                agentId,
              });
              break;
            case 1:
              // Each agent creates knowledge
              await knowledgeHandlers.add(ctx, {
                title: `Agent ${agentNum} knowledge ${i}`,
                content: `Knowledge entry from agent ${agentNum}, operation ${i}`,
                category: 'fact',
                scopeType: 'project',
                scopeId: projectId,
                agentId,
              });
              break;
            case 2:
              // Query own entries
              await queryHandlers.query(ctx, {
                search: `agent ${agentNum}`,
                scopeType: 'project',
                scopeId: projectId,
                limit: 10,
              });
              break;
            case 3:
              // Query all entries (shared access)
              await queryHandlers.context(ctx, {
                scopeType: 'project',
                scopeId: projectId,
                limit: 20,
              });
              break;
            case 4:
              // Update an entry from this agent
              const listResult = (await guidelineHandlers.list(ctx, {
                scopeType: 'project',
                scopeId: projectId,
                limit: 5,
              })) as { entries?: Array<{ id: string; name: string }> };
              if (listResult.entries?.length) {
                const entry = listResult.entries[0];
                await guidelineHandlers
                  .update(ctx, {
                    id: entry.id,
                    content: `Updated by agent ${agentNum} at ${Date.now()}`,
                    agentId,
                  })
                  .catch(() => {}); // Ignore update conflicts
              }
              break;
          }
        } catch (e) {
          logError(e);
        }
      }
    };

    agentOperations.push(agentWork());
  }

  // Wait for all agents to complete
  await Promise.all(agentOperations);

  const duration = performance.now() - start;
  console.log(`   ${agentCount} agents completed ${operationsPerAgent} operations each`);
  if (firstError) {
    console.error(`   First error: ${firstError}`);
  }

  return {
    name: 'Multi-Agent Concurrent Access',
    duration,
    operations: totalOps,
    opsPerSecond: (totalOps / duration) * 1000,
    errors,
    errorRate: errors / totalOps,
  };
}

// =============================================================================
// TEST 6: MEMORY PRESSURE
// =============================================================================

async function testMemoryPressure(ctx: AppContext, projectId: string): Promise<StressResult> {
  console.log('\n💾 Test 6: Memory Pressure');
  console.log('===========================');

  const { largeEntryCount, entrySize } = STRESS_CONFIG.memoryPressure;
  let errors = 0;
  let firstError: string | null = null;

  // Generate large content
  const generateLargeContent = (index: number): string => {
    const base = `Large content entry ${index}. `;
    const repeatCount = Math.floor(entrySize / base.length);
    return base.repeat(repeatCount);
  };

  const start = performance.now();

  console.log(`   Creating ${largeEntryCount} entries of ~${entrySize / 1000}KB each...`);

  // Create large entries
  for (let i = 0; i < largeEntryCount; i++) {
    const largeContent = generateLargeContent(i);

    try {
      await knowledgeHandlers.add(ctx, {
        title: `Memory pressure test ${i}`,
        content: largeContent,
        category: 'fact',
        scopeType: 'project',
        scopeId: projectId,
        agentId: STRESS_TEST_AGENT_ID,
      });
    } catch (e) {
      errors++;
      if (!firstError) {
        firstError = (e as Error).message || String(e);
      }
    }

    if ((i + 1) % 10 === 0) {
      process.stdout.write(`\r   Entries: ${i + 1}/${largeEntryCount}`);
    }
  }

  console.log('');

  // Now test querying under memory pressure
  console.log('   Testing queries with large data...');
  const queryStart = performance.now();

  // Run multiple context queries to stress cache
  for (let i = 0; i < 10; i++) {
    try {
      await queryHandlers.context(ctx, {
        scopeType: 'project',
        scopeId: projectId,
      });
    } catch (e) {
      errors++;
    }
  }

  const queryDuration = performance.now() - queryStart;
  console.log(`   10 context queries: ${formatDuration(queryDuration)}`);

  // Check memory usage if available
  if (typeof process.memoryUsage === 'function') {
    const mem = process.memoryUsage();
    console.log(
      `   Memory: heap=${Math.round(mem.heapUsed / 1024 / 1024)}MB, rss=${Math.round(mem.rss / 1024 / 1024)}MB`
    );
  }

  const duration = performance.now() - start;
  if (firstError) {
    console.error(`   First error: ${firstError}`);
  }

  return {
    name: 'Memory Pressure',
    duration,
    operations: largeEntryCount + 10, // entries + queries
    opsPerSecond: ((largeEntryCount + 10) / duration) * 1000,
    errors,
    errorRate: errors / (largeEntryCount + 10),
  };
}

// =============================================================================
// TEST 7: COMPLEX QUERIES
// =============================================================================

async function testComplexQueries(ctx: AppContext, projectId: string): Promise<StressResult> {
  console.log('\n🔎 Test 7: Complex Queries');
  console.log('===========================');

  const { queryCount } = STRESS_CONFIG.complexQuery;
  let errors = 0;
  let firstError: string | null = null;

  // First, create some structured data for complex queries
  console.log('   Setting up test data with tags and relations...');

  const categories = ['security', 'performance', 'testing', 'deployment', 'documentation'];
  const tags = ['critical', 'experimental', 'deprecated', 'reviewed'];

  // Create guidelines with various categories
  for (let i = 0; i < 20; i++) {
    try {
      await guidelineHandlers.add(ctx, {
        name: `complex-query-guideline-${i}`,
        content: `Guideline ${i} for ${categories[i % categories.length]} with priority ${50 + i}`,
        category: categories[i % categories.length],
        priority: 50 + i,
        scopeType: 'project',
        scopeId: projectId,
        agentId: STRESS_TEST_AGENT_ID,
      });
    } catch (e) {
      // Ignore setup errors
    }
  }

  const start = performance.now();

  console.log(`   Running ${queryCount} complex queries...`);

  for (let i = 0; i < queryCount; i++) {
    const queryType = i % 6;

    try {
      switch (queryType) {
        case 0:
          // Query with multiple types
          await queryHandlers.query(ctx, {
            types: ['guidelines', 'knowledge'],
            scopeType: 'project',
            scopeId: projectId,
            limit: 50,
          });
          break;
        case 1:
          // Query with text search and filters
          await queryHandlers.query(ctx, {
            search: categories[i % categories.length],
            types: ['guidelines'],
            scopeType: 'project',
            scopeId: projectId,
            limit: 20,
          });
          break;
        case 2:
          // Query with priority filter (using search)
          await queryHandlers.query(ctx, {
            search: 'priority',
            types: ['guidelines'],
            scopeType: 'project',
            scopeId: projectId,
            limit: 30,
          });
          break;
        case 3:
          // Context query with all types
          await queryHandlers.context(ctx, {
            scopeType: 'project',
            scopeId: projectId,
          });
          break;
        case 4:
          // Semantic search with category
          await queryHandlers.query(ctx, {
            search: `best practices for ${categories[i % categories.length]}`,
            semanticSearch: true,
            scopeType: 'project',
            scopeId: projectId,
            limit: 10,
          });
          break;
        case 5:
          // Combined: multiple types + search + limit
          await queryHandlers.query(ctx, {
            search: 'guideline',
            types: ['guidelines', 'knowledge', 'tools'],
            scopeType: 'project',
            scopeId: projectId,
            limit: 100,
          });
          break;
      }
    } catch (e) {
      errors++;
      if (!firstError) {
        firstError = (e as Error).message || String(e);
      }
    }

    if ((i + 1) % 10 === 0) {
      process.stdout.write(`\r   Queries: ${i + 1}/${queryCount}`);
    }
  }

  const duration = performance.now() - start;
  console.log('');
  if (firstError) {
    console.error(`   First error: ${firstError}`);
  }

  return {
    name: 'Complex Queries',
    duration,
    operations: queryCount,
    opsPerSecond: (queryCount / duration) * 1000,
    errors,
    errorRate: errors / queryCount,
  };
}

// =============================================================================
// TEST 8: EMBEDDING BACKPRESSURE
// =============================================================================

async function testEmbeddingBackpressure(
  ctx: AppContext,
  projectId: string
): Promise<StressResult> {
  console.log('\n⏳ Test 8: Embedding Backpressure');
  console.log('==================================');

  const { batchCount, entriesPerBatch } = STRESS_CONFIG.embeddingBackpressure;
  const totalOps = batchCount * entriesPerBatch;
  let errors = 0;
  let firstError: string | null = null;

  // This test creates many entries rapidly to stress the embedding queue
  const sampleTexts = [
    'Machine learning model training pipeline optimization strategies',
    'Database query performance tuning and index optimization',
    'Microservices architecture design patterns and best practices',
    'Container orchestration with Kubernetes deployment strategies',
    'Continuous integration and deployment automation workflows',
    'API gateway configuration and rate limiting policies',
    'Event-driven architecture with message queue systems',
    'Cloud infrastructure cost optimization techniques',
    'Security vulnerability scanning and remediation processes',
    'Distributed tracing and observability implementation',
  ];

  const start = performance.now();

  console.log(`   Creating ${totalOps} entries to stress embedding queue...`);

  // Create entries in rapid succession to overwhelm the embedding queue
  for (let batch = 0; batch < batchCount; batch++) {
    const batchPromises: Promise<unknown>[] = [];

    for (let i = 0; i < entriesPerBatch; i++) {
      const textIdx = (batch * entriesPerBatch + i) % sampleTexts.length;
      const uniqueText = `${sampleTexts[textIdx]} (batch ${batch}, entry ${i}, ts=${Date.now()})`;

      batchPromises.push(
        knowledgeHandlers
          .add(ctx, {
            title: `Embedding test ${batch}-${i}`,
            content: uniqueText,
            category: 'fact',
            scopeType: 'project',
            scopeId: projectId,
            agentId: STRESS_TEST_AGENT_ID,
          })
          .catch((e) => {
            errors++;
            if (!firstError) {
              firstError = (e as Error).message || String(e);
            }
          })
      );
    }

    // Fire all entries in the batch at once
    await Promise.all(batchPromises);
    process.stdout.write(`\r   Batch ${batch + 1}/${batchCount} complete`);
  }

  console.log('');

  // Now immediately query to test if system handles backpressure
  console.log('   Testing semantic search under backpressure...');
  const searchStart = performance.now();

  const searchPromises: Promise<unknown>[] = [];
  for (let i = 0; i < 10; i++) {
    searchPromises.push(
      queryHandlers
        .query(ctx, {
          search: sampleTexts[i % sampleTexts.length],
          semanticSearch: true,
          scopeType: 'project',
          scopeId: projectId,
          limit: 10,
        })
        .catch(() => {
          errors++;
        })
    );
  }

  await Promise.all(searchPromises);
  const searchDuration = performance.now() - searchStart;
  console.log(`   10 parallel semantic searches: ${formatDuration(searchDuration)}`);

  const duration = performance.now() - start;
  if (firstError) {
    console.error(`   First error: ${firstError}`);
  }

  return {
    name: 'Embedding Backpressure',
    duration,
    operations: totalOps + 10, // entries + searches
    opsPerSecond: ((totalOps + 10) / duration) * 1000,
    errors,
    errorRate: errors / (totalOps + 10),
  };
}

// =============================================================================
// CLEANUP
// =============================================================================

async function cleanupStressTestData(ctx: AppContext, projectId: string) {
  console.log('\n🧹 Cleaning up stress test data...');

  // List and delete stress test entries
  const prefixes = ['stress-', 'volume-', 'rapid-', 'multiagent-', 'complex-query-'];

  for (const prefix of prefixes) {
    try {
      const guidelines = (await guidelineHandlers.list(ctx, {
        scopeType: 'project',
        scopeId: projectId,
        limit: 1000,
      })) as { entries: Array<{ id: string; name: string }> };

      for (const g of guidelines.entries) {
        if (g.name.startsWith(prefix)) {
          await guidelineHandlers.delete(ctx, { id: g.id }).catch(() => {});
        }
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  console.log('   Cleanup complete');
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           Agent Memory Comprehensive Stress Test               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  // Setup
  console.log('\n⚙️  Setting up test environment...');

  const dbPath = `./data/stress-test/stress-${Date.now()}.db`;
  let testDb: TestDb | undefined;
  let ctx: AppContext | undefined;

  try {
    // Setup test database
    testDb = setupTestDb(dbPath);
    ctx = await createTestContext(testDb);

    // Create a project for the stress test
    // Note: For testing without admin key, we use the repository directly
    const project = await ctx.repos.projects.create({
      name: 'stress-test-project',
      description: 'Project for stress testing',
    });
    const projectId = project.id;

    // Start a session using repository
    await ctx.repos.sessions.create({
      projectId,
      name: 'stress-test-session',
      purpose: 'Comprehensive stress testing',
      status: 'active',
    });

    console.log('   Environment ready');
    console.log(`   Project ID: ${projectId}`);

    const results: StressResult[] = [];

    // Run all stress tests
    results.push(await testConcurrentMcpCalls(ctx, projectId));
    results.push(await testLargeDataVolume(ctx, projectId));
    results.push(await testSemanticSearchLoad(ctx, projectId));
    results.push(await testRapidEntryCreation(ctx, projectId));
    results.push(await testMultiAgentAccess(ctx, projectId));
    results.push(await testMemoryPressure(ctx, projectId));
    results.push(await testComplexQueries(ctx, projectId));
    results.push(await testEmbeddingBackpressure(ctx, projectId));

    // Print summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                        STRESS TEST RESULTS                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    for (const result of results) {
      printResult(result);
    }

    // Overall summary
    const totalOps = results.reduce((sum, r) => sum + r.operations, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 TOTAL: ${totalOps} operations in ${formatDuration(totalDuration)}`);
    console.log(`   Average throughput: ${((totalOps / totalDuration) * 1000).toFixed(2)} ops/sec`);
    console.log(
      `   Total errors: ${totalErrors} (${((totalErrors / totalOps) * 100).toFixed(2)}%)`
    );
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Cleanup stress test data
    await cleanupStressTestData(ctx, projectId);
  } catch (error) {
    console.error('\n❌ Stress test failed:', error);
    process.exitCode = 1;
  } finally {
    // Shutdown
    console.log('\n⏹️  Shutting down...');
    if (testDb) {
      testDb.sqlite.close();
      cleanupTestDb(dbPath);
    }
    console.log('   Done');
  }
}

main().catch(console.error);
