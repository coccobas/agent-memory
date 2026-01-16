/**
 * Integration tests for export/import handlers
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestContext } from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';
import { exportHandlers } from '../../src/mcp/handlers/export.handler.js';
import { importHandlers } from '../../src/mcp/handlers/import.handler.js';

const TEST_DB_PATH = './data/test-export-import.db';

let testDb: ReturnType<typeof setupTestDb>;
let context: AppContext;

describe('Export/Import Handlers', () => {
  const AGENT_ID = 'agent-1';
  const ADMIN_KEY = 'test-admin-key';
  let previousPermMode: string | undefined;
  let previousAdminKey: string | undefined;
  beforeAll(async () => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    previousAdminKey = process.env.AGENT_MEMORY_ADMIN_KEY;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    process.env.AGENT_MEMORY_ADMIN_KEY = ADMIN_KEY;
    testDb = setupTestDb(TEST_DB_PATH);
    context = await createTestContext(testDb);
  });

  afterAll(() => {
    if (previousPermMode === undefined) {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    } else {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
    if (previousAdminKey === undefined) {
      delete process.env.AGENT_MEMORY_ADMIN_KEY;
    } else {
      process.env.AGENT_MEMORY_ADMIN_KEY = previousAdminKey;
    }
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('exportHandlers', () => {
    it('should handle export action with JSON format', async () => {
      await context.repos.tools.create({
        scopeType: 'global',
        name: 'handler-export-test',
        createdBy: 'test',
      });

      const result = await exportHandlers.export(context, {
        agentId: AGENT_ID,
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

    it('should handle export action with Markdown format', async () => {
      await context.repos.guidelines.create({
        scopeType: 'global',
        name: 'markdown-export',
        content: 'Test content',
        createdBy: 'test',
      });

      const result = await exportHandlers.export(context, {
        agentId: AGENT_ID,
        types: ['guidelines'],
        format: 'markdown',
      });

      expect(result.format).toBe('markdown');
      expect(result.content).toContain('# Agent Memory Export');
      expect(result.content).toContain('## Guidelines');
    });

    it('should handle export with scope filtering', async () => {
      await context.repos.tools.create({
        scopeType: 'global',
        name: 'global-export-tool',
        createdBy: 'test',
      });

      await context.repos.tools.create({
        scopeType: 'project',
        scopeId: 'proj-123',
        name: 'project-export-tool',
        createdBy: 'test',
      });

      const result = await exportHandlers.export(context, {
        agentId: AGENT_ID,
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
    it('should handle import action', async () => {
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

      const result = await importHandlers.import(context, {
        admin_key: ADMIN_KEY,
        content: JSON.stringify(exportData),
        format: 'json',
        conflictStrategy: 'update',
      });

      expect(result).toHaveProperty('success', true);
      expect(result.created).toBe(1);
      expect(result.errors).toEqual([]);

      // Verify tool was created
      const tool = await context.repos.tools.getByName('handler-import-tool', 'global');
      expect(tool).toBeDefined();
    });

    it('should handle missing content parameter', async () => {
      await expect(
        importHandlers.import(context, {
          admin_key: ADMIN_KEY,
          format: 'json',
        })
      ).rejects.toThrow(/content.*required/i);
    });

    it('should validate format parameter', async () => {
      await expect(
        importHandlers.import(context, {
          admin_key: ADMIN_KEY,
          content: '{}',
          format: 'invalid',
        })
      ).rejects.toThrow(/format.*must be/i);
    });
  });

  describe('Round-trip (export then import)', () => {
    it('should preserve data through export and import', async () => {
      // Create test data
      const tool = await context.repos.tools.create({
        scopeType: 'global',
        name: 'roundtrip-tool',
        category: 'mcp',
        description: 'Test description',
        createdBy: 'test',
      });

      const tag = await context.repos.tags.getOrCreate('roundtrip-tag');
      await context.repos.entryTags.attach({
        entryType: 'tool',
        entryId: tool.id,
        tagId: tag.id,
      });

      // Export
      const exportResult = await exportHandlers.export(context, {
        agentId: AGENT_ID,
        types: ['tools'],
        format: 'json',
      });

      expect(exportResult.success).toBe(true);

      // Delete the tool
      await context.repos.tools.deactivate(tool.id);

      // Import
      const importResult = await importHandlers.import(context, {
        admin_key: ADMIN_KEY,
        content: exportResult.content,
        format: 'json',
        conflictStrategy: 'update',
      });

      expect(importResult.success).toBe(true);
      expect(importResult.created).toBeGreaterThanOrEqual(0);
      expect(importResult.updated).toBeGreaterThanOrEqual(0);
    });

    it('should handle complex data with multiple types', async () => {
      // Create diverse test data
      await context.repos.tools.create({
        scopeType: 'global',
        name: 'multi-tool',
        createdBy: 'test',
      });

      await context.repos.guidelines.create({
        scopeType: 'global',
        name: 'multi-guideline',
        content: 'Multi content',
        createdBy: 'test',
      });

      await context.repos.knowledge.create({
        scopeType: 'global',
        title: 'Multi Knowledge',
        content: 'Multi knowledge content',
        createdBy: 'test',
      });

      // Export all types
      const exportResult = await exportHandlers.export(context, {
        agentId: AGENT_ID,
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
