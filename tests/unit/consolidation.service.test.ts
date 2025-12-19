/**
 * Unit tests for consolidation service
 *
 * Tests memory consolidation features including:
 * - archiveStale: Auto-archive stale entries based on age/recency
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb } from '../fixtures/test-helpers.js';
import { config } from '../../src/config/index.js';

const TEST_DB_PATH = './data/test-consolidation.db';
let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { archiveStale, type ArchiveStaleParams } from '../../src/services/consolidation.service.js';
import {
  guidelines,
  guidelineVersions,
  knowledge,
  knowledgeVersions,
} from '../../src/db/schema.js';
import { generateId } from '../../src/db/repositories/base.js';
import { eq } from 'drizzle-orm';

describe('Consolidation Service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('archiveStale', () => {
    // Helper to create a guideline with specific age
    function createGuidelineWithAge(name: string, daysOld: number): string {
      const id = generateId();
      const versionId = generateId();

      // Calculate timestamp for daysOld ago
      const timestamp = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

      db.insert(guidelines)
        .values({
          id,
          name,
          scopeType: 'global',
          scopeId: null,
          category: 'test',
          currentVersionId: versionId,
          isActive: true,
          createdAt: timestamp,
        })
        .run();

      db.insert(guidelineVersions)
        .values({
          id: versionId,
          guidelineId: id,
          versionNum: 1,
          content: `Test guideline content for ${name}`,
          createdAt: timestamp,
        })
        .run();

      return id;
    }

    // Helper to create a knowledge entry with specific age
    function createKnowledgeWithAge(title: string, daysOld: number): string {
      const id = generateId();
      const versionId = generateId();

      // Calculate timestamp for daysOld ago
      const timestamp = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

      db.insert(knowledge)
        .values({
          id,
          title,
          scopeType: 'global',
          scopeId: null,
          category: 'fact',
          currentVersionId: versionId,
          isActive: true,
          createdAt: timestamp,
        })
        .run();

      db.insert(knowledgeVersions)
        .values({
          id: versionId,
          knowledgeId: id,
          versionNum: 1,
          content: `Test knowledge content for ${title}`,
          createdAt: timestamp,
        })
        .run();

      return id;
    }

    // Helper to check if guideline is active
    function isGuidelineActive(id: string): boolean {
      const result = db.select().from(guidelines).where(eq(guidelines.id, id)).get();
      return result?.isActive ?? false;
    }

    it('should archive entries older than staleDays', async () => {
      // Create entries with different ages
      const recentId = createGuidelineWithAge('recent-test-1', 10); // 10 days old
      const oldId = createGuidelineWithAge('old-test-1', 100); // 100 days old
      const veryOldId = createGuidelineWithAge('very-old-test-1', 200); // 200 days old

      const params: ArchiveStaleParams = {
        scopeType: 'global',
        entryTypes: ['guideline'],
        staleDays: 90,
        dryRun: false,
      };

      const result = await archiveStale(params);

      expect(result.dryRun).toBe(false);
      expect(result.staleDays).toBe(90);
      expect(result.entriesArchived).toBeGreaterThanOrEqual(2); // old and very-old

      // Verify archived entries in result
      const archivedIds = result.archivedEntries.map((e) => e.id);
      expect(archivedIds).toContain(oldId);
      expect(archivedIds).toContain(veryOldId);
      expect(archivedIds).not.toContain(recentId);

      // Verify database state
      expect(isGuidelineActive(recentId)).toBe(true);
      expect(isGuidelineActive(oldId)).toBe(false);
      expect(isGuidelineActive(veryOldId)).toBe(false);
    });

    it('should respect dryRun and not modify entries', async () => {
      const oldId = createGuidelineWithAge('old-dryrun-test', 100);

      const params: ArchiveStaleParams = {
        scopeType: 'global',
        entryTypes: ['guideline'],
        staleDays: 90,
        dryRun: true, // Dry run mode
      };

      const result = await archiveStale(params);

      expect(result.dryRun).toBe(true);
      expect(result.archivedEntries.some((e) => e.id === oldId)).toBe(true);

      // Verify entry is still active (not actually archived)
      expect(isGuidelineActive(oldId)).toBe(true);
    });

    it('should filter by minRecencyScore', async () => {
      // Create entries with different ages
      // At 30 days (default half-life), recencyScore ~ 0.5
      // At 60 days, recencyScore ~ 0.25
      // At 120 days, recencyScore ~ 0.0625
      createGuidelineWithAge('half-life-test', 30);
      createGuidelineWithAge('double-half-life-test', 60);
      const quadHalfLifeId = createGuidelineWithAge('quad-half-life-test', 120);

      const params: ArchiveStaleParams = {
        scopeType: 'global',
        entryTypes: ['guideline'],
        staleDays: 1, // All entries qualify by age
        minRecencyScore: 0.1, // Only archive if recencyScore < 0.1
        dryRun: true,
      };

      const result = await archiveStale(params);

      // Only entries with recencyScore < 0.1 should be archived
      // At 120 days (with 30-day half-life), recencyScore ~ 0.0625 < 0.1
      expect(result.archivedEntries.some((e) => e.id === quadHalfLifeId)).toBe(true);

      // The entry at 120 days should have very low recency score
      const quadEntry = result.archivedEntries.find((e) => e.id === quadHalfLifeId);
      expect(quadEntry?.recencyScore).toBeLessThan(0.1);
    });

    it('should handle multiple entry types', async () => {
      const guidelineId = createGuidelineWithAge('multi-type-guideline', 100);
      const knowledgeId = createKnowledgeWithAge('multi-type-knowledge', 100);

      const params: ArchiveStaleParams = {
        scopeType: 'global',
        entryTypes: ['guideline', 'knowledge'],
        staleDays: 90,
        dryRun: true,
      };

      const result = await archiveStale(params);

      const archivedIds = result.archivedEntries.map((e) => e.id);
      expect(archivedIds).toContain(guidelineId);
      expect(archivedIds).toContain(knowledgeId);

      const types = result.archivedEntries.map((e) => e.type);
      expect(types).toContain('guideline');
      expect(types).toContain('knowledge');
    });

    it('should return correct ageDays and recencyScore', async () => {
      const daysOld = 60;
      const testId = createGuidelineWithAge('age-score-test', daysOld);

      const params: ArchiveStaleParams = {
        scopeType: 'global',
        entryTypes: ['guideline'],
        staleDays: 30,
        dryRun: true,
      };

      const result = await archiveStale(params);

      const entry = result.archivedEntries.find((e) => e.id === testId);
      expect(entry).toBeDefined();

      // Age should be approximately 60 days
      expect(entry!.ageDays).toBeCloseTo(daysOld, 0);

      // RecencyScore uses per-entry-type half-life (guideline = 30 days)
      // = 0.5^(60/30) = 0.5^2 = 0.25
      const halfLifeDays = config.recency?.decayHalfLifeDays?.guideline ?? 30;
      const expectedRecencyScore = Math.pow(0.5, daysOld / halfLifeDays);
      expect(entry!.recencyScore).toBeCloseTo(expectedRecencyScore, 2);
    });

    it('should handle entries with no matching staleness', async () => {
      // Create only recent entries
      createGuidelineWithAge('recent-only-1', 5);
      createGuidelineWithAge('recent-only-2', 15);

      const params: ArchiveStaleParams = {
        scopeType: 'global',
        entryTypes: ['guideline'],
        staleDays: 300, // Very high threshold, none should match
        dryRun: true,
      };

      const result = await archiveStale(params);

      // No entries should be archived since staleDays is very high
      const matchingEntries = result.archivedEntries.filter((e) => e.name.includes('recent-only'));
      expect(matchingEntries.length).toBe(0);
    });
  });
});
