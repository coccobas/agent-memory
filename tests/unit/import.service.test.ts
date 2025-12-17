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
  importFromOpenAPI,
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

  describe('importFromJson - additional scenarios', () => {
    it('should handle error conflict strategy for tools', () => {
      toolRepo.create({
        scopeType: 'global',
        name: 'error-conflict-tool',
        description: 'Original',
        createdBy: 'test',
      });

      const jsonContent = JSON.stringify({
        entries: {
          tools: [
            {
              scopeType: 'global',
              name: 'error-conflict-tool',
              currentVersion: {
                description: 'Should cause error',
              },
            },
          ],
        },
      });

      const result = importFromJson(jsonContent, {
        conflictStrategy: 'error',
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('already exists');
    });

    it('should handle replace conflict strategy for tools', () => {
      const existing = toolRepo.create({
        scopeType: 'global',
        name: 'replace-tool',
        description: 'Original',
        createdBy: 'test',
      });

      const jsonContent = JSON.stringify({
        entries: {
          tools: [
            {
              scopeType: 'global',
              name: 'replace-tool',
              currentVersion: {
                description: 'Replaced description',
              },
            },
          ],
        },
      });

      const result = importFromJson(jsonContent, {
        conflictStrategy: 'replace',
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);

      const tool = toolRepo.getById(existing.id);
      expect(tool?.currentVersion?.description).toBe('Replaced description');
    });

    it('should apply scope mapping', () => {
      const jsonContent = JSON.stringify({
        entries: {
          tools: [
            {
              scopeType: 'agent',
              scopeId: 'agent-123',
              name: 'scoped-tool',
              currentVersion: {
                description: 'Tool with scope mapping',
              },
            },
          ],
        },
      });

      const result = importFromJson(jsonContent, {
        scopeMapping: {
          'agent:agent-123': { type: 'global', id: undefined },
        },
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      // Tool should be created with global scope instead
      const tool = toolRepo.getByName('scoped-tool', 'global');
      expect(tool).toBeDefined();
    });

    it('should handle missing guideline name', () => {
      const jsonContent = JSON.stringify({
        entries: {
          guidelines: [
            {
              scopeType: 'global',
              // Missing name
              currentVersion: {
                content: 'Guideline without name',
              },
            },
          ],
        },
      });

      const result = importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('name is required');
    });

    it('should handle missing guideline content', () => {
      const jsonContent = JSON.stringify({
        entries: {
          guidelines: [
            {
              scopeType: 'global',
              name: 'guideline-no-content',
              currentVersion: {
                // Missing content
                rationale: 'Has rationale but no content',
              },
            },
          ],
        },
      });

      const result = importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('content is required');
    });

    it('should handle guideline conflict strategies', () => {
      guidelineRepo.create({
        scopeType: 'global',
        name: 'conflict-guideline',
        content: 'Original content',
        createdBy: 'test',
      });

      const jsonContent = JSON.stringify({
        entries: {
          guidelines: [
            {
              scopeType: 'global',
              name: 'conflict-guideline',
              currentVersion: {
                content: 'Updated content',
              },
            },
          ],
        },
      });

      // Test skip
      const skipResult = importFromJson(jsonContent, { conflictStrategy: 'skip' });
      expect(skipResult.skipped).toBe(1);
      expect(skipResult.details.guidelines.skipped).toBe(1);

      // Test error
      const errorResult = importFromJson(jsonContent, { conflictStrategy: 'error' });
      expect(errorResult.errors.length).toBeGreaterThan(0);
      expect(errorResult.errors[0].error).toContain('already exists');

      // Test update
      const updateResult = importFromJson(jsonContent, { conflictStrategy: 'update' });
      expect(updateResult.updated).toBe(1);
      expect(updateResult.details.guidelines.updated).toBe(1);
    });

    it('should attach tags when updating guidelines', () => {
      const existing = guidelineRepo.create({
        scopeType: 'global',
        name: 'guideline-with-tags',
        content: 'Original',
        createdBy: 'test',
      });

      const jsonContent = JSON.stringify({
        entries: {
          guidelines: [
            {
              scopeType: 'global',
              name: 'guideline-with-tags',
              currentVersion: {
                content: 'Updated',
              },
              tags: ['updated', 'imported'],
            },
          ],
        },
      });

      const result = importFromJson(jsonContent, { conflictStrategy: 'update' });

      expect(result.updated).toBe(1);

      const tags = entryTagRepo.getTagsForEntry('guideline', existing.id);
      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain('updated');
      expect(tagNames).toContain('imported');
    });

    it('should handle missing knowledge title', () => {
      const jsonContent = JSON.stringify({
        entries: {
          knowledge: [
            {
              scopeType: 'global',
              // Missing title
              currentVersion: {
                content: 'Knowledge without title',
              },
            },
          ],
        },
      });

      const result = importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('title is required');
    });

    it('should handle missing knowledge content', () => {
      const jsonContent = JSON.stringify({
        entries: {
          knowledge: [
            {
              scopeType: 'global',
              title: 'Knowledge without content',
              currentVersion: {
                // Missing content
                source: 'test',
              },
            },
          ],
        },
      });

      const result = importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('content is required');
    });

    it('should handle knowledge conflict strategies', () => {
      knowledgeRepo.create({
        scopeType: 'global',
        title: 'Conflict Knowledge',
        content: 'Original content',
        createdBy: 'test',
      });

      const jsonContent = JSON.stringify({
        entries: {
          knowledge: [
            {
              scopeType: 'global',
              title: 'Conflict Knowledge',
              currentVersion: {
                content: 'Updated content',
              },
            },
          ],
        },
      });

      // Test skip
      const skipResult = importFromJson(jsonContent, { conflictStrategy: 'skip' });
      expect(skipResult.skipped).toBe(1);
      expect(skipResult.details.knowledge.skipped).toBe(1);

      // Test error
      const errorResult = importFromJson(jsonContent, { conflictStrategy: 'error' });
      expect(errorResult.errors.length).toBeGreaterThan(0);
      expect(errorResult.errors[0].error).toContain('already exists');

      // Test update
      const updateResult = importFromJson(jsonContent, { conflictStrategy: 'update' });
      expect(updateResult.updated).toBe(1);
      expect(updateResult.details.knowledge.updated).toBe(1);
    });

    it('should attach tags when updating knowledge', () => {
      const existing = knowledgeRepo.create({
        scopeType: 'global',
        title: 'Knowledge with tags',
        content: 'Original',
        createdBy: 'test',
      });

      const jsonContent = JSON.stringify({
        entries: {
          knowledge: [
            {
              scopeType: 'global',
              title: 'Knowledge with tags',
              currentVersion: {
                content: 'Updated',
              },
              tags: ['updated', 'imported'],
            },
          ],
        },
      });

      const result = importFromJson(jsonContent, { conflictStrategy: 'update' });

      expect(result.updated).toBe(1);

      const tags = entryTagRepo.getTagsForEntry('knowledge', existing.id);
      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain('updated');
      expect(tagNames).toContain('imported');
    });

    it('should handle errors in tool creation gracefully', () => {
      const jsonContent = JSON.stringify({
        entries: {
          tools: [
            {
              scopeType: 'global',
              name: 'error-tool',
              category: 'invalid-category', // This will cause type issues
              currentVersion: {
                description: 'Tool that may error',
              },
            },
          ],
        },
      });

      // Should not throw, just record error
      const result = importFromJson(jsonContent);

      expect(result.success).toBe(true);
      // May succeed or error depending on validation
    });

    it('should use importedBy option', () => {
      const jsonContent = JSON.stringify({
        entries: {
          tools: [
            {
              scopeType: 'global',
              name: 'tool-with-creator',
              currentVersion: {
                description: 'Tool with creator',
              },
            },
          ],
        },
      });

      const result = importFromJson(jsonContent, {
        importedBy: 'import-service-test',
      });

      expect(result.created).toBe(1);

      const tool = toolRepo.getByName('tool-with-creator', 'global');
      expect(tool?.createdBy).toBe('import-service-test');
    });
  });

  describe('importFromOpenAPI', () => {
    it('should import tools from OpenAPI spec', () => {
      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              summary: 'Create a new user',
              description: 'Creates a new user in the system',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: {
                          type: 'string',
                          description: 'User name',
                        },
                        email: {
                          type: 'string',
                          description: 'User email',
                        },
                      },
                      required: ['email'],
                    },
                  },
                },
              },
              tags: ['users', 'create'],
            },
          },
        },
      });

      const result = importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
      expect(result.details.tools.created).toBe(1);

      const tool = toolRepo.getByName('createUser', 'global');
      expect(tool).toBeDefined();
      expect(tool?.currentVersion?.description).toContain('Creates a new user');
      expect(tool?.category).toBe('api');

      // Verify parameters
      const params = tool?.currentVersion?.parameters as Record<string, unknown>;
      expect(params).toBeDefined();
      expect(params.name).toBeDefined();
      expect(params.email).toBeDefined();

      // Verify tags
      const tags = entryTagRepo.getTagsForEntry('tool', tool!.id);
      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain('users');
      expect(tagNames).toContain('create');
    });

    it('should handle OpenAPI with parameters array', () => {
      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/items/{id}': {
            get: {
              operationId: 'getItem',
              summary: 'Get item by ID',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: {
                    type: 'string',
                    description: 'Item ID',
                  },
                },
                {
                  name: 'include',
                  in: 'query',
                  required: false,
                  schema: {
                    type: 'string',
                    description: 'Fields to include',
                  },
                },
              ],
            },
          },
        },
      });

      const result = importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      const tool = toolRepo.getByName('getItem', 'global');
      expect(tool).toBeDefined();

      const params = tool?.currentVersion?.parameters as Record<string, unknown>;
      expect(params).toBeDefined();
      expect(params.id).toBeDefined();
      expect(params.include).toBeDefined();
    });

    it('should handle OpenAPI without operationId', () => {
      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/api/test/endpoint': {
            post: {
              // No operationId
              summary: 'Test endpoint summary',
              description: 'Test endpoint',
            },
          },
        },
      });

      const result = importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      // Should use summary as tool name
      const tool = toolRepo.getByName('Test endpoint summary', 'global');
      expect(tool).toBeDefined();
    });

    it('should handle OpenAPI without operationId or summary', () => {
      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/api/fallback': {
            get: {
              // No operationId or summary
              description: 'Just a description',
            },
          },
        },
      });

      const result = importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      // Should use path as tool name
      const tool = toolRepo.getByName('api_fallback', 'global');
      expect(tool).toBeDefined();
    });

    it('should handle invalid OpenAPI JSON', () => {
      const result = importFromOpenAPI('invalid json');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].entry).toBe('parsing');
    });

    it('should handle missing paths in OpenAPI', () => {
      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        info: {
          title: 'Test API',
        },
        // Missing paths
      });

      const result = importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toContain('Missing paths');
    });

    it('should handle OpenAPI update conflict', () => {
      toolRepo.create({
        scopeType: 'global',
        name: 'updateOperation',
        category: 'api',
        description: 'Original description',
        createdBy: 'test',
      });

      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/update': {
            put: {
              operationId: 'updateOperation',
              description: 'Updated description',
            },
          },
        },
      });

      const result = importFromOpenAPI(openApiSpec, {
        conflictStrategy: 'update',
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);
      expect(result.details.tools.updated).toBe(1);

      const tool = toolRepo.getByName('updateOperation', 'global');
      expect(tool?.currentVersion?.description).toBe('Updated description');
    });

    it('should handle OpenAPI skip conflict', () => {
      toolRepo.create({
        scopeType: 'global',
        name: 'skipOperation',
        category: 'api',
        description: 'Original',
        createdBy: 'test',
      });

      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/skip': {
            get: {
              operationId: 'skipOperation',
              description: 'Should be skipped',
            },
          },
        },
      });

      const result = importFromOpenAPI(openApiSpec, {
        conflictStrategy: 'skip',
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(1);
      expect(result.details.tools.skipped).toBe(1);

      const tool = toolRepo.getByName('skipOperation', 'global');
      expect(tool?.currentVersion?.description).toBe('Original');
    });

    it('should handle OpenAPI error conflict', () => {
      toolRepo.create({
        scopeType: 'global',
        name: 'errorOperation',
        category: 'api',
        description: 'Original',
        createdBy: 'test',
      });

      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/error': {
            delete: {
              operationId: 'errorOperation',
              description: 'Should cause error',
            },
          },
        },
      });

      const result = importFromOpenAPI(openApiSpec, {
        conflictStrategy: 'error',
      });

      expect(result.success).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('already exists');
    });

    it('should handle OpenAPI replace conflict', () => {
      const existing = toolRepo.create({
        scopeType: 'global',
        name: 'replaceOperation',
        category: 'api',
        description: 'Original',
        createdBy: 'test',
      });

      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/replace': {
            patch: {
              operationId: 'replaceOperation',
              description: 'Replaced description',
            },
          },
        },
      });

      const result = importFromOpenAPI(openApiSpec, {
        conflictStrategy: 'replace',
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);

      const tool = toolRepo.getById(existing.id);
      expect(tool?.currentVersion?.description).toBe('Replaced description');
    });

    it('should attach tags when updating OpenAPI tools', () => {
      const existing = toolRepo.create({
        scopeType: 'global',
        name: 'taggedOperation',
        category: 'api',
        description: 'Original',
        createdBy: 'test',
      });

      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/tagged': {
            post: {
              operationId: 'taggedOperation',
              description: 'Updated',
              tags: ['v2', 'authenticated'],
            },
          },
        },
      });

      const result = importFromOpenAPI(openApiSpec, {
        conflictStrategy: 'update',
      });

      expect(result.updated).toBe(1);

      const tags = entryTagRepo.getTagsForEntry('tool', existing.id);
      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain('v2');
      expect(tagNames).toContain('authenticated');
    });

    it('should handle OpenAPI with default parameter values', () => {
      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/defaults': {
            get: {
              operationId: 'getWithDefaults',
              summary: 'Get with default params',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        limit: {
                          type: 'number',
                          description: 'Result limit',
                          default: 10,
                        },
                        offset: {
                          type: 'number',
                          description: 'Result offset',
                          default: 0,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const result = importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      const tool = toolRepo.getByName('getWithDefaults', 'global');
      const params = tool?.currentVersion?.parameters as Record<string, any>;
      expect(params.limit.default).toBe(10);
      expect(params.offset.default).toBe(0);
    });

    it('should handle multiple operations in single path', () => {
      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/multi': {
            get: {
              operationId: 'getMulti',
              description: 'Get operation',
            },
            post: {
              operationId: 'createMulti',
              description: 'Create operation',
            },
            put: {
              operationId: 'updateMulti',
              description: 'Update operation',
            },
            delete: {
              operationId: 'deleteMulti',
              description: 'Delete operation',
            },
          },
        },
      });

      const result = importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(4);

      expect(toolRepo.getByName('getMulti', 'global')).toBeDefined();
      expect(toolRepo.getByName('createMulti', 'global')).toBeDefined();
      expect(toolRepo.getByName('updateMulti', 'global')).toBeDefined();
      expect(toolRepo.getByName('deleteMulti', 'global')).toBeDefined();
    });

    it('should handle OpenAPI with importedBy option', () => {
      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/created-by': {
            get: {
              operationId: 'testCreatedBy',
              description: 'Test created by',
            },
          },
        },
      });

      const result = importFromOpenAPI(openApiSpec, {
        importedBy: 'openapi-importer',
      });

      expect(result.created).toBe(1);

      const tool = toolRepo.getByName('testCreatedBy', 'global');
      expect(tool?.createdBy).toBe('openapi-importer');
    });

    it('should handle empty paths object', () => {
      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {},
      });

      const result = importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
    });

    it('should skip non-object path items', () => {
      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/normal': {
            get: {
              operationId: 'normalOp',
              description: 'Normal operation',
            },
          },
          '/invalid': 'string-value', // Invalid path item
        },
      });

      const result = importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1); // Only normal operation
    });

    it('should skip non-object operations', () => {
      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/test': {
            get: {
              operationId: 'validGet',
              description: 'Valid',
            },
            invalidMethod: 'not-an-object',
          },
        },
      });

      const result = importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
    });
  });
});


