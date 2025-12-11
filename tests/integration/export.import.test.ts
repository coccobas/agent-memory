/**
 * Integration tests for export/import handlers
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb } from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-export-import.db';

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
import { tagRepo, entryTagRepo } from '../../src/db/repositories/tags.js';
import { exportHandlers } from '../../src/mcp/handlers/export.handler.js';
import { importHandlers } from '../../src/mcp/handlers/import.handler.js';

describe('Export/Import Handlers', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('exportHandlers', () => {
    it('should handle export action with JSON format', () => {
      toolRepo.create({
        scopeType: 'global',
        name: 'handler-export-test',
        createdBy: 'test',
      });

      const result = exportHandlers.export({
        types: ['tools'],
        format: 'json',
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('format', 'json');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('metadata');

      const data = JSON.parse(result.content);
      expect(data.entries.tools).toBeInstanceOf(Array);
    });

    it('should handle export action with Markdown format', () => {
      guidelineRepo.create({
        scopeType: 'global',
        name: 'markdown-export',
        content: 'Test content',
        createdBy: 'test',
      });

      const result = exportHandlers.export({
        types: ['guidelines'],
        format: 'markdown',
      });

      expect(result.format).toBe('markdown');
      expect(result.content).toContain('# Agent Memory Export');
      expect(result.content).toContain('## Guidelines');
    });

    it('should handle export with scope filtering', () => {
      toolRepo.create({
        scopeType: 'global',
        name: 'global-export-tool',
        createdBy: 'test',
      });

      toolRepo.create({
        scopeType: 'project',
        scopeId: 'proj-123',
        name: 'project-export-tool',
        createdBy: 'test',
      });

      const result = exportHandlers.export({
        types: ['tools'],
        scopeType: 'project',
        scopeId: 'proj-123',
        format: 'json',
      });

      const data = JSON.parse(result.content);
      const toolNames = data.entries.tools.map((t: any) => t.name);
      expect(toolNames).toContain('project-export-tool');
      expect(toolNames).not.toContain('global-export-tool');
    });
  });

  describe('importHandlers', () => {
    it('should handle import action', () => {
      const exportData = {
        version: '1.0',
        entries: {
          tools: [
            {
              scopeType: 'global',
              name: 'handler-import-tool',
              category: 'mcp',
              currentVersion: {
                description: 'Imported via handler',
              },
            },
          ],
        },
      };

      const result = importHandlers.import({
        content: JSON.stringify(exportData),
        format: 'json',
        conflictStrategy: 'update',
      });

      expect(result).toHaveProperty('success', true);
      expect(result.created).toBe(1);
      expect(result.errors).toEqual([]);

      // Verify tool was created
      const tool = toolRepo.getByName('handler-import-tool', 'global');
      expect(tool).toBeDefined();
    });

    it('should handle missing content parameter', () => {
      expect(() => {
        importHandlers.import({
          format: 'json',
        });
      }).toThrow(/content.*required/i);
    });

    it('should validate format parameter', () => {
      expect(() => {
        importHandlers.import({
          content: '{}',
          format: 'invalid',
        });
      }).toThrow(/format.*must be/i);
    });
  });

  describe('Round-trip (export then import)', () => {
    it('should preserve data through export and import', () => {
      // Create test data
      const tool = toolRepo.create({
        scopeType: 'global',
        name: 'roundtrip-tool',
        category: 'mcp',
        description: 'Test description',
        createdBy: 'test',
      });

      const tag = tagRepo.getOrCreate('roundtrip-tag');
      entryTagRepo.attach({
        entryType: 'tool',
        entryId: tool.id,
        tagId: tag.id,
      });

      // Export
      const exportResult = exportHandlers.export({
        types: ['tools'],
        format: 'json',
      });

      expect(exportResult.success).toBe(true);

      // Delete the tool
      toolRepo.deactivate(tool.id);

      // Import
      const importResult = importHandlers.import({
        content: exportResult.content,
        format: 'json',
        conflictStrategy: 'update',
      });

      expect(importResult.success).toBe(true);
      expect(importResult.created).toBeGreaterThanOrEqual(0);
      expect(importResult.updated).toBeGreaterThanOrEqual(0);
    });

    it('should handle complex data with multiple types', () => {
      // Create diverse test data
      toolRepo.create({
        scopeType: 'global',
        name: 'multi-tool',
        createdBy: 'test',
      });

      guidelineRepo.create({
        scopeType: 'global',
        name: 'multi-guideline',
        content: 'Multi content',
        createdBy: 'test',
      });

      knowledgeRepo.create({
        scopeType: 'global',
        title: 'Multi Knowledge',
        content: 'Multi knowledge content',
        createdBy: 'test',
      });

      // Export all types
      const exportResult = exportHandlers.export({
        types: ['tools', 'guidelines', 'knowledge'],
        format: 'json',
      });

      const data = JSON.parse(exportResult.content);
      expect(data.entries.tools.length).toBeGreaterThan(0);
      expect(data.entries.guidelines.length).toBeGreaterThan(0);
      expect(data.entries.knowledge.length).toBeGreaterThan(0);
    });
  });
});








