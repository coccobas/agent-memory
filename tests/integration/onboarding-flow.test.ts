/**
 * Integration tests for Onboarding Flow
 *
 * Tests the complete memory_onboard workflow with a test project setup.
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createProjectDetectorService,
  createTechStackDetectorService,
  createDocScannerService,
  createGuidelineSeederService,
  createDeepScannerService,
} from '../../src/services/onboarding/index.js';

describe('Onboarding Flow Integration', () => {
  let testDir: string;

  beforeAll(() => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `onboard-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Full Onboarding Flow', () => {
    beforeEach(() => {
      // Reset test directory contents
      const files = ['package.json', 'tsconfig.json', 'README.md', '.cursorrules'];
      for (const file of files) {
        const filePath = join(testDir, file);
        if (existsSync(filePath)) {
          rmSync(filePath);
        }
      }
      const dirs = ['.git', '.claude'];
      for (const dir of dirs) {
        const dirPath = join(testDir, dir);
        if (existsSync(dirPath)) {
          rmSync(dirPath, { recursive: true });
        }
      }
    });

    it('should detect project info from package.json', async () => {
      // Create test package.json
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-integration-project',
          description: 'A test project for integration tests',
          version: '1.0.0',
          dependencies: {
            react: '^18.0.0',
          },
          devDependencies: {
            typescript: '^5.0.0',
            vitest: '^1.0.0',
          },
        })
      );

      const projectDetector = createProjectDetectorService();
      const result = await projectDetector.detectProjectInfo(testDir);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('test-integration-project');
      expect(result?.description).toBe('A test project for integration tests');
      expect(result?.version).toBe('1.0.0');
      expect(result?.source).toBe('package.json');
    });

    it('should detect full tech stack from multiple sources', async () => {
      // Create package.json with deps
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            react: '^18.0.0',
            next: '^14.0.0',
            express: '^4.18.0',
          },
          devDependencies: {
            typescript: '^5.0.0',
            vitest: '^1.0.0',
            eslint: '^8.0.0',
            prettier: '^3.0.0',
          },
        })
      );

      // Create tsconfig.json
      writeFileSync(
        join(testDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true } })
      );

      const techStackDetector = createTechStackDetectorService();
      const result = await techStackDetector.detectTechStack(testDir);

      // Languages
      expect(result.languages.some((l) => l.name === 'TypeScript')).toBe(true);

      // Frameworks
      expect(result.frameworks.some((f) => f.name === 'React')).toBe(true);
      expect(result.frameworks.some((f) => f.name === 'Next.js')).toBe(true);
      expect(result.frameworks.some((f) => f.name === 'Express')).toBe(true);

      // Tools
      expect(result.tools.some((t) => t.name === 'Vitest')).toBe(true);
      expect(result.tools.some((t) => t.name === 'ESLint')).toBe(true);
      expect(result.tools.some((t) => t.name === 'Prettier')).toBe(true);
    });

    it('should scan for documentation files', async () => {
      // Create README.md
      writeFileSync(join(testDir, 'README.md'), '# Test Project\n\nThis is a test.');

      // Create .cursorrules
      writeFileSync(join(testDir, '.cursorrules'), 'Rule 1: Test rule');

      // Create .claude/CLAUDE.md
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(join(testDir, '.claude', 'CLAUDE.md'), '# Claude Instructions');

      const docScanner = createDocScannerService();
      const docs = await docScanner.scanForDocs(testDir);

      expect(docs.length).toBeGreaterThanOrEqual(3);
      expect(docs.some((d) => d.type === 'readme')).toBe(true);
      expect(docs.some((d) => d.type === 'cursorrules')).toBe(true);
      expect(docs.some((d) => d.type === 'claude')).toBe(true);
    });

    it('should read documentation contents', async () => {
      const content = '# My Project\n\nThis is the documentation content.';
      writeFileSync(join(testDir, 'README.md'), content);

      const docScanner = createDocScannerService();
      const readContent = await docScanner.readDoc(join(testDir, 'README.md'));

      expect(readContent).toBe(content);
    });

    it('should truncate large files when reading', async () => {
      const largeContent = 'x'.repeat(50000);
      writeFileSync(join(testDir, 'LARGE.md'), largeContent);

      const docScanner = createDocScannerService();
      const readContent = await docScanner.readDoc(join(testDir, 'LARGE.md'), 1000);

      expect(readContent).not.toBeNull();
      expect(readContent!.length).toBeLessThan(largeContent.length);
      expect(readContent).toContain('[truncated');
    });

    it('should get appropriate guidelines for tech stack', async () => {
      // Create package.json with TypeScript + React
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          dependencies: { react: '^18.0.0' },
          devDependencies: { typescript: '^5.0.0' },
        })
      );
      writeFileSync(join(testDir, 'tsconfig.json'), JSON.stringify({}));

      const techStackDetector = createTechStackDetectorService();
      const techStack = await techStackDetector.detectTechStack(testDir);

      // Mock guideline repo (not using actual DB in integration test)
      const mockRepo = {
        findByName: vi.fn().mockResolvedValue(null),
        bulkCreate: vi
          .fn()
          .mockImplementation(async (entries) =>
            entries.map((e: { name: string }, i: number) => ({ id: `guid-${i}`, name: e.name }))
          ),
      };

      const guidelineSeeder = createGuidelineSeederService(mockRepo);
      const guidelines = guidelineSeeder.getGuidelinesForTechStack(techStack);

      // Should have TypeScript guidelines
      expect(guidelines.some((g) => g.category === 'typescript')).toBe(true);

      // Should have React guidelines
      expect(guidelines.some((g) => g.category === 'react')).toBe(true);

      // Should have general guidelines
      expect(
        guidelines.some((g) => g.category === 'testing' || g.category === 'code-quality')
      ).toBe(true);

      // Guidelines should be sorted by priority
      for (let i = 1; i < guidelines.length; i++) {
        expect(guidelines[i - 1].priority).toBeGreaterThanOrEqual(guidelines[i].priority);
      }
    });

    it('should detect project from git config when no package.json', async () => {
      // Create .git/config
      mkdirSync(join(testDir, '.git'), { recursive: true });
      writeFileSync(
        join(testDir, '.git', 'config'),
        `[remote "origin"]
  url = https://github.com/testuser/test-git-repo.git
  fetch = +refs/heads/*:refs/remotes/origin/*`
      );

      const projectDetector = createProjectDetectorService();
      const result = await projectDetector.detectProjectInfo(testDir);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('test-git-repo');
      expect(result?.source).toBe('git');
    });

    it('should handle Python projects', async () => {
      // Create requirements.txt
      writeFileSync(join(testDir, 'requirements.txt'), 'flask>=2.0.0\nrequests>=2.28.0');

      const techStackDetector = createTechStackDetectorService();
      const result = await techStackDetector.detectTechStack(testDir);

      expect(result.languages.some((l) => l.name === 'Python')).toBe(true);
    });

    it('should handle Rust projects', async () => {
      // Create Cargo.toml
      writeFileSync(
        join(testDir, 'Cargo.toml'),
        `[package]
name = "test-rust-project"
version = "0.1.0"
edition = "2021"`
      );

      const techStackDetector = createTechStackDetectorService();
      const result = await techStackDetector.detectTechStack(testDir);

      expect(result.languages.some((l) => l.name === 'Rust')).toBe(true);
    });

    it('should handle Go projects', async () => {
      // Create go.mod
      writeFileSync(
        join(testDir, 'go.mod'),
        `module github.com/test/go-project

go 1.21`
      );

      const techStackDetector = createTechStackDetectorService();
      const result = await techStackDetector.detectTechStack(testDir);

      expect(result.languages.some((l) => l.name === 'Go')).toBe(true);
    });
  });

  describe('Deep Scanner with Phase 1 Extractors', () => {
    beforeEach(() => {
      const dirs = ['docs', 'docs/adr'];
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

    it('should extract npm scripts as tools', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          scripts: {
            build: 'tsc',
            test: 'vitest',
            lint: 'eslint .',
            custom: 'echo custom',
          },
        })
      );

      const deepScanner = createDeepScannerService();
      const result = await deepScanner.scan(testDir, { areas: ['architecture'] });

      const toolFindings = result.findings.filter((f) => f.category === 'tool');
      expect(toolFindings.length).toBeGreaterThanOrEqual(3);

      const buildTool = toolFindings.find((f) => f.title.includes('npm run build'));
      expect(buildTool).toBeDefined();
      expect(buildTool?.content).toContain('To build the project');
      expect(buildTool?.command).toBe('npm run build');

      const customScript = toolFindings.find((f) => f.title.includes('custom'));
      expect(customScript).toBeUndefined();
    });

    it('should extract ADRs with accepted status as decisions', async () => {
      mkdirSync(join(testDir, 'docs/adr'), { recursive: true });

      writeFileSync(
        join(testDir, 'docs/adr/0001-use-typescript.md'),
        `# ADR-0001: Use TypeScript

## Status

Accepted

## Context

We need type safety.

## Decision

Use TypeScript for all code.

## Consequences

- Better tooling
- Learning curve
`
      );

      writeFileSync(
        join(testDir, 'docs/adr/0002-deprecated.md'),
        `# ADR-0002: Old Decision

## Status

Deprecated

## Context

Old context.

## Decision

Old decision.

## Consequences

- N/A
`
      );

      const deepScanner = createDeepScannerService();
      const result = await deepScanner.scan(testDir, { areas: ['documentation'] });

      const decisionFindings = result.findings.filter((f) => f.category === 'decision');
      expect(decisionFindings.length).toBeGreaterThanOrEqual(1);

      const typescriptAdr = decisionFindings.find((f) => f.title.includes('Use TypeScript'));
      expect(typescriptAdr).toBeDefined();
      expect(typescriptAdr?.content).toContain('Decision:');
      expect(typescriptAdr?.content).toContain('Rationale:');

      const deprecatedAdr = decisionFindings.find((f) => f.title.includes('Old Decision'));
      expect(deprecatedAdr).toBeUndefined();
    });

    it('should extract workflow knowledge from CONTRIBUTING.md', async () => {
      writeFileSync(
        join(testDir, 'CONTRIBUTING.md'),
        `# Contributing Guide

## Branch Strategy

- **main**: Production branch
- **feature/***: Feature branches

### Branch Naming

Use \`feature/issue-123-description\` format.

## Pull Request Process

1. Create a feature branch
2. Make your changes
3. Submit PR for review

### PR Title Format

[type]: description

Types: feat, fix, docs

## Commit Messages

Follow conventional commits format.

\`\`\`
type(scope): subject
\`\`\`

Example:
\`\`\`
feat(auth): add login endpoint
\`\`\`
`
      );

      const deepScanner = createDeepScannerService();
      const result = await deepScanner.scan(testDir, { areas: ['documentation'] });

      const referenceFindings = result.findings.filter((f) => f.category === 'reference');
      expect(referenceFindings.length).toBeGreaterThanOrEqual(1);

      const branchStrategy = referenceFindings.find((f) => f.title.includes('Branch Strategy'));
      if (branchStrategy) {
        expect(branchStrategy.source).toBe('CONTRIBUTING.md');
      }
    });

    it('should not create duplicates on re-scan', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          scripts: { build: 'tsc', test: 'vitest' },
        })
      );

      const deepScanner = createDeepScannerService();

      const result1 = await deepScanner.scan(testDir, { areas: ['architecture'] });
      const toolCount1 = result1.findings.filter((f) => f.category === 'tool').length;

      const result2 = await deepScanner.scan(testDir, { areas: ['architecture'] });
      const toolCount2 = result2.findings.filter((f) => f.category === 'tool').length;

      expect(toolCount1).toBe(toolCount2);
    });

    it('should handle missing files gracefully', async () => {
      const deepScanner = createDeepScannerService();

      const result = await deepScanner.scan(testDir);

      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should include all extractor findings in full scan', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          scripts: { build: 'tsc', test: 'vitest', lint: 'eslint .' },
        })
      );

      mkdirSync(join(testDir, 'docs/adr'), { recursive: true });
      writeFileSync(
        join(testDir, 'docs/adr/0001-decision.md'),
        `# ADR-0001: Test Decision

## Status

Accepted

## Context

Test context.

## Decision

Test decision.
`
      );

      writeFileSync(
        join(testDir, 'CONTRIBUTING.md'),
        `# Contributing

## Branch Strategy

- **main**: Production
`
      );

      const deepScanner = createDeepScannerService();
      const result = await deepScanner.scan(testDir);

      const toolFindings = result.findings.filter((f) => f.category === 'tool');
      const decisionFindings = result.findings.filter((f) => f.category === 'decision');
      const referenceFindings = result.findings.filter((f) => f.category === 'reference');

      expect(toolFindings.length).toBeGreaterThanOrEqual(2);
      expect(decisionFindings.length).toBeGreaterThanOrEqual(1);
      expect(referenceFindings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Deep Scanner with Phase 2 Extractors', () => {
    beforeEach(() => {
      // Clean up test directory
      const dirs = [
        'src',
        'src/services',
        'src/handlers',
        'src/repositories',
        'templates',
        'examples',
      ];
      for (const dir of dirs) {
        const dirPath = join(testDir, dir);
        if (existsSync(dirPath)) {
          rmSync(dirPath, { recursive: true });
        }
      }
      const files = ['package.json'];
      for (const file of files) {
        const filePath = join(testDir, file);
        if (existsSync(filePath)) {
          rmSync(filePath);
        }
      }
    });

    it('should detect module boundaries from src/ structure', async () => {
      // Create layered architecture
      mkdirSync(join(testDir, 'src/handlers'), { recursive: true });
      mkdirSync(join(testDir, 'src/services'), { recursive: true });
      mkdirSync(join(testDir, 'src/repositories'), { recursive: true });

      writeFileSync(join(testDir, 'src/handlers/user.handler.ts'), 'export class UserHandler {}');
      writeFileSync(join(testDir, 'src/services/user.service.ts'), 'export class UserService {}');
      writeFileSync(
        join(testDir, 'src/repositories/user.repository.ts'),
        'export class UserRepository {}'
      );

      const deepScanner = createDeepScannerService();
      const result = await deepScanner.scan(testDir, { areas: ['architecture'] });

      const moduleBoundaryFinding = result.findings.find((f) => f.title === 'Module Boundaries');
      expect(moduleBoundaryFinding).toBeDefined();
      expect(moduleBoundaryFinding?.category).toBe('decision');
      expect(moduleBoundaryFinding?.content).toContain('Layered architecture');
      expect(moduleBoundaryFinding?.confidence).toBe(0.85);
    });

    it('should detect template directories', async () => {
      mkdirSync(join(testDir, 'templates'), { recursive: true });
      mkdirSync(join(testDir, 'examples'), { recursive: true });

      writeFileSync(join(testDir, 'templates/component.tsx'), 'export const Component = () => {}');
      writeFileSync(join(testDir, 'examples/usage.ts'), 'import { Component } from "./component"');

      const deepScanner = createDeepScannerService();
      const result = await deepScanner.scan(testDir, { areas: ['architecture'] });

      const templateFindings = result.findings.filter(
        (f) => f.title.includes('Template') || f.title.includes('template')
      );
      expect(templateFindings.length).toBeGreaterThanOrEqual(1);

      const templateFinding = templateFindings[0];
      expect(templateFinding.category).toBe('reference');
      expect(templateFinding.content).toContain('template');
      expect(templateFinding.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should generate pattern contribution guides', async () => {
      // Create files with recognizable patterns
      mkdirSync(join(testDir, 'src/repositories'), { recursive: true });
      mkdirSync(join(testDir, 'src/handlers'), { recursive: true });
      mkdirSync(join(testDir, 'src/services'), { recursive: true });

      writeFileSync(
        join(testDir, 'src/repositories/user.repository.ts'),
        'export class UserRepository {}'
      );
      writeFileSync(join(testDir, 'src/handlers/user.handler.ts'), 'export class UserHandler {}');
      writeFileSync(join(testDir, 'src/services/user.service.ts'), 'export class UserService {}');

      const deepScanner = createDeepScannerService();
      const result = await deepScanner.scan(testDir, { areas: ['architecture'] });

      const guideFindings = result.findings.filter((f) => f.title.startsWith('How to add new'));
      expect(guideFindings.length).toBeGreaterThanOrEqual(1);

      const guide = guideFindings[0];
      expect(guide.category).toBe('reference');
      expect(guide.area).toBe('architecture');
      expect(guide.content).toMatch(/1\)/); // Numbered steps
      expect(guide.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should detect naming conventions', async () => {
      mkdirSync(join(testDir, 'src/repositories'), { recursive: true });
      mkdirSync(join(testDir, 'src/handlers'), { recursive: true });

      writeFileSync(
        join(testDir, 'src/repositories/user.repository.ts'),
        'export class UserRepository {}'
      );
      writeFileSync(
        join(testDir, 'src/repositories/post.repository.ts'),
        'export class PostRepository {}'
      );
      writeFileSync(join(testDir, 'src/handlers/user.handler.ts'), 'export class UserHandler {}');
      writeFileSync(join(testDir, 'src/handlers/post.handler.ts'), 'export class PostHandler {}');

      const deepScanner = createDeepScannerService();
      const result = await deepScanner.scan(testDir, { areas: ['architecture'] });

      const namingFinding = result.findings.find((f) => f.title === 'Naming Conventions');
      expect(namingFinding).toBeDefined();
      expect(namingFinding?.category).toBe('reference');
      expect(namingFinding?.content).toContain('.repository.ts');
      expect(namingFinding?.content).toContain('.handler.ts');
      expect(namingFinding?.confidence).toBe(0.85);
    });

    it('should analyze import patterns from index.ts files', async () => {
      mkdirSync(join(testDir, 'src/services'), { recursive: true });
      mkdirSync(join(testDir, 'src/repositories'), { recursive: true });

      // Create index.ts with cross-module import
      writeFileSync(
        join(testDir, 'src/services/index.ts'),
        `import { UserRepository } from '../repositories/user.repository.js';
export * from './user.service.js';`
      );

      writeFileSync(
        join(testDir, 'src/repositories/index.ts'),
        `export * from './user.repository.js';`
      );

      const deepScanner = createDeepScannerService();
      const result = await deepScanner.scan(testDir, { areas: ['architecture'] });

      // Import patterns or module boundaries should be detected
      const architectureFindings = result.findings.filter((f) => f.area === 'architecture');
      expect(architectureFindings.length).toBeGreaterThanOrEqual(1);

      // Should have either Import Patterns or Module Boundaries finding
      const hasImportOrBoundary = architectureFindings.some(
        (f) => f.title === 'Import Patterns' || f.title === 'Module Boundaries'
      );
      expect(hasImportOrBoundary).toBe(true);
    });

    it('should not output raw file counts', async () => {
      // Create various files
      mkdirSync(join(testDir, 'src/repositories'), { recursive: true });
      mkdirSync(join(testDir, 'src/handlers'), { recursive: true });

      for (let i = 0; i < 10; i++) {
        writeFileSync(
          join(testDir, `src/repositories/entity${i}.repository.ts`),
          `export class Entity${i}Repository {}`
        );
      }

      const deepScanner = createDeepScannerService();
      const result = await deepScanner.scan(testDir);

      // Verify NO findings contain raw file counts like "Found 10 files"
      const hasRawCounts = result.findings.some((f) =>
        /Found \d+ (files?|repositories|handlers|services)/i.test(f.content)
      );
      expect(hasRawCounts).toBe(false);

      // Verify findings are actionable (contain "To", "How to", or pattern descriptions)
      const actionableFindings = result.findings.filter(
        (f) =>
          f.content.includes('To ') ||
          f.content.includes('How to') ||
          f.content.includes('pattern') ||
          f.content.includes('convention') ||
          f.content.includes('Layered architecture')
      );
      expect(actionableFindings.length).toBeGreaterThanOrEqual(1);
    });

    it('should include actionable patterns and guides in output', async () => {
      // Create comprehensive project structure
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          scripts: { build: 'tsc', test: 'vitest', lint: 'eslint .' },
        })
      );

      mkdirSync(join(testDir, 'src/repositories'), { recursive: true });
      mkdirSync(join(testDir, 'src/handlers'), { recursive: true });
      mkdirSync(join(testDir, 'templates'), { recursive: true });

      writeFileSync(
        join(testDir, 'src/repositories/user.repository.ts'),
        'export class UserRepository {}'
      );
      writeFileSync(join(testDir, 'src/handlers/user.handler.ts'), 'export class UserHandler {}');
      writeFileSync(join(testDir, 'templates/component.tsx'), 'export const Component = () => {}');

      const deepScanner = createDeepScannerService();
      const result = await deepScanner.scan(testDir);

      // Should have tools (npm scripts)
      const toolFindings = result.findings.filter((f) => f.category === 'tool');
      expect(toolFindings.length).toBeGreaterThanOrEqual(2);

      // Should have pattern guides
      const guideFindings = result.findings.filter((f) => f.title.startsWith('How to add new'));
      expect(guideFindings.length).toBeGreaterThanOrEqual(1);

      // Should have naming conventions
      const namingFinding = result.findings.find((f) => f.title === 'Naming Conventions');
      expect(namingFinding).toBeDefined();

      // Verify we have actionable findings (not just structural facts)
      const actionableFindings = result.findings.filter(
        (f) =>
          f.category === 'tool' ||
          f.category === 'decision' ||
          f.category === 'reference' ||
          f.content.includes('To ') ||
          f.content.includes('How to')
      );

      // Should have multiple actionable findings
      expect(actionableFindings.length).toBeGreaterThanOrEqual(5);

      // Verify specific actionable types are present
      const hasTools = result.findings.some((f) => f.category === 'tool');
      const hasGuides = result.findings.some((f) => f.title.startsWith('How to add new'));
      const hasConventions = result.findings.some((f) => f.title === 'Naming Conventions');

      expect(hasTools).toBe(true);
      expect(hasGuides).toBe(true);
      expect(hasConventions).toBe(true);
    });

    it('should not create duplicates on full Phase 2 re-scan', async () => {
      // Create project structure
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          scripts: { build: 'tsc', test: 'vitest' },
        })
      );

      mkdirSync(join(testDir, 'src/repositories'), { recursive: true });
      writeFileSync(
        join(testDir, 'src/repositories/user.repository.ts'),
        'export class UserRepository {}'
      );

      const deepScanner = createDeepScannerService();

      // First scan
      const result1 = await deepScanner.scan(testDir);
      const findingCount1 = result1.findings.length;

      // Second scan (should not create duplicates within same scan)
      const result2 = await deepScanner.scan(testDir);
      const findingCount2 = result2.findings.length;

      expect(findingCount1).toBe(findingCount2);

      // Verify no duplicate titles within a scan
      const titles1 = result1.findings.map((f) => f.title);
      const uniqueTitles1 = new Set(titles1);
      expect(titles1.length).toBe(uniqueTitles1.size);

      const titles2 = result2.findings.map((f) => f.title);
      const uniqueTitles2 = new Set(titles2);
      expect(titles2.length).toBe(uniqueTitles2.size);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty directory gracefully', async () => {
      const emptyDir = join(testDir, 'empty');
      mkdirSync(emptyDir, { recursive: true });

      const projectDetector = createProjectDetectorService();
      const projectResult = await projectDetector.detectProjectInfo(emptyDir);

      // Should fall back to directory name
      expect(projectResult?.name).toBe('empty');
      expect(projectResult?.source).toBe('directory');

      const techStackDetector = createTechStackDetectorService();
      const techResult = await techStackDetector.detectTechStack(emptyDir);

      // Should return empty arrays
      expect(techResult.languages).toEqual([]);
      expect(techResult.frameworks).toEqual([]);

      const docScanner = createDocScannerService();
      const docs = await docScanner.scanForDocs(emptyDir);

      // Should return empty array
      expect(docs).toEqual([]);
    });

    it('should handle malformed package.json', async () => {
      writeFileSync(join(testDir, 'package.json'), 'not valid json {');

      const projectDetector = createProjectDetectorService();
      const result = await projectDetector.detectProjectInfo(testDir);

      // Should fall back to directory name
      expect(result?.source).toBe('directory');
    });

    it('should handle missing files gracefully', async () => {
      const docScanner = createDocScannerService();
      const result = await docScanner.readDoc(join(testDir, 'NONEXISTENT.md'));

      expect(result).toBeNull();
    });
  });
});
