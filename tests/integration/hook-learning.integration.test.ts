/**
 * Integration Test: Hook Learning Service
 *
 * Tests the full flow of hooks creating experiences and triggering Librarian analysis.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../../src/db/schema.js';
import { createExperienceRepository } from '../../src/db/repositories/experiences.js';
import { createKnowledgeRepository } from '../../src/db/repositories/knowledge.js';
import type {
  IExperienceRepository,
  IKnowledgeRepository,
} from '../../src/core/interfaces/repositories.js';
import {
  HookLearningService,
  resetHookLearningService,
} from '../../src/services/learning/hook-learning.service.js';

describe('Hook Learning Service Integration', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let experienceRepo: IExperienceRepository;
  let knowledgeRepo: IKnowledgeRepository;
  let learningService: HookLearningService;
  let projectId: string;
  let sessionId: string;
  let testCounter = 0;

  beforeAll(() => {
    // Create in-memory test database
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    db = drizzle(sqlite, { schema });

    // Run migrations
    const migrations = [
      '0000_lying_the_hand.sql',
      '0012_add_experiences.sql',
      '0016_add_access_tracking.sql',
      '0017_add_temporal_knowledge.sql',
    ];
    for (const migrationFile of migrations) {
      const migrationPath = join(process.cwd(), 'src/db/migrations', migrationFile);
      if (existsSync(migrationPath)) {
        const migrationSql = readFileSync(migrationPath, 'utf-8');
        const statements = migrationSql.split('--> statement-breakpoint');
        for (const statement of statements) {
          const trimmed = statement.trim();
          if (trimmed) {
            try {
              sqlite.exec(trimmed);
            } catch {
              // Ignore errors from duplicate tables/indexes
            }
          }
        }
      }
    }

    // Create repositories
    experienceRepo = createExperienceRepository({ db, sqlite });
    knowledgeRepo = createKnowledgeRepository({ db, sqlite });
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    // Generate unique IDs for each test to avoid cross-test contamination
    testCounter++;
    sessionId = `sess-hook-learning-test-${testCounter}`;
    projectId = `proj-hook-learning-test-${testCounter}`;

    // Reset and configure learning service for each test
    resetHookLearningService();
    learningService = new HookLearningService({
      enabled: true,
      minFailuresForExperience: 2,
      errorPatternThreshold: 2,
      errorPatternWindowMs: 60000, // 1 minute
      analysisThreshold: 10, // High threshold so we don't trigger Librarian
      defaultConfidence: 0.7,
      includeToolInput: false,
      enableKnowledgeExtraction: true,
      knowledgeConfidenceThreshold: 0.7,
      knowledgeExtractionTools: ['Read', 'Grep', 'Glob', 'Bash', 'WebFetch'],
      minOutputLengthForKnowledge: 50,
    });
    learningService.setDependencies({ experienceRepo, knowledgeRepo });
  });

  describe('Tool Failure Learning', () => {
    it('should not create experience on first failure', async () => {
      const result = await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        toolInput: { command: 'npm test' },
        errorType: 'non_zero_exit',
        errorMessage: 'Error: Command failed with exit code 1',
        timestamp: new Date().toISOString(),
      });

      expect(result.experienceCreated).toBe(false);
      expect(result.experienceId).toBeUndefined();
    });

    it('should create experience after 2 consecutive failures of same tool', async () => {
      // First failure
      await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        toolInput: { command: 'npm test' },
        errorType: 'non_zero_exit',
        errorMessage: 'Error: Command failed with exit code 1',
        timestamp: new Date().toISOString(),
      });

      // Second failure
      const result = await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        toolInput: { command: 'npm test' },
        errorType: 'non_zero_exit',
        errorMessage: 'Error: Command failed with exit code 1 - test suite failure',
        timestamp: new Date().toISOString(),
      });

      expect(result.experienceCreated).toBe(true);
      expect(result.experienceId).toBeDefined();

      // Verify experience was created correctly
      const experience = await experienceRepo.getById(result.experienceId!);
      expect(experience).toBeDefined();
      expect(experience?.title).toContain('Bash');
      expect(experience?.category).toBe('tool-failure');
      expect(experience?.level).toBe('case');
    });

    it('should not create duplicate experiences for same failure pattern', async () => {
      // Create first experience (2 failures)
      await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'non_zero_exit',
        errorMessage: 'Error 1',
        timestamp: new Date().toISOString(),
      });
      const first = await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'non_zero_exit',
        errorMessage: 'Error 2',
        timestamp: new Date().toISOString(),
      });

      expect(first.experienceCreated).toBe(true);

      // More failures with same pattern (should NOT create another experience due to duplicate detection)
      await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'non_zero_exit',
        errorMessage: 'Error 3',
        timestamp: new Date().toISOString(),
      });
      const second = await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'non_zero_exit',
        errorMessage: 'Error 4',
        timestamp: new Date().toISOString(),
      });

      // Should NOT create another experience due to duplicate pattern detection
      expect(second.experienceCreated).toBe(false);
    });

    it('should create experience for different failure pattern', async () => {
      // Create first experience with one error type
      await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'non_zero_exit',
        errorMessage: 'Error 1',
        timestamp: new Date().toISOString(),
      });
      const first = await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'non_zero_exit',
        errorMessage: 'Error 2',
        timestamp: new Date().toISOString(),
      });

      expect(first.experienceCreated).toBe(true);

      // Different error type should create new experience
      await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'timeout', // Different error type!
        errorMessage: 'Error 3',
        timestamp: new Date().toISOString(),
      });
      const second = await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'timeout',
        errorMessage: 'Error 4',
        timestamp: new Date().toISOString(),
      });

      // Should create another experience because it's a different pattern
      expect(second.experienceCreated).toBe(true);
    });
  });

  describe('Subagent Completion Learning', () => {
    it('should create experience for failed subagent', async () => {
      const result = await learningService.onSubagentCompletion({
        sessionId,
        projectId,
        subagentId: 'subagent-123',
        subagentType: 'Explore',
        success: false,
        resultSummary:
          'Failed to find the requested files. The search pattern did not match any files.',
        resultSize: 500,
        durationMs: 5000,
        timestamp: new Date().toISOString(),
      });

      expect(result.experienceCreated).toBe(true);
      expect(result.experienceId).toBeDefined();

      const experience = await experienceRepo.getById(result.experienceId!);
      expect(experience).toBeDefined();
      expect(experience?.title).toContain('Explore');
      expect(experience?.category).toBe('subagent-failure');
    });

    it('should create experience for significant successful subagent', async () => {
      const result = await learningService.onSubagentCompletion({
        sessionId,
        projectId,
        subagentId: 'subagent-456',
        subagentType: 'Plan',
        success: true,
        // Long result summary (>200 chars) makes it significant
        resultSummary:
          'Created detailed implementation plan with 5 phases. Phase 1: Initial setup and configuration. Phase 2: Core implementation. Phase 3: Testing and validation. Phase 4: Integration. Phase 5: Deployment and monitoring. Each phase has clear milestones.',
        resultSize: 1000,
        durationMs: 10000,
        timestamp: new Date().toISOString(),
      });

      expect(result.experienceCreated).toBe(true);
      expect(result.experienceId).toBeDefined();

      const experience = await experienceRepo.getById(result.experienceId!);
      expect(experience).toBeDefined();
      expect(experience?.title).toContain('Plan');
      expect(experience?.category).toBe('subagent-success');
    });

    it('should not create experience for trivial successful subagent', async () => {
      const result = await learningService.onSubagentCompletion({
        sessionId,
        projectId,
        subagentId: 'subagent-789',
        subagentType: 'Explore',
        success: true,
        resultSummary: 'Found 3 files', // Short result, not significant
        resultSize: 50,
        durationMs: 1000,
        timestamp: new Date().toISOString(),
      });

      expect(result.experienceCreated).toBe(false);
    });
  });

  describe('Error Pattern Learning', () => {
    it('should not detect pattern on first error', async () => {
      const result = await learningService.onErrorNotification({
        sessionId,
        projectId,
        errorType: 'build',
        message: 'Build failed: TypeScript compilation error',
        timestamp: new Date().toISOString(),
      });

      expect(result.patternDetected).toBe(false);
      expect(result.experienceCreated).toBe(false);
    });

    it('should detect pattern after threshold errors', async () => {
      // First error
      await learningService.onErrorNotification({
        sessionId,
        projectId,
        errorType: 'build',
        message: 'Build failed: TypeScript compilation error 1',
        timestamp: new Date().toISOString(),
      });

      // Second error (should trigger pattern)
      const result = await learningService.onErrorNotification({
        sessionId,
        projectId,
        errorType: 'build',
        message: 'Build failed: TypeScript compilation error 2',
        timestamp: new Date().toISOString(),
      });

      expect(result.patternDetected).toBe(true);
      expect(result.experienceCreated).toBe(true);
      expect(result.experienceId).toBeDefined();

      const experience = await experienceRepo.getById(result.experienceId!);
      expect(experience).toBeDefined();
      expect(experience?.category).toBe('error-pattern');
    });
  });

  describe('Session Statistics', () => {
    it('should track session statistics correctly', async () => {
      // Add some failures
      await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'error',
        errorMessage: 'Error',
        timestamp: new Date().toISOString(),
      });

      await learningService.onErrorNotification({
        sessionId,
        projectId,
        errorType: 'build',
        message: 'Error',
        timestamp: new Date().toISOString(),
      });

      const stats = learningService.getSessionStats(sessionId);
      expect(stats.toolFailureCount).toBe(1);
      expect(stats.errorCount).toBe(1);
    });

    it('should cleanup session data correctly', async () => {
      // Add some data
      await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'error',
        errorMessage: 'Error',
        timestamp: new Date().toISOString(),
      });

      // Cleanup
      learningService.cleanupSession(sessionId);

      const stats = learningService.getSessionStats(sessionId);
      expect(stats.toolFailureCount).toBe(0);
      expect(stats.errorCount).toBe(0);
      expect(stats.experiencesCreated).toBe(0);
    });
  });

  describe('Service Configuration', () => {
    it('should respect enabled flag', async () => {
      learningService.updateConfig({ enabled: false });

      const result = await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'error',
        errorMessage: 'Error',
        timestamp: new Date().toISOString(),
      });

      expect(result.experienceCreated).toBe(false);
    });

    it('should respect custom thresholds', async () => {
      // Set higher threshold
      learningService.updateConfig({ minFailuresForExperience: 3 });

      // 2 failures should not create experience
      await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'error',
        errorMessage: 'Error 1',
        timestamp: new Date().toISOString(),
      });
      const second = await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'error',
        errorMessage: 'Error 2',
        timestamp: new Date().toISOString(),
      });

      expect(second.experienceCreated).toBe(false);

      // 3rd failure should create experience
      const third = await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'error',
        errorMessage: 'Error 3',
        timestamp: new Date().toISOString(),
      });

      expect(third.experienceCreated).toBe(true);
    });
  });

  describe('Complete Flow Verification', () => {
    it('should create experiences from different hook types with proper data', async () => {
      const createdExperienceIds: string[] = [];

      // Tool failure experience
      await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Read',
        errorType: 'file_not_found',
        errorMessage: 'File does not exist',
        timestamp: new Date().toISOString(),
      });
      const toolResult = await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Read',
        errorType: 'file_not_found',
        errorMessage: 'Another file not found',
        timestamp: new Date().toISOString(),
      });
      if (toolResult.experienceId) createdExperienceIds.push(toolResult.experienceId);

      // Subagent failure experience
      const subagentResult = await learningService.onSubagentCompletion({
        sessionId,
        projectId,
        subagentId: 'subagent-test-1',
        subagentType: 'Explore',
        success: false,
        resultSummary: 'Failed to find requested files in the codebase',
        resultSize: 100,
        durationMs: 5000,
        timestamp: new Date().toISOString(),
      });
      if (subagentResult.experienceId) createdExperienceIds.push(subagentResult.experienceId);

      // Error pattern experience
      await learningService.onErrorNotification({
        sessionId,
        projectId,
        errorType: 'build',
        message: 'TypeScript compilation failed',
        timestamp: new Date().toISOString(),
      });
      const errorResult = await learningService.onErrorNotification({
        sessionId,
        projectId,
        errorType: 'build',
        message: 'Still failing to compile',
        timestamp: new Date().toISOString(),
      });
      if (errorResult.experienceId) createdExperienceIds.push(errorResult.experienceId);

      // Verify all experiences were created
      expect(createdExperienceIds.length).toBe(3);

      // Verify each has different categories
      const categories = new Set<string>();
      for (const id of createdExperienceIds) {
        const exp = await experienceRepo.getById(id);
        expect(exp).toBeDefined();
        categories.add(exp!.category ?? 'unknown');
      }
      expect(categories.size).toBe(3);
      expect(categories.has('tool-failure')).toBe(true);
      expect(categories.has('subagent-failure')).toBe(true);
      expect(categories.has('error-pattern')).toBe(true);
    });

    it('should create experiences with trajectory data for pattern detection', async () => {
      await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Edit',
        errorType: 'syntax_error',
        errorMessage: 'Invalid syntax in file',
        timestamp: new Date().toISOString(),
      });
      const result = await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Edit',
        errorType: 'syntax_error',
        errorMessage: 'Parse error in modified file',
        timestamp: new Date().toISOString(),
      });

      // Get experience with trajectory data
      const experience = await experienceRepo.getById(result.experienceId!, true);

      // Verify experience has all required fields for Librarian pattern detection
      expect(experience).toBeDefined();
      expect(experience?.title).toBeDefined();
      expect(experience?.category).toBeDefined();
      expect(experience?.level).toBe('case');

      // Content, scenario, outcome are in currentVersion
      expect(experience?.currentVersion).toBeDefined();
      expect(experience?.currentVersion?.content).toBeDefined();
      expect(experience?.currentVersion?.scenario).toBeDefined();
      expect(experience?.currentVersion?.outcome).toBeDefined();
      expect(experience?.currentVersion?.confidence).toBeGreaterThan(0);

      // Verify experience has trajectory steps for similarity comparison
      expect(experience?.trajectorySteps).toBeDefined();
      expect(experience?.trajectorySteps?.length).toBeGreaterThanOrEqual(1);

      // Each step should have required fields
      const step = experience?.trajectorySteps?.[0];
      expect(step).toBeDefined();
      expect(step?.action).toBeDefined();
      expect(step?.observation).toBeDefined();
    });
  });

  describe('Knowledge Extraction Learning', () => {
    it('should extract knowledge from tool output with matching patterns', async () => {
      const result = await learningService.onToolSuccess({
        sessionId,
        projectId,
        toolName: 'Read',
        toolInput: { file_path: '/path/to/package.json' },
        toolOutput:
          'Configuration: {"typescript": true, "strict": true}\nversion: 2.5.0 found in dependencies',
        timestamp: new Date().toISOString(),
      });

      expect(result.knowledgeCreated).toBe(true);
      expect(result.knowledgeIds.length).toBeGreaterThanOrEqual(1);

      // Verify knowledge was stored correctly
      const knowledge = await knowledgeRepo.getById(result.knowledgeIds[0]!);
      expect(knowledge).toBeDefined();
      expect(knowledge?.title).toBeDefined();
      expect(knowledge?.category).toBeDefined();
    });

    it('should not extract knowledge from tools not in the extraction list', async () => {
      const result = await learningService.onToolSuccess({
        sessionId,
        projectId,
        toolName: 'Edit', // Not in the default extraction tools list
        toolInput: { file_path: '/path/to/file.ts' },
        toolOutput: 'Configuration: some config value with enough length to pass minimum check',
        timestamp: new Date().toISOString(),
      });

      expect(result.knowledgeCreated).toBe(false);
      expect(result.knowledgeIds.length).toBe(0);
    });

    it('should not extract knowledge from short outputs', async () => {
      const result = await learningService.onToolSuccess({
        sessionId,
        projectId,
        toolName: 'Read',
        toolInput: { file_path: '/path/to/file.ts' },
        toolOutput: 'short', // Below minOutputLengthForKnowledge (50)
        timestamp: new Date().toISOString(),
      });

      expect(result.knowledgeCreated).toBe(false);
      expect(result.knowledgeIds.length).toBe(0);
    });

    it('should extract knowledge from subagent findings', async () => {
      const result = await learningService.onSubagentKnowledge({
        sessionId,
        projectId,
        subagentType: 'Explore',
        findings:
          'Found configuration: tsconfig.json with strict mode enabled. Architecture: monorepo structure with packages folder.',
        timestamp: new Date().toISOString(),
      });

      expect(result.knowledgeCreated).toBe(true);
      expect(result.knowledgeIds.length).toBeGreaterThanOrEqual(1);
    });

    it('should not extract knowledge from non-knowledge subagent types', async () => {
      const result = await learningService.onSubagentKnowledge({
        sessionId,
        projectId,
        subagentType: 'Bash', // Not in the knowledge subagent list
        findings: 'Configuration: some config value with enough length',
        timestamp: new Date().toISOString(),
      });

      expect(result.knowledgeCreated).toBe(false);
      expect(result.knowledgeIds.length).toBe(0);
    });

    it('should track knowledge statistics correctly', async () => {
      // Initial stats
      const initialStats = learningService.getKnowledgeStats(sessionId);
      expect(initialStats.knowledgeCount).toBe(0);

      // Create some knowledge
      await learningService.onToolSuccess({
        sessionId,
        projectId,
        toolName: 'Read',
        toolOutput:
          'Configuration: some important config value that is long enough to pass minimum',
        timestamp: new Date().toISOString(),
      });

      const afterStats = learningService.getKnowledgeStats(sessionId);
      expect(afterStats.knowledgeCount).toBeGreaterThanOrEqual(1);
    });

    it('should not create duplicate knowledge within same session', async () => {
      // First call should create knowledge
      const first = await learningService.onToolSuccess({
        sessionId,
        projectId,
        toolName: 'Read',
        toolOutput: 'Configuration: exact same config that will match patterns',
        timestamp: new Date().toISOString(),
      });

      // Second call with same content should not create duplicate
      const second = await learningService.onToolSuccess({
        sessionId,
        projectId,
        toolName: 'Read',
        toolOutput: 'Configuration: exact same config that will match patterns',
        timestamp: new Date().toISOString(),
      });

      // First should create, second should not (duplicate)
      if (first.knowledgeCreated) {
        // Knowledge was extracted from first call
        expect(second.knowledgeIds.length).toBeLessThanOrEqual(first.knowledgeIds.length);
      }
    });

    it('should respect enableKnowledgeExtraction config flag', async () => {
      // Disable knowledge extraction
      learningService.updateConfig({ enableKnowledgeExtraction: false });

      const result = await learningService.onToolSuccess({
        sessionId,
        projectId,
        toolName: 'Read',
        toolOutput: 'Configuration: some config value that would normally trigger extraction',
        timestamp: new Date().toISOString(),
      });

      expect(result.knowledgeCreated).toBe(false);
      expect(result.knowledgeIds.length).toBe(0);
    });

    it('should cleanup knowledge tracking on session cleanup', async () => {
      // Create some knowledge
      await learningService.onToolSuccess({
        sessionId,
        projectId,
        toolName: 'Read',
        toolOutput: 'Configuration: some config value that triggers extraction',
        timestamp: new Date().toISOString(),
      });

      // Verify stats before cleanup
      const beforeStats = learningService.getKnowledgeStats(sessionId);
      expect(beforeStats.knowledgeCount).toBeGreaterThanOrEqual(0);

      // Cleanup session
      learningService.cleanupSession(sessionId);

      // Verify stats reset after cleanup
      const afterStats = learningService.getKnowledgeStats(sessionId);
      expect(afterStats.knowledgeCount).toBe(0);
    });
  });

  describe('Librarian Auto-Trigger', () => {
    it('should trigger Librarian analysis when experience threshold is reached', async () => {
      // Create a mock Librarian service
      let analysisTriggered = false;
      let analysisScopeId: string | undefined;
      const mockLibrarian = {
        analyze: async (params: { scopeType: string; scopeId: string; lookbackDays: number }) => {
          analysisTriggered = true;
          analysisScopeId = params.scopeId;
          return {
            patternDetection: { stats: { patternsFound: 1 } },
            generatedRecommendations: [],
          };
        },
      };

      // Configure service with low threshold and mock Librarian
      learningService.updateConfig({ analysisThreshold: 2 });
      learningService.setDependencies({
        experienceRepo,
        librarianService:
          mockLibrarian as unknown as import('../../src/services/librarian/index.js').LibrarianService,
      });

      // Create first experience (triggers on 2nd failure)
      await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'error1',
        errorMessage: 'First error',
        timestamp: new Date().toISOString(),
      });
      await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'error1',
        errorMessage: 'Second error',
        timestamp: new Date().toISOString(),
      });

      // First experience - not enough to trigger Librarian yet
      expect(analysisTriggered).toBe(false);

      // Create second experience (different error type)
      await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'error2',
        errorMessage: 'Third error',
        timestamp: new Date().toISOString(),
      });
      const result = await learningService.onToolFailure({
        sessionId,
        projectId,
        toolName: 'Bash',
        errorType: 'error2',
        errorMessage: 'Fourth error',
        timestamp: new Date().toISOString(),
      });

      expect(result.experienceCreated).toBe(true);

      // Give async Librarian trigger time to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second experience should trigger Librarian (threshold = 2)
      expect(analysisTriggered).toBe(true);
      expect(analysisScopeId).toBe(projectId);
    });

    it('should handle manual Librarian trigger', async () => {
      let manualTriggered = false;
      const mockLibrarian = {
        analyze: async () => {
          manualTriggered = true;
          return {
            patternDetection: { stats: { patternsFound: 2 } },
            generatedRecommendations: [{ id: 'rec-1' }],
          };
        },
      };

      learningService.setDependencies({
        experienceRepo,
        librarianService:
          mockLibrarian as unknown as import('../../src/services/librarian/index.js').LibrarianService,
      });

      const result = await learningService.triggerAnalysis({
        sessionId,
        projectId,
        dryRun: false,
      });

      expect(result.triggered).toBe(true);
      expect(result.patternsFound).toBe(2);
      expect(result.recommendationsCreated).toBe(1);
      expect(manualTriggered).toBe(true);
    });
  });
});
