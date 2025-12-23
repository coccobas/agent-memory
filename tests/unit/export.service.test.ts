/**
 * Unit tests for export service
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestRepositories } from '../fixtures/test-helpers.js';
import type { Repositories } from '../../src/core/interfaces/repositories.js';
import { exportToJson, exportToMarkdown, exportToYaml } from '../../src/services/export.service.js';

const TEST_DB_PATH = './data/test-export.db';

let testDb: ReturnType<typeof setupTestDb>;
let repos: Repositories;

describe('Export Service', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    repos = createTestRepositories(testDb);
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('exportToJson', () => {
    it('should export tools to JSON', async () => {
      // Create a test tool
      const tool = await repos.tools.create({
        scopeType: 'global',
        name: 'test-export-tool',
        description: 'Test tool for export',
        category: 'mcp',
        createdBy: 'test-user',
      });

      const result = exportToJson({ types: ['tools'] });

      expect(result.format).toBe('json');
      expect(result.metadata.entryCount).toBeGreaterThanOrEqual(1);

      const data = JSON.parse(result.content);
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('exportedAt');
      expect(data.entries.tools).toBeInstanceOf(Array);

      const exportedTool = data.entries.tools.find((t: any) => t.id === tool.id);
      expect(exportedTool).toBeDefined();
      expect(exportedTool.name).toBe('test-export-tool');
    });

    it('should export guidelines to JSON', async () => {
      const guideline = await repos.guidelines.create({
        scopeType: 'global',
        name: 'test-export-guideline',
        content: 'Test guideline content',
        priority: 80,
        createdBy: 'test-user',
      });

      const result = exportToJson({ types: ['guidelines'] });

      const data = JSON.parse(result.content);
      const exportedGuideline = data.entries.guidelines.find((g: any) => g.id === guideline.id);
      expect(exportedGuideline).toBeDefined();
      expect(exportedGuideline.priority).toBe(80);
    });

    it('should filter by scope', async () => {
      await repos.tools.create({
        scopeType: 'global',
        name: 'global-tool',
        createdBy: 'test',
      });

      await repos.tools.create({
        scopeType: 'project',
        scopeId: 'proj-123',
        name: 'project-tool',
        createdBy: 'test',
      });

      const result = exportToJson({
        types: ['tools'],
        scopeType: 'global',
      });

      const data = JSON.parse(result.content);
      const toolNames = data.entries.tools.map((t: any) => t.name);
      expect(toolNames).toContain('global-tool');
      expect(toolNames).not.toContain('project-tool');
    });

    it('should include tags', async () => {
      const tool = await repos.tools.create({
        scopeType: 'global',
        name: 'tagged-tool',
        createdBy: 'test',
      });

      const tag = await repos.tags.getOrCreate('test-tag');
      await repos.entryTags.attach({
        entryType: 'tool',
        entryId: tool.id,
        tagId: tag.id,
      });

      const result = exportToJson({ types: ['tools'] });
      const data = JSON.parse(result.content);
      const exportedTool = data.entries.tools.find((t: any) => t.id === tool.id);

      expect(exportedTool.tags).toContain('test-tag');
    });

    it('should filter by tags', async () => {
      const tool1 = await repos.tools.create({
        scopeType: 'global',
        name: 'python-tool',
        createdBy: 'test',
      });

      const tool2 = await repos.tools.create({
        scopeType: 'global',
        name: 'java-tool',
        createdBy: 'test',
      });

      const pythonTag = await repos.tags.getOrCreate('python');
      await repos.entryTags.attach({
        entryType: 'tool',
        entryId: tool1.id,
        tagId: pythonTag.id,
      });

      const result = exportToJson({
        types: ['tools'],
        tags: ['python'],
      });

      const data = JSON.parse(result.content);
      const toolNames = data.entries.tools.map((t: any) => t.name);
      expect(toolNames).toContain('python-tool');
      expect(toolNames).not.toContain('java-tool');
    });
  });

  describe('exportToMarkdown', () => {
    it('should export to Markdown format', async () => {
      await repos.tools.create({
        scopeType: 'global',
        name: 'markdown-tool',
        description: 'Tool for Markdown export',
        createdBy: 'test',
      });

      const result = exportToMarkdown({ types: ['tools'] });

      expect(result.format).toBe('markdown');
      expect(result.content).toContain('# Agent Memory Export');
      expect(result.content).toContain('## Tools');
      expect(result.content).toContain('### markdown-tool');
    });

    it('should format guidelines properly', async () => {
      await repos.guidelines.create({
        scopeType: 'global',
        name: 'markdown-guideline',
        content: 'This is the guideline content',
        rationale: 'This is the rationale',
        createdBy: 'test',
      });

      const result = exportToMarkdown({ types: ['guidelines'] });

      expect(result.content).toContain('## Guidelines');
      expect(result.content).toContain('### markdown-guideline');
      expect(result.content).toContain('This is the guideline content');
      expect(result.content).toContain('**Rationale:**');
    });
  });

  describe('exportToYaml', () => {
    it('should export to YAML format', async () => {
      await repos.tools.create({
        scopeType: 'global',
        name: 'yaml-tool',
        createdBy: 'test',
      });

      const result = exportToYaml({ types: ['tools'] });

      expect(result.format).toBe('yaml');
      expect(result.content).toContain('# Agent Memory Export');
      expect(result.content).toContain('version:');
      expect(result.content).toContain('tools:');
      expect(result.content).toContain('name: "yaml-tool"');
    });
  });
});
