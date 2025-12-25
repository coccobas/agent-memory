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
  });
});

