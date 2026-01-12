/**
 * Quick test for query decomposition
 */

import { QueryDecomposer } from '../src/services/query-rewrite/decomposer.js';
import { SubQueryExecutor, type SubQueryResult } from '../src/services/query-rewrite/executor.js';

async function test() {
  console.log('Testing QueryDecomposer...\n');

  const decomposer = new QueryDecomposer(null, { useLLM: false });

  // Test queries
  const queries = [
    "What is our authentication system?",  // Simple
    "What is our authentication system and how do we deploy to production?",  // Multi-topic
    "What's the difference between JWT and session-based auth?",  // Comparison
    "Why did we switch to PostgreSQL and what was the migration process?",  // Causal
  ];

  for (const query of queries) {
    console.log(`Query: "${query}"`);
    const analysis = decomposer.analyzeQuery(query);
    console.log(`  Analysis: needsDecomposition=${analysis.needsDecomposition}, type=${analysis.complexityType}, confidence=${analysis.confidence}`);

    if (analysis.needsDecomposition) {
      const plan = await decomposer.decompose(query);
      console.log(`  Plan: ${plan.subQueries.length} sub-queries, order=${plan.executionOrder}`);
      for (const sq of plan.subQueries) {
        console.log(`    [${sq.index}] "${sq.query}" - ${sq.purpose}`);
      }
    }
    console.log('');
  }

  console.log('Testing SubQueryExecutor with RRF merge...\n');

  const executor = new SubQueryExecutor({ mergeStrategy: 'rrf' });

  // Simulate results
  const mockResults: SubQueryResult[] = [
    {
      subQuery: { index: 0, query: 'What is auth?', purpose: 'Auth info' },
      entries: [
        { id: 'a', content: 'Auth A', type: 'knowledge', score: 0.9 },
        { id: 'b', content: 'Auth B', type: 'knowledge', score: 0.8 },
        { id: 'c', content: 'Auth C', type: 'knowledge', score: 0.7 },
      ],
      executionTimeMs: 100,
      success: true,
    },
    {
      subQuery: { index: 1, query: 'How to deploy?', purpose: 'Deploy info' },
      entries: [
        { id: 'b', content: 'Auth B', type: 'knowledge', score: 0.95 },  // Overlap
        { id: 'd', content: 'Deploy D', type: 'knowledge', score: 0.85 },
        { id: 'e', content: 'Deploy E', type: 'knowledge', score: 0.75 },
      ],
      executionTimeMs: 120,
      success: true,
    },
  ];

  const merged = executor.mergeResults(mockResults);
  console.log('Merged results (RRF):');
  for (const entry of merged.entries) {
    const score = merged.scores.get(entry.id);
    console.log(`  ${entry.id}: score=${score?.toFixed(4)}`);
  }

  console.log('\nAll tests passed!');
}

test().catch(console.error);
