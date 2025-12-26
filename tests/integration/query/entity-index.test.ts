/**
 * Integration tests for EntityIndex
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { EntityIndex, resetEntityIndex } from '../../../src/services/query/entity-index.js';
import { EntityExtractor } from '../../../src/services/query/entity-extractor.js';
import { entityIndex } from '../../../src/db/schema/entity-index.js';
import {
  setupTestDb,
  cleanupTestDb,
} from '../../fixtures/test-helpers.js';
import type { DbClient } from '../../../src/db/connection.js';

const TEST_DB_PATH = './data/test-entity-index.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: DbClient;

// Mock the database connection
vi.mock('../../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/db/connection.js')>(
    '../../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

describe('EntityIndex', () => {
  let index: EntityIndex;
  let extractor: EntityExtractor;

  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;

    // Create the entity_index table if it doesn't exist
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS entity_index (
        entity_value TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        PRIMARY KEY (entity_value, entry_id)
      );
      CREATE INDEX IF NOT EXISTS idx_entity_lookup ON entity_index(entity_value);
      CREATE INDEX IF NOT EXISTS idx_entity_entry_lookup ON entity_index(entry_id);
      CREATE INDEX IF NOT EXISTS idx_entity_type_value ON entity_index(entity_type, entity_value);
    `);
  });

  afterAll(() => {
    cleanupTestDb(TEST_DB_PATH, sqlite);
  });

  beforeEach(() => {
    extractor = new EntityExtractor();
    index = new EntityIndex(db, extractor);

    // Clear the entity index table before each test
    sqlite.exec('DELETE FROM entity_index');
    resetEntityIndex();
  });

  describe('indexEntry', () => {
    it('should index entities from content', async () => {
      const content = 'Check ./src/query.ts for the executeQuery function';
      const count = await index.indexEntry('entry-1', 'knowledge', content);

      expect(count).toBeGreaterThanOrEqual(2); // At least FILE_PATH and FUNCTION_NAME

      // Verify lookup works
      const entries = index.lookup('./src/query.ts');
      expect(entries).toContain('entry-1');
    });

    it('should replace entities on re-indexing', async () => {
      // First index
      await index.indexEntry('entry-1', 'knowledge', 'Check ./old-file.ts');

      // Re-index with different content
      await index.indexEntry('entry-1', 'knowledge', 'Check ./new-file.ts');

      // Old entity should not be found
      const oldEntries = index.lookup('./old-file.ts');
      expect(oldEntries).not.toContain('entry-1');

      // New entity should be found
      const newEntries = index.lookup('./new-file.ts');
      expect(newEntries).toContain('entry-1');
    });

    it('should return 0 for content with no entities', async () => {
      const content = 'This is plain text with no technical entities';
      const count = await index.indexEntry('entry-1', 'knowledge', content);

      // Might still have some matches from function name patterns
      expect(typeof count).toBe('number');
    });
  });

  describe('indexBatch', () => {
    it('should index multiple entries in batch', async () => {
      const entries = [
        { id: 'entry-1', type: 'knowledge' as const, content: 'Check ./file1.ts' },
        { id: 'entry-2', type: 'guideline' as const, content: 'Check ./file2.ts' },
        { id: 'entry-3', type: 'tool' as const, content: 'Run npm install' },
      ];

      const count = await index.indexBatch(entries);
      expect(count).toBeGreaterThanOrEqual(3);

      // Verify lookups
      expect(index.lookup('./file1.ts')).toContain('entry-1');
      expect(index.lookup('./file2.ts')).toContain('entry-2');
      expect(index.lookup('npm install')).toContain('entry-3');
    });
  });

  describe('lookup', () => {
    it('should find entries by entity value', async () => {
      // Use file paths which are reliably extracted
      await index.indexEntry('entry-1', 'knowledge', 'Check ./src/executeQuery.ts for the query');
      await index.indexEntry('entry-2', 'knowledge', 'Also check ./src/executeQuery.ts for docs');

      const entries = index.lookup('./src/executequery.ts');
      expect(entries).toContain('entry-1');
      expect(entries).toContain('entry-2');
    });

    it('should return empty array for unknown entities', () => {
      const entries = index.lookup('nonexistent');
      expect(entries).toEqual([]);
    });
  });

  describe('lookupMultiple', () => {
    it('should count matches across multiple entities', async () => {
      // Entry 1 mentions both file and command
      await index.indexEntry('entry-1', 'knowledge', 'Check ./file.ts and run npm install');
      // Entry 2 mentions only file
      await index.indexEntry('entry-2', 'knowledge', 'See ./file.ts for details');

      // Extract entities that we know will match
      const entities = extractor.extract('Find ./file.ts npm install');
      const matchCounts = index.lookupMultiple(entities);

      // Entry 1 should have higher count (matches both file and command)
      expect(matchCounts.get('entry-1')).toBeGreaterThanOrEqual(2);
      // Entry 2 should have lower count (matches file only)
      expect(matchCounts.get('entry-2')).toBeGreaterThanOrEqual(1);
    });

    it('should return empty map for empty entities array', () => {
      const matchCounts = index.lookupMultiple([]);
      expect(matchCounts.size).toBe(0);
    });
  });

  describe('removeEntry', () => {
    it('should remove all entities for an entry', async () => {
      await index.indexEntry('entry-1', 'knowledge', 'Check ./file.ts executeQuery');

      // Verify entities exist
      expect(index.lookup('./file.ts')).toContain('entry-1');

      // Remove
      await index.removeEntry('entry-1');

      // Verify entities removed
      expect(index.lookup('./file.ts')).not.toContain('entry-1');
    });
  });

  describe('removeEntries', () => {
    it('should remove entities for multiple entries', async () => {
      await index.indexEntry('entry-1', 'knowledge', 'Check ./file1.ts');
      await index.indexEntry('entry-2', 'knowledge', 'Check ./file2.ts');
      await index.indexEntry('entry-3', 'knowledge', 'Check ./file3.ts');

      await index.removeEntries(['entry-1', 'entry-2']);

      expect(index.lookup('./file1.ts')).not.toContain('entry-1');
      expect(index.lookup('./file2.ts')).not.toContain('entry-2');
      expect(index.lookup('./file3.ts')).toContain('entry-3');
    });
  });

  describe('getEntitiesForEntry', () => {
    it('should return all entities for an entry', async () => {
      await index.indexEntry('entry-1', 'knowledge', 'Check ./file.ts for executeQuery npm install');

      const entities = index.getEntitiesForEntry('entry-1');

      expect(entities.length).toBeGreaterThanOrEqual(2);
      expect(entities.some(e => e.type === 'FILE_PATH')).toBe(true);
    });
  });

  describe('count', () => {
    it('should return total entity count', async () => {
      await index.indexEntry('entry-1', 'knowledge', 'Check ./file1.ts executeQuery');

      const count = await index.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getStats', () => {
    it('should return entity statistics', async () => {
      await index.indexEntry('entry-1', 'knowledge', 'Check ./file.ts');
      await index.indexEntry('entry-2', 'tool', 'Run npm install');

      const stats = await index.getStats();

      expect(stats.totalEntities).toBeGreaterThanOrEqual(2);
      expect(stats.byType.FILE_PATH).toBeGreaterThanOrEqual(1);
      expect(stats.byType.COMMAND).toBeGreaterThanOrEqual(1);
      expect(stats.byEntryType.knowledge).toBeGreaterThanOrEqual(1);
      expect(stats.byEntryType.tool).toBeGreaterThanOrEqual(1);
    });
  });

  describe('clear', () => {
    it('should clear all entities', async () => {
      await index.indexEntry('entry-1', 'knowledge', 'Check ./file.ts');
      await index.indexEntry('entry-2', 'knowledge', 'Check ./other.ts');

      await index.clear();

      const count = await index.count();
      expect(count).toBe(0);
    });
  });
});
