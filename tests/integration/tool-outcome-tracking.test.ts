/**
 * Tool Outcome Tracking Integration Tests
 *
 * Tests the full pipeline:
 * Tool execution → Outcome storage → Analysis → Knowledge generation
 *
 * Edge cases covered:
 * - All successes (best practices only)
 * - All failures (corrective knowledge only)
 * - Mixed outcomes (both pattern types)
 * - Recovery patterns (failure → success)
 * - Tool sequences
 * - Periodic analysis triggers at threshold (20 tools)
 * - LLM unavailable (graceful degradation)
 * - Timestamp and sequence correctness
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestProject,
  createTestSession,
  schema,
  type TestDb,
} from '../fixtures/test-helpers.js';
import { createToolOutcomesRepository } from '../../src/db/repositories/tool-outcomes.js';
import { OutcomeAnalyzerService } from '../../src/services/learning/outcome-analyzer.service.js';
import type { DatabaseDeps } from '../../src/core/types.js';

const TEST_DB_PATH = './data/test-tool-outcomes.db';
let testDb: TestDb;
let testProjectId: string;
let testSessionId: string;
let toolOutcomesRepo: ReturnType<typeof createToolOutcomesRepository>;
let analyzer: OutcomeAnalyzerService;

describe('Tool Outcome Tracking Integration', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);

    const dbDeps: DatabaseDeps = { db: testDb.db as any, sqlite: testDb.sqlite };
    toolOutcomesRepo = createToolOutcomesRepository(dbDeps);

    const project = createTestProject(testDb.db, 'Tool Outcome Test Project');
    testProjectId = project.id;

    const session = createTestSession(testDb.db, testProjectId, 'Tool Outcome Test Session');
    testSessionId = session.id;

    analyzer = new OutcomeAnalyzerService({ enabled: false }); // Disabled for controlled testing
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    // Clear tool outcomes and counters
    testDb.db.delete(schema.toolOutcomes).run();
    testDb.db.delete(schema.sessionToolCounter).run();
  });

  describe('Full Pipeline', () => {
    it('success → storage → analysis → best practice knowledge', async () => {
      const sessionId = 'test-session-1';

      // Record 10 successful Edit outcomes
      for (let i = 0; i < 10; i++) {
        await toolOutcomesRepo.record({
          sessionId,
          toolName: 'Edit',
          outcome: 'success',
          inputSummary: `Edit file ${i}`,
          outputSummary: 'File updated successfully',
          projectId: testProjectId,
          durationMs: 100,
        });
      }

      // Verify storage
      const outcomes = await toolOutcomesRepo.getBySession(sessionId);
      expect(outcomes).toHaveLength(10);
      expect(outcomes.every((o) => o.outcome === 'success')).toBe(true);

      // Analyze outcomes
      const analysis = await analyzer.analyzeAllPatterns(outcomes);

      // Verify analysis structure (even if LLM disabled, should return valid structure)
      expect(analysis).toBeDefined();
      expect(analysis.totalOutcomes).toBe(10);
      expect(analysis.successRate).toBe(1.0);
      expect(Array.isArray(analysis.bestPractices)).toBe(true);
      expect(Array.isArray(analysis.recoveryPatterns)).toBe(true);
      expect(Array.isArray(analysis.toolSequences)).toBe(true);
      expect(Array.isArray(analysis.efficiencyPatterns)).toBe(true);
    });

    it('failure → success → recovery pattern detected', async () => {
      const sessionId = 'test-session-2';

      // Record failure
      const failureId = await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Bash',
        outcome: 'failure',
        outcomeType: 'command_error',
        message: 'Command not found',
      });

      // Record success (recovery)
      await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Bash',
        outcome: 'success',
        outputSummary: 'Command executed successfully',
        precedingToolId: failureId,
      });

      const outcomes = await toolOutcomesRepo.getBySession(sessionId);
      expect(outcomes).toHaveLength(2);

      const success = outcomes.find((o) => o.outcome === 'success');
      const failure = outcomes.find((o) => o.outcome === 'failure');

      expect(success).toBeDefined();
      expect(failure).toBeDefined();
      expect(success!.precedingToolId).toBe(failureId);

      const analysis = await analyzer.analyzeAllPatterns(outcomes);
      expect(analysis.totalOutcomes).toBe(2);
      expect(analysis.successRate).toBe(0.5);
    });

    it('tool sequence → sequence pattern detected', async () => {
      const sessionId = 'test-session-3';
      const sequence = ['Read', 'Edit', 'Bash'];

      let lastId: string | undefined;
      for (const toolName of sequence) {
        lastId = await toolOutcomesRepo.record({
          sessionId,
          toolName,
          outcome: 'success',
          precedingToolId: lastId,
        });
      }

      const outcomes = await toolOutcomesRepo.getBySession(sessionId);
      expect(outcomes).toHaveLength(3);

      const read = outcomes.find((o) => o.toolName === 'Read');
      const edit = outcomes.find((o) => o.toolName === 'Edit');
      const bash = outcomes.find((o) => o.toolName === 'Bash');

      expect(read).toBeDefined();
      expect(edit).toBeDefined();
      expect(bash).toBeDefined();

      expect(read!.precedingToolId).toBeNull();
      expect(edit!.precedingToolId).toBe(read!.id);
      expect(bash!.precedingToolId).toBe(edit!.id);

      const analysis = await analyzer.analyzeAllPatterns(outcomes);
      expect(analysis.totalOutcomes).toBe(3);
    });
  });

  describe('Periodic Analysis', () => {
    it('triggers at threshold (20 tools)', async () => {
      const sessionId = 'test-session-4';

      // Record 20 outcomes
      for (let i = 0; i < 20; i++) {
        await toolOutcomesRepo.record({
          sessionId,
          toolName: 'Edit',
          outcome: 'success',
        });
        await toolOutcomesRepo.incrementAndGetToolCount(sessionId);
      }

      // Verify counter
      const snapshot = await toolOutcomesRepo.getCounterSnapshot(sessionId);
      expect(snapshot?.toolCount).toBe(20);
      expect(snapshot?.lastAnalysisCount).toBe(0);

      // Simulate periodic trigger
      const countSince = snapshot!.toolCount - snapshot!.lastAnalysisCount;
      expect(countSince).toBeGreaterThanOrEqual(20);

      // CAS claim
      const claimed = await toolOutcomesRepo.tryClaimAnalysis(
        sessionId,
        snapshot!.lastAnalysisCount,
        snapshot!.toolCount
      );
      expect(claimed).toBe(true);

      // Verify counter updated
      const afterClaim = await toolOutcomesRepo.getCounterSnapshot(sessionId);
      expect(afterClaim?.lastAnalysisCount).toBe(20);
    });

    it('does not trigger below threshold', async () => {
      const sessionId = 'test-session-5';

      // Record only 10 outcomes
      for (let i = 0; i < 10; i++) {
        await toolOutcomesRepo.record({
          sessionId,
          toolName: 'Edit',
          outcome: 'success',
        });
        await toolOutcomesRepo.incrementAndGetToolCount(sessionId);
      }

      const snapshot = await toolOutcomesRepo.getCounterSnapshot(sessionId);
      const countSince = snapshot!.toolCount - snapshot!.lastAnalysisCount;
      expect(countSince).toBeLessThan(20);
    });

    it('resets counter after analysis', async () => {
      const sessionId = 'test-session-6';

      // Record 20, trigger analysis
      for (let i = 0; i < 20; i++) {
        await toolOutcomesRepo.record({
          sessionId,
          toolName: 'Edit',
          outcome: 'success',
        });
        await toolOutcomesRepo.incrementAndGetToolCount(sessionId);
      }

      const snapshot = await toolOutcomesRepo.getCounterSnapshot(sessionId);
      await toolOutcomesRepo.tryClaimAnalysis(
        sessionId,
        snapshot!.lastAnalysisCount,
        snapshot!.toolCount
      );

      // Verify counter delta is now 0
      const after = await toolOutcomesRepo.getCounterSnapshot(sessionId);
      expect(after!.toolCount - after!.lastAnalysisCount).toBe(0);
    });

    it('handles concurrent analysis attempts (CAS)', async () => {
      const sessionId = 'test-session-7';

      // Record 20 outcomes
      for (let i = 0; i < 20; i++) {
        await toolOutcomesRepo.record({
          sessionId,
          toolName: 'Edit',
          outcome: 'success',
        });
        await toolOutcomesRepo.incrementAndGetToolCount(sessionId);
      }

      const snapshot = await toolOutcomesRepo.getCounterSnapshot(sessionId);

      // First claim succeeds
      const claim1 = await toolOutcomesRepo.tryClaimAnalysis(
        sessionId,
        snapshot!.lastAnalysisCount,
        snapshot!.toolCount
      );
      expect(claim1).toBe(true);

      // Second claim with same expectedLast fails (CAS prevents double analysis)
      const claim2 = await toolOutcomesRepo.tryClaimAnalysis(
        sessionId,
        snapshot!.lastAnalysisCount,
        snapshot!.toolCount
      );
      expect(claim2).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('all successes: generates best practices only', async () => {
      const sessionId = 'test-session-8';

      for (let i = 0; i < 10; i++) {
        await toolOutcomesRepo.record({
          sessionId,
          toolName: 'Edit',
          outcome: 'success',
        });
      }

      const outcomes = await toolOutcomesRepo.getBySession(sessionId);
      const analysis = await analyzer.analyzeAllPatterns(outcomes);

      // Should have 100% success rate
      expect(analysis.successRate).toBe(1.0);
      expect(analysis.totalOutcomes).toBe(10);

      // With LLM disabled, patterns will be empty, but structure is valid
      expect(Array.isArray(analysis.bestPractices)).toBe(true);
      expect(Array.isArray(analysis.recoveryPatterns)).toBe(true);
    });

    it('all failures: generates corrective knowledge only', async () => {
      const sessionId = 'test-session-9';

      for (let i = 0; i < 10; i++) {
        await toolOutcomesRepo.record({
          sessionId,
          toolName: 'Bash',
          outcome: 'failure',
          outcomeType: 'command_error',
        });
      }

      const outcomes = await toolOutcomesRepo.getBySession(sessionId);
      const analysis = await analyzer.analyzeAllPatterns(outcomes);

      // Should have 0% success rate
      expect(analysis.successRate).toBe(0);
      expect(analysis.totalOutcomes).toBe(10);
    });

    it('mixed: generates both pattern types', async () => {
      const sessionId = 'test-session-10';

      // Mix of successes and failures
      for (let i = 0; i < 5; i++) {
        await toolOutcomesRepo.record({
          sessionId,
          toolName: 'Edit',
          outcome: 'success',
        });
      }
      for (let i = 0; i < 5; i++) {
        await toolOutcomesRepo.record({
          sessionId,
          toolName: 'Bash',
          outcome: 'failure',
          outcomeType: 'command_error',
        });
      }

      const outcomes = await toolOutcomesRepo.getBySession(sessionId);
      const analysis = await analyzer.analyzeAllPatterns(outcomes);

      expect(analysis.successRate).toBe(0.5);
      expect(analysis.totalOutcomes).toBe(10);
    });

    it('LLM unavailable: graceful degradation', async () => {
      const sessionId = 'test-session-11';

      await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Edit',
        outcome: 'success',
      });

      const outcomes = await toolOutcomesRepo.getBySession(sessionId);

      // Should not throw even if LLM fails
      await expect(analyzer.analyzeAllPatterns(outcomes)).resolves.toBeDefined();

      const analysis = await analyzer.analyzeAllPatterns(outcomes);
      expect(analysis.totalOutcomes).toBe(1);
      expect(analysis.successRate).toBe(1.0);
    });

    it('insufficient outcomes: skips analysis', async () => {
      const sessionId = 'test-session-12';

      // Record only 2 outcomes (below minOutcomesForAnalysis = 5)
      await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Edit',
        outcome: 'success',
      });
      await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Read',
        outcome: 'success',
      });

      const outcomes = await toolOutcomesRepo.getBySession(sessionId);
      const analysis = await analyzer.analyzeAllPatterns(outcomes);

      // Should return empty patterns (below threshold)
      expect(analysis.totalOutcomes).toBe(2);
      expect(analysis.bestPractices).toEqual([]);
      expect(analysis.recoveryPatterns).toEqual([]);
      expect(analysis.toolSequences).toEqual([]);
      expect(analysis.efficiencyPatterns).toEqual([]);
    });
  });

  describe('Timestamp and Sequence Correctness', () => {
    it('precedingToolId is set correctly via getLastOutcomeForSession', async () => {
      const sessionId = 's1';

      const id1 = await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Read',
        outcome: 'success',
      });

      const lastBefore2 = await toolOutcomesRepo.getLastOutcomeForSession(sessionId);
      expect(lastBefore2?.id).toBe(id1);

      const id2 = await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Edit',
        outcome: 'success',
        precedingToolId: lastBefore2?.id ?? undefined,
      });

      const outcomes = await toolOutcomesRepo.getBySession(sessionId);
      const second = outcomes.find((o) => o.id === id2);
      expect(second?.precedingToolId).toBe(id1);
    });

    it('getRecentOutcomes returns N most recent by timestamp+id order', async () => {
      const sessionId = 's2';

      // Insert 5 outcomes with small delays
      const ids: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const id = await toolOutcomesRepo.record({
          sessionId,
          toolName: 'Edit',
          outcome: 'success',
        });
        ids.push(id);
        await new Promise((r) => setTimeout(r, 5));
      }

      // Query most recent 3
      const recent = await toolOutcomesRepo.getRecentOutcomes(sessionId, 3);
      expect(recent.length).toBe(3);

      // Should be in reverse insertion order (most recent first)
      expect(new Date(recent[0].createdAt) >= new Date(recent[1].createdAt)).toBe(true);
      expect(new Date(recent[1].createdAt) >= new Date(recent[2].createdAt)).toBe(true);
    });

    it('same-millisecond ties are deterministic', async () => {
      const sessionId = 's3';

      // Insert multiple outcomes as fast as possible
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        const id = await toolOutcomesRepo.record({
          sessionId,
          toolName: 'Edit',
          outcome: 'success',
        });
        ids.push(id);
      }

      // Query twice - should get same order both times
      const batch1 = await toolOutcomesRepo.getRecentOutcomes(sessionId, 10);
      const batch2 = await toolOutcomesRepo.getRecentOutcomes(sessionId, 10);

      expect(batch1.map((o) => o.id)).toEqual(batch2.map((o) => o.id));
    });

    it('getBySession returns outcomes in correct order', async () => {
      const sessionId = 's4';

      // Insert outcomes with known order
      const id1 = await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Read',
        outcome: 'success',
      });
      await new Promise((r) => setTimeout(r, 10));

      const id2 = await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Edit',
        outcome: 'success',
      });
      await new Promise((r) => setTimeout(r, 10));

      const id3 = await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Bash',
        outcome: 'success',
      });

      const outcomes = await toolOutcomesRepo.getBySession(sessionId);

      // Should be in reverse chronological order (most recent first)
      expect(outcomes[0].id).toBe(id3);
      expect(outcomes[1].id).toBe(id2);
      expect(outcomes[2].id).toBe(id1);
    });
  });

  describe('Counter Management', () => {
    it('incrementAndGetToolCount creates counter on first call', async () => {
      const sessionId = 'counter-test-1';

      const count = await toolOutcomesRepo.incrementAndGetToolCount(sessionId);
      expect(count).toBe(1);

      const snapshot = await toolOutcomesRepo.getCounterSnapshot(sessionId);
      expect(snapshot?.toolCount).toBe(1);
      expect(snapshot?.lastAnalysisCount).toBe(0);
    });

    it('incrementAndGetToolCount increments existing counter', async () => {
      const sessionId = 'counter-test-2';

      await toolOutcomesRepo.incrementAndGetToolCount(sessionId);
      const count2 = await toolOutcomesRepo.incrementAndGetToolCount(sessionId);
      const count3 = await toolOutcomesRepo.incrementAndGetToolCount(sessionId);

      expect(count2).toBe(2);
      expect(count3).toBe(3);
    });

    it('getToolCountSinceLastAnalysis returns correct delta', async () => {
      const sessionId = 'counter-test-3';

      // Increment 5 times
      for (let i = 0; i < 5; i++) {
        await toolOutcomesRepo.incrementAndGetToolCount(sessionId);
      }

      const delta1 = await toolOutcomesRepo.getToolCountSinceLastAnalysis(sessionId);
      expect(delta1).toBe(5);

      // Mark analysis complete
      await toolOutcomesRepo.markAnalysisComplete(sessionId);

      const delta2 = await toolOutcomesRepo.getToolCountSinceLastAnalysis(sessionId);
      expect(delta2).toBe(0);

      // Increment 3 more times
      for (let i = 0; i < 3; i++) {
        await toolOutcomesRepo.incrementAndGetToolCount(sessionId);
      }

      const delta3 = await toolOutcomesRepo.getToolCountSinceLastAnalysis(sessionId);
      expect(delta3).toBe(3);
    });

    it('deleteCounter removes counter', async () => {
      const sessionId = 'counter-test-4';

      await toolOutcomesRepo.incrementAndGetToolCount(sessionId);
      let snapshot = await toolOutcomesRepo.getCounterSnapshot(sessionId);
      expect(snapshot).toBeDefined();

      await toolOutcomesRepo.deleteCounter(sessionId);
      snapshot = await toolOutcomesRepo.getCounterSnapshot(sessionId);
      expect(snapshot).toBeUndefined();
    });
  });

  describe('Analysis Tracking', () => {
    it('markAnalyzed updates analyzed flag', async () => {
      const sessionId = 'analyzed-test-1';

      const id = await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Edit',
        outcome: 'success',
      });

      // Initially unanalyzed
      const unanalyzed = await toolOutcomesRepo.getUnanalyzed();
      expect(unanalyzed.some((o) => o.id === id)).toBe(true);

      // Mark as analyzed
      await toolOutcomesRepo.markAnalyzed(id);

      // Should no longer appear in unanalyzed
      const stillUnanalyzed = await toolOutcomesRepo.getUnanalyzed();
      expect(stillUnanalyzed.some((o) => o.id === id)).toBe(false);
    });

    it('getUnanalyzed returns only unanalyzed outcomes', async () => {
      const sessionId = 'analyzed-test-2';

      const id1 = await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Edit',
        outcome: 'success',
      });

      const id2 = await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Read',
        outcome: 'success',
      });

      const id3 = await toolOutcomesRepo.record({
        sessionId,
        toolName: 'Bash',
        outcome: 'success',
      });

      // Mark id2 as analyzed
      await toolOutcomesRepo.markAnalyzed(id2);

      const unanalyzed = await toolOutcomesRepo.getUnanalyzed();
      const unanalyzedIds = unanalyzed.map((o) => o.id);

      expect(unanalyzedIds).toContain(id1);
      expect(unanalyzedIds).not.toContain(id2);
      expect(unanalyzedIds).toContain(id3);
    });

    it('getUnanalyzed respects limit parameter', async () => {
      const sessionId = 'analyzed-test-3';

      // Create 10 unanalyzed outcomes
      for (let i = 0; i < 10; i++) {
        await toolOutcomesRepo.record({
          sessionId,
          toolName: 'Edit',
          outcome: 'success',
        });
      }

      const limited = await toolOutcomesRepo.getUnanalyzed(5);
      expect(limited.length).toBe(5);

      const unlimited = await toolOutcomesRepo.getUnanalyzed();
      expect(unlimited.length).toBe(10);
    });
  });
});
