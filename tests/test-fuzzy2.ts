import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../src/db/schema/index.js';
import { applyMigrations } from './fixtures/migration-loader.js';
import { createRepositories } from '../src/core/factory/repositories.js';
import { fuzzyTextMatches } from '../src/utils/text-matching.js';

async function test() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema }) as any;
  applyMigrations(sqlite);

  const repos = createRepositories({ db, sqlite });

  // Create project
  db.insert(schema.projects)
    .values({
      id: 'proj-test',
      name: 'Test Project',
      rootPath: '/test',
    })
    .run();

  // Create knowledge entry
  const k = await repos.knowledge.create({
    scopeType: 'project',
    scopeId: 'proj-test',
    title: 'Database Selection Decision',
    content: 'We chose PostgreSQL for the primary database',
    category: 'decision',
    confidence: 0.95,
    createdBy: 'test',
  });
  console.log('Created knowledge entry:', k.id);
  console.log('Entry title:', k.title);
  console.log('Entry content:', k.content);

  // Test fuzzy match directly
  const searchableText = k.title + ' ' + k.content;
  console.log('\nDirect fuzzy test:');
  console.log('Searchable text:', searchableText);
  console.log('Search term: "postgres"');
  console.log('Fuzzy matches:', fuzzyTextMatches(searchableText, 'postgres'));

  // Manually fetch knowledge entries
  console.log('\n=== Manual fetch ===');
  const rows = sqlite
    .prepare(
      `
    SELECT id, title, content FROM knowledge 
    WHERE scope_type = 'project' AND scope_id = 'proj-test' AND is_active = 1
  `
    )
    .all();
  console.log('Found rows:', rows.length);
  rows.forEach((r: any) => {
    console.log('-', r.id, r.title);
    const text = r.title + ' ' + r.content;
    console.log('  Fuzzy match for "postgres":', fuzzyTextMatches(text, 'postgres'));
  });

  sqlite.close();
}

test().catch(console.error);
