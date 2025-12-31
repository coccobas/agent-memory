/**
 * Tag Filtering Pipeline Unit Test
 *
 * Exercises the exact pipeline path with tag filtering to isolate
 * why the query benchmark shows 0% results for tag filtering.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema/index.js';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  type TestDb,
} from '../fixtures/test-helpers.js';
import {
  executeQueryPipelineAsync,
  createDependencies,
} from '../../src/services/query/index.js';
import { LRUCache } from '../../src/utils/lru-cache.js';
import pino from 'pino';

const TEST_DB_PATH = './data/test-tag-filtering-pipeline.db';

// Create a test logger
const testLogger = pino({ level: 'debug' });

let testDb: TestDb;
let repos: ReturnType<typeof createTestRepositories>;

// Test data IDs
let projectId: string;
let guidelineWithTestingTag: string;
let guidelineWithSecurityApiTags: string;
let guidelineWithDeprecatedTag: string;
let guidelineWithFormattingTag: string;
let toolWithTestingTag: string;

describe('Tag Filtering Pipeline', () => {
  beforeAll(async () => {
    testDb = setupTestDb(TEST_DB_PATH);
    repos = createTestRepositories(testDb);

    // Create a test project
    const project = await repos.projects.create({
      name: 'Tag Test Project',
      description: 'Project for tag filtering tests',
      rootPath: '/test/tag-filter',
    });
    projectId = project.id;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(async () => {
    // Clean up entries between tests (but keep project)
    // Order matters: delete associations first, then entries, then tags
    testDb.db.delete(schema.entryTags).run();
    testDb.db.delete(schema.entryRelations).run();
    testDb.db.delete(schema.guidelineVersions).run();
    testDb.db.delete(schema.toolVersions).run();
    testDb.db.delete(schema.guidelines).run();
    testDb.db.delete(schema.tools).run();
    testDb.db.delete(schema.tags).run();
  });

  describe('Tag Seeding Verification', () => {
    it('should successfully attach tags to entries', async () => {
      // Create a guideline
      const guideline = await repos.guidelines.create({
        scopeType: 'project',
        scopeId: projectId,
        name: 'test-guideline',
        content: 'Test content',
        category: 'testing',
        priority: 80,
        createdBy: 'test',
      });

      // Attach a tag
      const entryTag = await repos.entryTags.attach({
        entryType: 'guideline',
        entryId: guideline.id,
        tagName: 'testing',
      });

      expect(entryTag).toBeDefined();
      expect(entryTag.entryType).toBe('guideline');
      expect(entryTag.entryId).toBe(guideline.id);

      // Verify tag was created
      const tag = testDb.db
        .select()
        .from(schema.tags)
        .where(eq(schema.tags.name, 'testing'))
        .get();
      expect(tag).toBeDefined();
      expect(tag?.name).toBe('testing');

      // Verify entry_tag association exists
      const entryTagRecord = testDb.db
        .select()
        .from(schema.entryTags)
        .where(eq(schema.entryTags.entryId, guideline.id))
        .get();
      expect(entryTagRecord).toBeDefined();
      expect(entryTagRecord?.tagId).toBe(tag?.id);
    });

    it('should attach multiple tags to one entry', async () => {
      const guideline = await repos.guidelines.create({
        scopeType: 'project',
        scopeId: projectId,
        name: 'multi-tag-guideline',
        content: 'Has multiple tags',
        category: 'security',
        priority: 90,
        createdBy: 'test',
      });

      // Attach multiple tags
      await repos.entryTags.attach({
        entryType: 'guideline',
        entryId: guideline.id,
        tagName: 'security',
      });
      await repos.entryTags.attach({
        entryType: 'guideline',
        entryId: guideline.id,
        tagName: 'api',
      });

      // Verify both tags are attached
      const tags = await repos.entryTags.getTagsForEntry('guideline', guideline.id);
      expect(tags).toHaveLength(2);
      const tagNames = tags.map((t) => t.name).sort();
      expect(tagNames).toEqual(['api', 'security']);
    });
  });

  describe('Pipeline with tag:include filter', () => {
    beforeEach(async () => {
      // Setup: Create entries with different tags
      const g1 = await repos.guidelines.create({
        scopeType: 'project',
        scopeId: projectId,
        name: 'g-with-testing',
        content: 'Has testing tag',
        category: 'testing',
        priority: 85,
        createdBy: 'test',
      });
      guidelineWithTestingTag = g1.id;
      await repos.entryTags.attach({
        entryType: 'guideline',
        entryId: g1.id,
        tagName: 'testing',
      });

      const g2 = await repos.guidelines.create({
        scopeType: 'project',
        scopeId: projectId,
        name: 'g-no-testing',
        content: 'Does NOT have testing tag',
        category: 'code_style',
        priority: 70,
        createdBy: 'test',
      });
      await repos.entryTags.attach({
        entryType: 'guideline',
        entryId: g2.id,
        tagName: 'formatting',
      });

      const t1 = await repos.tools.create({
        scopeType: 'project',
        scopeId: projectId,
        name: 't-npm-test',
        description: 'Runs tests',
        category: 'cli',
        createdBy: 'test',
      });
      toolWithTestingTag = t1.id;
      await repos.entryTags.attach({
        entryType: 'tool',
        entryId: t1.id,
        tagName: 'testing',
      });
    });

    it('should return only entries with the included tag', async () => {
      // Verify seeding worked
      const testingTaggedEntries = testDb.db
        .select()
        .from(schema.entryTags)
        .innerJoin(schema.tags, eq(schema.entryTags.tagId, schema.tags.id))
        .where(eq(schema.tags.name, 'testing'))
        .all();
      console.log('Entries with testing tag:', testingTaggedEntries.length);
      expect(testingTaggedEntries.length).toBe(2);

      // Create pipeline dependencies
      const deps = createDependencies({
        getDb: () => testDb.db,
        getPreparedStatement: (sql: string) => testDb.sqlite.prepare(sql),
        cache: new LRUCache(100, 10 * 1024 * 1024),
        perfLog: true,
        logger: testLogger,
      });

      // Execute query with tag:include filter
      const result = await executeQueryPipelineAsync(
        {
          action: 'search',
          scope: { type: 'project', id: projectId, inherit: true },
          tags: { include: ['testing'] },
          limit: 10,
        },
        deps
      );

      console.log('Query results:', result.results.length);
      console.log(
        'Result IDs:',
        result.results.map((r) => r.id)
      );

      // Should return exactly 2 entries (guideline + tool with testing tag)
      expect(result.results.length).toBe(2);

      const resultIds = new Set(result.results.map((r) => r.id));
      expect(resultIds.has(guidelineWithTestingTag)).toBe(true);
      expect(resultIds.has(toolWithTestingTag)).toBe(true);
    });
  });

  describe('Pipeline with tag:require filter', () => {
    beforeEach(async () => {
      // Create entry with BOTH security and api tags
      const g1 = await repos.guidelines.create({
        scopeType: 'project',
        scopeId: projectId,
        name: 'g-auth-required',
        content: 'Has both security AND api tags',
        category: 'security',
        priority: 90,
        createdBy: 'test',
      });
      guidelineWithSecurityApiTags = g1.id;
      await repos.entryTags.attach({
        entryType: 'guideline',
        entryId: g1.id,
        tagName: 'security',
      });
      await repos.entryTags.attach({
        entryType: 'guideline',
        entryId: g1.id,
        tagName: 'api',
      });

      // Create entry with ONLY security tag (not api)
      const g2 = await repos.guidelines.create({
        scopeType: 'project',
        scopeId: projectId,
        name: 'g-security-only',
        content: 'Has only security tag',
        category: 'security',
        priority: 85,
        createdBy: 'test',
      });
      await repos.entryTags.attach({
        entryType: 'guideline',
        entryId: g2.id,
        tagName: 'security',
      });
    });

    it('should return only entries with ALL required tags', async () => {
      const deps = createDependencies({
        getDb: () => testDb.db,
        getPreparedStatement: (sql: string) => testDb.sqlite.prepare(sql),
        cache: new LRUCache(100, 10 * 1024 * 1024),
        perfLog: true,
        logger: testLogger,
      });

      const result = await executeQueryPipelineAsync(
        {
          action: 'search',
          scope: { type: 'project', id: projectId, inherit: true },
          tags: { require: ['security', 'api'] },
          limit: 10,
        },
        deps
      );

      console.log('Require filter results:', result.results.length);

      // Should return exactly 1 entry (the one with BOTH tags)
      expect(result.results.length).toBe(1);
      expect(result.results[0].id).toBe(guidelineWithSecurityApiTags);
    });
  });

  describe('Pipeline with tag:exclude filter', () => {
    beforeEach(async () => {
      // Create entry with deprecated tag
      const g1 = await repos.guidelines.create({
        scopeType: 'project',
        scopeId: projectId,
        name: 'g-deprecated',
        content: 'Has deprecated tag - about formatting',
        category: 'code_style',
        priority: 50,
        createdBy: 'test',
      });
      guidelineWithDeprecatedTag = g1.id;
      await repos.entryTags.attach({
        entryType: 'guideline',
        entryId: g1.id,
        tagName: 'deprecated',
      });
      await repos.entryTags.attach({
        entryType: 'guideline',
        entryId: g1.id,
        tagName: 'formatting',
      });

      // Create entry without deprecated tag
      const g2 = await repos.guidelines.create({
        scopeType: 'project',
        scopeId: projectId,
        name: 'g-max-line-length',
        content: 'Good guideline about formatting',
        category: 'code_style',
        priority: 60,
        createdBy: 'test',
      });
      guidelineWithFormattingTag = g2.id;
      await repos.entryTags.attach({
        entryType: 'guideline',
        entryId: g2.id,
        tagName: 'formatting',
      });
    });

    it('should exclude entries with the excluded tag', async () => {
      const deps = createDependencies({
        getDb: () => testDb.db,
        getPreparedStatement: (sql: string) => testDb.sqlite.prepare(sql),
        cache: new LRUCache(100, 10 * 1024 * 1024),
        perfLog: true,
        logger: testLogger,
      });

      const result = await executeQueryPipelineAsync(
        {
          action: 'search',
          search: 'formatting',
          scope: { type: 'project', id: projectId, inherit: true },
          tags: { exclude: ['deprecated'] },
          limit: 10,
        },
        deps
      );

      console.log('Exclude filter results:', result.results.length);
      console.log(
        'Result IDs:',
        result.results.map((r) => r.id)
      );

      // Should NOT contain the deprecated entry
      const resultIds = new Set(result.results.map((r) => r.id));
      expect(resultIds.has(guidelineWithDeprecatedTag)).toBe(false);
      // Should contain the non-deprecated entry
      expect(resultIds.has(guidelineWithFormattingTag)).toBe(true);
    });
  });

  describe('Tag filtering without search term', () => {
    beforeEach(async () => {
      // Create entries
      const g1 = await repos.guidelines.create({
        scopeType: 'project',
        scopeId: projectId,
        name: 'g-testing-1',
        content: 'Testing guideline 1',
        category: 'testing',
        priority: 80,
        createdBy: 'test',
      });
      guidelineWithTestingTag = g1.id;
      await repos.entryTags.attach({
        entryType: 'guideline',
        entryId: g1.id,
        tagName: 'testing',
      });

      const g2 = await repos.guidelines.create({
        scopeType: 'project',
        scopeId: projectId,
        name: 'g-other',
        content: 'Other guideline',
        category: 'code_style',
        priority: 70,
        createdBy: 'test',
      });
      await repos.entryTags.attach({
        entryType: 'guideline',
        entryId: g2.id,
        tagName: 'other',
      });
    });

    it('should filter by tags even without a search term', async () => {
      const deps = createDependencies({
        getDb: () => testDb.db,
        getPreparedStatement: (sql: string) => testDb.sqlite.prepare(sql),
        cache: new LRUCache(100, 10 * 1024 * 1024),
        perfLog: true,
        logger: testLogger,
      });

      // Query with ONLY tag filter, no search term
      const result = await executeQueryPipelineAsync(
        {
          action: 'search',
          scope: { type: 'project', id: projectId, inherit: true },
          tags: { include: ['testing'] },
          limit: 10,
        },
        deps
      );

      console.log('Tag-only filter results:', result.results.length);

      // Should return only the entry with 'testing' tag
      expect(result.results.length).toBe(1);
      expect(result.results[0].id).toBe(guidelineWithTestingTag);
    });
  });
});
