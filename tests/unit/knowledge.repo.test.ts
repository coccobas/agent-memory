/**
 * Unit tests for knowledge repository
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestOrg,
  createTestProject,
  createTestRepositories,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { IKnowledgeRepository } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-knowledge-repo.db';
let testDb: TestDb;
let knowledgeRepo: IKnowledgeRepository;

describe('knowledgeRepo', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    knowledgeRepo = repos.knowledge;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('create', () => {
    it('should create a knowledge entry with initial version', async () => {
      const knowledge = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'test-knowledge',
        content: 'Test content',
        category: 'fact',
      });

      expect(knowledge.id).toBeDefined();
      expect(knowledge.title).toBe('test-knowledge');
      expect(knowledge.currentVersion).toBeDefined();
      expect(knowledge.currentVersion?.content).toBe('Test content');
      expect(knowledge.currentVersion?.versionNum).toBe(1);
    });

    it('should default confidence to 1.0', async () => {
      const knowledge = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'default-confidence-knowledge',
        content: 'Content',
      });

      expect(knowledge.currentVersion?.confidence).toBe(1.0);
    });

    it('should store source and validUntil', async () => {
      const knowledge = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'source-knowledge',
        content: 'Content',
        source: 'https://example.com',
        validUntil: '2025-12-31T23:59:59Z',
      });

      expect(knowledge.currentVersion?.source).toBe('https://example.com');
      expect(knowledge.currentVersion?.validUntil).toBe('2025-12-31T23:59:59Z');
    });
  });

  describe('getById', () => {
    it('should get knowledge by ID', async () => {
      const created = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'get-by-id-knowledge',
        content: 'Content',
      });

      const knowledge = await knowledgeRepo.getById(created.id);

      expect(knowledge).toBeDefined();
      expect(knowledge?.id).toBe(created.id);
      expect(knowledge?.title).toBe('get-by-id-knowledge');
    });

    it('should return undefined for non-existent ID', async () => {
      const knowledge = await knowledgeRepo.getById('non-existent-id');
      expect(knowledge).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list knowledge entries', async () => {
      await knowledgeRepo.create({
        scopeType: 'global',
        title: 'list-knowledge-1',
        content: 'Content 1',
      });

      await knowledgeRepo.create({
        scopeType: 'global',
        title: 'list-knowledge-2',
        content: 'Content 2',
      });

      const knowledgeEntries = await knowledgeRepo.list({ scopeType: 'global' }, { limit: 10 });

      expect(knowledgeEntries.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by category', async () => {
      await knowledgeRepo.create({
        scopeType: 'global',
        title: 'decision-knowledge',
        content: 'Content',
        category: 'decision',
      });

      const entries = await knowledgeRepo.list(
        { scopeType: 'global', category: 'decision' },
        { limit: 10 }
      );

      entries.forEach((e) => {
        expect(e.category).toBe('decision');
      });
    });
  });

  describe('update', () => {
    it('should update knowledge and create new version', async () => {
      const created = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'update-knowledge',
        content: 'Original content',
      });

      const originalVersionId = created.currentVersionId;

      const updated = await knowledgeRepo.update(created.id, {
        content: 'Updated content',
        changeReason: 'Test update',
      });

      expect(updated.currentVersionId).not.toBe(originalVersionId);
      expect(updated.currentVersion?.content).toBe('Updated content');
      expect(updated.currentVersion?.versionNum).toBe(2);
    });

    it('should update confidence', async () => {
      const created = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'update-confidence-knowledge',
        content: 'Content',
        confidence: 0.9,
      });

      const updated = await knowledgeRepo.update(created.id, {
        confidence: 0.95,
      });

      expect(updated.currentVersion?.confidence).toBe(0.95);
    });
  });

  describe('getHistory', () => {
    it('should get version history', async () => {
      const created = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'history-knowledge',
        content: 'Version 1',
      });

      await knowledgeRepo.update(created.id, {
        content: 'Version 2',
        changeReason: 'Update',
      });

      const history = await knowledgeRepo.getHistory(created.id);

      expect(history.length).toBe(2);
      expect(history[0]?.versionNum).toBe(1);
      expect(history[1]?.versionNum).toBe(2);
    });
  });

  describe('deactivate', () => {
    it('should deactivate knowledge entry', async () => {
      const created = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'deactivate-knowledge',
        content: 'Content',
      });

      await knowledgeRepo.deactivate(created.id);

      const knowledge = await knowledgeRepo.getById(created.id);
      expect(knowledge?.isActive).toBe(false);
    });

    it('should return false for non-existent knowledge', async () => {
      const result = await knowledgeRepo.deactivate('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('reactivate', () => {
    it('should reactivate a deactivated knowledge entry', async () => {
      const created = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'reactivate-knowledge',
        content: 'Content',
      });

      await knowledgeRepo.deactivate(created.id);
      const deactivated = await knowledgeRepo.getById(created.id);
      expect(deactivated?.isActive).toBe(false);

      const result = await knowledgeRepo.reactivate(created.id);
      expect(result).toBe(true);

      const reactivated = await knowledgeRepo.getById(created.id);
      expect(reactivated?.isActive).toBe(true);
    });

    it('should return false for non-existent knowledge', async () => {
      const result = await knowledgeRepo.reactivate('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete knowledge and its versions', async () => {
      const created = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'delete-knowledge',
        content: 'Content',
      });

      const result = await knowledgeRepo.delete(created.id);
      expect(result).toBe(true);

      const knowledge = await knowledgeRepo.getById(created.id);
      expect(knowledge).toBeUndefined();
    });

    it('should return false for non-existent knowledge', async () => {
      const result = await knowledgeRepo.delete('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('getByIds', () => {
    it('should get multiple knowledge entries by IDs', async () => {
      const knowledge1 = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'getbyids-knowledge-1',
        content: 'Content 1',
      });

      const knowledge2 = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'getbyids-knowledge-2',
        content: 'Content 2',
      });

      const entries = await knowledgeRepo.getByIds([knowledge1.id, knowledge2.id]);

      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.id).sort()).toEqual([knowledge1.id, knowledge2.id].sort());
    });

    it('should return empty array for empty IDs array', async () => {
      const entries = await knowledgeRepo.getByIds([]);
      expect(entries).toEqual([]);
    });

    it('should handle mix of existing and non-existing IDs', async () => {
      const knowledge = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'getbyids-mix-knowledge',
        content: 'Content',
      });

      const entries = await knowledgeRepo.getByIds([knowledge.id, 'non-existent-id']);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.id).toBe(knowledge.id);
    });
  });

  describe('getByTitle', () => {
    it('should get knowledge by title at exact scope', async () => {
      await knowledgeRepo.create({
        scopeType: 'global',
        title: 'titled-knowledge',
        content: 'Content',
      });

      const knowledge = await knowledgeRepo.getByTitle('titled-knowledge', 'global');

      expect(knowledge).toBeDefined();
      expect(knowledge?.title).toBe('titled-knowledge');
    });

    it('should return undefined for non-existent title', async () => {
      const knowledge = await knowledgeRepo.getByTitle('non-existent-title', 'global');
      expect(knowledge).toBeUndefined();
    });

    it('should inherit from global scope when not found at project scope', async () => {
      const org = createTestOrg(testDb.db, 'Knowledge Inherit Org');
      const project = createTestProject(testDb.db, 'Knowledge Inherit Project', org.id);

      // Create knowledge at global scope
      await knowledgeRepo.create({
        scopeType: 'global',
        title: 'inherited-knowledge',
        content: 'Global content',
      });

      // Search at project scope with inherit=true (default)
      const knowledge = await knowledgeRepo.getByTitle(
        'inherited-knowledge',
        'project',
        project.id
      );

      expect(knowledge).toBeDefined();
      expect(knowledge?.title).toBe('inherited-knowledge');
      expect(knowledge?.scopeType).toBe('global');
    });

    it('should not inherit when inherit=false', async () => {
      const org = createTestOrg(testDb.db, 'Knowledge No Inherit Org');
      const project = createTestProject(testDb.db, 'Knowledge No Inherit Project', org.id);

      // Create knowledge at global scope
      await knowledgeRepo.create({
        scopeType: 'global',
        title: 'no-inherit-knowledge',
        content: 'Global content',
      });

      // Search at project scope with inherit=false
      const knowledge = await knowledgeRepo.getByTitle(
        'no-inherit-knowledge',
        'project',
        project.id,
        false
      );

      expect(knowledge).toBeUndefined();
    });
  });

  describe('update edge cases', () => {
    it('should return undefined when updating non-existent knowledge', async () => {
      const result = await knowledgeRepo.update('non-existent-id', {
        content: 'New content',
      });

      expect(result).toBeUndefined();
    });

    it('should update category', async () => {
      const created = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'update-category-knowledge',
        content: 'Content',
        category: 'fact',
      });

      const updated = await knowledgeRepo.update(created.id, {
        category: 'decision',
      });

      expect(updated?.category).toBe('decision');
    });

    it('should update scope', async () => {
      const org = createTestOrg(testDb.db, 'Knowledge Update Scope Org');
      const project = createTestProject(testDb.db, 'Knowledge Update Scope Project', org.id);

      const created = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'update-scope-knowledge',
        content: 'Content',
      });

      const updated = await knowledgeRepo.update(created.id, {
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(updated?.scopeType).toBe('project');
      expect(updated?.scopeId).toBe(project.id);
    });

    it('should invalidate knowledge', async () => {
      const created = await knowledgeRepo.create({
        scopeType: 'global',
        title: 'invalidate-knowledge',
        content: 'Content',
      });

      const updated = await knowledgeRepo.update(created.id, {
        invalidatedBy: 'new-knowledge-id',
      });

      expect(updated?.currentVersion?.invalidatedBy).toBe('new-knowledge-id');
    });
  });

  describe('create with project scope', () => {
    it('should create knowledge at project scope', async () => {
      const org = createTestOrg(testDb.db, 'Knowledge Create Org');
      const project = createTestProject(testDb.db, 'Knowledge Create Project', org.id);

      const knowledge = await knowledgeRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        title: 'project-knowledge',
        content: 'Project content',
      });

      expect(knowledge.scopeType).toBe('project');
      expect(knowledge.scopeId).toBe(project.id);
    });
  });
});
