/**
 * Unit tests for IDE import service
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, cleanupTestDb } from '../fixtures/test-helpers.js';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DB_PATH = './data/test-ide-import.db';
const TEST_RULES_DIR = './data/test-rules-import';

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
import { importFromCursor, importFromFiles } from '../../src/services/ide-import.service.js';

function cleanupTestRules() {
  if (existsSync(TEST_RULES_DIR)) {
    rmSync(TEST_RULES_DIR, { recursive: true, force: true });
  }
}

describe('IDE Import Service', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;

    cleanupTestRules();

    // Create test rules directory
    mkdirSync(TEST_RULES_DIR, { recursive: true });
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
    cleanupTestRules();
  });

  describe('importFromCursor', () => {
    it('should import guidelines from Cursor .mdc files', () => {
      // Create a test .mdc file
      const testRuleFile = join(TEST_RULES_DIR, 'test-rule.mdc');
      const mdcContent = `---
description: Test Rule
globs: ["**/*.ts", "**/*.tsx"]
alwaysApply: true
---

<!-- agent-memory:test-id-123 -->

# Test Rule

This is a test rule content.

## Rationale

This is the rationale.

## Examples

### Good

\`\`\`
const good = true;
\`\`\`

### Bad

\`\`\`
const bad = false;
\`\`\`
`;

      writeFileSync(testRuleFile, mdcContent, 'utf-8');

      const result = importFromCursor(TEST_RULES_DIR, {
        scopeType: 'global',
        createdBy: 'test-user',
      });

      expect(result.imported).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);

      // Verify guideline was created
      const guidelines = guidelineRepo.list({ scopeType: 'global' }, { limit: 100 });
      const imported = guidelines.find((g) => g.name === 'Test Rule');
      expect(imported).toBeDefined();
      if (imported && imported.currentVersion) {
        expect(imported.currentVersion.content).toContain('test rule content');
        expect(imported.currentVersion.rationale).toContain('rationale');
        expect(imported.currentVersion.examples).toBeDefined();
      }
    });

    it('should handle files without Agent Memory IDs', () => {
      const testRuleFile = join(TEST_RULES_DIR, 'no-id-rule.mdc');
      const mdcContent = `---
description: No ID Rule
globs: ["**/*.js"]
alwaysApply: false
---

# No ID Rule

Content without ID.
`;

      writeFileSync(testRuleFile, mdcContent, 'utf-8');

      const result = importFromCursor(TEST_RULES_DIR, {
        scopeType: 'global',
        createdBy: 'test-user',
      });

      // Should still import (creates new guideline)
      expect(result.imported).toBeGreaterThan(0);
    });

    it('should update existing guidelines if ID matches', () => {
      // First create a guideline
      const existing = guidelineRepo.create({
        scopeType: 'global',
        name: 'existing-rule',
        content: 'Old content',
        createdBy: 'test-user',
      });

      // Create .mdc file with matching ID
      const testRuleFile = join(TEST_RULES_DIR, 'existing.mdc');
      const mdcContent = `---
description: existing-rule
globs: ["**/*"]
alwaysApply: true
---

<!-- agent-memory:${existing.id} -->

# existing-rule

Updated content
`;

      writeFileSync(testRuleFile, mdcContent, 'utf-8');

      const result = importFromCursor(TEST_RULES_DIR, {
        scopeType: 'global',
        createdBy: 'test-user',
      });

      expect(result.updated).toBeGreaterThan(0);

      // Verify content was updated
      const updated = guidelineRepo.getById(existing.id);
      expect(updated?.currentVersion?.content).toContain('Updated content');
    });

    it('should handle dry run mode', () => {
      const testRuleFile = join(TEST_RULES_DIR, 'dry-run-rule.mdc');
      const mdcContent = `---
description: Dry Run Rule
globs: ["**/*"]
alwaysApply: false
---

# Dry Run Rule

Test content
`;

      writeFileSync(testRuleFile, mdcContent, 'utf-8');

      const result = importFromCursor(TEST_RULES_DIR, {
        scopeType: 'global',
        createdBy: 'test-user',
        dryRun: true,
      });

      expect(result.imported).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries[0].action).toBe('create');
    });
  });

  describe('importFromFiles', () => {
    it('should import from multiple files', () => {
      const file1 = join(TEST_RULES_DIR, 'file1.md');
      const file2 = join(TEST_RULES_DIR, 'file2.md');

      writeFileSync(
        file1,
        `---
id: file1-id
name: File 1 Rule
content: Content 1
priority: 80
---

# File 1 Rule

Content 1
`,
        'utf-8'
      );

      writeFileSync(
        file2,
        `---
id: file2-id
name: File 2 Rule
content: Content 2
priority: 90
---

# File 2 Rule

Content 2
`,
        'utf-8'
      );

      const result = importFromFiles([file1, file2], {
        scopeType: 'global',
        createdBy: 'test-user',
      });

      expect(result.imported).toBeGreaterThanOrEqual(2);
      expect(result.errors.length).toBe(0);
    });

    it('should handle file parsing errors gracefully', () => {
      const invalidFile = join(TEST_RULES_DIR, 'invalid.md');
      writeFileSync(invalidFile, 'Invalid content without frontmatter', 'utf-8');

      const result = importFromFiles([invalidFile], {
        scopeType: 'global',
        createdBy: 'test-user',
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.skipped).toBeGreaterThan(0);
    });
  });
});




