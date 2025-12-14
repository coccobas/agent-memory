/**
 * Unit tests for IDE export service
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb } from '../fixtures/test-helpers.js';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DB_PATH = './data/test-ide-export.db';
const TEST_OUTPUT_DIR = './data/test-ide-output';

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

import { guidelineRepo } from '../../src/db/repositories/guidelines.js';
import { entryTagRepo } from '../../src/db/repositories/tags.js';
import {
  prepareGuidelinesForExport,
  exportToCursor,
  exportToGeneric,
  exportGuidelinesToIDE,
} from '../../src/services/ide-export.service.js';

function cleanupTestOutput() {
  if (existsSync(TEST_OUTPUT_DIR)) {
    rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  }
}

describe('IDE Export Service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;

    // Ensure test output directory doesn't exist
    cleanupTestOutput();
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
    cleanupTestOutput();
  });

  describe('prepareGuidelinesForExport', () => {
    it('should prepare guidelines for export', () => {
      const guideline = guidelineRepo.create({
        scopeType: 'global',
        name: 'test-guideline',
        content: 'Test content',
        priority: 80,
        category: 'code_style',
        createdBy: 'test-user',
      });

      const result = prepareGuidelinesForExport({
        scopeType: 'global',
        inherit: false,
      });

      expect(result).toBeInstanceOf(Array);
      const found = result.find((g) => g.id === guideline.id);
      expect(found).toBeDefined();
      expect(found?.name).toBe('test-guideline');
      expect(found?.content).toBe('Test content');
      expect(found?.priority).toBe(80);
      expect(found?.alwaysApply).toBe(true); // Priority >= 80
      expect(found?.globs).toEqual(['**/*']); // Default globs
    });

    it('should extract globs from tags', () => {
      const guideline = guidelineRepo.create({
        scopeType: 'global',
        name: 'typescript-rule',
        content: 'TypeScript rule',
        createdBy: 'test-user',
      });

      // Add typescript tag
      entryTagRepo.attach({
        entryType: 'guideline',
        entryId: guideline.id,
        tagName: 'typescript',
      });

      const result = prepareGuidelinesForExport({
        scopeType: 'global',
      });

      const found = result.find((g) => g.id === guideline.id);
      expect(found?.globs).toContain('**/*.ts');
      expect(found?.globs).toContain('**/*.tsx');
    });

    it('should determine alwaysApply from priority', () => {
      const highPriority = guidelineRepo.create({
        scopeType: 'global',
        name: 'high-priority',
        content: 'High priority rule',
        priority: 90,
        createdBy: 'test-user',
      });

      const lowPriority = guidelineRepo.create({
        scopeType: 'global',
        name: 'low-priority',
        content: 'Low priority rule',
        priority: 50,
        createdBy: 'test-user',
      });

      const result = prepareGuidelinesForExport({
        scopeType: 'global',
      });

      const high = result.find((g) => g.id === highPriority.id);
      const low = result.find((g) => g.id === lowPriority.id);

      expect(high?.alwaysApply).toBe(true);
      expect(low?.alwaysApply).toBe(false);
    });
  });

  describe('exportToCursor', () => {
    it('should export guidelines to Cursor format', () => {
      const guideline = guidelineRepo.create({
        scopeType: 'global',
        name: 'cursor-test-rule',
        content: 'Test rule content',
        rationale: 'Test rationale',
        priority: 80,
        createdBy: 'test-user',
      });

      const guidelines = prepareGuidelinesForExport({
        scopeType: 'global',
      });

      const result = exportToCursor(guidelines, TEST_OUTPUT_DIR);

      expect(result.ide).toBe('cursor');
      expect(result.entryCount).toBeGreaterThan(0);
      expect(result.filesCreated.length).toBeGreaterThan(0);

      // Check file exists
      const filePath = result.filesCreated.find((f) => f.includes('cursor-test-rule'));
      expect(filePath).toBeDefined();
      if (filePath && existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('cursor-test-rule');
        expect(content).toContain('Test rule content');
        expect(content).toContain('Test rationale');
        expect(content).toContain('<!-- agent-memory:');
        expect(content).toContain('---');
      }
    });

    it('should create .cursor/rules directory if it does not exist', () => {
      const guidelines = prepareGuidelinesForExport({
        scopeType: 'global',
      });

      const result = exportToCursor(guidelines, TEST_OUTPUT_DIR);

      const cursorDir = join(TEST_OUTPUT_DIR, '.cursor', 'rules');
      expect(existsSync(cursorDir)).toBe(true);
    });
  });

  describe('exportToGeneric', () => {
    it('should export guidelines to generic format', () => {
      const guideline = guidelineRepo.create({
        scopeType: 'global',
        name: 'generic-test-rule',
        content: 'Generic test content',
        priority: 75,
        createdBy: 'test-user',
      });

      const guidelines = prepareGuidelinesForExport({
        scopeType: 'global',
      });

      const result = exportToGeneric(guidelines, TEST_OUTPUT_DIR);

      expect(result.ide).toBe('generic');
      expect(result.entryCount).toBeGreaterThan(0);
      expect(result.filesCreated.length).toBeGreaterThan(0);

      // Check file exists
      const filePath = result.filesCreated.find((f) => f.includes('generic-test-rule'));
      expect(filePath).toBeDefined();
      if (filePath && existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('generic-test-rule');
        expect(content).toContain('Generic test content');
        expect(content).toContain('---'); // YAML frontmatter
        expect(content).toContain('id:');
        expect(content).toContain('name:');
      }
    });
  });

  describe('exportGuidelinesToIDE', () => {
    it('should export to specified IDE', () => {
      guidelineRepo.create({
        scopeType: 'global',
        name: 'export-test-rule',
        content: 'Export test',
        createdBy: 'test-user',
      });

      const results = exportGuidelinesToIDE({
        ide: 'generic',
        scopeType: 'global',
        outputDir: TEST_OUTPUT_DIR,
      });

      expect(results.length).toBe(1);
      expect(results[0].ide).toBe('generic');
    });

    it('should export to all IDEs when ide is "all"', () => {
      guidelineRepo.create({
        scopeType: 'global',
        name: 'all-ides-test',
        content: 'Test for all IDEs',
        createdBy: 'test-user',
      });

      const results = exportGuidelinesToIDE({
        ide: 'all',
        scopeType: 'global',
        outputDir: TEST_OUTPUT_DIR,
      });

      // Should have multiple results (one per IDE)
      expect(results.length).toBeGreaterThan(1);
      const ides = results.map((r) => r.ide);
      expect(ides).toContain('cursor');
      expect(ides).toContain('generic');
    });

    it('should handle scope filtering', () => {
      const globalGuideline = guidelineRepo.create({
        scopeType: 'global',
        name: 'global-rule',
        content: 'Global rule',
        createdBy: 'test-user',
      });

      const results = exportGuidelinesToIDE({
        ide: 'generic',
        scopeType: 'global',
        outputDir: TEST_OUTPUT_DIR,
      });

      expect(results.length).toBe(1);
      const exportedIds = results[0].filesCreated
        .map((f) => {
          if (existsSync(f)) {
            const content = readFileSync(f, 'utf-8');
            // Generic format uses YAML frontmatter, not HTML comment
            // Try both formats for compatibility
            const commentMatch = content.match(/agent-memory:([^\s]+)/);
            if (commentMatch) {
              return commentMatch[1];
            }
            // Check YAML frontmatter: id: <guid>
            const frontmatterMatch = content.match(/^---\s*\n[\s\S]*?\nid:\s*([^\s\n]+)/m);
            if (frontmatterMatch) {
              return frontmatterMatch[1];
            }
          }
          return null;
        })
        .filter((id) => id);

      expect(exportedIds).toContain(globalGuideline.id);
    });
  });
});

