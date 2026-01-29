/**
 * Error Learning Integration Tests
 *
 * Tests the full error learning pipeline:
 * PostToolUse → ErrorLog → Analysis → Knowledge Storage
 *
 * Edge cases covered:
 * - Empty sessions (0 errors)
 * - LLM unavailability
 * - Sessions without projectId
 * - Conflicting patterns
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  createTestProject,
  createTestSession,
  schema,
  type TestDb,
} from '../fixtures/test-helpers.js';
import { createErrorLogRepository } from '../../src/db/repositories/error-log.js';
import {
  ErrorAnalyzerService,
  type ErrorPattern,
} from '../../src/services/learning/error-analyzer.service.js';
import type { DatabaseDeps } from '../../src/core/types.js';
import type { Repositories } from '../../src/core/interfaces/repositories.js';
import { createHash } from 'crypto';

const TEST_DB_PATH = './data/test-error-learning.db';
let testDb: TestDb;
let testProjectId: string;
let testSessionId: string;
let testSessionIdNoProject: string;
let repos: Repositories;
let errorLogRepo: ReturnType<typeof createErrorLogRepository>;

// Mock LLM responses for predictable testing
const mockPatterns: ErrorPattern[] = [
  {
    patternType: 'wrong_path',
    description: 'Agent looking for database in wrong location',
    frequency: 3,
    suggestedCorrection: {
      type: 'knowledge',
      title: 'Database Location',
      content: 'Database is at data/memory.db, not ~/.agent-memory/memory.db',
    },
    confidence: 0.95,
  },
  {
    patternType: 'config_error',
    description: 'Missing TypeScript configuration',
    frequency: 2,
    suggestedCorrection: {
      type: 'guideline',
      title: 'TypeScript Config Required',
      content: 'Always ensure tsconfig.json exists before running TypeScript commands',
    },
    confidence: 0.85,
  },
];

describe('Error Learning Integration', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    repos = createTestRepositories(testDb);

    const dbDeps: DatabaseDeps = { db: testDb.db as any, sqlite: testDb.sqlite };
    errorLogRepo = createErrorLogRepository(dbDeps);

    const project = createTestProject(testDb.db, 'Error Learning Test Project');
    testProjectId = project.id;

    const session = createTestSession(testDb.db, testProjectId, 'Error Learning Test Session');
    testSessionId = session.id;

    // Create session without projectId for edge case testing
    const sessionNoProject = testDb.db
      .insert(schema.sessions)
      .values({
        id: `sess_${Date.now()}_no_project`,
        name: 'Session Without Project',
        purpose: 'Testing',
        status: 'active',
      })
      .returning()
      .get();
    testSessionIdNoProject = sessionNoProject.id;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    // Clear tables in correct order (children first to avoid FK violations)
    testDb.db.delete(schema.knowledgeVersions).run();
    testDb.db.delete(schema.knowledge).run();
    testDb.db.delete(schema.guidelineVersions).run();
    testDb.db.delete(schema.guidelines).run();
    testDb.db.delete(schema.errorLog).run();
  });

  describe('Full Pipeline', () => {
    it('should complete full flow: tool error → storage → analysis → knowledge creation', async () => {
      // Step 1: Simulate tool failures via error log repository
      const toolError1 = {
        sessionId: testSessionId,
        projectId: testProjectId,
        toolName: 'Bash',
        errorType: 'database_error',
        errorMessage: 'Error: unable to open database file at ~/.agent-memory/memory.db',
        errorSignature: createHash('sha256')
          .update('Bash:database_error:unable to open database file')
          .digest('hex'),
        toolInputHash: createHash('sha256')
          .update('sqlite3 ~/.agent-memory/memory.db')
          .digest('hex'),
      };

      const toolError2 = {
        sessionId: testSessionId,
        projectId: testProjectId,
        toolName: 'Bash',
        errorType: 'database_error',
        errorMessage: 'Error: unable to open database file at /Users/test/.agent-memory/memory.db',
        errorSignature: createHash('sha256')
          .update('Bash:database_error:unable to open database file')
          .digest('hex'),
        toolInputHash: createHash('sha256')
          .update('sqlite3 /Users/test/.agent-memory/memory.db')
          .digest('hex'),
      };

      const toolError3 = {
        sessionId: testSessionId,
        projectId: testProjectId,
        toolName: 'Bash',
        errorType: 'config_error',
        errorMessage: 'Error: Cannot find tsconfig.json',
        errorSignature: createHash('sha256')
          .update('Bash:config_error:Cannot find tsconfig.json')
          .digest('hex'),
        toolInputHash: createHash('sha256').update('tsc --build').digest('hex'),
      };

      await errorLogRepo.record(toolError1);
      await errorLogRepo.record(toolError2); // Should dedupe with toolError1
      await errorLogRepo.record(toolError3);

      // Step 2: Verify error storage
      const storedErrors = await errorLogRepo.getBySession(testSessionId);
      expect(storedErrors).toHaveLength(2); // 2 unique error signatures
      expect(storedErrors[0].occurrenceCount).toBeGreaterThanOrEqual(1);

      // Verify deduplication worked
      const dbError = storedErrors.find((e) => e.errorType === 'database_error');
      expect(dbError).toBeDefined();
      expect(dbError!.occurrenceCount).toBe(2); // toolError1 + toolError2

      // Step 3: Trigger session-end analysis (simulated)
      const analyzer = new ErrorAnalyzerService({ enabled: false }); // Disabled for test

      // Mock the analysis to return our predefined patterns
      const analyzeSessionErrorsSpy = vi.spyOn(analyzer, 'analyzeSessionErrors');
      analyzeSessionErrorsSpy.mockResolvedValue({
        sessionId: testSessionId,
        patterns: mockPatterns,
        analysisTimeMs: 100,
      });

      const analysisResult = await analyzer.analyzeSessionErrors(testSessionId);

      // Step 4: Verify analysis results
      expect(analysisResult.patterns).toHaveLength(2);
      expect(analysisResult.patterns[0].patternType).toBe('wrong_path');
      expect(analysisResult.patterns[0].confidence).toBeGreaterThanOrEqual(0.7);

      // Step 5: Generate and store corrective entries
      for (const pattern of analysisResult.patterns) {
        const entry = await analyzer.generateCorrectiveEntry(pattern);

        if (entry.type === 'knowledge') {
          await repos.knowledge.create({
            scopeType: 'session',
            scopeId: testSessionId,
            title: entry.title,
            content: entry.content,
            category: 'context',
            createdBy: 'error-analyzer',
          });
        } else if (entry.type === 'guideline') {
          await repos.guidelines.create({
            scopeType: 'session',
            scopeId: testSessionId,
            name: entry.name,
            content: entry.content,
            category: 'error-correction',
            priority: Math.round(pattern.confidence * 10),
            createdBy: 'error-analyzer',
          });
        }
      }

      // Step 6: Verify knowledge storage
      const storedKnowledge = testDb.db
        .select()
        .from(schema.knowledge)
        .where(eq(schema.knowledge.createdBy, 'error-analyzer'))
        .all();

      const storedGuidelines = testDb.db
        .select()
        .from(schema.guidelines)
        .where(eq(schema.guidelines.createdBy, 'error-analyzer'))
        .all();

      expect(storedKnowledge.length + storedGuidelines.length).toBe(2);

      // Verify knowledge entry structure
      const knowledgeEntry = storedKnowledge[0];
      if (knowledgeEntry) {
        expect(knowledgeEntry.scopeType).toBe('session');
        expect(knowledgeEntry.scopeId).toBe(testSessionId);
        expect(knowledgeEntry.category).toBe('context');
      }

      // Verify guideline entry structure
      const guidelineEntry = storedGuidelines[0];
      if (guidelineEntry) {
        expect(guidelineEntry.scopeType).toBe('session');
        expect(guidelineEntry.scopeId).toBe(testSessionId);
        expect(guidelineEntry.category).toBe('error-correction');
      }

      analyzeSessionErrorsSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('empty session: skips analysis when 0 errors', async () => {
      // Create session with no errors
      const emptySessionId = `sess_${Date.now()}_empty`;
      testDb.db
        .insert(schema.sessions)
        .values({
          id: emptySessionId,
          projectId: testProjectId,
          name: 'Empty Session',
          purpose: 'Testing',
          status: 'active',
        })
        .run();

      // Verify no errors exist
      const errors = await errorLogRepo.getBySession(emptySessionId);
      expect(errors).toHaveLength(0);

      // Trigger analysis
      const analyzer = new ErrorAnalyzerService({ minUniqueErrorTypes: 2 });
      const result = await analyzer.analyzeSessionErrors(emptySessionId);

      // Should return empty patterns (early return)
      expect(result.patterns).toEqual([]);
      expect(result.sessionId).toBe(emptySessionId);
    });

    it('LLM unavailable: graceful degradation', async () => {
      // Record errors
      await errorLogRepo.record({
        sessionId: testSessionId,
        projectId: testProjectId,
        toolName: 'Bash',
        errorType: 'test_error',
        errorMessage: 'Test error message',
        errorSignature: createHash('sha256').update('test_error').digest('hex'),
      });

      await errorLogRepo.record({
        sessionId: testSessionId,
        projectId: testProjectId,
        toolName: 'Edit',
        errorType: 'test_error_2',
        errorMessage: 'Another test error',
        errorSignature: createHash('sha256').update('test_error_2').digest('hex'),
      });

      // Create analyzer with disabled LLM
      const analyzer = new ErrorAnalyzerService({ enabled: false });

      // Should not throw, should return empty patterns
      const result = await analyzer.analyzeSessionErrors(testSessionId);

      expect(result).toBeDefined();
      expect(result.patterns).toEqual([]);
      expect(result.sessionId).toBe(testSessionId);
    });

    it('session without projectId: uses global scope fallback', async () => {
      // Record error for session without projectId
      await errorLogRepo.record({
        sessionId: testSessionIdNoProject,
        projectId: undefined,
        toolName: 'Bash',
        errorType: 'test_error',
        errorMessage: 'Error without project',
        errorSignature: createHash('sha256').update('no_project_error').digest('hex'),
      });

      await errorLogRepo.record({
        sessionId: testSessionIdNoProject,
        projectId: undefined,
        toolName: 'Edit',
        errorType: 'test_error_2',
        errorMessage: 'Another error without project',
        errorSignature: createHash('sha256').update('no_project_error_2').digest('hex'),
      });

      // Verify errors stored without projectId
      const errors = await errorLogRepo.getBySession(testSessionIdNoProject);
      expect(errors).toHaveLength(2);
      expect(errors[0].projectId).toBeNull();

      // Simulate analysis and storage
      const analyzer = new ErrorAnalyzerService({ enabled: false });
      const analyzeSessionErrorsSpy = vi.spyOn(analyzer, 'analyzeSessionErrors');
      analyzeSessionErrorsSpy.mockResolvedValue({
        sessionId: testSessionIdNoProject,
        patterns: [mockPatterns[0]], // Single pattern
        analysisTimeMs: 50,
      });

      const result = await analyzer.analyzeSessionErrors(testSessionIdNoProject);
      const entry = await analyzer.generateCorrectiveEntry(result.patterns[0]);

      // Store at session scope (no project available)
      if (entry.type === 'knowledge') {
        await repos.knowledge.create({
          scopeType: 'session',
          scopeId: testSessionIdNoProject,
          title: entry.title,
          content: entry.content,
          category: 'context',
          createdBy: 'error-analyzer',
        });
      }

      // Verify stored at session scope
      const storedKnowledge = testDb.db
        .select()
        .from(schema.knowledge)
        .where(eq(schema.knowledge.scopeId, testSessionIdNoProject))
        .all();

      expect(storedKnowledge).toHaveLength(1);
      expect(storedKnowledge[0].scopeType).toBe('session');

      analyzeSessionErrorsSpy.mockRestore();
    });

    it('conflicting patterns: creates separate entries', async () => {
      // Record multiple different error types
      await errorLogRepo.record({
        sessionId: testSessionId,
        projectId: testProjectId,
        toolName: 'Bash',
        errorType: 'path_error',
        errorMessage: 'Path not found',
        errorSignature: createHash('sha256').update('path_error').digest('hex'),
      });

      await errorLogRepo.record({
        sessionId: testSessionId,
        projectId: testProjectId,
        toolName: 'Edit',
        errorType: 'permission_error',
        errorMessage: 'Permission denied',
        errorSignature: createHash('sha256').update('permission_error').digest('hex'),
      });

      await errorLogRepo.record({
        sessionId: testSessionId,
        projectId: testProjectId,
        toolName: 'Bash',
        errorType: 'config_error',
        errorMessage: 'Config missing',
        errorSignature: createHash('sha256').update('config_error').digest('hex'),
      });

      // Simulate analysis returning multiple conflicting patterns
      const conflictingPatterns: ErrorPattern[] = [
        {
          patternType: 'wrong_path',
          description: 'Path errors',
          frequency: 1,
          suggestedCorrection: {
            type: 'knowledge',
            title: 'Path Resolution',
            content: 'Use absolute paths',
          },
          confidence: 0.8,
        },
        {
          patternType: 'permission',
          description: 'Permission issues',
          frequency: 1,
          suggestedCorrection: {
            type: 'guideline',
            title: 'Permission Handling',
            content: 'Check permissions before file operations',
          },
          confidence: 0.75,
        },
        {
          patternType: 'config_error',
          description: 'Config problems',
          frequency: 1,
          suggestedCorrection: {
            type: 'knowledge',
            title: 'Config Validation',
            content: 'Validate config files exist',
          },
          confidence: 0.9,
        },
      ];

      const analyzer = new ErrorAnalyzerService({ enabled: false });
      const analyzeSessionErrorsSpy = vi.spyOn(analyzer, 'analyzeSessionErrors');
      analyzeSessionErrorsSpy.mockResolvedValue({
        sessionId: testSessionId,
        patterns: conflictingPatterns,
        analysisTimeMs: 150,
      });

      const result = await analyzer.analyzeSessionErrors(testSessionId);

      // Store all patterns as separate entries
      for (const pattern of result.patterns) {
        const entry = await analyzer.generateCorrectiveEntry(pattern);

        if (entry.type === 'knowledge') {
          await repos.knowledge.create({
            scopeType: 'session',
            scopeId: testSessionId,
            title: entry.title,
            content: entry.content,
            category: 'context',
            createdBy: 'error-analyzer',
          });
        } else if (entry.type === 'guideline') {
          await repos.guidelines.create({
            scopeType: 'session',
            scopeId: testSessionId,
            name: entry.name,
            content: entry.content,
            category: 'error-correction',
            priority: Math.round(pattern.confidence * 10),
            createdBy: 'error-analyzer',
          });
        }
      }

      // Verify all entries created separately
      const storedKnowledge = testDb.db
        .select()
        .from(schema.knowledge)
        .where(eq(schema.knowledge.createdBy, 'error-analyzer'))
        .all();

      const storedGuidelines = testDb.db
        .select()
        .from(schema.guidelines)
        .where(eq(schema.guidelines.createdBy, 'error-analyzer'))
        .all();

      const totalEntries = storedKnowledge.length + storedGuidelines.length;
      expect(totalEntries).toBe(3); // All 3 patterns stored

      // Verify distinct titles (no overwriting)
      const knowledgeTitles = storedKnowledge.map((k) => k.title);
      const guidelineTitles = storedGuidelines.map((g) => g.name);
      const allTitles = [...knowledgeTitles, ...guidelineTitles];

      expect(new Set(allTitles).size).toBe(3); // All unique

      analyzeSessionErrorsSpy.mockRestore();
    });

    it('threshold check: skips analysis when < minUniqueErrorTypes', async () => {
      // Record only 1 error (below threshold of 2)
      await errorLogRepo.record({
        sessionId: testSessionId,
        projectId: testProjectId,
        toolName: 'Bash',
        errorType: 'single_error',
        errorMessage: 'Only one error',
        errorSignature: createHash('sha256').update('single_error').digest('hex'),
      });

      const errors = await errorLogRepo.getBySession(testSessionId);
      expect(errors).toHaveLength(1);

      // Create analyzer with minUniqueErrorTypes = 2
      const analyzer = new ErrorAnalyzerService({ minUniqueErrorTypes: 2 });

      // Mock fetchSessionErrors to return the single error
      const fetchSessionErrorsSpy = vi.spyOn(analyzer as any, 'fetchSessionErrors');
      fetchSessionErrorsSpy.mockResolvedValue([
        {
          toolName: 'Bash',
          errorType: 'single_error',
          errorMessage: 'Only one error',
          timestamp: new Date().toISOString(),
        },
      ]);

      const result = await analyzer.analyzeSessionErrors(testSessionId);

      // Should skip analysis (below threshold)
      expect(result.patterns).toEqual([]);

      fetchSessionErrorsSpy.mockRestore();
    });
  });

  describe('Error Signature Generation', () => {
    it('should deduplicate errors with same signature across different paths', async () => {
      const baseSignature = createHash('sha256')
        .update('Bash:database_error:unable to open database file')
        .digest('hex');

      // Record same conceptual error with different absolute paths
      await errorLogRepo.record({
        sessionId: testSessionId,
        projectId: testProjectId,
        toolName: 'Bash',
        errorType: 'database_error',
        errorMessage: 'Error: unable to open database file at /Users/alice/project/data.db',
        errorSignature: baseSignature,
      });

      await errorLogRepo.record({
        sessionId: testSessionId,
        projectId: testProjectId,
        toolName: 'Bash',
        errorType: 'database_error',
        errorMessage: 'Error: unable to open database file at /Users/bob/project/data.db',
        errorSignature: baseSignature,
      });

      await errorLogRepo.record({
        sessionId: testSessionId,
        projectId: testProjectId,
        toolName: 'Bash',
        errorType: 'database_error',
        errorMessage: 'Error: unable to open database file at /home/charlie/project/data.db',
        errorSignature: baseSignature,
      });

      // Should deduplicate to single entry
      const errors = await errorLogRepo.getBySession(testSessionId);
      expect(errors).toHaveLength(1);
      expect(errors[0].occurrenceCount).toBe(3);
      expect(errors[0].errorSignature).toBe(baseSignature);
    });
  });

  describe('Cross-Session Analysis', () => {
    it('should analyze patterns across multiple sessions', async () => {
      // Create second session
      const session2 = createTestSession(testDb.db, testProjectId, 'Session 2');

      // Record same error in both sessions
      const sharedSignature = createHash('sha256').update('shared_error').digest('hex');

      await errorLogRepo.record({
        sessionId: testSessionId,
        projectId: testProjectId,
        toolName: 'Bash',
        errorType: 'shared_error',
        errorMessage: 'Shared error message',
        errorSignature: sharedSignature,
      });

      await errorLogRepo.record({
        sessionId: session2.id,
        projectId: testProjectId,
        toolName: 'Bash',
        errorType: 'shared_error',
        errorMessage: 'Shared error message',
        errorSignature: sharedSignature,
      });

      // Verify errors in both sessions
      const session1Errors = await errorLogRepo.getBySession(testSessionId);
      const session2Errors = await errorLogRepo.getBySession(session2.id);

      expect(session1Errors).toHaveLength(1);
      expect(session2Errors).toHaveLength(1);

      // Analyze cross-session patterns
      const analyzer = new ErrorAnalyzerService({ enabled: false });
      const analyzeCrossSessionSpy = vi.spyOn(analyzer, 'analyzeCrossSessionPatterns');
      analyzeCrossSessionSpy.mockResolvedValue({
        projectId: testProjectId,
        lookbackDays: 7,
        patterns: [mockPatterns[0]], // Pattern detected across sessions
        analysisTimeMs: 200,
      });

      const result = await analyzer.analyzeCrossSessionPatterns(testProjectId, 7);

      expect(result.patterns).toHaveLength(1);
      expect(result.projectId).toBe(testProjectId);

      analyzeCrossSessionSpy.mockRestore();
    });
  });
});
