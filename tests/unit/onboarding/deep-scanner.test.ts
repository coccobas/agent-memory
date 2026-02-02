import { describe, it, expect, beforeEach } from 'vitest';
import {
  DeepScannerService,
  createDeepScannerService,
} from '../../../src/services/onboarding/deep-scanner.js';

describe('DeepScannerService', () => {
  let service: DeepScannerService;
  const testCwd = process.cwd();

  beforeEach(() => {
    service = new DeepScannerService();
  });

  describe('scan - overall behavior', () => {
    it('should scan all 5 areas by default', async () => {
      const result = await service.scan(testCwd);

      expect(result.areasScanned).toContain('architecture');
      expect(result.areasScanned).toContain('database');
      expect(result.areasScanned).toContain('api');
      expect(result.areasScanned).toContain('testing');
      expect(result.areasScanned).toContain('documentation');
      expect(result.areasScanned.length).toBe(5);
    });

    it('should return findings array with area metadata', async () => {
      const result = await service.scan(testCwd);

      expect(Array.isArray(result.findings)).toBe(true);
      result.findings.forEach((finding) => {
        expect(finding).toHaveProperty('area');
        expect(finding).toHaveProperty('title');
        expect(finding).toHaveProperty('content');
        expect(finding).toHaveProperty('category');
        expect(finding).toHaveProperty('confidence');
      });
    });

    it('should respect maxFindings option', async () => {
      const result = await service.scan(testCwd, { maxFindings: 2 });

      const findingsByArea = new Map<string, number>();
      result.findings.forEach((f) => {
        const count = findingsByArea.get(f.area) || 0;
        findingsByArea.set(f.area, count + 1);
      });

      findingsByArea.forEach((count) => {
        expect(count).toBeLessThanOrEqual(2);
      });
    });

    it('should include duration in milliseconds', async () => {
      const result = await service.scan(testCwd);

      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should set success=true when no errors occur', async () => {
      const result = await service.scan(testCwd);

      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('scanArchitecture - entry points and module structure', () => {
    it('should detect entry points from standard locations', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const entryPointFinding = result.findings.find((f) => f.title === 'Entry Points');
      if (entryPointFinding) {
        expect(entryPointFinding.area).toBe('architecture');
        expect(entryPointFinding.category).toBe('fact');
        expect(entryPointFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(entryPointFinding.content).toMatch(/Found \d+ entry point/);
      }
    });

    it('should detect module structure in src directory', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const moduleFinding = result.findings.find((f) => f.title === 'Module Structure');
      if (moduleFinding) {
        expect(moduleFinding.area).toBe('architecture');
        expect(moduleFinding.category).toBe('fact');
        expect(moduleFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(moduleFinding.content).toMatch(/Source organized into \d+ modules/);
      }
    });

    it('should detect core abstractions if src/core exists', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const coreFinding = result.findings.find((f) => f.title === 'Core Abstractions');
      if (coreFinding) {
        expect(coreFinding.area).toBe('architecture');
        expect(coreFinding.category).toBe('fact');
        expect(coreFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(coreFinding.content).toMatch(/Core module contains \d+ files/);
      }
    });

    it('should detect design patterns from file naming conventions', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const patternFinding = result.findings.find((f) => f.title === 'Design Patterns');
      if (patternFinding) {
        expect(patternFinding.area).toBe('architecture');
        expect(patternFinding.category).toBe('decision');
        expect(patternFinding.confidence).toBeGreaterThanOrEqual(0.7);
        expect(patternFinding.content).toMatch(/Detected patterns:/);
      }
    });

    it('should return at least one architecture finding for this project', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const architectureFindings = result.findings.filter((f) => f.area === 'architecture');
      expect(architectureFindings.length).toBeGreaterThan(0);
    });
  });

  describe('scanDatabase - ORM, schema, repositories, migrations', () => {
    it('should detect ORM type (Drizzle, Prisma, or TypeORM)', async () => {
      const result = await service.scan(testCwd, { areas: ['database'] });

      const ormFinding = result.findings.find(
        (f) => f.title.includes('ORM') || f.title.includes('Drizzle') || f.title.includes('Prisma')
      );
      if (ormFinding) {
        expect(ormFinding.area).toBe('database');
        expect(ormFinding.category).toBe('fact');
        expect(ormFinding.confidence).toBeGreaterThanOrEqual(0.9);
        expect(ormFinding.content).toMatch(/uses.*ORM/i);
      }
    });

    it('should detect schema files if src/db/schema exists', async () => {
      const result = await service.scan(testCwd, { areas: ['database'] });

      const schemaFinding = result.findings.find((f) => f.title === 'Schema Structure');
      if (schemaFinding) {
        expect(schemaFinding.area).toBe('database');
        expect(schemaFinding.category).toBe('fact');
        expect(schemaFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(schemaFinding.content).toMatch(/Found \d+ schema files/);
      }
    });

    it('should detect repository pattern if src/db/repositories exists', async () => {
      const result = await service.scan(testCwd, { areas: ['database'] });

      const repoFinding = result.findings.find((f) => f.title === 'Repository Pattern');
      if (repoFinding) {
        expect(repoFinding.area).toBe('database');
        expect(repoFinding.category).toBe('fact');
        expect(repoFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(repoFinding.content).toMatch(/Found \d+ repository files/);
      }
    });

    it('should detect migrations directory', async () => {
      const result = await service.scan(testCwd, { areas: ['database'] });

      const migrationFinding = result.findings.find((f) => f.title === 'Migrations');
      if (migrationFinding) {
        expect(migrationFinding.area).toBe('database');
        expect(migrationFinding.category).toBe('fact');
        expect(migrationFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(migrationFinding.content).toMatch(/Database migrations found/);
      }
    });

    it('should return at least one database finding for this project', async () => {
      const result = await service.scan(testCwd, { areas: ['database'] });

      const databaseFindings = result.findings.filter((f) => f.area === 'database');
      expect(databaseFindings.length).toBeGreaterThan(0);
    });
  });

  describe('scanApi - MCP tools, handlers, REST routes, services', () => {
    it('should detect MCP tool descriptors if src/mcp/descriptors exists', async () => {
      const result = await service.scan(testCwd, { areas: ['api'] });

      const mcpToolsFinding = result.findings.find((f) => f.title === 'MCP Tools');
      if (mcpToolsFinding) {
        expect(mcpToolsFinding.area).toBe('api');
        expect(mcpToolsFinding.category).toBe('fact');
        expect(mcpToolsFinding.confidence).toBeGreaterThanOrEqual(0.9);
        expect(mcpToolsFinding.content).toMatch(/Found \d+ MCP tool descriptors/);
      }
    });

    it('should detect MCP handlers if src/mcp/handlers exists', async () => {
      const result = await service.scan(testCwd, { areas: ['api'] });

      const mcpHandlersFinding = result.findings.find((f) => f.title === 'MCP Handlers');
      if (mcpHandlersFinding) {
        expect(mcpHandlersFinding.area).toBe('api');
        expect(mcpHandlersFinding.category).toBe('fact');
        expect(mcpHandlersFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(mcpHandlersFinding.content).toMatch(/Found \d+ MCP handler files/);
      }
    });

    it('should detect REST API routes if src/restapi/routes exists', async () => {
      const result = await service.scan(testCwd, { areas: ['api'] });

      const restRoutesFinding = result.findings.find((f) => f.title === 'REST API Routes');
      if (restRoutesFinding) {
        expect(restRoutesFinding.area).toBe('api');
        expect(restRoutesFinding.category).toBe('fact');
        expect(restRoutesFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(restRoutesFinding.content).toMatch(/Found \d+ REST API route files/);
      }
    });

    it('should detect service modules if src/services exists', async () => {
      const result = await service.scan(testCwd, { areas: ['api'] });

      const servicesFinding = result.findings.find((f) => f.title === 'Service Modules');
      if (servicesFinding) {
        expect(servicesFinding.area).toBe('api');
        expect(servicesFinding.category).toBe('fact');
        expect(servicesFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(servicesFinding.content).toMatch(/Found \d+ service modules/);
      }
    });

    it('should return at least one API finding for this project', async () => {
      const result = await service.scan(testCwd, { areas: ['api'] });

      const apiFindings = result.findings.filter((f) => f.area === 'api');
      expect(apiFindings.length).toBeGreaterThan(0);
    });
  });

  describe('scanTesting - framework, organization, fixtures', () => {
    it('should detect test framework (Vitest or Jest)', async () => {
      const result = await service.scan(testCwd, { areas: ['testing'] });

      const frameworkFinding = result.findings.find(
        (f) =>
          f.title.includes('Test Framework') ||
          f.title.includes('Vitest') ||
          f.title.includes('Jest')
      );
      if (frameworkFinding) {
        expect(frameworkFinding.area).toBe('testing');
        expect(frameworkFinding.category).toBe('fact');
        expect(frameworkFinding.confidence).toBeGreaterThanOrEqual(0.9);
        expect(frameworkFinding.content).toMatch(/uses.*(?:Vitest|Jest)/i);
      }
    });

    it('should detect test organization and structure', async () => {
      const result = await service.scan(testCwd, { areas: ['testing'] });

      const orgFinding = result.findings.find((f) => f.title === 'Test Organization');
      if (orgFinding) {
        expect(orgFinding.area).toBe('testing');
        expect(orgFinding.category).toBe('fact');
        expect(orgFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(orgFinding.content).toMatch(/Found \d+ test files/);
      }
    });

    it('should detect test fixtures if tests/fixtures exists', async () => {
      const result = await service.scan(testCwd, { areas: ['testing'] });

      const fixturesFinding = result.findings.find((f) => f.title === 'Test Fixtures');
      if (fixturesFinding) {
        expect(fixturesFinding.area).toBe('testing');
        expect(fixturesFinding.category).toBe('fact');
        expect(fixturesFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(fixturesFinding.content).toMatch(/Found \d+ fixture\/helper files/);
      }
    });

    it('should return at least one testing finding for this project', async () => {
      const result = await service.scan(testCwd, { areas: ['testing'] });

      const testingFindings = result.findings.filter((f) => f.area === 'testing');
      expect(testingFindings.length).toBeGreaterThan(0);
    });
  });

  describe('scanDocumentation - markdown, ADRs, docs structure, rules', () => {
    it('should detect markdown documentation files', async () => {
      const result = await service.scan(testCwd, { areas: ['documentation'] });

      const docsFinding = result.findings.find((f) => f.title === 'Documentation Files');
      if (docsFinding) {
        expect(docsFinding.area).toBe('documentation');
        expect(docsFinding.category).toBe('fact');
        expect(docsFinding.confidence).toBeGreaterThanOrEqual(0.9);
        expect(docsFinding.content).toMatch(/Found \d+ markdown documentation files/);
      }
    });

    it('should detect ADRs if docs/adr exists', async () => {
      const result = await service.scan(testCwd, { areas: ['documentation'] });

      const adrFinding = result.findings.find((f) => f.title === 'Architecture Decision Records');
      if (adrFinding) {
        expect(adrFinding.area).toBe('documentation');
        expect(adrFinding.category).toBe('fact');
        expect(adrFinding.confidence).toBeGreaterThanOrEqual(0.9);
        expect(adrFinding.content).toMatch(/Found \d+ ADRs/);
      }
    });

    it('should detect documentation structure if docs exists', async () => {
      const result = await service.scan(testCwd, { areas: ['documentation'] });

      const docStructFinding = result.findings.find((f) => f.title === 'Documentation Structure');
      if (docStructFinding) {
        expect(docStructFinding.area).toBe('documentation');
        expect(docStructFinding.category).toBe('fact');
        expect(docStructFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(docStructFinding.content).toMatch(/Documentation organized/);
      }
    });

    it('should detect rules/guidelines if rules directory exists', async () => {
      const result = await service.scan(testCwd, { areas: ['documentation'] });

      const rulesFinding = result.findings.find((f) => f.title === 'Rules/Guidelines');
      if (rulesFinding) {
        expect(rulesFinding.area).toBe('documentation');
        expect(rulesFinding.category).toBe('fact');
        expect(rulesFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(rulesFinding.content).toMatch(/Found \d+ rule files/);
      }
    });

    it('should return at least one documentation finding for this project', async () => {
      const result = await service.scan(testCwd, { areas: ['documentation'] });

      const docFindings = result.findings.filter((f) => f.area === 'documentation');
      expect(docFindings.length).toBeGreaterThan(0);
    });
  });

  describe('selective scanning', () => {
    it('should scan only specified areas', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture', 'testing'] });

      expect(result.areasScanned).toContain('architecture');
      expect(result.areasScanned).toContain('testing');
      expect(result.areasScanned).not.toContain('database');
      expect(result.areasScanned).not.toContain('api');
      expect(result.areasScanned).not.toContain('documentation');
    });

    it('should only return findings from requested areas', async () => {
      const result = await service.scan(testCwd, { areas: ['database'] });

      result.findings.forEach((finding) => {
        expect(finding.area).toBe('database');
      });
    });
  });

  describe('createDeepScannerService factory', () => {
    it('should create a service instance', () => {
      const svc = createDeepScannerService();

      expect(svc).toBeDefined();
      expect(typeof svc.scan).toBe('function');
    });

    it('should return instance with scan method', async () => {
      const svc = createDeepScannerService();
      const result = await svc.scan(testCwd, { areas: ['architecture'], maxFindings: 1 });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('areasScanned');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('errors');
    });
  });

  describe('finding structure and metadata', () => {
    it('should include source path in findings when available', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const findingsWithSource = result.findings.filter((f) => f.source);
      if (findingsWithSource.length > 0) {
        findingsWithSource.forEach((finding) => {
          expect(typeof finding.source).toBe('string');
          expect((finding.source as string).length).toBeGreaterThan(0);
        });
      }
    });

    it('should have confidence scores between 0 and 1', async () => {
      const result = await service.scan(testCwd);

      result.findings.forEach((finding) => {
        expect(finding.confidence).toBeGreaterThanOrEqual(0);
        expect(finding.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should categorize findings as fact, decision, reference, or tool', async () => {
      const result = await service.scan(testCwd);

      result.findings.forEach((finding) => {
        expect(['fact', 'decision', 'reference', 'tool']).toContain(finding.category);
      });
    });
  });
});
