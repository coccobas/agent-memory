import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  registerTestContext,
  createTestProject,
  createTestGuideline,
  createTestKnowledge,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';
import * as schema from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

const TEST_DB_PATH = './data/test-consolidation-int.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { handleConsolidation } from '../../src/mcp/handlers/consolidation.handler.js';

describe('Consolidation Integration', () => {
  const AGENT_ID = 'agent-1';
  let previousPermMode: string | undefined;

  beforeAll(() => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = registerTestContext(testDb);
  });

  afterAll(() => {
    if (previousPermMode === undefined) {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    } else {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('input validation', () => {
    it('rejects invalid action', async () => {
      await expect(
        handleConsolidation(context, {
          action: 'invalid_action' as unknown as 'find_similar',
          scopeType: 'global',
        })
      ).rejects.toThrow(/invalid value/i);
    });

    it('rejects missing scopeType', async () => {
      await expect(
        handleConsolidation(context, {
          action: 'find_similar',
          scopeType: undefined as unknown as 'global',
        })
      ).rejects.toThrow(/scopeType.*required/i);
    });

    it('rejects missing scopeId for non-global scopes', async () => {
      await expect(
        handleConsolidation(context, {
          action: 'find_similar',
          scopeType: 'project',
          // missing scopeId
        })
      ).rejects.toThrow(/scopeId.*required/i);
    });

    it('rejects invalid threshold values', async () => {
      await expect(
        handleConsolidation(context, {
          action: 'find_similar',
          scopeType: 'global',
          threshold: 1.5, // Invalid: > 1
        })
      ).rejects.toThrow(/threshold.*between 0 and 1/i);
    });

    it('rejects archive_stale without staleDays', async () => {
      await expect(
        handleConsolidation(context, {
          action: 'archive_stale',
          scopeType: 'global',
          // missing staleDays
        })
      ).rejects.toThrow(/staleDays.*required/i);
    });

    it('rejects archive_stale with invalid staleDays', async () => {
      await expect(
        handleConsolidation(context, {
          action: 'archive_stale',
          scopeType: 'global',
          staleDays: -5,
        })
      ).rejects.toThrow(/staleDays.*required.*positive/i);
    });

    it('rejects archive_stale with invalid minRecencyScore', async () => {
      await expect(
        handleConsolidation(context, {
          action: 'archive_stale',
          scopeType: 'global',
          staleDays: 90,
          minRecencyScore: 2.0, // Invalid: > 1
        })
      ).rejects.toThrow(/minRecencyScore.*between 0 and 1/i);
    });
  });

  describe('archive_stale action', () => {
    it('archives stale entries in global scope', async () => {
      // Create guidelines with different ages
      const { guideline: recentGuideline } = createTestGuideline(
        db,
        'Recent Global Guideline',
        'global',
        undefined,
        'test'
      );
      const { guideline: staleGuideline } = createTestGuideline(
        db,
        'Stale Global Guideline',
        'global',
        undefined,
        'test'
      );

      // Backdate the stale entry
      const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      db.update(schema.guidelines)
        .set({ createdAt: staleDate })
        .where(eq(schema.guidelines.id, staleGuideline.id))
        .run();

      const result = (await handleConsolidation(context, {
        action: 'archive_stale',
        scopeType: 'global',
        entryTypes: ['guideline'],
        staleDays: 90,
        dryRun: false,
        consolidatedBy: AGENT_ID,
      })) as {
        action: string;
        dryRun: boolean;
        staleDays: number;
        entriesArchived: number;
        archivedEntries: Array<{ id: string; name: string }>;
      };

      expect(result.action).toBe('archive_stale');
      expect(result.dryRun).toBe(false);
      expect(result.staleDays).toBe(90);

      // Verify the stale guideline was archived
      const archivedIds = result.archivedEntries.map((e) => e.id);
      expect(archivedIds).toContain(staleGuideline.id);
      expect(archivedIds).not.toContain(recentGuideline.id);

      // Verify database state
      const staleEntry = db
        .select()
        .from(schema.guidelines)
        .where(eq(schema.guidelines.id, staleGuideline.id))
        .get();
      expect(staleEntry?.isActive).toBe(false);

      const recentEntry = db
        .select()
        .from(schema.guidelines)
        .where(eq(schema.guidelines.id, recentGuideline.id))
        .get();
      expect(recentEntry?.isActive).toBe(true);
    });

    it('archives stale entries within project scope', async () => {
      const project = createTestProject(db, 'Archive Stale Project');

      const { guideline } = createTestGuideline(
        db,
        'Project Stale Guideline',
        'project',
        project.id,
        'test'
      );

      // Backdate
      const staleDate = new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString();
      db.update(schema.guidelines)
        .set({ createdAt: staleDate })
        .where(eq(schema.guidelines.id, guideline.id))
        .run();

      const result = (await handleConsolidation(context, {
        action: 'archive_stale',
        scopeType: 'project',
        scopeId: project.id,
        entryTypes: ['guideline'],
        staleDays: 60,
        dryRun: false,
      })) as {
        action: string;
        entriesArchived: number;
        archivedEntries: Array<{ id: string }>;
      };

      expect(result.action).toBe('archive_stale');
      expect(result.archivedEntries.some((e) => e.id === guideline.id)).toBe(true);
    });

    it('respects dryRun flag', async () => {
      const project = createTestProject(db, 'DryRun Consolidation Project');

      const { guideline } = createTestGuideline(
        db,
        'DryRun Stale Guideline',
        'project',
        project.id,
        'test'
      );

      // Backdate
      const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      db.update(schema.guidelines)
        .set({ createdAt: staleDate })
        .where(eq(schema.guidelines.id, guideline.id))
        .run();

      const result = (await handleConsolidation(context, {
        action: 'archive_stale',
        scopeType: 'project',
        scopeId: project.id,
        entryTypes: ['guideline'],
        staleDays: 90,
        dryRun: true,
      })) as {
        dryRun: boolean;
        archivedEntries: Array<{ id: string }>;
        message: string;
      };

      expect(result.dryRun).toBe(true);
      expect(result.archivedEntries.some((e) => e.id === guideline.id)).toBe(true);
      expect(result.message).toContain('Would archive');

      // Verify entry is still active
      const entry = db
        .select()
        .from(schema.guidelines)
        .where(eq(schema.guidelines.id, guideline.id))
        .get();
      expect(entry?.isActive).toBe(true);
    });

    it('handles multiple entry types', async () => {
      const project = createTestProject(db, 'Multi-Type Archive Project');

      const { guideline } = createTestGuideline(db, 'Multi-Type Guideline', 'project', project.id);
      const { knowledge } = createTestKnowledge(db, 'Multi-Type Knowledge', 'project', project.id);

      // Backdate both
      const staleDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
      db.update(schema.guidelines)
        .set({ createdAt: staleDate })
        .where(eq(schema.guidelines.id, guideline.id))
        .run();
      db.update(schema.knowledge)
        .set({ createdAt: staleDate })
        .where(eq(schema.knowledge.id, knowledge.id))
        .run();

      const result = (await handleConsolidation(context, {
        action: 'archive_stale',
        scopeType: 'project',
        scopeId: project.id,
        entryTypes: ['guideline', 'knowledge'],
        staleDays: 60,
        dryRun: true,
      })) as {
        archivedEntries: Array<{ id: string; type: string }>;
      };

      const types = result.archivedEntries.map((e) => e.type);
      expect(types).toContain('guideline');
      expect(types).toContain('knowledge');
    });

    it('filters by minRecencyScore', async () => {
      const project = createTestProject(db, 'RecencyScore Project');

      // Create entries with different ages
      // At ~30 days, recencyScore ~ 0.5
      // At ~120 days, recencyScore ~ 0.0625
      const { guideline: moderateAge } = createTestGuideline(
        db,
        'Moderate Age Guideline',
        'project',
        project.id
      );
      const { guideline: veryOld } = createTestGuideline(
        db,
        'Very Old Guideline',
        'project',
        project.id
      );

      const moderateDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const veryOldDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();

      db.update(schema.guidelines)
        .set({ createdAt: moderateDate })
        .where(eq(schema.guidelines.id, moderateAge.id))
        .run();
      db.update(schema.guidelines)
        .set({ createdAt: veryOldDate })
        .where(eq(schema.guidelines.id, veryOld.id))
        .run();

      const result = (await handleConsolidation(context, {
        action: 'archive_stale',
        scopeType: 'project',
        scopeId: project.id,
        entryTypes: ['guideline'],
        staleDays: 1, // All entries qualify by age
        minRecencyScore: 0.1, // Only archive entries with recencyScore < 0.1
        dryRun: true,
      })) as {
        archivedEntries: Array<{ id: string; recencyScore: number }>;
      };

      // Only the very old entry (recencyScore < 0.1) should be in candidates
      const veryOldEntry = result.archivedEntries.find((e) => e.id === veryOld.id);
      expect(veryOldEntry).toBeDefined();
      expect(veryOldEntry?.recencyScore).toBeLessThan(0.1);

      // The moderate age entry should not be archived
      const moderateEntry = result.archivedEntries.find((e) => e.id === moderateAge.id);
      expect(moderateEntry).toBeUndefined();
    });

    it('returns message for dry run', async () => {
      const project = createTestProject(db, 'Message Test Project');

      const result = (await handleConsolidation(context, {
        action: 'archive_stale',
        scopeType: 'project',
        scopeId: project.id,
        staleDays: 90,
        dryRun: true,
      })) as {
        message: string;
      };

      expect(result.message).toContain('Would archive');
      expect(result.message).toContain('90 days');
    });

    it('handles empty scope gracefully', async () => {
      const emptyProject = createTestProject(db, 'Empty Consolidation Project');

      const result = (await handleConsolidation(context, {
        action: 'archive_stale',
        scopeType: 'project',
        scopeId: emptyProject.id,
        staleDays: 90,
        dryRun: true,
      })) as {
        entriesArchived: number;
        archivedEntries: unknown[];
      };

      expect(result.entriesArchived).toBe(0);
      expect(result.archivedEntries).toEqual([]);
    });
  });

  describe('services validation', () => {
    it('rejects find_similar when embedding service is missing', async () => {
      // The test context doesn't have embedding/vector services
      await expect(
        handleConsolidation(context, {
          action: 'find_similar',
          scopeType: 'global',
        })
      ).rejects.toThrow(/Embedding and vector services.*required/i);
    });

    it('rejects dedupe when embedding service is missing', async () => {
      await expect(
        handleConsolidation(context, {
          action: 'dedupe',
          scopeType: 'global',
        })
      ).rejects.toThrow(/Embedding and vector services.*required/i);
    });

    it('rejects merge when embedding service is missing', async () => {
      await expect(
        handleConsolidation(context, {
          action: 'merge',
          scopeType: 'global',
        })
      ).rejects.toThrow(/Embedding and vector services.*required/i);
    });

    it('rejects abstract when embedding service is missing', async () => {
      await expect(
        handleConsolidation(context, {
          action: 'abstract',
          scopeType: 'global',
        })
      ).rejects.toThrow(/Embedding and vector services.*required/i);
    });

    // archive_stale doesn't need embedding services, so it should work
    it('archive_stale works without embedding service', async () => {
      const project = createTestProject(db, 'No Embedding Project');

      // This should not throw
      const result = (await handleConsolidation(context, {
        action: 'archive_stale',
        scopeType: 'project',
        scopeId: project.id,
        staleDays: 90,
        dryRun: true,
      })) as { action: string };

      expect(result.action).toBe('archive_stale');
    });
  });
});
