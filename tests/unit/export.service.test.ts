/**
 * Unit tests for export service
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb } from '../fixtures/test-helpers.js';

const TEST_DB_PATH = './data/test-export.db';

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
import { exportToJson, exportToMarkdown, exportToYaml } from '../../src/services/export.service.js';

describe('Export Service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('exportToJson', () => {
    it('should export tools to JSON', () => {
      // Create a test tool
      const tool = toolRepo.create({
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

    it('should export guidelines to JSON', () => {
      const guideline = guidelineRepo.create({
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

    it('should filter by scope', () => {
      toolRepo.create({
        scopeType: 'global',
        name: 'global-tool',
        createdBy: 'test',
      });

      toolRepo.create({
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

    it('should include tags', () => {
      const tool = toolRepo.create({
        scopeType: 'global',
        name: 'tagged-tool',
        createdBy: 'test',
      });

      const tag = tagRepo.getOrCreate('test-tag');
      entryTagRepo.attach({
        entryType: 'tool',
        entryId: tool.id,
        tagId: tag.id,
      });

      const result = exportToJson({ types: ['tools'] });
      const data = JSON.parse(result.content);
      const exportedTool = data.entries.tools.find((t: any) => t.id === tool.id);

      expect(exportedTool.tags).toContain('test-tag');
    });

    it('should filter by tags', () => {
      const tool1 = toolRepo.create({
        scopeType: 'global',
        name: 'python-tool',
        createdBy: 'test',
      });

      const tool2 = toolRepo.create({
        scopeType: 'global',
        name: 'java-tool',
        createdBy: 'test',
      });

      const pythonTag = tagRepo.getOrCreate('python');
      entryTagRepo.attach({
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
    it('should export to Markdown format', () => {
      toolRepo.create({
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

    it('should format guidelines properly', () => {
      guidelineRepo.create({
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
    it('should export to YAML format', () => {
      toolRepo.create({
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




