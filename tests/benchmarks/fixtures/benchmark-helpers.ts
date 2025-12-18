/**
 * Benchmark helpers for Agent Memory performance testing
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../../../src/db/schema.js';
import { generateId } from '../../../src/db/repositories/base.js';

const BENCH_DB_PATH = './data/benchmark/benchmark-memory.db';

export interface BenchDb {
  sqlite: Database.Database;
  db: ReturnType<typeof drizzle>;
  path: string;
}

/**
 * Setup a benchmark database with optional data seeding
 */
export function setupBenchmarkDb(entryCount: number = 1000): BenchDb {
  // Ensure data directory exists
  if (!existsSync('./data/benchmark')) {
    mkdirSync('./data/benchmark', { recursive: true });
  }

  // Clean up existing
  cleanupBenchmarkDb();

  // Create database
  const sqlite = new Database(BENCH_DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });

  // Run migrations
  const migrations = [
    '0000_lying_the_hand.sql',
    '0001_add_file_locks.sql',
    '0002_add_embeddings_tracking.sql',
    '0003_add_fts5_tables.sql',
    '0004_add_permissions.sql',
    '0005_add_task_decomposition.sql',
    '0006_add_audit_log.sql',
    '0007_add_execution_tracking.sql',
    '0008_add_agent_votes.sql',
    '0009_add_conversation_history.sql',
    '0010_add_verification_rules.sql',
  ];

  for (const migrationFile of migrations) {
    const migrationPath = join(process.cwd(), 'src/db/migrations', migrationFile);
    if (existsSync(migrationPath)) {
      const migrationSql = readFileSync(migrationPath, 'utf-8');
      const statements = migrationSql.split('--> statement-breakpoint');
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed) {
          sqlite.exec(trimmed);
        }
      }
    }
  }

  // Seed with benchmark data
  seedBenchmarkData(db, sqlite, entryCount);

  return { sqlite, db, path: BENCH_DB_PATH };
}

/**
 * Clean up benchmark database files
 */
export function cleanupBenchmarkDb(): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const path = `${BENCH_DB_PATH}${suffix}`;
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch {
        // Ignore errors
      }
    }
  }
}

/**
 * Seed database with realistic test data
 */
function seedBenchmarkData(
  db: ReturnType<typeof drizzle>,
  sqlite: Database.Database,
  count: number
): void {
  const categories = ['security', 'code_style', 'testing', 'documentation', 'architecture'];
  const knowledgeCategories = ['decision', 'fact', 'context', 'reference'] as const;
  const toolCategories = ['cli', 'mcp', 'function', 'api'] as const;

  // Create organizations
  const orgIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = generateId();
    db.insert(schema.organizations)
      .values({
        id,
        name: `Benchmark Org ${i}`,
      })
      .run();
    orgIds.push(id);
  }

  // Create projects
  const projectIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = generateId();
    db.insert(schema.projects)
      .values({
        id,
        orgId: orgIds[i % orgIds.length],
        name: `Benchmark Project ${i}`,
        description: `Project for benchmarking performance testing ${i}`,
        rootPath: `/projects/benchmark-${i}`,
      })
      .run();
    projectIds.push(id);
  }

  // Prepare batch insert statements for performance
  const insertGuideline = sqlite.prepare(`
    INSERT INTO guidelines (id, scope_type, scope_id, name, category, priority, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `);

  const insertGuidelineVersion = sqlite.prepare(`
    INSERT INTO guideline_versions (id, guideline_id, version_num, content, change_reason, created_at)
    VALUES (?, ?, 1, ?, 'Initial version', datetime('now'))
  `);

  const insertKnowledge = sqlite.prepare(`
    INSERT INTO knowledge (id, scope_type, scope_id, title, category, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
  `);

  const insertKnowledgeVersion = sqlite.prepare(`
    INSERT INTO knowledge_versions (id, knowledge_id, version_num, content, change_reason, created_at)
    VALUES (?, ?, 1, ?, 'Initial version', datetime('now'))
  `);

  const insertTool = sqlite.prepare(`
    INSERT INTO tools (id, scope_type, scope_id, name, category, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
  `);

  const insertToolVersion = sqlite.prepare(`
    INSERT INTO tool_versions (id, tool_id, version_num, description, change_reason, created_at)
    VALUES (?, ?, 1, ?, 'Initial version', datetime('now'))
  `);

  // Use transactions for faster bulk inserts
  const insertAll = sqlite.transaction(() => {
    const guidelinesPerType = Math.floor(count / 3);

    // Create guidelines
    for (let i = 0; i < guidelinesPerType; i++) {
      const guidelineId = generateId();
      const versionId = generateId();
      const projectId = projectIds[i % projectIds.length];
      const isGlobal = i % 4 === 0;

      insertGuideline.run(
        guidelineId,
        isGlobal ? 'global' : 'project',
        isGlobal ? null : projectId,
        `benchmark_guideline_${i}`,
        categories[i % categories.length],
        Math.floor(Math.random() * 100)
      );

      insertGuidelineVersion.run(
        versionId,
        guidelineId,
        `Benchmark guideline content for testing performance. This is entry ${i} with sufficient text for realistic testing scenarios. Keywords: performance, testing, benchmark, optimization, memory.`
      );
    }

    // Create knowledge entries
    for (let i = 0; i < guidelinesPerType; i++) {
      const knowledgeId = generateId();
      const versionId = generateId();
      const projectId = projectIds[i % projectIds.length];
      const isGlobal = i % 4 === 0;

      insertKnowledge.run(
        knowledgeId,
        isGlobal ? 'global' : 'project',
        isGlobal ? null : projectId,
        `Benchmark Knowledge ${i}`,
        knowledgeCategories[i % knowledgeCategories.length]
      );

      insertKnowledgeVersion.run(
        versionId,
        knowledgeId,
        `Knowledge content for benchmark entry ${i}. Contains facts and context for performance testing. Keywords: database, query, search, index, cache.`
      );
    }

    // Create tools
    for (let i = 0; i < guidelinesPerType; i++) {
      const toolId = generateId();
      const versionId = generateId();
      const projectId = projectIds[i % projectIds.length];
      const isGlobal = i % 4 === 0;

      insertTool.run(
        toolId,
        isGlobal ? 'global' : 'project',
        isGlobal ? null : projectId,
        `benchmark_tool_${i}`,
        toolCategories[i % toolCategories.length]
      );

      insertToolVersion.run(
        versionId,
        toolId,
        `Benchmark tool ${i} for performance testing. Used to measure throughput and latency of various operations.`
      );
    }
  });

  insertAll();
}

/**
 * Create a single guideline for insert benchmarks
 */
export function createBenchmarkGuideline(
  db: ReturnType<typeof drizzle>,
  projectId: string,
  index: number
): { guidelineId: string; versionId: string } {
  const guidelineId = generateId();
  const versionId = generateId();

  db.insert(schema.guidelines)
    .values({
      id: guidelineId,
      scopeType: 'project',
      scopeId: projectId,
      name: `bench_guideline_${index}_${Date.now()}`,
      category: 'code_style',
      priority: 50,
      isActive: true,
    })
    .run();

  db.insert(schema.guidelineVersions)
    .values({
      id: versionId,
      guidelineId,
      versionNum: 1,
      content: `Benchmark content ${index}`,
      changeReason: 'Initial version',
    })
    .run();

  return { guidelineId, versionId };
}

/**
 * Create a single knowledge entry for insert benchmarks
 */
export function createBenchmarkKnowledge(
  db: ReturnType<typeof drizzle>,
  projectId: string,
  index: number
): { knowledgeId: string; versionId: string } {
  const knowledgeId = generateId();
  const versionId = generateId();

  db.insert(schema.knowledge)
    .values({
      id: knowledgeId,
      scopeType: 'project',
      scopeId: projectId,
      title: `Bench Knowledge ${index} ${Date.now()}`,
      category: 'fact',
      isActive: true,
    })
    .run();

  db.insert(schema.knowledgeVersions)
    .values({
      id: versionId,
      knowledgeId,
      versionNum: 1,
      content: `Benchmark knowledge content ${index}`,
      changeReason: 'Initial version',
    })
    .run();

  return { knowledgeId, versionId };
}

/**
 * Get a random project ID from the seeded data
 */
export function getRandomProjectId(db: ReturnType<typeof drizzle>): string | null {
  const projects = db.select({ id: schema.projects.id }).from(schema.projects).limit(1).all();
  return projects[0]?.id ?? null;
}

/**
 * Calculate percentile from an array of numbers
 */
export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

/**
 * Calculate statistics for benchmark results
 */
export function calculateStats(times: number[]): {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
} {
  if (times.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0 };
  }

  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: sum / sorted.length,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

// Re-export schema for use in benchmarks
export { schema };
