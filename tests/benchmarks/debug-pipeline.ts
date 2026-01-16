#!/usr/bin/env npx tsx
/**
 * Debug script for pipeline query issues
 */
import 'dotenv/config';
process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

const { setupTestDb, registerTestContext, cleanupTestDb } =
  await import('../fixtures/test-helpers.js');
const { knowledgeHandlers } = await import('../../src/mcp/handlers/knowledge.handler.js');
const { executeQueryPipelineAsync, executeQueryPipelineSync } =
  await import('../../src/services/query/index.js');

const DB_PATH = './data/benchmark/debug-test.db';

async function main() {
  console.log('Setting up test database...');
  const testDb = setupTestDb(DB_PATH);
  const context = registerTestContext(testDb);

  // Check FTS tables
  console.log('\nChecking FTS tables...');
  const tables = testDb.sqlite
    .prepare(
      `
    SELECT name FROM sqlite_master
    WHERE type='table' AND name LIKE '%fts%'
  `
    )
    .all();
  console.log(
    'FTS tables:',
    tables.map((t: { name: string }) => t.name)
  );

  console.log('Creating project...');
  const project = await context.repos.projects.create({
    name: 'Debug Test Project',
    rootPath: '/test',
  });
  console.log('Project created:', project.id);

  console.log('Adding knowledge entry via handler...');
  const result = await knowledgeHandlers.add(context, {
    action: 'add',
    agentId: 'debug-test',
    scopeType: 'project',
    scopeId: project.id,
    title: 'Test Entry',
    content: 'Caroline went to the LGBTQ support group on Tuesday',
    category: 'context',
  });
  console.log('Knowledge added:', result.knowledge?.id);

  // Check FTS content
  console.log('\nChecking knowledge_fts content...');
  try {
    const ftsContent = testDb.sqlite
      .prepare(
        `
      SELECT * FROM knowledge_fts LIMIT 5
    `
      )
      .all();
    console.log('FTS entries:', ftsContent.length);
    if (ftsContent.length > 0) {
      console.log('First FTS entry:', JSON.stringify(ftsContent[0]));
    }
  } catch (e) {
    console.log('Error checking FTS:', (e as Error).message);
  }

  // Check knowledge versions table (snake_case in DB)
  console.log('\nChecking knowledge versions...');
  const versions = testDb.sqlite
    .prepare(
      `
    SELECT id, knowledge_id, content FROM knowledge_versions LIMIT 5
  `
    )
    .all();
  console.log('Knowledge versions:', versions.length);
  if (versions.length > 0) {
    console.log('First version:', JSON.stringify(versions[0]));
  }

  // Check triggers
  console.log('\nChecking triggers...');
  const triggers = testDb.sqlite
    .prepare(
      `
    SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'knowledge%'
  `
    )
    .all();
  console.log(
    'Knowledge triggers:',
    triggers.map((t: { name: string }) => t.name)
  );

  // Check knowledge table state
  console.log('\nChecking knowledge table...');
  const knowledge = testDb.sqlite
    .prepare(
      `
    SELECT id, title, current_version_id FROM knowledge LIMIT 5
  `
    )
    .all() as Array<{ id: string; title: string; current_version_id: string }>;
  console.log('Knowledge entries:', knowledge.length);
  if (knowledge.length > 0) {
    console.log('First knowledge:', JSON.stringify(knowledge[0]));
  }

  // Manually rebuild FTS entry to test
  console.log('\nManually rebuilding FTS for first entry...');
  const entry = knowledge[0];
  if (entry) {
    testDb.sqlite
      .prepare(
        `
      DELETE FROM knowledge_fts WHERE knowledge_id = ?
    `
      )
      .run(entry.id);

    testDb.sqlite
      .prepare(
        `
      INSERT INTO knowledge_fts(knowledge_id, title, content, source)
      SELECT k.id, k.title, COALESCE(kv.content, ''), COALESCE(kv.source, '')
      FROM knowledge k
      LEFT JOIN knowledge_versions kv ON k.current_version_id = kv.id
      WHERE k.id = ?
    `
      )
      .run(entry.id);

    // Check FTS again
    const ftsAfterRebuild = testDb.sqlite
      .prepare(
        `
      SELECT * FROM knowledge_fts WHERE knowledge_id = ?
    `
      )
      .get(entry.id);
    console.log('FTS after rebuild:', JSON.stringify(ftsAfterRebuild));
  }

  // Check what FTS query the pipeline would use
  console.log('\nTesting FTS via pipeline deps...');
  try {
    const ftsResults = context.queryDeps.executeFts5Search('Caroline', ['knowledge']);
    console.log('Pipeline FTS results:', ftsResults);
  } catch (e) {
    console.log('Pipeline FTS error:', (e as Error).message);
  }

  // Check scope resolution
  console.log('\nTesting scope resolution...');
  try {
    const scopeChain = context.queryDeps.resolveScopeChain({
      type: 'project',
      id: project.id,
      inherit: true,
    });
    console.log('Scope chain:', JSON.stringify(scopeChain));
  } catch (e) {
    console.log('Scope resolution error:', (e as Error).message);
  }

  // Check if entry matches scope
  console.log('\nChecking entry scope...');
  const entryScope = testDb.sqlite
    .prepare(
      `
    SELECT id, scope_type, scope_id FROM knowledge WHERE id = ?
  `
    )
    .get(entry?.id);
  console.log('Entry scope:', JSON.stringify(entryScope));

  // Try listing all knowledge with project scope (no search term)
  console.log('\nListing all knowledge (NO SEARCH, PROJECT SCOPE)...');
  const listResult = executeQueryPipelineSync(
    {
      scope: { type: 'project', id: project.id, inherit: true },
      types: ['knowledge'],
      limit: 10,
    },
    context.queryDeps
  );
  console.log('List all results:', listResult.results.length);
  if (listResult.results.length > 0) {
    console.log('Found entry:', listResult.results[0]?.id);
  }

  // Try sync pipeline first - WITHOUT scope (global search)
  console.log('\nQuerying via SYNC pipeline (NO SCOPE)...');
  const noScopeResult = executeQueryPipelineSync(
    {
      search: 'Caroline',
      types: ['knowledge'],
      limit: 10,
    },
    context.queryDeps
  );
  console.log('No-scope query results:', noScopeResult.results.length);

  // Try sync pipeline with scope
  console.log('\nQuerying via SYNC pipeline (WITH SCOPE)...');
  const syncResult = executeQueryPipelineSync(
    {
      search: 'Caroline',
      scope: { type: 'project', id: project.id, inherit: true },
      types: ['knowledge'],
      limit: 10,
    },
    context.queryDeps
  );
  console.log('Sync query results:', syncResult.results.length);
  if (syncResult.results.length > 0) {
    console.log('Sync first result:', JSON.stringify(syncResult.results[0], null, 2));
  }

  console.log('\nQuerying via ASYNC pipeline...');
  const queryResult = await executeQueryPipelineAsync(
    {
      search: 'Caroline', // Use simple query
      scope: { type: 'project', id: project.id, inherit: true },
      types: ['knowledge'],
      limit: 10,
    },
    context.queryDeps
  );

  console.log('Async query results:', queryResult.results.length);

  // Try a simpler query
  console.log('\nTrying simpler query "Caroline"...');
  const simpleResult = await executeQueryPipelineAsync(
    {
      search: 'Caroline',
      scope: { type: 'project', id: project.id, inherit: true },
      types: ['knowledge'],
      limit: 10,
    },
    context.queryDeps
  );
  console.log('Simple query results:', simpleResult.results.length);

  // Test FTS5 directly
  console.log('\nTesting FTS5 directly...');
  try {
    const ftsQuery = testDb.sqlite
      .prepare(
        `
      SELECT rowid, * FROM knowledge_fts WHERE knowledge_fts MATCH 'Caroline'
    `
      )
      .all();
    console.log('Direct FTS5 results:', ftsQuery.length);
  } catch (e) {
    console.log('Direct FTS5 error:', (e as Error).message);
  }

  console.log('\nCleaning up...');
  cleanupTestDb(DB_PATH);
  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err);
  cleanupTestDb(DB_PATH);
  process.exit(1);
});
