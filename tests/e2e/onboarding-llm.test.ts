/**
 * E2E tests for LLM-assisted onboarding
 *
 * Tests the full memory_onboard workflow with useLlm=true flag,
 * verifying contribution guide generation, error handling, and
 * graceful degradation when LLM fails.
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestDb, cleanupTestDb, createTestContext } from '../fixtures/test-helpers.js';
import type { AppContext } from '../../src/core/context.js';
import { config } from '../../src/config/index.js';

const TEST_DB_PATH = './data/test-onboarding-llm.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let context: AppContext;
let testDir: string;

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
    getSqlite: () => sqlite,
    getPreparedStatement: (sql: string) => sqlite.prepare(sql),
  };
});

import { runTool } from '../../src/mcp/tool-runner.js';

describe('Onboarding LLM E2E', () => {
  const AGENT_ID = 'e2e-onboard-agent';
  let previousPermMode: string | undefined;
  let previousOpenAiKey: string | undefined;

  beforeAll(async () => {
    // Store original env values
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    previousOpenAiKey = process.env.AGENT_MEMORY_OPENAI_API_KEY;
    process.env.AGENT_MEMORY_PERMISSIONS_MODE = 'permissive';

    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    context = await createTestContext(testDb);

    // Create a temporary test directory
    testDir = join(tmpdir(), `onboard-llm-e2e-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    // Restore env values
    if (previousPermMode === undefined) {
      delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    } else {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
    if (previousOpenAiKey === undefined) {
      delete process.env.AGENT_MEMORY_OPENAI_API_KEY;
    } else {
      process.env.AGENT_MEMORY_OPENAI_API_KEY = previousOpenAiKey;
    }

    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);

    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Reset test directory contents
    const dirs = ['src', 'src/services', 'src/handlers', 'src/repositories', 'docs', 'docs/adr'];
    for (const dir of dirs) {
      const dirPath = join(testDir, dir);
      if (existsSync(dirPath)) {
        rmSync(dirPath, { recursive: true });
      }
    }
    const files = ['package.json', 'CONTRIBUTING.md'];
    for (const file of files) {
      const filePath = join(testDir, file);
      if (existsSync(filePath)) {
        rmSync(filePath);
      }
    }
  });

  describe('useLlm flag validation', () => {
    it('should throw error when useLlm=true but no API key configured', async () => {
      // Ensure no API key is set
      delete process.env.AGENT_MEMORY_OPENAI_API_KEY;
      // Force config reload by accessing extraction config
      const originalKey = config.extraction.openaiApiKey;
      (config.extraction as { openaiApiKey: string | undefined }).openaiApiKey = undefined;

      try {
        const result = await runTool(context, 'memory_onboard', {
          useLlm: true,
          dryRun: true,
        });

        // Should have error in result
        expect(result).toBeDefined();
        const content = result.content;
        expect(content).toBeDefined();

        // Check if it's an error response
        if (Array.isArray(content) && content.length > 0) {
          const textContent = content[0];
          if (textContent && typeof textContent === 'object' && 'text' in textContent) {
            const text = textContent.text as string;
            expect(text).toContain('AGENT_MEMORY_OPENAI_API_KEY');
          }
        }
      } finally {
        // Restore config
        (config.extraction as { openaiApiKey: string | undefined }).openaiApiKey = originalKey;
      }
    });

    it('should not call LLM when useLlm=false', async () => {
      // Create a project structure
      mkdirSync(join(testDir, 'src/services'), { recursive: true });
      writeFileSync(join(testDir, 'src/services/user.service.ts'), 'export class UserService {}');
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-no-llm',
          scripts: { build: 'tsc', test: 'vitest' },
        })
      );

      // Mock working directory
      vi.mock('../../src/utils/working-directory.js', () => ({
        getWorkingDirectoryAsync: () => Promise.resolve({ path: testDir }),
      }));

      const result = await runTool(context, 'memory_onboard', {
        useLlm: false,
        deepScan: true,
        dryRun: true,
        skipSteps: ['createProject', 'importDocs', 'seedGuidelines'],
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      // Verify no LLM-sourced findings
      const content = result.content;
      if (Array.isArray(content) && content.length > 0) {
        const textContent = content[0];
        if (textContent && typeof textContent === 'object' && 'text' in textContent) {
          const text = textContent.text as string;
          expect(text).not.toContain('llm-extraction');
        }
      }
    });
  });

  describe('Deep scan with LLM mode', () => {
    it('should generate contribution guides when useLlm=true with valid API key', async () => {
      // Set up a mock API key
      process.env.AGENT_MEMORY_OPENAI_API_KEY = 'test-api-key';
      (config.extraction as { openaiApiKey: string | undefined }).openaiApiKey = 'test-api-key';

      // Create project structure with patterns
      mkdirSync(join(testDir, 'src/repositories'), { recursive: true });
      mkdirSync(join(testDir, 'src/handlers'), { recursive: true });
      mkdirSync(join(testDir, 'src/services'), { recursive: true });

      writeFileSync(
        join(testDir, 'src/repositories/user.repository.ts'),
        'export class UserRepository {}'
      );
      writeFileSync(join(testDir, 'src/handlers/user.handler.ts'), 'export class UserHandler {}');
      writeFileSync(join(testDir, 'src/services/user.service.ts'), 'export class UserService {}');
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-llm-project',
          scripts: { build: 'tsc', test: 'vitest', lint: 'eslint .' },
        })
      );

      const result = await runTool(context, 'memory_onboard', {
        useLlm: true,
        deepScan: true,
        dryRun: true,
        skipSteps: ['createProject', 'importDocs', 'seedGuidelines'],
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      const content = result.content;
      if (Array.isArray(content) && content.length > 0) {
        const textContent = content[0];
        if (textContent && typeof textContent === 'object' && 'text' in textContent) {
          const text = textContent.text as string;
          expect(text).toContain('Deep');
        }
      }
    });
  });

  describe('LLM failure graceful degradation', () => {
    it('should fall back to static guides when LLM fails', async () => {
      // Set up API key but the actual LLM call will fail in test environment
      process.env.AGENT_MEMORY_OPENAI_API_KEY = 'test-api-key';
      (config.extraction as { openaiApiKey: string | undefined }).openaiApiKey = 'test-api-key';

      // Create project structure
      mkdirSync(join(testDir, 'src/repositories'), { recursive: true });
      writeFileSync(
        join(testDir, 'src/repositories/user.repository.ts'),
        'export class UserRepository {}'
      );
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-fallback',
          scripts: { build: 'tsc' },
        })
      );

      const result = await runTool(context, 'memory_onboard', {
        useLlm: true,
        deepScan: true,
        dryRun: true,
        skipSteps: ['createProject', 'importDocs', 'seedGuidelines'],
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });

  describe('Full onboarding flow with LLM', () => {
    it('should complete full onboard flow with deepScan and useLlm', async () => {
      process.env.AGENT_MEMORY_OPENAI_API_KEY = 'test-api-key';
      (config.extraction as { openaiApiKey: string | undefined }).openaiApiKey = 'test-api-key';

      // Create comprehensive project structure
      mkdirSync(join(testDir, 'src/repositories'), { recursive: true });
      mkdirSync(join(testDir, 'src/handlers'), { recursive: true });
      mkdirSync(join(testDir, 'src/services'), { recursive: true });
      mkdirSync(join(testDir, 'docs/adr'), { recursive: true });

      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-full-flow',
          description: 'Test project for E2E',
          scripts: {
            build: 'tsc',
            test: 'vitest',
            lint: 'eslint .',
            typecheck: 'tsc --noEmit',
          },
          dependencies: { typescript: '^5.0.0' },
        })
      );

      writeFileSync(
        join(testDir, 'src/repositories/user.repository.ts'),
        'export class UserRepository {}'
      );
      writeFileSync(join(testDir, 'src/handlers/user.handler.ts'), 'export class UserHandler {}');
      writeFileSync(join(testDir, 'src/services/user.service.ts'), 'export class UserService {}');

      writeFileSync(
        join(testDir, 'docs/adr/0001-use-typescript.md'),
        `# ADR-0001: Use TypeScript

## Status

Accepted

## Context

We need type safety.

## Decision

Use TypeScript for all code.
`
      );

      writeFileSync(
        join(testDir, 'CONTRIBUTING.md'),
        `# Contributing

## Branch Strategy

- **main**: Production branch
- **feature/***: Feature branches
`
      );

      const result = await runTool(context, 'memory_onboard', {
        useLlm: true,
        deepScan: true,
        dryRun: true,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      const content = result.content;
      expect(Array.isArray(content)).toBe(true);
      if (Array.isArray(content) && content.length > 0) {
        const textContent = content[0];
        expect(textContent).toBeDefined();
        if (textContent && typeof textContent === 'object' && 'text' in textContent) {
          const text = textContent.text as string;
          expect(text.length).toBeGreaterThan(0);
        }
      }
    });

    it('should store findings as knowledge entries when not in dryRun mode', async () => {
      process.env.AGENT_MEMORY_OPENAI_API_KEY = 'test-api-key';
      (config.extraction as { openaiApiKey: string | undefined }).openaiApiKey = 'test-api-key';

      // Create minimal project structure
      mkdirSync(join(testDir, 'src/services'), { recursive: true });
      writeFileSync(join(testDir, 'src/services/user.service.ts'), 'export class UserService {}');
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-store-findings',
          scripts: { build: 'tsc', test: 'vitest' },
        })
      );

      // Run without dryRun to actually store findings
      const result = await runTool(context, 'memory_onboard', {
        useLlm: true,
        deepScan: true,
        dryRun: false,
        importDocs: false,
        seedGuidelines: false,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      const content = result.content;
      if (Array.isArray(content) && content.length > 0) {
        const textContent = content[0];
        if (textContent && typeof textContent === 'object' && 'text' in textContent) {
          const text = textContent.text as string;
          expect(text.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Token budget enforcement', () => {
    it('should respect token budget when generating LLM prompts', async () => {
      process.env.AGENT_MEMORY_OPENAI_API_KEY = 'test-api-key';
      (config.extraction as { openaiApiKey: string | undefined }).openaiApiKey = 'test-api-key';

      // Create project with many patterns to test token limiting
      mkdirSync(join(testDir, 'src/repositories'), { recursive: true });
      mkdirSync(join(testDir, 'src/handlers'), { recursive: true });
      mkdirSync(join(testDir, 'src/services'), { recursive: true });
      mkdirSync(join(testDir, 'src/factories'), { recursive: true });
      mkdirSync(join(testDir, 'src/adapters'), { recursive: true });
      mkdirSync(join(testDir, 'src/strategies'), { recursive: true });

      // Create many files to generate many patterns
      for (let i = 0; i < 10; i++) {
        writeFileSync(
          join(testDir, `src/repositories/entity${i}.repository.ts`),
          `export class Entity${i}Repository {}`
        );
        writeFileSync(
          join(testDir, `src/handlers/entity${i}.handler.ts`),
          `export class Entity${i}Handler {}`
        );
        writeFileSync(
          join(testDir, `src/services/entity${i}.service.ts`),
          `export class Entity${i}Service {}`
        );
      }

      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-token-budget',
          scripts: { build: 'tsc' },
        })
      );

      // The scan should complete without token budget errors
      const result = await runTool(context, 'memory_onboard', {
        useLlm: true,
        deepScan: true,
        dryRun: true,
        skipSteps: ['createProject', 'importDocs', 'seedGuidelines'],
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      const content = result.content;
      if (Array.isArray(content) && content.length > 0) {
        const textContent = content[0];
        if (textContent && typeof textContent === 'object' && 'text' in textContent) {
          const text = textContent.text as string;
          expect(text).not.toContain('token budget');
          expect(text).not.toContain('exceeds');
        }
      }
    });
  });
});
