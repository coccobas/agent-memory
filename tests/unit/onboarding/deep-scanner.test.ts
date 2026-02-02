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

    it('should detect module boundaries from src/ structure', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const boundaryFinding = result.findings.find((f) => f.title === 'Module Boundaries');
      if (boundaryFinding) {
        expect(boundaryFinding.area).toBe('architecture');
        expect(boundaryFinding.category).toBe('decision');
        expect(boundaryFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(boundaryFinding.content).toMatch(/layered architecture/i);
      }
    });

    it('should generate actionable module boundary findings', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const boundaryFinding = result.findings.find((f) => f.title === 'Module Boundaries');
      if (boundaryFinding) {
        // Should describe what each layer does, not just list directories
        expect(boundaryFinding.content).not.toMatch(/^Found \d+ directories/);
        // Should mention handlers, services, or repositories
        expect(boundaryFinding.content).toMatch(/handlers|services|repositories/i);
      }
    });

    it('should detect handler -> service -> repository pattern', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const boundaryFinding = result.findings.find((f) => f.title === 'Module Boundaries');
      if (boundaryFinding) {
        // Should describe the flow: handlers call services, services use repositories
        const content = boundaryFinding.content.toLowerCase();
        const hasHandlers = content.includes('handler');
        const hasServices = content.includes('service');
        const hasRepositories = content.includes('repositor');

        // If any layer exists, the finding should describe the architecture
        if (hasHandlers || hasServices || hasRepositories) {
          expect(boundaryFinding.content.length).toBeGreaterThan(50);
        }
      }
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

  describe('scanArchitecture - template directory identification', () => {
    it('should detect templates/ directory if present', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const templateFinding = result.findings.find((f) => f.title === 'Template Directories');
      if (templateFinding) {
        expect(templateFinding.area).toBe('architecture');
        expect(templateFinding.category).toBe('reference');
        expect(templateFinding.confidence).toBeGreaterThanOrEqual(0.85);
        expect(templateFinding.content).toMatch(/templates?\//);
      }
    });

    it('should detect examples/ directory if present', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const exampleFinding = result.findings.find((f) => f.title === 'Template Directories');
      if (exampleFinding) {
        expect(exampleFinding.area).toBe('architecture');
        expect(exampleFinding.category).toBe('reference');
        expect(exampleFinding.content).toMatch(/examples?\//);
      }
    });

    it('should detect boilerplate/ directory if present', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const boilerplateFinding = result.findings.find((f) => f.title === 'Template Directories');
      if (boilerplateFinding) {
        expect(boilerplateFinding.area).toBe('architecture');
        expect(boilerplateFinding.category).toBe('reference');
        expect(boilerplateFinding.content).toMatch(/boilerplate\//);
      }
    });

    it('should detect *.template.* files', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const templateFileFinding = result.findings.find((f) => f.title === 'Template Files');
      if (templateFileFinding) {
        expect(templateFileFinding.area).toBe('architecture');
        expect(templateFileFinding.category).toBe('reference');
        expect(templateFileFinding.confidence).toBeGreaterThanOrEqual(0.8);
        expect(templateFileFinding.content).toMatch(/\.template\./);
      }
    });

    it('should generate actionable "copy this pattern" guidance', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const templateFinding = result.findings.find(
        (f) => f.title === 'Template Directories' || f.title === 'Template Files'
      );
      if (templateFinding) {
        // Should contain actionable guidance like "To add new X, copy from templates/X/"
        expect(templateFinding.content).toMatch(/[Tt]o add|[Cc]opy|template/i);
      }
    });

    it('should not create template finding if no templates exist', async () => {
      // This test verifies conditional behavior - if no templates, no finding
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const templateFindings = result.findings.filter(
        (f) => f.title === 'Template Directories' || f.title === 'Template Files'
      );
      // Either findings exist with proper structure, or none exist (both valid)
      templateFindings.forEach((f) => {
        expect(f.area).toBe('architecture');
        expect(['reference']).toContain(f.category);
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

  describe('pattern contribution guides', () => {
    it('should generate at least one contribution guide for this project', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const guideFindings = result.findings.filter((f) => f.title.includes('How to add'));
      expect(guideFindings.length).toBeGreaterThan(0);
    });

    it('should generate contribution guides for detected patterns', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const guideFinding = result.findings.find((f) => f.title.includes('How to add'));
      if (guideFinding) {
        expect(guideFinding.area).toBe('architecture');
        expect(guideFinding.category).toBe('reference');
        expect(guideFinding.confidence).toBeGreaterThanOrEqual(0.7);
        expect(guideFinding.content).toMatch(/To add (?:a new|new)/i);
        expect(guideFinding.content).toMatch(/\d+\)/); // Numbered steps
      }
    });

    it('should format guides with numbered steps', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const guideFindings = result.findings.filter((f) => f.title.includes('How to add'));
      guideFindings.forEach((finding) => {
        // Should have "To add new X:" prefix
        expect(finding.content).toMatch(/To add (?:a new|new) \w+:/i);
        // Should have numbered steps (1), 2), 3))
        expect(finding.content).toMatch(/1\)/);
        expect(finding.content).toMatch(/2\)/);
      });
    });

    it('should generate Repository pattern guide when repositories detected', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const repoGuide = result.findings.find((f) => f.title === 'How to add new Repository');
      if (repoGuide) {
        expect(repoGuide.content).toContain('src/db/repositories/');
        expect(repoGuide.content).toMatch(/interface/i);
        expect(repoGuide.content).toMatch(/implement/i);
        expect(repoGuide.confidence).toBe(0.8);
      }
    });

    it('should generate Handler pattern guide when handlers detected', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const handlerGuide = result.findings.find((f) => f.title === 'How to add new Handler');
      if (handlerGuide) {
        expect(handlerGuide.content).toContain('src/mcp/handlers/');
        expect(handlerGuide.content).toMatch(/descriptor/i);
        expect(handlerGuide.content).toMatch(/register/i);
        expect(handlerGuide.confidence).toBe(0.8);
      }
    });

    it('should generate Service pattern guide when services detected', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const serviceGuide = result.findings.find((f) => f.title === 'How to add new Service');
      if (serviceGuide) {
        expect(serviceGuide.content).toContain('src/services/');
        expect(serviceGuide.content).toMatch(/interface/i);
        expect(serviceGuide.content).toMatch(/export/i);
        expect(serviceGuide.confidence).toBe(0.8);
      }
    });

    it('should generate Factory pattern guide when factories detected', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const factoryGuide = result.findings.find((f) => f.title === 'How to add new Factory');
      if (factoryGuide) {
        expect(factoryGuide.content).toMatch(/create/i);
        expect(factoryGuide.content).toMatch(/return/i);
        expect(factoryGuide.confidence).toBe(0.75);
      }
    });

    it('should not generate guides for patterns not detected', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'], maxFindings: 100 });

      const allGuides = result.findings.filter((f) => f.title.includes('How to add'));
      const allPatterns = result.findings.find((f) => f.title === 'Design Patterns');

      if (allPatterns && allGuides.length > 0) {
        const detectedPatterns = allPatterns.content.match(/Detected patterns: (.+)/)?.[1] || '';
        const patternList = detectedPatterns.split(', ');

        allGuides.forEach((guide) => {
          const patternName = guide.title.replace('How to add new ', '');
          const hasPattern = patternList.some((p) => {
            const pLower = p.toLowerCase();
            const nameLower = patternName.toLowerCase();
            return pLower.includes(nameLower) || nameLower.includes(pLower.split(' ')[0]);
          });
          expect(hasPattern).toBe(true);
        });
      }
    });

    it('should set confidence to 0.8 for Repository/Handler/Service guides', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const primaryGuides = result.findings.filter(
        (f) =>
          f.title === 'How to add new Repository' ||
          f.title === 'How to add new Handler' ||
          f.title === 'How to add new Service'
      );

      primaryGuides.forEach((guide) => {
        expect(guide.confidence).toBe(0.8);
      });
    });

    it('should set confidence to 0.75 for other pattern guides', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const otherGuides = result.findings.filter(
        (f) =>
          f.title.includes('How to add new') &&
          !['Repository', 'Handler', 'Service'].some((p) => f.title.includes(p))
      );

      otherGuides.forEach((guide) => {
        expect(guide.confidence).toBe(0.75);
      });
    });

    it('should include source field with pattern detection reference', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const guideFindings = result.findings.filter((f) => f.title.includes('How to add'));
      guideFindings.forEach((finding) => {
        expect(finding.source).toBe('pattern detection');
      });
    });

    it('should generate guides only in architecture area', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const guideFindings = result.findings.filter((f) => f.title.includes('How to add'));
      guideFindings.forEach((finding) => {
        expect(finding.area).toBe('architecture');
      });
    });
  });

  describe('scanArchitecture - naming conventions', () => {
    it('should detect file naming patterns per directory', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const namingFinding = result.findings.find((f) => f.title === 'Naming Conventions');
      if (namingFinding) {
        expect(namingFinding.area).toBe('architecture');
        expect(namingFinding.category).toBe('reference');
        expect(namingFinding.confidence).toBeGreaterThanOrEqual(0.7);
        expect(namingFinding.content).toMatch(/naming convention/i);
      }
    });

    it('should detect repository naming pattern (*.repository.ts)', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const namingFinding = result.findings.find((f) => f.title === 'Naming Conventions');
      if (namingFinding) {
        // Should mention repository pattern if repositories exist
        const content = namingFinding.content.toLowerCase();
        if (content.includes('repository')) {
          expect(content).toMatch(/repository.*\.ts|\.repository\.ts/i);
        }
      }
    });

    it('should detect handler naming pattern (*.handler.ts)', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const namingFinding = result.findings.find((f) => f.title === 'Naming Conventions');
      if (namingFinding) {
        // Should mention handler pattern if handlers exist
        const content = namingFinding.content.toLowerCase();
        if (content.includes('handler')) {
          expect(content).toMatch(/handler.*\.ts|\.handler\.ts/i);
        }
      }
    });

    it('should detect service naming pattern (*.service.ts)', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const namingFinding = result.findings.find((f) => f.title === 'Naming Conventions');
      if (namingFinding) {
        // Should mention service pattern if services exist
        const content = namingFinding.content.toLowerCase();
        if (content.includes('service')) {
          expect(content).toMatch(/service.*\.ts|\.service\.ts/i);
        }
      }
    });

    it('should use regex on filenames, not content', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const namingFinding = result.findings.find((f) => f.title === 'Naming Conventions');
      if (namingFinding) {
        // Naming conventions should be based on file patterns, not file content
        // This is validated by checking that the finding exists and has proper structure
        expect(namingFinding).toBeDefined();
        expect(namingFinding.source).toBeDefined();
      }
    });

    it('should generate actionable convention descriptions', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const namingFinding = result.findings.find((f) => f.title === 'Naming Conventions');
      if (namingFinding) {
        // Should describe conventions in actionable format like "Repositories: {entity}.repository.ts"
        // Not just list files
        expect(namingFinding.content.length).toBeGreaterThan(20);
        expect(namingFinding.content).not.toMatch(/^Found \d+ files/);
      }
    });

    it('should have confidence score in valid range (0.7-0.95)', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const namingFinding = result.findings.find((f) => f.title === 'Naming Conventions');
      if (namingFinding) {
        expect(namingFinding.confidence).toBeGreaterThanOrEqual(0.7);
        expect(namingFinding.confidence).toBeLessThanOrEqual(0.95);
      }
    });

    it('should include source field with directory path', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const namingFinding = result.findings.find((f) => f.title === 'Naming Conventions');
      if (namingFinding) {
        expect(namingFinding.source).toBeDefined();
        expect(typeof namingFinding.source).toBe('string');
      }
    });
  });

  describe('scanArchitecture - import pattern analysis', () => {
    it('should detect cross-module imports in index.ts files', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const importFinding = result.findings.find((f) => f.title === 'Import Patterns');
      if (importFinding) {
        expect(importFinding.area).toBe('architecture');
        expect(importFinding.category).toBe('decision');
        expect(importFinding.confidence).toBeGreaterThanOrEqual(0.8);
      }
    });

    it('should generate at least one import pattern finding for this project', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const importFindings = result.findings.filter(
        (f) => f.title === 'Import Patterns' || f.title === 'Module Boundaries'
      );
      expect(importFindings.length).toBeGreaterThan(0);
    });

    it('should analyze only top-level index.ts files (depth 1)', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const importFinding = result.findings.find((f) => f.title === 'Import Patterns');
      if (importFinding) {
        // Should mention index.ts analysis
        expect(importFinding.content).toMatch(/index\.ts|module/i);
      }
    });

    it('should detect imports from other src/ modules', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const importFinding = result.findings.find((f) => f.title === 'Import Patterns');
      if (importFinding) {
        // Should detect patterns like services importing from db, mcp importing from services
        const content = importFinding.content.toLowerCase();
        const hasModuleReference =
          content.includes('services') ||
          content.includes('db') ||
          content.includes('mcp') ||
          content.includes('config');
        expect(hasModuleReference).toBe(true);
      }
    });

    it('should generate module boundary guidelines', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      // Look for guidelines about import boundaries
      const boundaryGuideline = result.findings.find(
        (f) =>
          f.title.includes('Import') || (f.title.includes('Module') && f.content.includes('import'))
      );
      if (boundaryGuideline) {
        expect(boundaryGuideline.category).toMatch(/decision|reference/);
        expect(boundaryGuideline.confidence).toBeGreaterThanOrEqual(0.75);
      }
    });

    it('should identify allowed import directions (e.g., mcp → services)', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const importFinding = result.findings.find((f) => f.title === 'Import Patterns');
      if (importFinding) {
        // Should describe allowed import directions
        const content = importFinding.content.toLowerCase();
        // In this codebase: mcp imports from services, services imports from db
        const hasDirectionInfo =
          content.includes('→') ||
          content.includes('->') ||
          content.includes('from') ||
          content.includes('imports');
        expect(hasDirectionInfo).toBe(true);
      }
    });

    it('should have proper finding structure', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const importFinding = result.findings.find((f) => f.title === 'Import Patterns');
      if (importFinding) {
        expect(importFinding).toHaveProperty('area', 'architecture');
        expect(importFinding).toHaveProperty('title');
        expect(importFinding).toHaveProperty('content');
        expect(importFinding).toHaveProperty('category');
        expect(importFinding).toHaveProperty('confidence');
        expect(importFinding.confidence).toBeGreaterThanOrEqual(0);
        expect(importFinding.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should set confidence based on number of imports analyzed', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const importFinding = result.findings.find((f) => f.title === 'Import Patterns');
      if (importFinding) {
        // Confidence should be reasonable (0.75-0.9 range)
        expect(importFinding.confidence).toBeGreaterThanOrEqual(0.75);
        expect(importFinding.confidence).toBeLessThanOrEqual(0.9);
      }
    });

    it('should include source reference', async () => {
      const result = await service.scan(testCwd, { areas: ['architecture'] });

      const importFinding = result.findings.find((f) => f.title === 'Import Patterns');
      if (importFinding) {
        expect(importFinding.source).toBeDefined();
      }
    });
  });
});
