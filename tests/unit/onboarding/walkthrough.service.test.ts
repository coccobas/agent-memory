import { describe, it, expect, beforeEach } from 'vitest';
import { createWalkthroughService } from '../../../src/services/onboarding/walkthrough.service.js';
import type { WalkthroughProgress } from '../../../src/services/onboarding/walkthrough-types.js';

describe('WalkthroughService', () => {
  let service: ReturnType<typeof createWalkthroughService>;

  beforeEach(() => {
    service = createWalkthroughService();
  });

  describe('getSteps', () => {
    it('should return all walkthrough steps', () => {
      const steps = service.getSteps();
      expect(steps.length).toBe(7);
      expect(steps[0].id).toBe('welcome');
      expect(steps[steps.length - 1].id).toBe('complete');
    });

    it('should have required content for each step', () => {
      const steps = service.getSteps();
      for (const step of steps) {
        expect(step.id).toBeDefined();
        expect(step.title).toBeDefined();
        expect(step.explanation).toBeDefined();
        expect(step.explanation.length).toBeGreaterThan(50);
      }
    });
  });

  describe('getStep', () => {
    it('should return specific step by id', () => {
      const step = service.getStep('welcome');
      expect(step).not.toBeNull();
      expect(step?.title).toBe('Welcome to Agent Memory');
    });

    it('should return null for invalid step id', () => {
      const step = service.getStep('invalid' as never);
      expect(step).toBeNull();
    });
  });

  describe('createInitialProgress', () => {
    it('should create progress starting at welcome', () => {
      const progress = service.createInitialProgress();
      expect(progress.currentStep).toBe('welcome');
      expect(progress.completedSteps).toHaveLength(0);
      expect(progress.hasStoredMemory).toBe(false);
      expect(progress.hasQueriedMemory).toBe(false);
      expect(progress.hasStartedSession).toBe(false);
    });

    it('should set timestamps', () => {
      const before = new Date().toISOString();
      const progress = service.createInitialProgress();
      const after = new Date().toISOString();

      expect(progress.startedAt >= before).toBe(true);
      expect(progress.startedAt <= after).toBe(true);
      expect(progress.lastActivityAt).toBe(progress.startedAt);
    });
  });

  describe('nextStep', () => {
    it('should advance to next step', () => {
      const initial = service.createInitialProgress();
      const next = service.nextStep(initial);

      expect(next.currentStep).toBe('project_setup');
      expect(next.completedSteps).toContain('welcome');
    });

    it('should not go past complete', () => {
      let progress = service.createInitialProgress();

      for (let i = 0; i < 10; i++) {
        progress = service.nextStep(progress);
      }

      expect(progress.currentStep).toBe('complete');
    });

    it('should not duplicate completed steps', () => {
      let progress = service.createInitialProgress();
      progress = service.nextStep(progress);
      progress = service.prevStep(progress);
      progress = service.nextStep(progress);

      const welcomeCount = progress.completedSteps.filter((s) => s === 'welcome').length;
      expect(welcomeCount).toBe(1);
    });
  });

  describe('prevStep', () => {
    it('should go back to previous step', () => {
      let progress = service.createInitialProgress();
      progress = service.nextStep(progress);
      progress = service.prevStep(progress);

      expect(progress.currentStep).toBe('welcome');
    });

    it('should not go before welcome', () => {
      const progress = service.createInitialProgress();
      const prev = service.prevStep(progress);

      expect(prev.currentStep).toBe('welcome');
    });
  });

  describe('gotoStep', () => {
    it('should jump to specific step', () => {
      const progress = service.createInitialProgress();
      const jumped = service.gotoStep(progress, 'querying');

      expect(jumped.currentStep).toBe('querying');
    });

    it('should ignore invalid step id', () => {
      const progress = service.createInitialProgress();
      const result = service.gotoStep(progress, 'invalid' as never);

      expect(result.currentStep).toBe('welcome');
    });
  });

  describe('markAchievement', () => {
    it('should mark stored memory achievement', () => {
      const progress = service.createInitialProgress();
      const updated = service.markAchievement(progress, 'storedMemory');

      expect(updated.hasStoredMemory).toBe(true);
      expect(updated.hasQueriedMemory).toBe(false);
    });

    it('should mark queried memory achievement', () => {
      const progress = service.createInitialProgress();
      const updated = service.markAchievement(progress, 'queriedMemory');

      expect(updated.hasQueriedMemory).toBe(true);
    });

    it('should mark started session achievement', () => {
      const progress = service.createInitialProgress();
      const updated = service.markAchievement(progress, 'startedSession');

      expect(updated.hasStartedSession).toBe(true);
    });
  });

  describe('persistence', () => {
    it('should save and retrieve progress', async () => {
      const projectId = 'test-project';
      const progress = service.createInitialProgress();
      progress.projectId = projectId;

      await service.saveProgress(projectId, progress);
      const retrieved = await service.getProgress(projectId);

      expect(retrieved).toEqual(progress);
    });

    it('should return null for unknown project', async () => {
      const result = await service.getProgress('unknown-project');
      expect(result).toBeNull();
    });
  });

  describe('getStepNumber', () => {
    it('should return 1-indexed step number', () => {
      expect(service.getStepNumber('welcome')).toBe(1);
      expect(service.getStepNumber('project_setup')).toBe(2);
      expect(service.getStepNumber('complete')).toBe(7);
    });
  });

  describe('isComplete', () => {
    it('should return false for incomplete progress', () => {
      const progress = service.createInitialProgress();
      expect(service.isComplete(progress)).toBe(false);
    });

    it('should return true when on complete step', () => {
      const progress: WalkthroughProgress = {
        ...service.createInitialProgress(),
        currentStep: 'complete',
      };
      expect(service.isComplete(progress)).toBe(true);
    });
  });
});
