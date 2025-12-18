/**
 * Graph Traversal Tests
 *
 * Tests for multi-hop relation traversal functionality.
 *
 * Test Graph Structure:
 *   A → B → C → D
 *   A → E
 *   B → F
 *   G → A (creates cycle: G → A → B → ... potentially back to G if linked)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../../src/db/schema.js';
import { v4 as uuid } from 'uuid';

const TEST_DB_PATH = './data/test/graph-traversal.db';

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle>;

// Mock the connection module before importing query service
vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

// Import after mocking
import {
  traverseRelationGraph,
  executeMemoryQuery,
  clearQueryCache,
} from '../../src/services/query.service.js';

describe('Graph Traversal', () => {
  // Entry IDs for the test graph
  const entryIds = {
    A: uuid(),
    B: uuid(),
    C: uuid(),
    D: uuid(),
    E: uuid(),
    F: uuid(),
    G: uuid(),
  };

  beforeAll(() => {
    // Ensure data directory exists
    if (!existsSync('./data/test')) {
      mkdirSync('./data/test', { recursive: true });
    }

    // Clean up any existing test database
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${TEST_DB_PATH}${suffix}`;
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }

    // Create test database
    sqlite = new Database(TEST_DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    db = drizzle(sqlite, { schema });

    // Run all migrations
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

    // Create knowledge entries for each node
    const now = new Date().toISOString();
    for (const [name, id] of Object.entries(entryIds)) {
      db.insert(schema.knowledge)
        .values({
          id,
          title: `Entry ${name}`,
          category: 'fact',
          scopeType: 'global',
          scopeId: null,
          isActive: true,
          createdAt: now,
        })
        .run();

      // Create a version for each entry
      db.insert(schema.knowledgeVersions)
        .values({
          id: uuid(),
          knowledgeId: id,
          versionNum: 1,
          content: `Content for ${name}`,
          createdAt: now,
        })
        .run();
    }

    // Create the graph structure:
    // A → B, A → E
    // B → C, B → F
    // C → D
    // G → A
    const relations = [
      { source: 'A', target: 'B' },
      { source: 'A', target: 'E' },
      { source: 'B', target: 'C' },
      { source: 'B', target: 'F' },
      { source: 'C', target: 'D' },
      { source: 'G', target: 'A' },
    ];

    for (const rel of relations) {
      db.insert(schema.entryRelations)
        .values({
          id: uuid(),
          sourceType: 'knowledge',
          sourceId: entryIds[rel.source as keyof typeof entryIds],
          targetType: 'knowledge',
          targetId: entryIds[rel.target as keyof typeof entryIds],
          relationType: 'related_to',
          createdAt: now,
        })
        .run();
    }
  });

  afterAll(() => {
    sqlite.close();
    // Clean up test database files
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${TEST_DB_PATH}${suffix}`;
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }
  });

  beforeEach(() => {
    clearQueryCache();
  });

  describe('traverseRelationGraph', () => {
    it('should find direct relations with depth=1 (default)', () => {
      const result = traverseRelationGraph('knowledge', entryIds.A, {
        depth: 1,
        direction: 'both',
      });

      // A → B, A → E, and G → A (backward)
      expect(result.knowledge.size).toBe(3);
      expect(result.knowledge.has(entryIds.B)).toBe(true);
      expect(result.knowledge.has(entryIds.E)).toBe(true);
      expect(result.knowledge.has(entryIds.G)).toBe(true);

      // Should not find C, D, F (too deep)
      expect(result.knowledge.has(entryIds.C)).toBe(false);
      expect(result.knowledge.has(entryIds.D)).toBe(false);
      expect(result.knowledge.has(entryIds.F)).toBe(false);
    });

    it('should find 2-hop relations with depth=2', () => {
      const result = traverseRelationGraph('knowledge', entryIds.A, {
        depth: 2,
        direction: 'forward',
      });

      // Forward only: A → B, A → E (depth 1), B → C, B → F (depth 2)
      expect(result.knowledge.has(entryIds.B)).toBe(true);
      expect(result.knowledge.has(entryIds.E)).toBe(true);
      expect(result.knowledge.has(entryIds.C)).toBe(true);
      expect(result.knowledge.has(entryIds.F)).toBe(true);

      // Should not find D (depth 3) or G (backward only)
      expect(result.knowledge.has(entryIds.D)).toBe(false);
      expect(result.knowledge.has(entryIds.G)).toBe(false);
    });

    it('should find 3-hop relations with depth=3', () => {
      const result = traverseRelationGraph('knowledge', entryIds.A, {
        depth: 3,
        direction: 'forward',
      });

      // Forward: A → B, A → E, B → C, B → F, C → D
      expect(result.knowledge.has(entryIds.B)).toBe(true);
      expect(result.knowledge.has(entryIds.E)).toBe(true);
      expect(result.knowledge.has(entryIds.C)).toBe(true);
      expect(result.knowledge.has(entryIds.F)).toBe(true);
      expect(result.knowledge.has(entryIds.D)).toBe(true);
    });

    it('should clamp depth to max 5', () => {
      // Even with depth=100, it should be clamped to 5
      const result = traverseRelationGraph('knowledge', entryIds.A, {
        depth: 100,
        direction: 'forward',
      });

      // Should still work and find all reachable nodes
      expect(result.knowledge.size).toBeGreaterThan(0);
    });

    it('should respect direction=forward (only outgoing edges)', () => {
      const result = traverseRelationGraph('knowledge', entryIds.A, {
        depth: 1,
        direction: 'forward',
      });

      // Forward from A: B, E
      expect(result.knowledge.has(entryIds.B)).toBe(true);
      expect(result.knowledge.has(entryIds.E)).toBe(true);

      // G → A is backward, should not be included
      expect(result.knowledge.has(entryIds.G)).toBe(false);
    });

    it('should respect direction=backward (only incoming edges)', () => {
      const result = traverseRelationGraph('knowledge', entryIds.A, {
        depth: 1,
        direction: 'backward',
      });

      // Backward to A: only G → A
      expect(result.knowledge.has(entryIds.G)).toBe(true);

      // A → B, A → E are forward, should not be included
      expect(result.knowledge.has(entryIds.B)).toBe(false);
      expect(result.knowledge.has(entryIds.E)).toBe(false);
    });

    it('should detect and handle cycles (G → A → B → ...)', () => {
      // Start from G, traverse forward
      const result = traverseRelationGraph('knowledge', entryIds.G, {
        depth: 5,
        direction: 'forward',
      });

      // G → A → B → C → D and A → E, B → F
      // Should find all without infinite loop
      expect(result.knowledge.has(entryIds.A)).toBe(true);
      expect(result.knowledge.has(entryIds.B)).toBe(true);
      expect(result.knowledge.has(entryIds.E)).toBe(true);
      expect(result.knowledge.has(entryIds.C)).toBe(true);
      expect(result.knowledge.has(entryIds.F)).toBe(true);
      expect(result.knowledge.has(entryIds.D)).toBe(true);

      // Should not include G itself (start node excluded)
      expect(result.knowledge.has(entryIds.G)).toBe(false);
    });

    it('should handle cycles in both directions', () => {
      // Create a cycle test: start from B, go both ways
      const result = traverseRelationGraph('knowledge', entryIds.B, {
        depth: 5,
        direction: 'both',
      });

      // Should find connected nodes without infinite loop
      expect(result.knowledge.size).toBeGreaterThan(0);
      // B should not be in results (it's the start node)
      expect(result.knowledge.has(entryIds.B)).toBe(false);
    });

    it('should respect maxResults limit', () => {
      const result = traverseRelationGraph('knowledge', entryIds.A, {
        depth: 5,
        direction: 'both',
        maxResults: 2,
      });

      // Should only return 2 results max
      expect(result.knowledge.size).toBe(2);
    });

    it('should use default values when options not specified', () => {
      const result = traverseRelationGraph('knowledge', entryIds.A, {});

      // Default: depth=1, direction='both', maxResults=100
      // A → B, A → E (forward), G → A (backward)
      expect(result.knowledge.size).toBe(3);
    });

    it('should return empty sets for non-existent entry', () => {
      const result = traverseRelationGraph('knowledge', 'non-existent-id', {
        depth: 2,
      });

      expect(result.knowledge.size).toBe(0);
      expect(result.tool.size).toBe(0);
      expect(result.guideline.size).toBe(0);
    });

    it('should filter by relation type', () => {
      // Add a different relation type
      const now = new Date().toISOString();
      db.insert(schema.entryRelations)
        .values({
          id: uuid(),
          sourceType: 'knowledge',
          sourceId: entryIds.A,
          targetType: 'knowledge',
          targetId: entryIds.F,
          relationType: 'depends_on',
          createdAt: now,
        })
        .run();

      // Query only 'depends_on' relations
      const result = traverseRelationGraph('knowledge', entryIds.A, {
        depth: 1,
        direction: 'forward',
        relationType: 'depends_on',
      });

      // Should only find F (the depends_on relation)
      expect(result.knowledge.size).toBe(1);
      expect(result.knowledge.has(entryIds.F)).toBe(true);
    });
  });

  describe('executeMemoryQuery with relatedTo depth', () => {
    it('should use graph traversal for relatedTo queries', () => {
      const result = executeMemoryQuery({
        types: ['knowledge'],
        relatedTo: {
          type: 'knowledge',
          id: entryIds.A,
          depth: 2,
          direction: 'forward',
        },
      });

      // Should find B, E (depth 1) and C, F (depth 2)
      const ids = result.results.map((r) => r.id);
      expect(ids).toContain(entryIds.B);
      expect(ids).toContain(entryIds.E);
      expect(ids).toContain(entryIds.C);
      expect(ids).toContain(entryIds.F);
    });

    it('should respect backward compatibility (no depth = depth 1)', () => {
      const result = executeMemoryQuery({
        types: ['knowledge'],
        relatedTo: {
          type: 'knowledge',
          id: entryIds.A,
          // No depth specified - should default to 1
        },
      });

      // Should find direct relations only
      const ids = result.results.map((r) => r.id);
      expect(ids).toContain(entryIds.B);
      expect(ids).toContain(entryIds.E);
      expect(ids).toContain(entryIds.G);

      // Should not find deeper relations
      expect(ids).not.toContain(entryIds.D);
    });
  });

  describe('executeMemoryQuery with followRelations', () => {
    it('should expand results to include related entries', () => {
      // First, create a knowledge entry that matches a search
      const searchableId = uuid();
      const now = new Date().toISOString();
      db.insert(schema.knowledge)
        .values({
          id: searchableId,
          title: 'Searchable Entry XYZ123',
          category: 'fact',
          scopeType: 'global',
          scopeId: null,
          isActive: true,
          createdAt: now,
        })
        .run();

      db.insert(schema.knowledgeVersions)
        .values({
          id: uuid(),
          knowledgeId: searchableId,
          versionNum: 1,
          content: 'This is searchable content',
          createdAt: now,
        })
        .run();

      // Create a relation from searchable to entry B
      db.insert(schema.entryRelations)
        .values({
          id: uuid(),
          sourceType: 'knowledge',
          sourceId: searchableId,
          targetType: 'knowledge',
          targetId: entryIds.B,
          relationType: 'related_to',
          createdAt: now,
        })
        .run();

      // Search with followRelations
      const result = executeMemoryQuery({
        types: ['knowledge'],
        search: 'XYZ123',
        followRelations: true,
      });

      // Should find the searchable entry and its related entry B
      const ids = result.results.map((r) => r.id);
      expect(ids).toContain(searchableId);
      expect(ids).toContain(entryIds.B);
    });

    it('should not duplicate entries that match AND are related', () => {
      const result = executeMemoryQuery({
        types: ['knowledge'],
        search: 'Entry',
        followRelations: true,
        limit: 100,
      });

      // Check for no duplicate IDs
      const ids = result.results.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('should assign lower score to related entries', () => {
      const searchableId = uuid();
      const now = new Date().toISOString();
      db.insert(schema.knowledge)
        .values({
          id: searchableId,
          title: 'UniqueSearchTerm987',
          category: 'fact',
          scopeType: 'global',
          scopeId: null,
          isActive: true,
          createdAt: now,
        })
        .run();

      db.insert(schema.knowledgeVersions)
        .values({
          id: uuid(),
          knowledgeId: searchableId,
          versionNum: 1,
          content: 'Content',
          createdAt: now,
        })
        .run();

      // Create relation
      db.insert(schema.entryRelations)
        .values({
          id: uuid(),
          sourceType: 'knowledge',
          sourceId: searchableId,
          targetType: 'knowledge',
          targetId: entryIds.C,
          relationType: 'related_to',
          createdAt: now,
        })
        .run();

      const result = executeMemoryQuery({
        types: ['knowledge'],
        search: 'UniqueSearchTerm987',
        followRelations: true,
      });

      // Find the scores
      const searchedEntry = result.results.find((r) => r.id === searchableId);
      const relatedEntry = result.results.find((r) => r.id === entryIds.C);

      expect(searchedEntry).toBeDefined();
      expect(relatedEntry).toBeDefined();

      // Related entry should have lower score (0.5 for expanded entries)
      expect(searchedEntry!.score).toBeGreaterThan(relatedEntry!.score);
    });
  });
});
