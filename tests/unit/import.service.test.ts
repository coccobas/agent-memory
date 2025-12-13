/**
 * Unit tests for import service
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb } from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-import.db';

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

import { toolRepo } from '../../src/db/repositories/tools.js';
import { guidelineRepo } from '../../src/db/repositories/guidelines.js';
import { knowledgeRepo } from '../../src/db/repositories/knowledge.js';
import { entryTagRepo } from '../../src/db/repositories/tags.js';
import {
  importFromJson,
  importFromYaml,
  importFromMarkdown,
} from '../../src/services/import.service.js';

describe('Import Service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('importFromJson', () => {
    it('should import new tools', () => {
      const jsonContent = JSON.stringify({
        version: '1.0',
        entries: {
          tools: [
            {
              id: 'tool-1',
              scopeType: 'global',
              scopeId: null,
              name: 'import-test-tool',
              category: 'mcp',
              currentVersion: {
                description: 'Imported tool',
              },
              tags: ['test', 'import'],
            },
          ],
        },
      });

      const result = importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
      expect(result.details.tools.created).toBe(1);

      // Verify tool was created
      const tool = toolRepo.getByName('import-test-tool', 'global');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('import-test-tool');

      // Verify tags were attached
      const tags = entryTagRepo.getTagsForEntry('tool', tool!.id);
      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain('test');
      expect(tagNames).toContain('import');
    });

    it('should update existing tools when conflictStrategy is update', () => {
      // Create existing tool
      const existing = toolRepo.create({
        scopeType: 'global',
        name: 'existing-tool',
        description: 'Original description',
        createdBy: 'test',
      });

      const jsonContent = JSON.stringify({
        version: '1.0',
        entries: {
          tools: [
            {
              scopeType: 'global',
              scopeId: null,
              name: 'existing-tool',
              currentVersion: {
                description: 'Updated description',
              },
            },
          ],
        },
      });

      const result = importFromJson(jsonContent, {
        conflictStrategy: 'update',
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);

      // Verify tool was updated
      const tool = toolRepo.getById(existing.id);
      expect(tool?.currentVersion?.description).toBe('Updated description');
    });

    it('should skip existing tools when conflictStrategy is skip', () => {
      toolRepo.create({
        scopeType: 'global',
        name: 'skip-tool',
        description: 'Original',
        createdBy: 'test',
      });

      const jsonContent = JSON.stringify({
        version: '1.0',
        entries: {
          tools: [
            {
              scopeType: 'global',
              name: 'skip-tool',
              currentVersion: {
                description: 'Should not be applied',
              },
            },
          ],
        },
      });

      const result = importFromJson(jsonContent, {
        conflictStrategy: 'skip',
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(1);
      expect(result.updated).toBe(0);

      // Verify tool was not updated
      const tool = toolRepo.getByName('skip-tool', 'global');
      expect(tool?.currentVersion?.description).toBe('Original');
    });

    it('should import guidelines with all fields', () => {
      const jsonContent = JSON.stringify({
        version: '1.0',
        entries: {
          guidelines: [
            {
              scopeType: 'global',
              name: 'import-guideline',
              category: 'code_style',
              priority: 90,
              currentVersion: {
                content: 'Always use const',
                rationale: 'Immutability is better',
              },
              tags: ['javascript'],
            },
          ],
        },
      });

      const result = importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      const guideline = guidelineRepo.getByName('import-guideline', 'global');
      expect(guideline?.priority).toBe(90);
      expect(guideline?.currentVersion?.content).toBe('Always use const');
    });

    it('should import knowledge entries', () => {
      const jsonContent = JSON.stringify({
        version: '1.0',
        entries: {
          knowledge: [
            {
              scopeType: 'global',
              title: 'Import Knowledge',
              category: 'fact',
              currentVersion: {
                content: 'This is imported knowledge',
                source: 'import-test',
                confidence: 0.9,
              },
            },
          ],
        },
      });

      const result = importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      const knowledge = knowledgeRepo.getByTitle('Import Knowledge', 'global');
      expect(knowledge?.currentVersion?.content).toBe('This is imported knowledge');
    });

    it('should handle invalid JSON', () => {
      const result = importFromJson('invalid json content');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].entry).toBe('parsing');
    });

    it('should handle missing entries object', () => {
      const jsonContent = JSON.stringify({
        version: '1.0',
        // Missing entries
      });

      const result = importFromJson(jsonContent);

      expect(result.success).toBe(false);
      expect(result.errors[0].entry).toBe('structure');
    });

    it('should handle missing required fields', () => {
      const jsonContent = JSON.stringify({
        version: '1.0',
        entries: {
          tools: [
            {
              scopeType: 'global',
              // Missing name
              currentVersion: {
                description: 'Tool without name',
              },
            },
          ],
        },
      });

      const result = importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('importFromYaml', () => {
    it('should return error for YAML import', () => {
      const result = importFromYaml('some: yaml\ncontent: here');

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toContain('YAML import not fully implemented');
    });
  });

  describe('importFromMarkdown', () => {
    it('should return error for Markdown import', () => {
      const result = importFromMarkdown('# Markdown\n\nSome content');

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toContain('Markdown import not supported');
    });
  });
});
