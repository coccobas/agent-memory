/**
 * Unit tests for embedding coverage service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  getEmbeddingCoverage,
  type ScopeChainElement,
  type EmbeddingEntryType,
  type CoverageResult,
} from '../../src/services/embedding-coverage.service.js';

/**
 * Create an in-memory SQLite database with required schema for testing
 */
function createTestDb(): Database.Database {
  const db = new Database(':memory:');

  // Create minimal schema for coverage testing
  db.exec(`
    -- Knowledge table
    CREATE TABLE knowledge (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- Guidelines table
    CREATE TABLE guidelines (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- Tools table
    CREATE TABLE tools (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- Experiences table
    CREATE TABLE experiences (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- Entry embeddings tracking table
    CREATE TABLE entry_embeddings (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      has_embedding INTEGER NOT NULL DEFAULT 0
    );
  `);

  return db;
}

describe('getEmbeddingCoverage', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('empty database', () => {
    it('should return zero coverage for empty database', async () => {
      const result = await getEmbeddingCoverage(
        db,
        [{ type: 'project', id: 'proj-123' }],
        ['knowledge']
      );

      expect(result.total).toBe(0);
      expect(result.withEmbeddings).toBe(0);
      expect(result.ratio).toBe(0);
    });

    it('should return ratio of 0 when no entries exist', async () => {
      const result = await getEmbeddingCoverage(
        db,
        [{ type: 'global', id: null }],
        ['knowledge', 'guideline', 'tool']
      );

      expect(result.ratio).toBe(0);
    });
  });

  describe('knowledge entries', () => {
    it('should count knowledge entries with embeddings', async () => {
      // Insert knowledge entries
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k1', 'project', 'proj-123', 1);
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k2', 'project', 'proj-123', 1);
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k3', 'project', 'proj-123', 1);

      // Only k1 and k2 have embeddings
      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e1', 'k1', 'knowledge', 1);
      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e2', 'k2', 'knowledge', 1);

      const result = await getEmbeddingCoverage(
        db,
        [{ type: 'project', id: 'proj-123' }],
        ['knowledge']
      );

      expect(result.total).toBe(3);
      expect(result.withEmbeddings).toBe(2);
      expect(result.ratio).toBeCloseTo(0.667, 2);
    });

    it('should only count active entries', async () => {
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k1', 'project', 'proj-123', 1);
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k2', 'project', 'proj-123', 0); // Inactive

      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e1', 'k1', 'knowledge', 1);
      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e2', 'k2', 'knowledge', 1);

      const result = await getEmbeddingCoverage(
        db,
        [{ type: 'project', id: 'proj-123' }],
        ['knowledge']
      );

      expect(result.total).toBe(1);
      expect(result.withEmbeddings).toBe(1);
      expect(result.ratio).toBe(1.0);
    });
  });

  describe('scope filtering', () => {
    // Note: The service filters by scope_type (e.g., 'project', 'org', 'global'),
    // not by specific scope_ids. All entries with matching scope_type are included.

    it('should filter by scope type - project', async () => {
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k1', 'project', 'proj-123', 1);
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k2', 'project', 'proj-456', 1);
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k3', 'org', 'org-1', 1); // Different scope type

      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e1', 'k1', 'knowledge', 1);

      const result = await getEmbeddingCoverage(
        db,
        [{ type: 'project', id: 'proj-123' }],
        ['knowledge']
      );

      // All project-scoped entries are included (k1 and k2), not just proj-123
      expect(result.total).toBe(2);
      expect(result.withEmbeddings).toBe(1);
    });

    it('should include multiple scope types from chain', async () => {
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k1', 'global', null, 1);
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k2', 'project', 'proj-123', 1);
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k3', 'org', 'org-1', 1); // Different scope type

      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e1', 'k1', 'knowledge', 1);

      const result = await getEmbeddingCoverage(
        db,
        [{ type: 'global', id: null }, { type: 'project', id: 'proj-123' }],
        ['knowledge']
      );

      // global + project entries, not org
      expect(result.total).toBe(2);
      expect(result.withEmbeddings).toBe(1);
    });

    it('should handle scope chain with org and project types', async () => {
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k1', 'org', 'org-1', 1);
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k2', 'project', 'proj-1', 1);
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k3', 'project', 'proj-2', 1); // Also included (same scope type)
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k4', 'global', null, 1); // Not in chain

      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e1', 'k1', 'knowledge', 1);
      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e2', 'k2', 'knowledge', 1);
      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e3', 'k3', 'knowledge', 1);

      const result = await getEmbeddingCoverage(
        db,
        [
          { type: 'org', id: 'org-1' },
          { type: 'project', id: 'proj-1' },
        ],
        ['knowledge']
      );

      // org + project entries (k1, k2, k3), not global (k4)
      expect(result.total).toBe(3);
      expect(result.withEmbeddings).toBe(3);
      expect(result.ratio).toBe(1.0);
    });
  });

  describe('multiple entry types', () => {
    it('should aggregate across multiple entry types', async () => {
      // Insert knowledge
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k1', 'project', 'proj-123', 1);
      // Insert guideline
      db.prepare('INSERT INTO guidelines (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('g1', 'project', 'proj-123', 1);
      // Insert tool
      db.prepare('INSERT INTO tools (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('t1', 'project', 'proj-123', 1);

      // Only k1 has embedding
      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e1', 'k1', 'knowledge', 1);

      const result = await getEmbeddingCoverage(
        db,
        [{ type: 'project', id: 'proj-123' }],
        ['knowledge', 'guideline', 'tool']
      );

      expect(result.total).toBe(3);
      expect(result.withEmbeddings).toBe(1);
      expect(result.ratio).toBeCloseTo(0.333, 2);
    });

    it('should handle single type correctly', async () => {
      db.prepare('INSERT INTO guidelines (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('g1', 'project', 'proj-123', 1);
      db.prepare('INSERT INTO guidelines (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('g2', 'project', 'proj-123', 1);

      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e1', 'g1', 'guideline', 1);
      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e2', 'g2', 'guideline', 1);

      const result = await getEmbeddingCoverage(
        db,
        [{ type: 'project', id: 'proj-123' }],
        ['guideline']
      );

      expect(result.total).toBe(2);
      expect(result.withEmbeddings).toBe(2);
      expect(result.ratio).toBe(1.0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty scope chain', async () => {
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k1', 'global', null, 1);

      const result = await getEmbeddingCoverage(
        db,
        [],
        ['knowledge']
      );

      // With empty scope chain, should match nothing or handle gracefully
      expect(result).toBeDefined();
      expect(result.ratio).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty types array', async () => {
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k1', 'project', 'proj-123', 1);

      const result = await getEmbeddingCoverage(
        db,
        [{ type: 'project', id: 'proj-123' }],
        []
      );

      expect(result.total).toBe(0);
      expect(result.withEmbeddings).toBe(0);
      expect(result.ratio).toBe(0);
    });

    it('should handle has_embedding = 0 correctly', async () => {
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k1', 'project', 'proj-123', 1);

      // Entry exists in tracking table but has_embedding = 0
      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e1', 'k1', 'knowledge', 0);

      const result = await getEmbeddingCoverage(
        db,
        [{ type: 'project', id: 'proj-123' }],
        ['knowledge']
      );

      expect(result.total).toBe(1);
      expect(result.withEmbeddings).toBe(0);
      expect(result.ratio).toBe(0);
    });

    it('should return 100% coverage when all entries have embeddings', async () => {
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k1', 'project', 'proj-123', 1);
      db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)').run('k2', 'project', 'proj-123', 1);

      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e1', 'k1', 'knowledge', 1);
      db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)').run('e2', 'k2', 'knowledge', 1);

      const result = await getEmbeddingCoverage(
        db,
        [{ type: 'project', id: 'proj-123' }],
        ['knowledge']
      );

      expect(result.ratio).toBe(1.0);
    });
  });

  describe('performance', () => {
    it('should complete quickly for reasonable data sizes', async () => {
      // Insert 100 entries
      const insert = db.prepare('INSERT INTO knowledge (id, scope_type, scope_id, is_active) VALUES (?, ?, ?, ?)');
      const insertEmb = db.prepare('INSERT INTO entry_embeddings (id, entry_id, entry_type, has_embedding) VALUES (?, ?, ?, ?)');

      for (let i = 0; i < 100; i++) {
        insert.run(`k${i}`, 'project', 'proj-123', 1);
        if (i < 80) { // 80% have embeddings
          insertEmb.run(`e${i}`, `k${i}`, 'knowledge', 1);
        }
      }

      const start = performance.now();
      const result = await getEmbeddingCoverage(
        db,
        [{ type: 'project', id: 'proj-123' }],
        ['knowledge']
      );
      const elapsed = performance.now() - start;

      expect(result.total).toBe(100);
      expect(result.withEmbeddings).toBe(80);
      expect(result.ratio).toBe(0.8);
      expect(elapsed).toBeLessThan(100); // Should complete in < 100ms
    });
  });
});
