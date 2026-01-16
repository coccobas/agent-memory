import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestTool,
  createTestGuideline,
  createTestKnowledge,
} from '../fixtures/test-helpers.js';
import { loadVersionsBatched } from '../../src/services/query/load-versions-batched.js';
import * as schema from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { generateId } from '../../src/db/repositories/base.js';

const TEST_DB_PATH = './data/test-load-versions-batched.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

describe('loadVersionsBatched', () => {
  beforeEach(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    if (sqlite) {
      sqlite.close();
    }
    cleanupTestDb(TEST_DB_PATH);
  });

  it('should return empty maps when no IDs provided', () => {
    const result = loadVersionsBatched(db, [], [], []);

    expect(result.tools.size).toBe(0);
    expect(result.guidelines.size).toBe(0);
    expect(result.knowledge.size).toBe(0);
  });

  it('should load tool versions by IDs', () => {
    const { tool: tool1 } = createTestTool(db, 'test-tool-1', 'global');
    const { tool: tool2 } = createTestTool(db, 'test-tool-2', 'global');

    const result = loadVersionsBatched(db, [tool1.id, tool2.id], [], []);

    expect(result.tools.size).toBe(2);
    expect(result.tools.has(tool1.id)).toBe(true);
    expect(result.tools.has(tool2.id)).toBe(true);
    expect(result.tools.get(tool1.id)?.current.toolId).toBe(tool1.id);
    expect(result.tools.get(tool2.id)?.current.toolId).toBe(tool2.id);
  });

  it('should load guideline versions by IDs', () => {
    const { guideline: guide1 } = createTestGuideline(db, 'test-guide-1', 'global');
    const { guideline: guide2 } = createTestGuideline(db, 'test-guide-2', 'global');

    const result = loadVersionsBatched(db, [], [guide1.id, guide2.id], []);

    expect(result.guidelines.size).toBe(2);
    expect(result.guidelines.has(guide1.id)).toBe(true);
    expect(result.guidelines.has(guide2.id)).toBe(true);
    expect(result.guidelines.get(guide1.id)?.current.guidelineId).toBe(guide1.id);
    expect(result.guidelines.get(guide2.id)?.current.guidelineId).toBe(guide2.id);
  });

  it('should load knowledge versions by IDs', () => {
    const { knowledge: know1 } = createTestKnowledge(db, 'test-know-1', 'global');
    const { knowledge: know2 } = createTestKnowledge(db, 'test-know-2', 'global');

    const result = loadVersionsBatched(db, [], [], [know1.id, know2.id]);

    expect(result.knowledge.size).toBe(2);
    expect(result.knowledge.has(know1.id)).toBe(true);
    expect(result.knowledge.has(know2.id)).toBe(true);
    expect(result.knowledge.get(know1.id)?.current.knowledgeId).toBe(know1.id);
    expect(result.knowledge.get(know2.id)?.current.knowledgeId).toBe(know2.id);
  });

  it('should load all types in single call', () => {
    const { tool } = createTestTool(db, 'combined-tool', 'global');
    const { guideline } = createTestGuideline(db, 'combined-guide', 'global');
    const { knowledge } = createTestKnowledge(db, 'combined-know', 'global');

    const result = loadVersionsBatched(db, [tool.id], [guideline.id], [knowledge.id]);

    expect(result.tools.size).toBe(1);
    expect(result.guidelines.size).toBe(1);
    expect(result.knowledge.size).toBe(1);
  });

  it('should include version history sorted by version number (descending)', () => {
    const toolId = generateId();
    const versionId1 = generateId();
    const versionId2 = generateId();
    const versionId3 = generateId();

    // Create tool
    db.insert(schema.tools)
      .values({
        id: toolId,
        scopeType: 'global',
        name: 'multi-version-tool',
        category: 'function',
        isActive: true,
      })
      .run();

    // Create multiple versions
    db.insert(schema.toolVersions)
      .values({
        id: versionId1,
        toolId,
        versionNum: 1,
        description: 'Version 1',
        changeReason: 'Initial',
      })
      .run();

    db.insert(schema.toolVersions)
      .values({
        id: versionId2,
        toolId,
        versionNum: 2,
        description: 'Version 2',
        changeReason: 'Update 1',
      })
      .run();

    db.insert(schema.toolVersions)
      .values({
        id: versionId3,
        toolId,
        versionNum: 3,
        description: 'Version 3',
        changeReason: 'Update 2',
      })
      .run();

    db.update(schema.tools)
      .set({ currentVersionId: versionId3 })
      .where(eq(schema.tools.id, toolId))
      .run();

    const result = loadVersionsBatched(db, [toolId], [], []);

    expect(result.tools.size).toBe(1);
    const toolData = result.tools.get(toolId)!;

    // Current should be version 3 (highest version number)
    expect(toolData.current.versionNum).toBe(3);

    // History should be sorted descending
    expect(toolData.history).toHaveLength(3);
    expect(toolData.history[0].versionNum).toBe(3);
    expect(toolData.history[1].versionNum).toBe(2);
    expect(toolData.history[2].versionNum).toBe(1);
  });

  it('should include version history for guidelines sorted descending', () => {
    const guidelineId = generateId();
    const versionId1 = generateId();
    const versionId2 = generateId();

    // Create guideline
    db.insert(schema.guidelines)
      .values({
        id: guidelineId,
        scopeType: 'global',
        name: 'multi-version-guide',
        priority: 50,
        isActive: true,
      })
      .run();

    // Create multiple versions
    db.insert(schema.guidelineVersions)
      .values({
        id: versionId1,
        guidelineId,
        versionNum: 1,
        content: 'Version 1 content',
        changeReason: 'Initial',
      })
      .run();

    db.insert(schema.guidelineVersions)
      .values({
        id: versionId2,
        guidelineId,
        versionNum: 2,
        content: 'Version 2 content',
        changeReason: 'Update',
      })
      .run();

    db.update(schema.guidelines)
      .set({ currentVersionId: versionId2 })
      .where(eq(schema.guidelines.id, guidelineId))
      .run();

    const result = loadVersionsBatched(db, [], [guidelineId], []);

    expect(result.guidelines.size).toBe(1);
    const guideData = result.guidelines.get(guidelineId)!;

    expect(guideData.current.versionNum).toBe(2);
    expect(guideData.history).toHaveLength(2);
    expect(guideData.history[0].versionNum).toBe(2);
    expect(guideData.history[1].versionNum).toBe(1);
  });

  it('should include version history for knowledge sorted descending', () => {
    const knowledgeId = generateId();
    const versionId1 = generateId();
    const versionId2 = generateId();

    // Create knowledge
    db.insert(schema.knowledge)
      .values({
        id: knowledgeId,
        scopeType: 'global',
        title: 'multi-version-knowledge',
        isActive: true,
      })
      .run();

    // Create multiple versions
    db.insert(schema.knowledgeVersions)
      .values({
        id: versionId1,
        knowledgeId,
        versionNum: 1,
        content: 'Version 1 content',
        changeReason: 'Initial',
      })
      .run();

    db.insert(schema.knowledgeVersions)
      .values({
        id: versionId2,
        knowledgeId,
        versionNum: 2,
        content: 'Version 2 content',
        changeReason: 'Update',
      })
      .run();

    db.update(schema.knowledge)
      .set({ currentVersionId: versionId2 })
      .where(eq(schema.knowledge.id, knowledgeId))
      .run();

    const result = loadVersionsBatched(db, [], [], [knowledgeId]);

    expect(result.knowledge.size).toBe(1);
    const knowData = result.knowledge.get(knowledgeId)!;

    expect(knowData.current.versionNum).toBe(2);
    expect(knowData.history).toHaveLength(2);
    expect(knowData.history[0].versionNum).toBe(2);
    expect(knowData.history[1].versionNum).toBe(1);
  });

  it('should handle non-existent IDs gracefully', () => {
    const result = loadVersionsBatched(
      db,
      ['non-existent-tool-id'],
      ['non-existent-guide-id'],
      ['non-existent-knowledge-id']
    );

    expect(result.tools.size).toBe(0);
    expect(result.guidelines.size).toBe(0);
    expect(result.knowledge.size).toBe(0);
  });

  it('should handle mix of existent and non-existent IDs', () => {
    const { tool } = createTestTool(db, 'existing-tool', 'global');

    const result = loadVersionsBatched(db, [tool.id, 'non-existent-id'], [], []);

    expect(result.tools.size).toBe(1);
    expect(result.tools.has(tool.id)).toBe(true);
    expect(result.tools.has('non-existent-id')).toBe(false);
  });

  it('should handle entries without versions (edge case)', () => {
    // Create tool without version
    const toolId = generateId();
    db.insert(schema.tools)
      .values({
        id: toolId,
        scopeType: 'global',
        name: 'no-version-tool',
        category: 'function',
        isActive: true,
      })
      .run();

    const result = loadVersionsBatched(db, [toolId], [], []);

    // Tool without versions should not be included
    expect(result.tools.size).toBe(0);
  });

  it('should handle large batch of IDs', () => {
    const toolIds: string[] = [];

    // Create 20 tools
    for (let i = 0; i < 20; i++) {
      const { tool } = createTestTool(db, `batch-tool-${i}`, 'global');
      toolIds.push(tool.id);
    }

    const result = loadVersionsBatched(db, toolIds, [], []);

    expect(result.tools.size).toBe(20);

    // Verify each tool was loaded
    for (const id of toolIds) {
      expect(result.tools.has(id)).toBe(true);
    }
  });

  it('should preserve version content correctly', () => {
    const { tool, version } = createTestTool(
      db,
      'content-test',
      'global',
      undefined,
      'function',
      'Custom description'
    );

    const result = loadVersionsBatched(db, [tool.id], [], []);

    const toolData = result.tools.get(tool.id)!;
    expect(toolData.current.description).toBe('Custom description');
    expect(toolData.current.id).toBe(version.id);
  });

  it('should handle duplicate IDs in input', () => {
    const { tool } = createTestTool(db, 'duplicate-test', 'global');

    const result = loadVersionsBatched(db, [tool.id, tool.id, tool.id], [], []);

    expect(result.tools.size).toBe(1);
    expect(result.tools.has(tool.id)).toBe(true);
  });
});
