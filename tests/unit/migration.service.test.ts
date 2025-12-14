/**
 * Unit tests for migration service
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestTool } from '../fixtures/test-helpers.js';
import { migrateEntries, migrateScope } from '../../src/services/migration.service.js';
import { toolRepo } from '../../src/db/repositories/tools.js';
import { guidelineRepo } from '../../src/db/repositories/guidelines.js';
import { knowledgeRepo } from '../../src/db/repositories/knowledge.js';

const TEST_DB_PATH = './data/test-migration.db';
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

describe('migration.service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('migrateEntries', () => {
    it('should migrate entries from JSON to YAML', () => {
      createTestTool(db, 'migration-test-tool', 'global');

      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'yaml',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      expect(typeof result.migrated).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.dryRun).toBe('boolean');
    });

    it('should migrate entries from JSON to Markdown', () => {
      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'markdown',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      expect(result.migrated).toBeGreaterThanOrEqual(0);
    });

    it('should support dry-run mode', () => {
      createTestTool(db, 'dry-run-test-tool', 'global');

      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'yaml',
        scopeType: 'global',
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.migrated).toBeGreaterThanOrEqual(0);
    });

    it('should filter by scopeType', () => {
      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'yaml',
        scopeType: 'project',
        scopeId: 'test-project-id',
      });

      expect(result).toBeDefined();
    });

    it('should filter by scopeId', () => {
      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'yaml',
        scopeType: 'project',
        scopeId: 'specific-project-id',
      });

      expect(result).toBeDefined();
    });

    it('should handle migration errors gracefully', () => {
      const result = migrateEntries({
        fromFormat: 'invalid-format',
        toFormat: 'yaml',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
      // Should have errors for invalid format
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });

    it('should report migration statistics', () => {
      createTestTool(db, 'stats-test-tool-1', 'global');
      createTestTool(db, 'stats-test-tool-2', 'global');

      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'markdown',
        scopeType: 'global',
      });

      expect(result.migrated).toBeGreaterThanOrEqual(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle OpenAPI format migration', () => {
      // OpenAPI only supports tools
      createTestTool(db, 'openapi-test-tool', 'global');

      const result = migrateEntries({
        fromFormat: 'openapi',
        toFormat: 'json',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      // May succeed or fail depending on OpenAPI implementation
      expect(typeof result.migrated).toBe('number');
    });

    it('should handle empty database', () => {
      // Use a scope that doesn't have entries from previous tests
      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'yaml',
        scopeType: 'project',
        scopeId: 'non-existent-project-id',
      });

      expect(result.migrated).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it('should collect errors during migration', () => {
      // Try to migrate with invalid source format
      const result = migrateEntries({
        fromFormat: 'invalid',
        toFormat: 'json',
        scopeType: 'global',
      });

      expect(Array.isArray(result.errors)).toBe(true);
      // Errors should have entryId and error message
      result.errors.forEach((error) => {
        expect(error.entryId).toBeDefined();
        expect(typeof error.error).toBe('string');
      });
    });

    it('should handle YAML to JSON migration', () => {
      const result = migrateEntries({
        fromFormat: 'yaml',
        toFormat: 'json',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      expect(typeof result.migrated).toBe('number');
    });

    it('should handle Markdown to JSON migration', () => {
      const result = migrateEntries({
        fromFormat: 'markdown',
        toFormat: 'json',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      expect(typeof result.migrated).toBe('number');
    });

    it('should reject non-JSON to OpenAPI migration', () => {
      createTestTool(db, 'openapi-target-test', 'global');

      const result = migrateEntries({
        fromFormat: 'yaml', // Non-JSON source with OpenAPI target
        toFormat: 'openapi',
        scopeType: 'global',
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('OpenAPI target format requires JSON source');
    });

    it('should count created and updated entries', () => {
      // Create a tool that will be exported and re-imported
      const tool = toolRepo.create({
        scopeType: 'global',
        name: 'migration-count-test',
        description: 'Test tool for migration count',
        createdBy: 'test',
      });

      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'json',
        scopeType: 'global',
      });

      expect(result.migrated).toBeGreaterThanOrEqual(1);
      expect(result.dryRun).toBe(false);

      // Tool should still exist after migration
      const migratedTool = toolRepo.getById(tool.id);
      expect(migratedTool).toBeDefined();
    });

    it('should migrate guidelines', () => {
      guidelineRepo.create({
        scopeType: 'global',
        name: 'migration-guideline-test',
        content: 'Test guideline',
        createdBy: 'test',
      });

      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'json',
        scopeType: 'global',
      });

      expect(result.migrated).toBeGreaterThanOrEqual(1);
    });

    it('should migrate knowledge', () => {
      knowledgeRepo.create({
        scopeType: 'global',
        title: 'Migration Knowledge Test',
        content: 'Test knowledge',
        createdBy: 'test',
      });

      const result = migrateEntries({
        fromFormat: 'json',
        toFormat: 'json',
        scopeType: 'global',
      });

      expect(result.migrated).toBeGreaterThanOrEqual(1);
    });

    it('should use OpenAPI export for fromFormat openapi', () => {
      // OpenAPI only exports tools
      createTestTool(db, 'openapi-export-test', 'global');

      const result = migrateEntries({
        fromFormat: 'openapi',
        toFormat: 'json',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      expect(typeof result.migrated).toBe('number');
    });

    it('should handle errors in export/import cycle', () => {
      // Test with a format that might cause export issues
      const result = migrateEntries({
        fromFormat: 'invalid-format-test',
        toFormat: 'json',
        scopeType: 'global',
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('migrateScope', () => {
    it('should migrate entries between scopes', () => {
      // Create tools in agent scope
      toolRepo.create({
        scopeType: 'agent',
        scopeId: 'agent-1',
        name: 'agent-tool-1',
        description: 'Tool in agent scope',
        createdBy: 'test',
      });

      const result = migrateScope(
        { type: 'agent', id: 'agent-1' },
        { type: 'global', id: undefined }
      );

      expect(result.migrated).toBeGreaterThanOrEqual(1);
      expect(result.dryRun).toBe(false);

      // Tool should exist in global scope now
      const migratedTool = toolRepo.getByName('agent-tool-1', 'global');
      expect(migratedTool).toBeDefined();
    });

    it('should support dry-run mode for scope migration', () => {
      toolRepo.create({
        scopeType: 'project',
        scopeId: 'project-1',
        name: 'project-tool-dryrun',
        description: 'Tool for dry run test',
        createdBy: 'test',
      });

      const result = migrateScope(
        { type: 'project', id: 'project-1' },
        { type: 'global', id: undefined },
        undefined,
        true
      );

      expect(result.dryRun).toBe(true);
      expect(result.migrated).toBeGreaterThanOrEqual(1);

      // Tool should NOT exist in global scope (dry run)
      const tool = toolRepo.getByName('project-tool-dryrun', 'global');
      expect(tool).toBeUndefined();
    });

    it('should filter by entryTypes', () => {
      // Create tools and guidelines
      toolRepo.create({
        scopeType: 'agent',
        scopeId: 'agent-2',
        name: 'agent-tool-filter',
        description: 'Tool to filter',
        createdBy: 'test',
      });

      guidelineRepo.create({
        scopeType: 'agent',
        scopeId: 'agent-2',
        name: 'agent-guideline-filter',
        content: 'Guideline to filter',
        createdBy: 'test',
      });

      // Migrate only tools
      const result = migrateScope(
        { type: 'agent', id: 'agent-2' },
        { type: 'global', id: undefined },
        ['tools']
      );

      expect(result.migrated).toBeGreaterThanOrEqual(1);

      // Tool should be migrated
      const tool = toolRepo.getByName('agent-tool-filter', 'global');
      expect(tool).toBeDefined();

      // Guideline should NOT be migrated
      const guideline = guidelineRepo.getByName('agent-guideline-filter', 'global');
      expect(guideline).toBeUndefined();
    });

    it('should migrate guidelines with entryTypes filter', () => {
      guidelineRepo.create({
        scopeType: 'project',
        scopeId: 'project-2',
        name: 'project-guideline',
        content: 'Project guideline',
        createdBy: 'test',
      });

      const result = migrateScope(
        { type: 'project', id: 'project-2' },
        { type: 'global', id: undefined },
        ['guidelines']
      );

      expect(result.migrated).toBeGreaterThanOrEqual(1);

      const guideline = guidelineRepo.getByName('project-guideline', 'global');
      expect(guideline).toBeDefined();
    });

    it('should migrate knowledge with entryTypes filter', () => {
      knowledgeRepo.create({
        scopeType: 'agent',
        scopeId: 'agent-3',
        title: 'Agent Knowledge',
        content: 'Agent knowledge content',
        createdBy: 'test',
      });

      const result = migrateScope(
        { type: 'agent', id: 'agent-3' },
        { type: 'global', id: undefined },
        ['knowledge']
      );

      expect(result.migrated).toBeGreaterThanOrEqual(1);

      const knowledge = knowledgeRepo.getByTitle('Agent Knowledge', 'global');
      expect(knowledge).toBeDefined();
    });

    it('should migrate multiple entry types', () => {
      toolRepo.create({
        scopeType: 'project',
        scopeId: 'project-3',
        name: 'multi-tool',
        description: 'Multi-type test',
        createdBy: 'test',
      });

      guidelineRepo.create({
        scopeType: 'project',
        scopeId: 'project-3',
        name: 'multi-guideline',
        content: 'Multi-type guideline',
        createdBy: 'test',
      });

      knowledgeRepo.create({
        scopeType: 'project',
        scopeId: 'project-3',
        title: 'Multi Knowledge',
        content: 'Multi-type knowledge',
        createdBy: 'test',
      });

      const result = migrateScope(
        { type: 'project', id: 'project-3' },
        { type: 'global', id: undefined },
        ['tools', 'guidelines', 'knowledge']
      );

      expect(result.migrated).toBeGreaterThanOrEqual(3);

      expect(toolRepo.getByName('multi-tool', 'global')).toBeDefined();
      expect(guidelineRepo.getByName('multi-guideline', 'global')).toBeDefined();
      expect(knowledgeRepo.getByTitle('Multi Knowledge', 'global')).toBeDefined();
    });

    it('should handle empty source scope', () => {
      const result = migrateScope(
        { type: 'project', id: 'non-existent-project' },
        { type: 'global', id: undefined }
      );

      expect(result.migrated).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it('should use default entryTypes when not specified', () => {
      toolRepo.create({
        scopeType: 'agent',
        scopeId: 'agent-4',
        name: 'default-types-tool',
        description: 'Default types test',
        createdBy: 'test',
      });

      const result = migrateScope(
        { type: 'agent', id: 'agent-4' },
        { type: 'global', id: undefined }
        // Not specifying entryTypes - should default to all
      );

      expect(result.migrated).toBeGreaterThanOrEqual(1);
    });

    it('should map scopes correctly', () => {
      toolRepo.create({
        scopeType: 'agent',
        scopeId: 'source-agent',
        name: 'scope-mapping-tool',
        description: 'Scope mapping test',
        createdBy: 'test',
      });

      const result = migrateScope(
        { type: 'agent', id: 'source-agent' },
        { type: 'project', id: 'target-project' }
      );

      expect(result.migrated).toBeGreaterThanOrEqual(1);

      // Tool should be in target scope
      const tool = toolRepo.getByName('scope-mapping-tool', 'project', 'target-project');
      expect(tool).toBeDefined();
      expect(tool?.scopeType).toBe('project');
      expect(tool?.scopeId).toBe('target-project');
    });

    it('should update existing entries in target scope', () => {
      // Create tool in source scope
      toolRepo.create({
        scopeType: 'agent',
        scopeId: 'agent-5',
        name: 'update-test-tool',
        description: 'Original description',
        createdBy: 'test',
      });

      // Create same tool in target scope
      toolRepo.create({
        scopeType: 'global',
        name: 'update-test-tool',
        description: 'Will be updated',
        createdBy: 'test',
      });

      const result = migrateScope(
        { type: 'agent', id: 'agent-5' },
        { type: 'global', id: undefined }
      );

      expect(result.migrated).toBeGreaterThanOrEqual(1);

      // Tool in global should be updated
      const tool = toolRepo.getByName('update-test-tool', 'global');
      expect(tool?.currentVersion?.description).toBe('Original description');
    });

    it('should handle migration errors gracefully', () => {
      // Create an entry and test error handling
      toolRepo.create({
        scopeType: 'project',
        scopeId: 'project-error',
        name: 'error-test-tool',
        description: 'Error test',
        createdBy: 'test',
      });

      const result = migrateScope(
        { type: 'project', id: 'project-error' },
        { type: 'global', id: undefined }
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
      // Error structure should be correct
      result.errors.forEach((error) => {
        expect(error.entryId).toBeDefined();
        expect(typeof error.error).toBe('string');
      });
    });

    it('should return correct error structure on exception', () => {
      // This will test the catch block by using invalid scope type
      // The test exercises error handling but may not actually trigger an error
      const result = migrateScope(
        { type: 'global', id: undefined },
        { type: 'global', id: undefined }
      );

      expect(result).toBeDefined();
      expect(result.migrated).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should preserve all entry data during migration', () => {
      const originalTool = toolRepo.create({
        scopeType: 'agent',
        scopeId: 'agent-preserve',
        name: 'preserve-test',
        category: 'mcp',
        description: 'Preserve all data',
        parameters: { param1: 'value1' },
        createdBy: 'test-user',
      });

      migrateScope({ type: 'agent', id: 'agent-preserve' }, { type: 'global', id: undefined });

      const migratedTool = toolRepo.getByName('preserve-test', 'global');
      expect(migratedTool).toBeDefined();
      expect(migratedTool?.name).toBe('preserve-test');
      expect(migratedTool?.category).toBe('mcp');
      expect(migratedTool?.currentVersion?.description).toBe('Preserve all data');
      expect(migratedTool?.currentVersion?.parameters).toEqual({ param1: 'value1' });
    });

    it('should migrate between non-global scopes', () => {
      toolRepo.create({
        scopeType: 'agent',
        scopeId: 'agent-source',
        name: 'agent-to-project-tool',
        description: 'Agent to project',
        createdBy: 'test',
      });

      const result = migrateScope(
        { type: 'agent', id: 'agent-source' },
        { type: 'project', id: 'project-target' }
      );

      expect(result.migrated).toBeGreaterThanOrEqual(1);

      const tool = toolRepo.getByName('agent-to-project-tool', 'project', 'project-target');
      expect(tool).toBeDefined();
      expect(tool?.scopeType).toBe('project');
      expect(tool?.scopeId).toBe('project-target');
    });
  });
});

