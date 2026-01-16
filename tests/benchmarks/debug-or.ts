import 'dotenv/config';
process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

import { escapeFts5QueryOr } from '../../src/services/fts.service.js';
import { setupTestDb, registerTestContext, cleanupTestDb } from '../fixtures/test-helpers.js';
import { knowledgeHandlers } from '../../src/mcp/handlers/knowledge.handler.js';

const DB_PATH = './data/benchmark/debug-or.db';
const testDb = setupTestDb(DB_PATH);
const context = registerTestContext(testDb);

// Create project
const project = await context.repos.projects.create({
  name: 'Debug OR',
  rootPath: '/test',
});

// Add a knowledge entry
await knowledgeHandlers.add(context, {
  action: 'add',
  agentId: 'test',
  scopeType: 'project',
  scopeId: project.id,
  title: 'LGBTQ Support',
  content: 'The LGBTQ support group meets every Wednesday at 7pm in room 201',
  category: 'context',
});

// Test OR query transformation
const testQueries = [
  'When did Caroline go to the LGBTQ support group?',
  'LGBTQ support group',
  'Wednesday meeting',
];

console.log('\n=== OR Query Transformation ===');
for (const q of testQueries) {
  const orQuery = escapeFts5QueryOr(q);
  console.log(`"${q}"`);
  console.log(`  -> "${orQuery}"`);
}

// Test FTS5 with OR query
console.log('\n=== FTS5 Queries ===');
const sqlite = context.sqlite!;

for (const q of testQueries) {
  const orQuery = escapeFts5QueryOr(q);
  if (!orQuery) {
    console.log(`"${q}" -> empty after OR transform`);
    continue;
  }

  try {
    const results = sqlite
      .prepare(
        `
      SELECT knowledge_id, title, content
      FROM knowledge_fts
      WHERE knowledge_fts MATCH ?
    `
      )
      .all(orQuery);
    console.log(`"${q}" -> ${results.length} result(s)`);
    if (results.length > 0) {
      console.log(`  Match: ${(results[0] as { title: string }).title}`);
    }
  } catch (err) {
    console.log(`"${q}" -> ERROR: ${err}`);
  }
}

cleanupTestDb(DB_PATH);
console.log('\nDone!');
