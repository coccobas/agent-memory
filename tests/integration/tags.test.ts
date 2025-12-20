import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  setupTestDb,
  cleanupTestDb,
  seedPredefinedTags,
  createTestTool,
  createTestGuideline,
} from '../fixtures/test-helpers.js';
import * as schema from '../../src/db/schema.js';

const TEST_DB_PATH = './data/test-tags.db';

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

import { tagHandlers } from '../../src/mcp/handlers/tags.handler.js';

describe('Tags Integration', () => {
  const AGENT_ID = 'agent-1';
  let previousPermMode: string | undefined;
  beforeAll(() => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    seedPredefinedTags(db);
  });

  afterAll(() => {
    if (previousPermMode === undefined) {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    } else {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('memory_tag_create', () => {
    it('should create a custom tag', () => {
      const result = tagHandlers.create({
        agentId: AGENT_ID,
        name: 'custom_tag',
        category: 'custom',
        description: 'A custom tag',
      });

      expect(result.success).toBe(true);
      expect(result.tag).toBeDefined();
      expect(result.tag.name).toBe('custom_tag');
      expect(result.tag.category).toBe('custom');
      expect(result.tag.isPredefined).toBe(false);
      expect(result.existed).toBe(false);
    });

    it('should return existing tag if already exists', () => {
      tagHandlers.create({ agentId: AGENT_ID, name: 'existing_tag' });
      const result = tagHandlers.create({ agentId: AGENT_ID, name: 'existing_tag' });

      expect(result.success).toBe(true);
      expect(result.existed).toBe(true);
    });

    it('should require name', () => {
      expect(() => {
        tagHandlers.create({ agentId: AGENT_ID });
      }).toThrow('name is required');
    });
  });

  describe('memory_tag_list', () => {
    it('should list all tags', () => {
      const result = tagHandlers.list({ agentId: AGENT_ID, limit: 10 });
      expect(result.tags.length).toBeGreaterThan(0);
    });

    it('should filter by category', () => {
      const result = tagHandlers.list({ agentId: AGENT_ID, category: 'language', limit: 10 });
      expect(result.tags.length).toBeGreaterThan(0);
      result.tags.forEach((tag) => {
        expect(tag.category).toBe('language');
      });
    });

    it('should filter by isPredefined', () => {
      const result = tagHandlers.list({ agentId: AGENT_ID, isPredefined: true, limit: 10 });
      expect(result.tags.length).toBeGreaterThan(0);
      result.tags.forEach((tag) => {
        expect(tag.isPredefined).toBe(true);
      });
    });

    it('should support pagination', () => {
      const result = tagHandlers.list({ agentId: AGENT_ID, limit: 2, offset: 0 });
      expect(result.tags.length).toBeLessThanOrEqual(2);
    });
  });

  describe('memory_tag_attach', () => {
    it('should attach tag to a tool', () => {
      const { tool } = createTestTool(db, 'tagged_tool');
      const securityTag = db
        .select()
        .from(schema.tags)
        .where(eq(schema.tags.name, 'security'))
        .get()!;

      const result = tagHandlers.attach({
        agentId: AGENT_ID,
        entryType: 'tool',
        entryId: tool.id,
        tagName: 'security',
      });

      expect(result.success).toBe(true);
      expect(result.entryTag).toBeDefined();
      expect(result.entryTag.entryType).toBe('tool');
      expect(result.entryTag.entryId).toBe(tool.id);
      expect(result.entryTag.tagId).toBe(securityTag.id);
    });

    it('should attach tag to a guideline', () => {
      const { guideline } = createTestGuideline(db, 'tagged_guideline');

      const result = tagHandlers.attach({
        agentId: AGENT_ID,
        entryType: 'guideline',
        entryId: guideline.id,
        tagName: 'security',
      });

      expect(result.success).toBe(true);
      expect(result.entryTag.entryType).toBe('guideline');
    });

    it('should create tag if it does not exist', () => {
      const { tool } = createTestTool(db, 'auto_tag_tool');
      const result = tagHandlers.attach({
        agentId: AGENT_ID,
        entryType: 'tool',
        entryId: tool.id,
        tagName: 'new_auto_tag',
      });

      expect(result.success).toBe(true);
      const tag = db.select().from(schema.tags).where(eq(schema.tags.name, 'new_auto_tag')).get();
      expect(tag).toBeDefined();
    });

    it('should require entryType', () => {
      expect(() => {
        tagHandlers.attach({ agentId: AGENT_ID, entryId: 'test', tagName: 'test' });
      }).toThrow('entryType is required');
    });
  });

  describe('memory_tag_detach', () => {
    it('should detach tag from entry', () => {
      const { tool } = createTestTool(db, 'detach_test');
      const attachResult = tagHandlers.attach({
        agentId: AGENT_ID,
        entryType: 'tool',
        entryId: tool.id,
        tagName: 'security',
      });
      const securityTag = db
        .select()
        .from(schema.tags)
        .where(eq(schema.tags.name, 'security'))
        .get()!;

      const result = tagHandlers.detach({
        agentId: AGENT_ID,
        entryType: 'tool',
        entryId: tool.id,
        tagId: securityTag.id,
      });

      expect(result.success).toBe(true);

      // Verify tag is detached
      const tags = tagHandlers.forEntry({ agentId: AGENT_ID, entryType: 'tool', entryId: tool.id });
      expect(tags.tags.find((t) => t.name === 'security')).toBeUndefined();
    });

    it('should require entryType', () => {
      expect(() => {
        tagHandlers.detach({ agentId: AGENT_ID, entryId: 'test', tagId: 'test' });
      }).toThrow('entryType is required');
    });
  });

  describe('memory_tags_for_entry', () => {
    it('should return all tags for an entry', () => {
      const { tool } = createTestTool(db, 'multi_tag_tool');
      tagHandlers.attach({ agentId: AGENT_ID, entryType: 'tool', entryId: tool.id, tagName: 'security' });
      tagHandlers.attach({ agentId: AGENT_ID, entryType: 'tool', entryId: tool.id, tagName: 'required' });

      const result = tagHandlers.forEntry({
        agentId: AGENT_ID,
        entryType: 'tool',
        entryId: tool.id,
      });

      expect(result.tags.length).toBe(2);
      expect(result.tags.some((t) => t.name === 'security')).toBe(true);
      expect(result.tags.some((t) => t.name === 'required')).toBe(true);
    });

    it('should return empty array for entry with no tags', () => {
      const { tool } = createTestTool(db, 'no_tags_tool');
      const result = tagHandlers.forEntry({
        agentId: AGENT_ID,
        entryType: 'tool',
        entryId: tool.id,
      });

      expect(result.tags).toEqual([]);
    });

    it('should require entryType', () => {
      expect(() => {
        tagHandlers.forEntry({ agentId: AGENT_ID, entryId: 'test' });
      }).toThrow('entryType is required');
    });
  });
});
