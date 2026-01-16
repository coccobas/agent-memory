import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  setupTestDb,
  cleanupTestDb,
  registerTestContext,
  createTestProject,
  createTestExperience,
} from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';
import { entryRelations } from '../../src/db/schema.js';

const TEST_DB_PATH = './data/test-experiences.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
  };
});

import { experienceHandlers } from '../../src/mcp/handlers/experiences.handler.js';

describe('Experiences Integration', () => {
  const AGENT_ID = 'agent-1';
  let previousPermMode: string | undefined;

  beforeAll(() => {
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = registerTestContext(testDb);
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

  describe('memory_experience_add', () => {
    it('should add a case-level experience with all fields', async () => {
      const result = await experienceHandlers.add(context, {
        agentId: AGENT_ID,
        scopeType: 'global',
        title: 'Fixed Auth Bug',
        category: 'debugging',
        content: 'Discovered token expiry issue in auth module',
        scenario: 'User reported intermittent login failures',
        outcome: 'success',
        level: 'case',
      });

      expect(result.success).toBe(true);
      expect(result.experience).toBeDefined();
      expect(result.experience.title).toBe('Fixed Auth Bug');
      expect(result.experience.level).toBe('case');
      expect(result.experience.currentVersion?.content).toBe(
        'Discovered token expiry issue in auth module'
      );
      expect(result.experience.currentVersion?.scenario).toBe(
        'User reported intermittent login failures'
      );
    });

    it('should add experience at project scope', async () => {
      const project = createTestProject(db);
      const result = await experienceHandlers.add(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: project.id,
        title: 'Project Experience',
        content: 'Project-specific learning',
      });

      expect(result.success).toBe(true);
      expect(result.experience.scopeType).toBe('project');
      expect(result.experience.scopeId).toBe(project.id);
    });

    it('should add experience with trajectory steps', async () => {
      const result = await experienceHandlers.add(context, {
        agentId: AGENT_ID,
        scopeType: 'global',
        title: 'Debug with Steps',
        content: 'Debugging session with trajectory',
        steps: [
          { action: 'Read error log', observation: 'Found stack trace' },
          { action: 'Check token expiry', toolUsed: 'curl', reasoning: 'Verify API response' },
          { action: 'Fixed token refresh', success: true },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.experience).toBeDefined();

      // Verify steps were created
      const trajectory = await experienceHandlers.get_trajectory(context, {
        agentId: AGENT_ID,
        id: result.experience.id,
      });
      expect(trajectory.trajectorySteps).toBeDefined();
      expect(trajectory.trajectorySteps.length).toBe(3);
      expect(trajectory.trajectorySteps[0].action).toBe('Read error log');
      expect(trajectory.trajectorySteps[1].toolUsed).toBe('curl');
      expect(trajectory.trajectorySteps[2].success).toBe(true);
    });

    it('should require scopeType', async () => {
      await expect(
        experienceHandlers.add(context, { agentId: AGENT_ID, title: 'test', content: 'content' })
      ).rejects.toThrow(/scopeType.*required/i);
    });

    it('should require title', async () => {
      await expect(
        experienceHandlers.add(context, {
          agentId: AGENT_ID,
          scopeType: 'global',
          content: 'content',
        })
      ).rejects.toThrow(/title.*required/i);
    });

    it('should require content', async () => {
      await expect(
        experienceHandlers.add(context, { agentId: AGENT_ID, scopeType: 'global', title: 'test' })
      ).rejects.toThrow(/content.*required/i);
    });
  });

  describe('memory_experience_update', () => {
    it('should update experience and create new version', async () => {
      const { experience } = createTestExperience(db, 'update_test');
      const originalVersionId = experience.currentVersionId;

      const result = await experienceHandlers.update(context, {
        agentId: AGENT_ID,
        id: experience.id,
        content: 'Updated content',
        changeReason: 'Testing updates',
      });

      expect(result.success).toBe(true);
      expect(result.experience.currentVersionId).not.toBe(originalVersionId);
    });

    it('should update strategy-specific fields', async () => {
      const { experience } = createTestExperience(
        db,
        'strategy_update',
        'global',
        undefined,
        'strategy'
      );

      const result = await experienceHandlers.update(context, {
        agentId: AGENT_ID,
        id: experience.id,
        pattern: 'When X happens, do Y',
        applicability: 'TypeScript projects',
        contraindications: 'Not for legacy code',
      });

      expect(result.success).toBe(true);
      expect(result.experience.currentVersion?.pattern).toBe('When X happens, do Y');
      expect(result.experience.currentVersion?.applicability).toBe('TypeScript projects');
    });

    it('should require id', async () => {
      await expect(experienceHandlers.update(context, {})).rejects.toThrow(/id.*required/i);
    });
  });

  describe('memory_experience_get', () => {
    it('should get experience by ID', async () => {
      const { experience } = createTestExperience(db, 'get_test');
      const result = await experienceHandlers.get(context, {
        agentId: AGENT_ID,
        id: experience.id,
      });

      expect(result.experience).toBeDefined();
      expect(result.experience.id).toBe(experience.id);
    });

    it('should get experience by title and scope', async () => {
      const project = createTestProject(db);
      const { experience } = createTestExperience(db, 'get_by_title', 'project', project.id);

      const result = await experienceHandlers.get(context, {
        agentId: AGENT_ID,
        title: 'get_by_title',
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(result.experience.id).toBe(experience.id);
    });

    it('should include trajectory when using get_trajectory', async () => {
      // Create experience with steps via handler
      const addResult = await experienceHandlers.add(context, {
        agentId: AGENT_ID,
        scopeType: 'global',
        title: 'With Trajectory',
        content: 'Has steps',
        steps: [{ action: 'Step 1' }, { action: 'Step 2' }],
      });

      // Use get_trajectory to retrieve experience with trajectory
      const result = await experienceHandlers.get_trajectory(context, {
        agentId: AGENT_ID,
        id: addResult.experience.id,
      });

      expect(result.trajectorySteps).toBeDefined();
      expect(result.trajectorySteps.length).toBe(2);
    });
  });

  describe('memory_experience_list', () => {
    it('should list experiences with scope filter', async () => {
      const project = createTestProject(db);
      createTestExperience(db, 'exp1', 'global');
      createTestExperience(db, 'exp2', 'project', project.id);
      createTestExperience(db, 'exp3', 'project', project.id);

      const result = await experienceHandlers.list(context, {
        agentId: AGENT_ID,
        scopeType: 'project',
        scopeId: project.id,
        limit: 10,
      });

      expect(result.experiences.length).toBe(2);
      result.experiences.forEach((e) => {
        expect(e.scopeType).toBe('project');
        expect(e.scopeId).toBe(project.id);
      });
    });

    it('should filter by level', async () => {
      createTestExperience(db, 'case1', 'global', undefined, 'case');
      createTestExperience(db, 'case2', 'global', undefined, 'case');
      createTestExperience(db, 'strategy1', 'global', undefined, 'strategy');

      const result = await experienceHandlers.list(context, {
        agentId: AGENT_ID,
        scopeType: 'global',
        level: 'strategy',
        limit: 10,
      });

      expect(result.experiences.length).toBeGreaterThan(0);
      result.experiences.forEach((e) => {
        expect(e.level).toBe('strategy');
      });
    });

    it('should filter by category', async () => {
      createTestExperience(db, 'debug1', 'global', undefined, 'case', 'debugging');
      createTestExperience(db, 'debug2', 'global', undefined, 'case', 'debugging');
      createTestExperience(db, 'refactor1', 'global', undefined, 'case', 'refactoring');

      const result = await experienceHandlers.list(context, {
        agentId: AGENT_ID,
        scopeType: 'global',
        category: 'debugging',
        limit: 10,
      });

      expect(result.experiences.length).toBeGreaterThan(0);
      result.experiences.forEach((e) => {
        expect(e.category).toBe('debugging');
      });
    });
  });

  describe('memory_experience_history', () => {
    it('should return version history', async () => {
      const { experience } = createTestExperience(db, 'history_test');
      await experienceHandlers.update(context, {
        agentId: AGENT_ID,
        id: experience.id,
        content: 'Version 2',
        changeReason: 'Update',
      });
      await experienceHandlers.update(context, {
        agentId: AGENT_ID,
        id: experience.id,
        content: 'Version 3',
        changeReason: 'Another update',
      });

      const result = await experienceHandlers.history(context, {
        agentId: AGENT_ID,
        id: experience.id,
      });
      expect(result.versions.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('memory_experience_deactivate', () => {
    it('should deactivate an experience', async () => {
      const { experience } = createTestExperience(db, 'deactivate_test');
      const result = await experienceHandlers.deactivate(context, {
        agentId: AGENT_ID,
        id: experience.id,
      });

      expect(result.success).toBe(true);
      const fetched = await experienceHandlers.get(context, {
        agentId: AGENT_ID,
        id: experience.id,
      });
      expect(fetched.experience.isActive).toBe(false);
    });
  });

  describe('memory_experience_add_step', () => {
    it('should add a trajectory step to an experience', async () => {
      const { experience } = createTestExperience(db, 'add_step_test');

      const result = await experienceHandlers.add_step(context, {
        agentId: AGENT_ID,
        id: experience.id,
        action: 'New step',
        observation: 'Observed something',
        reasoning: 'Because of this',
        toolUsed: 'grep',
        success: true,
      });

      expect(result.success).toBe(true);
      expect(result.step).toBeDefined();
      expect(result.step.action).toBe('New step');
      expect(result.step.toolUsed).toBe('grep');
    });

    it('should increment step numbers correctly', async () => {
      const addResult = await experienceHandlers.add(context, {
        agentId: AGENT_ID,
        scopeType: 'global',
        title: 'Multiple Steps',
        content: 'Test multiple steps',
        steps: [{ action: 'Step 1' }],
      });

      await experienceHandlers.add_step(context, {
        agentId: AGENT_ID,
        id: addResult.experience.id,
        action: 'Step 2',
      });

      await experienceHandlers.add_step(context, {
        agentId: AGENT_ID,
        id: addResult.experience.id,
        action: 'Step 3',
      });

      const trajectory = await experienceHandlers.get_trajectory(context, {
        agentId: AGENT_ID,
        id: addResult.experience.id,
      });

      expect(trajectory.trajectorySteps.length).toBe(3);
      expect(trajectory.trajectorySteps[0].stepNum).toBe(1);
      expect(trajectory.trajectorySteps[1].stepNum).toBe(2);
      expect(trajectory.trajectorySteps[2].stepNum).toBe(3);
    });
  });

  describe('memory_experience_record_outcome', () => {
    it('should update success metrics', async () => {
      const { experience } = createTestExperience(db, 'outcome_test');

      const result = await experienceHandlers.record_outcome(context, {
        agentId: AGENT_ID,
        id: experience.id,
        success: true,
        feedback: 'Worked perfectly',
      });

      expect(result.success).toBe(true);
      expect(result.experience.useCount).toBe(1);
      expect(result.experience.successCount).toBe(1);
      expect(result.experience.lastUsedAt).toBeDefined();
    });

    it('should calculate confidence correctly', async () => {
      const { experience } = createTestExperience(db, 'confidence_test');

      // Record 3 successes and 1 failure
      await experienceHandlers.record_outcome(context, {
        agentId: AGENT_ID,
        id: experience.id,
        success: true,
      });
      await experienceHandlers.record_outcome(context, {
        agentId: AGENT_ID,
        id: experience.id,
        success: true,
      });
      await experienceHandlers.record_outcome(context, {
        agentId: AGENT_ID,
        id: experience.id,
        success: false,
      });
      const result = await experienceHandlers.record_outcome(context, {
        agentId: AGENT_ID,
        id: experience.id,
        success: true,
      });

      expect(result.experience.useCount).toBe(4);
      expect(result.experience.successCount).toBe(3);
      // Confidence should be approximately 0.75
      expect(result.experience.currentVersion?.confidence).toBeCloseTo(0.75, 1);
    });
  });

  describe('memory_experience_promote', () => {
    it('should promote case to strategy', async () => {
      const { experience } = createTestExperience(db, 'promote_case', 'global', undefined, 'case');

      const result = await experienceHandlers.promote(context, {
        agentId: AGENT_ID,
        id: experience.id,
        toLevel: 'strategy',
        pattern: 'When debugging auth issues, always check token expiry first',
        applicability: 'OAuth-based authentication systems',
        reason: 'Observed in 3 similar debugging sessions',
      });

      expect(result.success).toBe(true);
      expect(result.experience.level).toBe('strategy');
      expect(result.experience.currentVersion?.pattern).toBe(
        'When debugging auth issues, always check token expiry first'
      );
      // Verify promotion relation was created (case -> strategy via promoted_to)
      const relations = db
        .select()
        .from(entryRelations)
        .where(
          and(
            eq(entryRelations.sourceType, 'experience'),
            eq(entryRelations.sourceId, experience.id),
            eq(entryRelations.targetType, 'experience'),
            eq(entryRelations.targetId, result.experience.id),
            eq(entryRelations.relationType, 'promoted_to')
          )
        )
        .all();
      expect(relations.length).toBe(1);
    });

    it('should promote strategy to skill and create linked tool', async () => {
      const { experience } = createTestExperience(
        db,
        'promote_strategy',
        'global',
        undefined,
        'strategy'
      );

      const result = await experienceHandlers.promote(context, {
        agentId: AGENT_ID,
        id: experience.id,
        toLevel: 'skill',
        toolName: 'check-token-expiry',
        toolDescription: 'Check and validate token expiry in auth systems',
      });

      expect(result.success).toBe(true);
      expect(result.createdTool).toBeDefined();
      expect(result.createdTool?.name).toBe('check-token-expiry');
      // Verify promotion relation was created (strategy -> tool via promoted_to)
      const relations = db
        .select()
        .from(entryRelations)
        .where(
          and(
            eq(entryRelations.sourceType, 'experience'),
            eq(entryRelations.sourceId, experience.id),
            eq(entryRelations.targetType, 'tool'),
            eq(entryRelations.targetId, result.createdTool!.id),
            eq(entryRelations.relationType, 'promoted_to')
          )
        )
        .all();
      expect(relations.length).toBe(1);
    });

    it('should reject invalid promotion paths', async () => {
      const { experience } = createTestExperience(
        db,
        'invalid_promote',
        'global',
        undefined,
        'case'
      );

      // Can't promote case directly to skill
      await expect(
        experienceHandlers.promote(context, {
          agentId: AGENT_ID,
          id: experience.id,
          toLevel: 'skill',
          toolName: 'invalid-tool',
          toolDescription: 'Should fail',
        })
      ).rejects.toThrow(/only promote strategy.*experiences to skill/i);
    });
  });

  describe('memory_experience_delete', () => {
    it('should delete experience and related data', async () => {
      const { experience } = createTestExperience(db, 'delete_test');

      const result = await experienceHandlers.delete(context, {
        agentId: AGENT_ID,
        id: experience.id,
      });

      expect(result.success).toBe(true);

      // Verify it's deleted
      await expect(
        experienceHandlers.get(context, { agentId: AGENT_ID, id: experience.id })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('bulk operations', () => {
    it('should bulk add experiences', async () => {
      const result = await experienceHandlers.bulk_add(context, {
        agentId: AGENT_ID,
        scopeType: 'global',
        entries: [
          { title: 'Bulk 1', content: 'Content 1', category: 'debugging' },
          { title: 'Bulk 2', content: 'Content 2', category: 'refactoring' },
          { title: 'Bulk 3', content: 'Content 3', level: 'strategy' },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.experiences.length).toBe(3);
      expect(result.count).toBe(3);
    });
  });
});
