/**
 * Unit tests for experiences repository
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
import type { IExperienceRepository } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-experiences-repo.db';
let testDb: TestDb;
let experienceRepo: IExperienceRepository;

describe('experienceRepo', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    experienceRepo = repos.experiences;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('create', () => {
    it('should create an experience with initial version', async () => {
      const experience = await experienceRepo.create({
        scopeType: 'global',
        title: 'test-experience',
        content: 'Test content',
        level: 'case',
        scenario: 'Test scenario',
        outcome: 'Test outcome',
      });

      expect(experience.id).toBeDefined();
      expect(experience.title).toBe('test-experience');
      expect(experience.level).toBe('case');
      expect(experience.currentVersion).toBeDefined();
      expect(experience.currentVersion?.content).toBe('Test content');
      expect(experience.currentVersion?.versionNum).toBe(1);
    });

    it('should create experience at project scope', async () => {
      const org = createTestOrg(testDb.db, 'Experience Test Org');
      const project = createTestProject(testDb.db, 'Experience Test Project', org.id);

      const experience = await experienceRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        title: 'project-experience',
        content: 'Project content',
        level: 'case',
      });

      expect(experience.scopeType).toBe('project');
      expect(experience.scopeId).toBe(project.id);
    });

    it('should create strategy level experience', async () => {
      const experience = await experienceRepo.create({
        scopeType: 'global',
        title: 'strategy-experience',
        content: 'Strategy content',
        level: 'strategy',
      });

      expect(experience.level).toBe('strategy');
    });

    it('should store scenario and outcome', async () => {
      const experience = await experienceRepo.create({
        scopeType: 'global',
        title: 'scenario-outcome-experience',
        content: 'Content',
        level: 'case',
        scenario: 'When debugging a slow query',
        outcome: 'Found missing index and fixed it',
      });

      expect(experience.currentVersion?.scenario).toBe('When debugging a slow query');
      expect(experience.currentVersion?.outcome).toBe('Found missing index and fixed it');
    });
  });

  describe('getById', () => {
    it('should get experience by ID', async () => {
      const created = await experienceRepo.create({
        scopeType: 'global',
        title: 'get-by-id-experience',
        content: 'Content',
        level: 'case',
      });

      const experience = await experienceRepo.getById(created.id);

      expect(experience).toBeDefined();
      expect(experience?.id).toBe(created.id);
      expect(experience?.title).toBe('get-by-id-experience');
    });

    it('should return undefined for non-existent ID', async () => {
      const experience = await experienceRepo.getById('non-existent-id');
      expect(experience).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list experiences', async () => {
      await experienceRepo.create({
        scopeType: 'global',
        title: 'list-experience-1',
        content: 'Content 1',
        level: 'case',
      });

      await experienceRepo.create({
        scopeType: 'global',
        title: 'list-experience-2',
        content: 'Content 2',
        level: 'case',
      });

      const experiences = await experienceRepo.list({ scopeType: 'global' }, { limit: 10 });

      expect(experiences.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by level', async () => {
      await experienceRepo.create({
        scopeType: 'global',
        title: 'strategy-filter-experience',
        content: 'Content',
        level: 'strategy',
      });

      const experiences = await experienceRepo.list(
        { scopeType: 'global', level: 'strategy' },
        { limit: 10 }
      );

      experiences.forEach((e) => {
        expect(e.level).toBe('strategy');
      });
    });

    it('should filter by category', async () => {
      await experienceRepo.create({
        scopeType: 'global',
        title: 'debugging-experience',
        content: 'Content',
        level: 'case',
        category: 'debugging',
      });

      const experiences = await experienceRepo.list(
        { scopeType: 'global', category: 'debugging' },
        { limit: 10 }
      );

      experiences.forEach((e) => {
        expect(e.category).toBe('debugging');
      });
    });
  });

  describe('update', () => {
    it('should update experience and create new version', async () => {
      const created = await experienceRepo.create({
        scopeType: 'global',
        title: 'update-experience',
        content: 'Original content',
        level: 'case',
      });

      const originalVersionId = created.currentVersionId;

      const updated = await experienceRepo.update(created.id, {
        content: 'Updated content',
        changeReason: 'Test update',
      });

      expect(updated?.currentVersionId).not.toBe(originalVersionId);
      expect(updated?.currentVersion?.content).toBe('Updated content');
      expect(updated?.currentVersion?.versionNum).toBe(2);
    });

    it('should update outcome', async () => {
      const created = await experienceRepo.create({
        scopeType: 'global',
        title: 'update-outcome-experience',
        content: 'Content',
        level: 'case',
        outcome: 'Initial outcome',
      });

      const updated = await experienceRepo.update(created.id, {
        outcome: 'Updated outcome',
      });

      expect(updated?.currentVersion?.outcome).toBe('Updated outcome');
    });

    it('should return undefined when updating non-existent experience', async () => {
      const result = await experienceRepo.update('non-existent-id', {
        content: 'New content',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('getHistory', () => {
    it('should get version history', async () => {
      const created = await experienceRepo.create({
        scopeType: 'global',
        title: 'history-experience',
        content: 'Version 1',
        level: 'case',
      });

      await experienceRepo.update(created.id, {
        content: 'Version 2',
        changeReason: 'Update',
      });

      const history = await experienceRepo.getHistory(created.id);

      expect(history.length).toBe(2);
      expect(history[0]?.versionNum).toBe(1);
      expect(history[1]?.versionNum).toBe(2);
    });
  });

  describe('deactivate', () => {
    it('should deactivate experience', async () => {
      const created = await experienceRepo.create({
        scopeType: 'global',
        title: 'deactivate-experience',
        content: 'Content',
        level: 'case',
      });

      await experienceRepo.deactivate(created.id);

      const experience = await experienceRepo.getById(created.id);
      expect(experience?.isActive).toBe(false);
    });

    it('should return false for non-existent experience', async () => {
      const result = await experienceRepo.deactivate('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('reactivate', () => {
    it('should reactivate a deactivated experience', async () => {
      const created = await experienceRepo.create({
        scopeType: 'global',
        title: 'reactivate-experience',
        content: 'Content',
        level: 'case',
      });

      await experienceRepo.deactivate(created.id);
      const deactivated = await experienceRepo.getById(created.id);
      expect(deactivated?.isActive).toBe(false);

      const result = await experienceRepo.reactivate(created.id);
      expect(result).toBe(true);

      const reactivated = await experienceRepo.getById(created.id);
      expect(reactivated?.isActive).toBe(true);
    });

    it('should return false for non-existent experience', async () => {
      const result = await experienceRepo.reactivate('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete experience and its versions', async () => {
      const created = await experienceRepo.create({
        scopeType: 'global',
        title: 'delete-experience',
        content: 'Content',
        level: 'case',
      });

      const result = await experienceRepo.delete(created.id);
      expect(result).toBe(true);

      const experience = await experienceRepo.getById(created.id);
      expect(experience).toBeUndefined();
    });

    it('should return false for non-existent experience', async () => {
      const result = await experienceRepo.delete('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('getByTitle', () => {
    it('should get experience by title at exact scope', async () => {
      await experienceRepo.create({
        scopeType: 'global',
        title: 'titled-experience',
        content: 'Content',
        level: 'case',
      });

      const experience = await experienceRepo.getByTitle('titled-experience', 'global');

      expect(experience).toBeDefined();
      expect(experience?.title).toBe('titled-experience');
    });

    it('should return undefined for non-existent title', async () => {
      const experience = await experienceRepo.getByTitle('non-existent-title', 'global');
      expect(experience).toBeUndefined();
    });

    it('should inherit from global scope when not found at project scope', async () => {
      const org = createTestOrg(testDb.db, 'Experience Inherit Org');
      const project = createTestProject(testDb.db, 'Experience Inherit Project', org.id);

      // Create experience at global scope
      await experienceRepo.create({
        scopeType: 'global',
        title: 'inherited-experience',
        content: 'Global content',
        level: 'case',
      });

      // Search at project scope with inherit=true (default)
      const experience = await experienceRepo.getByTitle(
        'inherited-experience',
        'project',
        project.id
      );

      expect(experience).toBeDefined();
      expect(experience?.title).toBe('inherited-experience');
      expect(experience?.scopeType).toBe('global');
    });

    it('should not inherit when inherit=false', async () => {
      const org = createTestOrg(testDb.db, 'Experience No Inherit Org');
      const project = createTestProject(testDb.db, 'Experience No Inherit Project', org.id);

      // Create experience at global scope
      await experienceRepo.create({
        scopeType: 'global',
        title: 'no-inherit-experience',
        content: 'Global content',
        level: 'case',
      });

      // Search at project scope with inherit=false
      const experience = await experienceRepo.getByTitle(
        'no-inherit-experience',
        'project',
        project.id,
        false
      );

      expect(experience).toBeUndefined();
    });
  });

  describe('trajectory operations', () => {
    it('should add step to experience trajectory', async () => {
      const created = await experienceRepo.create({
        scopeType: 'global',
        title: 'trajectory-experience',
        content: 'Content',
        level: 'case',
      });

      const step = await experienceRepo.addStep(created.id, {
        action: 'Read error log',
        observation: 'Found timeout error',
        reasoning: 'Checking logs first is standard practice',
      });

      expect(step).toBeDefined();
      expect(step.action).toBe('Read error log');
      expect(step.observation).toBe('Found timeout error');
      expect(step.reasoning).toBe('Checking logs first is standard practice');
    });

    it('should get trajectory steps', async () => {
      const created = await experienceRepo.create({
        scopeType: 'global',
        title: 'trajectory-get-experience',
        content: 'Content',
        level: 'case',
      });

      await experienceRepo.addStep(created.id, {
        action: 'Step 1',
        observation: 'Observation 1',
      });

      await experienceRepo.addStep(created.id, {
        action: 'Step 2',
        observation: 'Observation 2',
      });

      const trajectory = await experienceRepo.getTrajectory(created.id);

      expect(trajectory).toHaveLength(2);
      expect(trajectory[0]?.action).toBe('Step 1');
      expect(trajectory[1]?.action).toBe('Step 2');
    });

    it('should return empty array for experience with no trajectory', async () => {
      const created = await experienceRepo.create({
        scopeType: 'global',
        title: 'no-trajectory-experience',
        content: 'Content',
        level: 'case',
      });

      const trajectory = await experienceRepo.getTrajectory(created.id);

      expect(trajectory).toEqual([]);
    });
  });

  describe('recordOutcome', () => {
    it('should record success outcome', async () => {
      const created = await experienceRepo.create({
        scopeType: 'global',
        title: 'outcome-success-experience',
        content: 'Content',
        level: 'case',
      });

      const updated = await experienceRepo.recordOutcome(created.id, {
        success: true,
        feedback: 'This approach worked well',
      });

      expect(updated).toBeDefined();
      // The confidence should increase with successful outcomes
    });

    it('should record failure outcome', async () => {
      const created = await experienceRepo.create({
        scopeType: 'global',
        title: 'outcome-failure-experience',
        content: 'Content',
        level: 'case',
      });

      const updated = await experienceRepo.recordOutcome(created.id, {
        success: false,
        feedback: 'This approach did not work',
      });

      expect(updated).toBeDefined();
    });

    it('should return undefined for non-existent experience', async () => {
      const result = await experienceRepo.recordOutcome('non-existent-id', {
        success: true,
      });

      expect(result).toBeUndefined();
    });
  });
});
