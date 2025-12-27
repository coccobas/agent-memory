/**
 * Unit tests for import service
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestRepositories } from '../fixtures/test-helpers.js';
import type { Repositories } from '../../src/core/interfaces/repositories.js';
import { createImportService, type ImportService } from '../../src/services/import.service.js';

const TEST_DB_PATH = './data/test-import.db';

let testDb: ReturnType<typeof setupTestDb>;
let repos: Repositories;
let importService: ImportService;

describe('Import Service', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    repos = createTestRepositories(testDb);
    importService = createImportService({
      toolRepo: repos.tools,
      guidelineRepo: repos.guidelines,
      knowledgeRepo: repos.knowledge,
      tagRepo: repos.tags,
      entryTagRepo: repos.entryTags,
    });
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('importFromJson', () => {
    describe('Entry limit validation', () => {
      it('should reject import when total entries exceed limit', async () => {
        // Set a low limit for testing
        const originalEnv = process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES;
        process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES = '5';

        // Create an import service with the new limit
        const testImportService = createImportService({
          toolRepo: repos.tools,
          guidelineRepo: repos.guidelines,
          knowledgeRepo: repos.knowledge,
          tagRepo: repos.tags,
          entryTagRepo: repos.entryTags,
        });

        const jsonContent = JSON.stringify({
          version: '1.0',
          entries: {
            tools: [
              { scopeType: 'global', name: 'tool-1', currentVersion: { description: 'Tool 1' } },
              { scopeType: 'global', name: 'tool-2', currentVersion: { description: 'Tool 2' } },
            ],
            guidelines: [
              {
                scopeType: 'global',
                name: 'guideline-1',
                currentVersion: { content: 'Content 1' },
              },
              {
                scopeType: 'global',
                name: 'guideline-2',
                currentVersion: { content: 'Content 2' },
              },
            ],
            knowledge: [
              {
                scopeType: 'global',
                title: 'knowledge-1',
                currentVersion: { content: 'Knowledge 1' },
              },
              {
                scopeType: 'global',
                title: 'knowledge-2',
                currentVersion: { content: 'Knowledge 2' },
              },
            ],
          },
        });

        const result = await testImportService.importFromJson(jsonContent);

        expect(result.success).toBe(false);
        expect(result.created).toBe(0);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].entry).toBe('import');
        expect(result.errors[0].error).toContain('exceeds maximum entry limit');
        expect(result.errors[0].error).toContain('5');
        expect(result.errors[0].error).toContain('6');

        // Restore original env
        if (originalEnv === undefined) {
          delete process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES;
        } else {
          process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES = originalEnv;
        }
      });

      it('should allow import when under the limit', async () => {
        const originalEnv = process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES;
        process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES = '10';

        const testImportService = createImportService({
          toolRepo: repos.tools,
          guidelineRepo: repos.guidelines,
          knowledgeRepo: repos.knowledge,
          tagRepo: repos.tags,
          entryTagRepo: repos.entryTags,
        });

        const jsonContent = JSON.stringify({
          version: '1.0',
          entries: {
            tools: [
              { scopeType: 'global', name: 'under-limit-1', currentVersion: { description: 'T1' } },
              { scopeType: 'global', name: 'under-limit-2', currentVersion: { description: 'T2' } },
            ],
          },
        });

        const result = await testImportService.importFromJson(jsonContent);

        expect(result.success).toBe(true);
        expect(result.created).toBe(2);

        // Restore original env
        if (originalEnv === undefined) {
          delete process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES;
        } else {
          process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES = originalEnv;
        }
      });

      it('should use default limit of 10000 when env var not set', async () => {
        const originalEnv = process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES;
        delete process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES;

        const testImportService = createImportService({
          toolRepo: repos.tools,
          guidelineRepo: repos.guidelines,
          knowledgeRepo: repos.knowledge,
          tagRepo: repos.tags,
          entryTagRepo: repos.entryTags,
        });

        // Create a small import (well under default)
        const jsonContent = JSON.stringify({
          version: '1.0',
          entries: {
            tools: [
              { scopeType: 'global', name: 'default-limit', currentVersion: { description: 'Test' } },
            ],
          },
        });

        const result = await testImportService.importFromJson(jsonContent);

        expect(result.success).toBe(true);

        // Restore original env
        if (originalEnv === undefined) {
          delete process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES;
        } else {
          process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES = originalEnv;
        }
      });
    });

    it('should import new tools', async () => {
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

      const result = await importService.importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
      expect(result.details.tools.created).toBe(1);

      // Verify tool was created
      const tool = await repos.tools.getByName('import-test-tool', 'global');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('import-test-tool');

      // Verify tags were attached
      const tags = await repos.entryTags.getTagsForEntry('tool', tool!.id);
      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain('test');
      expect(tagNames).toContain('import');
    });

    it('should update existing tools when conflictStrategy is update', async () => {
      // Create existing tool
      const existing = await repos.tools.create({
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

      const result = await importService.importFromJson(jsonContent, {
        conflictStrategy: 'update',
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);

      // Verify tool was updated
      const tool = await repos.tools.getById(existing.id);
      expect(tool?.currentVersion?.description).toBe('Updated description');
    });

    it('should skip existing tools when conflictStrategy is skip', async () => {
      await repos.tools.create({
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

      const result = await importService.importFromJson(jsonContent, {
        conflictStrategy: 'skip',
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(1);
      expect(result.updated).toBe(0);

      // Verify tool was not updated
      const tool = await repos.tools.getByName('skip-tool', 'global');
      expect(tool?.currentVersion?.description).toBe('Original');
    });

    it('should import guidelines with all fields', async () => {
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

      const result = await importService.importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      const guideline = await repos.guidelines.getByName('import-guideline', 'global');
      expect(guideline?.priority).toBe(90);
      expect(guideline?.currentVersion?.content).toBe('Always use const');
    });

    it('should import knowledge entries', async () => {
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

      const result = await importService.importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      const knowledge = await repos.knowledge.getByTitle('Import Knowledge', 'global');
      expect(knowledge?.currentVersion?.content).toBe('This is imported knowledge');
    });

    it('should handle invalid JSON', async () => {
      const result = await importService.importFromJson('invalid json content');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].entry).toBe('parsing');
    });

    it('should handle missing entries object', async () => {
      const jsonContent = JSON.stringify({
        version: '1.0',
        // Missing entries
      });

      const result = await importService.importFromJson(jsonContent);

      expect(result.success).toBe(false);
      expect(result.errors[0].entry).toBe('structure');
    });

    it('should handle missing required fields', async () => {
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

      const result = await importService.importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('importFromYaml', () => {
    it('should return error for YAML import', async () => {
      const result = await importService.importFromYaml('some: yaml\ncontent: here');

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toContain('YAML import not fully implemented');
    });
  });

  describe('importFromMarkdown', () => {
    it('should return error for Markdown import', async () => {
      const result = await importService.importFromMarkdown('# Markdown\n\nSome content');

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toContain('Markdown import not supported');
    });
  });

  describe('importFromJson - additional scenarios', () => {
    it('should handle error conflict strategy for tools', async () => {
      await repos.tools.create({
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

      const result = await importService.importFromJson(jsonContent, {
        conflictStrategy: 'error',
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('already exists');
    });

    it('should handle replace conflict strategy for tools', async () => {
      const existing = await repos.tools.create({
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

      const result = await importService.importFromJson(jsonContent, {
        conflictStrategy: 'replace',
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);

      const tool = await repos.tools.getById(existing.id);
      expect(tool?.currentVersion?.description).toBe('Replaced description');
    });

    it('should apply scope mapping', async () => {
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

      const result = await importService.importFromJson(jsonContent, {
        scopeMapping: {
          'agent:agent-123': { type: 'global', id: undefined },
        },
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      // Tool should be created with global scope instead
      const tool = await repos.tools.getByName('scoped-tool', 'global');
      expect(tool).toBeDefined();
    });

    it('should handle missing guideline name', async () => {
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

      const result = await importService.importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('name is required');
    });

    it('should handle missing guideline content', async () => {
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

      const result = await importService.importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('content is required');
    });

    it('should handle guideline conflict strategies', async () => {
      await repos.guidelines.create({
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
      const skipResult = await importService.importFromJson(jsonContent, {
        conflictStrategy: 'skip',
      });
      expect(skipResult.skipped).toBe(1);
      expect(skipResult.details.guidelines.skipped).toBe(1);

      // Test error
      const errorResult = await importService.importFromJson(jsonContent, {
        conflictStrategy: 'error',
      });
      expect(errorResult.errors.length).toBeGreaterThan(0);
      expect(errorResult.errors[0].error).toContain('already exists');

      // Test update
      const updateResult = await importService.importFromJson(jsonContent, {
        conflictStrategy: 'update',
      });
      expect(updateResult.updated).toBe(1);
      expect(updateResult.details.guidelines.updated).toBe(1);
    });

    it('should attach tags when updating guidelines', async () => {
      const existing = await repos.guidelines.create({
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

      const result = await importService.importFromJson(jsonContent, {
        conflictStrategy: 'update',
      });

      expect(result.updated).toBe(1);

      const tags = await repos.entryTags.getTagsForEntry('guideline', existing.id);
      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain('updated');
      expect(tagNames).toContain('imported');
    });

    it('should handle missing knowledge title', async () => {
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

      const result = await importService.importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('title is required');
    });

    it('should handle missing knowledge content', async () => {
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

      const result = await importService.importFromJson(jsonContent);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('content is required');
    });

    it('should handle knowledge conflict strategies', async () => {
      await repos.knowledge.create({
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
      const skipResult = await importService.importFromJson(jsonContent, {
        conflictStrategy: 'skip',
      });
      expect(skipResult.skipped).toBe(1);
      expect(skipResult.details.knowledge.skipped).toBe(1);

      // Test error
      const errorResult = await importService.importFromJson(jsonContent, {
        conflictStrategy: 'error',
      });
      expect(errorResult.errors.length).toBeGreaterThan(0);
      expect(errorResult.errors[0].error).toContain('already exists');

      // Test update
      const updateResult = await importService.importFromJson(jsonContent, {
        conflictStrategy: 'update',
      });
      expect(updateResult.updated).toBe(1);
      expect(updateResult.details.knowledge.updated).toBe(1);
    });

    it('should attach tags when updating knowledge', async () => {
      const existing = await repos.knowledge.create({
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

      const result = await importService.importFromJson(jsonContent, {
        conflictStrategy: 'update',
      });

      expect(result.updated).toBe(1);

      const tags = await repos.entryTags.getTagsForEntry('knowledge', existing.id);
      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain('updated');
      expect(tagNames).toContain('imported');
    });

    it('should handle errors in tool creation gracefully', async () => {
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
      const result = await importService.importFromJson(jsonContent);

      expect(result.success).toBe(true);
      // May succeed or error depending on validation
    });

    it('should use importedBy option', async () => {
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

      const result = await importService.importFromJson(jsonContent, {
        importedBy: 'import-service-test',
      });

      expect(result.created).toBe(1);

      const tool = await repos.tools.getByName('tool-with-creator', 'global');
      expect(tool?.createdBy).toBe('import-service-test');
    });
  });

  describe('importFromOpenAPI', () => {
    describe('Entry limit validation', () => {
      it('should reject OpenAPI import when operations exceed limit', async () => {
        const originalEnv = process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES;
        process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES = '3';

        const testImportService = createImportService({
          toolRepo: repos.tools,
          guidelineRepo: repos.guidelines,
          knowledgeRepo: repos.knowledge,
          tagRepo: repos.tags,
          entryTagRepo: repos.entryTags,
        });

        const openApiSpec = JSON.stringify({
          openapi: '3.0.0',
          paths: {
            '/users': {
              get: { operationId: 'getUsers', description: 'Get users' },
              post: { operationId: 'createUser', description: 'Create user' },
            },
            '/posts': {
              get: { operationId: 'getPosts', description: 'Get posts' },
              post: { operationId: 'createPost', description: 'Create post' },
            },
          },
        });

        const result = await testImportService.importFromOpenAPI(openApiSpec);

        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].entry).toBe('import');
        expect(result.errors[0].error).toContain('exceeds maximum entry limit');
        expect(result.errors[0].error).toContain('3');
        expect(result.errors[0].error).toContain('4');

        // Restore original env
        if (originalEnv === undefined) {
          delete process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES;
        } else {
          process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES = originalEnv;
        }
      });

      it('should allow OpenAPI import when under limit', async () => {
        const originalEnv = process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES;
        process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES = '5';

        const testImportService = createImportService({
          toolRepo: repos.tools,
          guidelineRepo: repos.guidelines,
          knowledgeRepo: repos.knowledge,
          tagRepo: repos.tags,
          entryTagRepo: repos.entryTags,
        });

        const openApiSpec = JSON.stringify({
          openapi: '3.0.0',
          paths: {
            '/test': {
              get: { operationId: 'getTest', description: 'Get test' },
            },
          },
        });

        const result = await testImportService.importFromOpenAPI(openApiSpec);

        expect(result.success).toBe(true);
        expect(result.created).toBe(1);

        // Restore original env
        if (originalEnv === undefined) {
          delete process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES;
        } else {
          process.env.AGENT_MEMORY_MAX_IMPORT_ENTRIES = originalEnv;
        }
      });
    });

    it('should import tools from OpenAPI spec', async () => {
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

      const result = await importService.importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
      expect(result.details.tools.created).toBe(1);

      const tool = await repos.tools.getByName('createUser', 'global');
      expect(tool).toBeDefined();
      expect(tool?.currentVersion?.description).toContain('Creates a new user');
      expect(tool?.category).toBe('api');

      // Verify parameters
      const params = tool?.currentVersion?.parameters as Record<string, unknown>;
      expect(params).toBeDefined();
      expect(params.name).toBeDefined();
      expect(params.email).toBeDefined();

      // Verify tags
      const tags = await repos.entryTags.getTagsForEntry('tool', tool!.id);
      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain('users');
      expect(tagNames).toContain('create');
    });

    it('should handle OpenAPI with parameters array', async () => {
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

      const result = await importService.importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      const tool = await repos.tools.getByName('getItem', 'global');
      expect(tool).toBeDefined();

      const params = tool?.currentVersion?.parameters as Record<string, unknown>;
      expect(params).toBeDefined();
      expect(params.id).toBeDefined();
      expect(params.include).toBeDefined();
    });

    it('should handle OpenAPI without operationId', async () => {
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

      const result = await importService.importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      // Should use summary as tool name
      const tool = await repos.tools.getByName('Test endpoint summary', 'global');
      expect(tool).toBeDefined();
    });

    it('should handle OpenAPI without operationId or summary', async () => {
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

      const result = await importService.importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      // Should use path as tool name
      const tool = await repos.tools.getByName('api_fallback', 'global');
      expect(tool).toBeDefined();
    });

    it('should handle invalid OpenAPI JSON', async () => {
      const result = await importService.importFromOpenAPI('invalid json');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].entry).toBe('parsing');
    });

    it('should handle missing paths in OpenAPI', async () => {
      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        info: {
          title: 'Test API',
        },
        // Missing paths
      });

      const result = await importService.importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toContain('Missing paths');
    });

    it('should handle OpenAPI update conflict', async () => {
      await repos.tools.create({
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

      const result = await importService.importFromOpenAPI(openApiSpec, {
        conflictStrategy: 'update',
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);
      expect(result.details.tools.updated).toBe(1);

      const tool = await repos.tools.getByName('updateOperation', 'global');
      expect(tool?.currentVersion?.description).toBe('Updated description');
    });

    it('should handle OpenAPI skip conflict', async () => {
      await repos.tools.create({
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

      const result = await importService.importFromOpenAPI(openApiSpec, {
        conflictStrategy: 'skip',
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(1);
      expect(result.details.tools.skipped).toBe(1);

      const tool = await repos.tools.getByName('skipOperation', 'global');
      expect(tool?.currentVersion?.description).toBe('Original');
    });

    it('should handle OpenAPI error conflict', async () => {
      await repos.tools.create({
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

      const result = await importService.importFromOpenAPI(openApiSpec, {
        conflictStrategy: 'error',
      });

      expect(result.success).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('already exists');
    });

    it('should handle OpenAPI replace conflict', async () => {
      const existing = await repos.tools.create({
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

      const result = await importService.importFromOpenAPI(openApiSpec, {
        conflictStrategy: 'replace',
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);

      const tool = await repos.tools.getById(existing.id);
      expect(tool?.currentVersion?.description).toBe('Replaced description');
    });

    it('should attach tags when updating OpenAPI tools', async () => {
      const existing = await repos.tools.create({
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

      const result = await importService.importFromOpenAPI(openApiSpec, {
        conflictStrategy: 'update',
      });

      expect(result.updated).toBe(1);

      const tags = await repos.entryTags.getTagsForEntry('tool', existing.id);
      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain('v2');
      expect(tagNames).toContain('authenticated');
    });

    it('should handle OpenAPI with default parameter values', async () => {
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

      const result = await importService.importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);

      const tool = await repos.tools.getByName('getWithDefaults', 'global');
      const params = tool?.currentVersion?.parameters as Record<string, any>;
      expect(params.limit.default).toBe(10);
      expect(params.offset.default).toBe(0);
    });

    it('should handle multiple operations in single path', async () => {
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

      const result = await importService.importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(4);

      expect(await repos.tools.getByName('getMulti', 'global')).toBeDefined();
      expect(await repos.tools.getByName('createMulti', 'global')).toBeDefined();
      expect(await repos.tools.getByName('updateMulti', 'global')).toBeDefined();
      expect(await repos.tools.getByName('deleteMulti', 'global')).toBeDefined();
    });

    it('should handle OpenAPI with importedBy option', async () => {
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

      const result = await importService.importFromOpenAPI(openApiSpec, {
        importedBy: 'openapi-importer',
      });

      expect(result.created).toBe(1);

      const tool = await repos.tools.getByName('testCreatedBy', 'global');
      expect(tool?.createdBy).toBe('openapi-importer');
    });

    it('should handle empty paths object', async () => {
      const openApiSpec = JSON.stringify({
        openapi: '3.0.0',
        paths: {},
      });

      const result = await importService.importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
    });

    it('should skip non-object path items', async () => {
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

      const result = await importService.importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1); // Only normal operation
    });

    it('should skip non-object operations', async () => {
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

      const result = await importService.importFromOpenAPI(openApiSpec);

      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
    });
  });
});


