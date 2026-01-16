import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../src/db/schema/index.js';
import { applyMigrations } from './fixtures/migration-loader.js';
import { createRepositories } from '../src/core/factory/repositories.js';
import { executeQueryPipelineAsync, createDependencies } from '../src/services/query/index.js';
import { LRUCache } from '../src/utils/lru-cache.js';
import pino from 'pino';

const logger = pino({ level: 'debug' });

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

  // Create pipeline dependencies
  const queryCache = new LRUCache<unknown>(100, 10 * 1024 * 1024);
  const pipelineDeps = createDependencies({
    getDb: () => db,
    getSqlite: () => sqlite,
    getPreparedStatement: (sql: string) => sqlite.prepare(sql),
    cache: queryCache as any,
    perfLog: true,
    logger,
  });

  // Test fuzzy query
  console.log('\n=== Testing fuzzy query for "postgres" ===');
  const result = await executeQueryPipelineAsync(
    {
      action: 'search',
      search: 'postgres',
      scope: { type: 'project', id: 'proj-test', inherit: true },
      fuzzy: true,
    },
    pipelineDeps
  );

  console.log('\nResults:', result.results.length);
  result.results.forEach((r) => {
    console.log('-', r.type, r.id, (r as any).knowledge?.title);
  });

  sqlite.close();
}

test().catch(console.error);
