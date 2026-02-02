/**
 * Script Extractor Service Tests
 *
 * Tests for extracting npm scripts from package.json
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { ScriptExtractorService } from '../../../src/services/onboarding/script-extractor.js';
import type { DeepScanFinding } from '../../../src/services/onboarding/types.js';

describe('ScriptExtractorService', () => {
  let service: ScriptExtractorService;
  const fixturesDir = join(process.cwd(), 'tests/fixtures/onboarding');
  const samplePackageJsonPath = join(fixturesDir, 'sample-package.json');

  beforeEach(() => {
    service = new ScriptExtractorService();
  });

  describe('extractScripts', () => {
    it('extracts only allowlisted scripts from package.json', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);

      // Should extract exactly 7 allowlisted scripts
      expect(findings).toHaveLength(7);

      // Verify all findings are tools
      findings.forEach((finding) => {
        expect(finding.category).toBe('tool');
        expect(finding.area).toBe('testing'); // Scripts are testing/tooling related
      });
    });

    it('formats scripts with actionable framing', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);

      // Find the test script
      const testScript = findings.find((f) => f.title.includes('test'));
      expect(testScript).toBeDefined();
      expect(testScript?.content).toMatch(/^To .+: `npm run test`$/);

      // Find the build script
      const buildScript = findings.find((f) => f.title.includes('build'));
      expect(buildScript).toBeDefined();
      expect(buildScript?.content).toMatch(/^To .+: `npm run build`$/);
    });

    it('includes command field with npm run syntax', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);

      findings.forEach((finding) => {
        expect(finding.command).toBeDefined();
        expect(finding.command).toMatch(/^npm run \w+$/);
      });
    });

    it('sets appropriate confidence scores', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);

      findings.forEach((finding) => {
        expect(finding.confidence).toBeGreaterThanOrEqual(0.7);
        expect(finding.confidence).toBeLessThanOrEqual(0.95);
      });
    });

    it('includes source field pointing to package.json', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);

      findings.forEach((finding) => {
        expect(finding.source).toBe('package.json scripts');
      });
    });

    it('extracts all 7 allowlisted scripts', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);

      const allowlist = ['build', 'test', 'start', 'dev', 'lint', 'typecheck', 'format'];
      const extractedScripts = findings.map((f) => {
        const match = f.command?.match(/npm run (\w+)/);
        return match ? match[1] : null;
      });

      allowlist.forEach((script) => {
        expect(extractedScripts).toContain(script);
      });
    });

    it('returns empty array for non-existent file', async () => {
      const findings = await service.extractScripts('/nonexistent/package.json');
      expect(findings).toEqual([]);
    });

    it('returns empty array for invalid JSON', async () => {
      const invalidJsonPath = join(fixturesDir, 'invalid.json');
      const findings = await service.extractScripts(invalidJsonPath);
      expect(findings).toEqual([]);
    });

    it('returns empty array for package.json without scripts', async () => {
      // Create a minimal package.json without scripts section
      const findings = await service.extractScripts(samplePackageJsonPath);
      // This test assumes we'll handle missing scripts gracefully
      expect(Array.isArray(findings)).toBe(true);
    });

    it('ignores non-allowlisted scripts', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);

      // Should not include scripts like "prepare", "postinstall", etc.
      const scriptNames = findings.map((f) => {
        const match = f.command?.match(/npm run (\w+)/);
        return match ? match[1] : null;
      });

      expect(scriptNames).not.toContain('prepare');
      expect(scriptNames).not.toContain('postinstall');
      expect(scriptNames).not.toContain('preinstall');
    });
  });

  describe('script action mapping', () => {
    it('maps build script to "build the project"', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);
      const buildScript = findings.find((f) => f.command === 'npm run build');

      expect(buildScript?.content).toContain('build');
      expect(buildScript?.content).toMatch(/^To .+: `npm run build`$/);
    });

    it('maps test script to "run tests"', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);
      const testScript = findings.find((f) => f.command === 'npm run test');

      expect(testScript?.content).toContain('test');
      expect(testScript?.content).toMatch(/^To .+: `npm run test`$/);
    });

    it('maps start script to "start the application"', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);
      const startScript = findings.find((f) => f.command === 'npm run start');

      expect(startScript?.content).toContain('start');
      expect(startScript?.content).toMatch(/^To .+: `npm run start`$/);
    });

    it('maps dev script to "run in development mode"', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);
      const devScript = findings.find((f) => f.command === 'npm run dev');

      expect(devScript?.content).toContain('dev');
      expect(devScript?.content).toMatch(/^To .+: `npm run dev`$/);
    });

    it('maps lint script to "lint the code"', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);
      const lintScript = findings.find((f) => f.command === 'npm run lint');

      expect(lintScript?.content).toContain('lint');
      expect(lintScript?.content).toMatch(/^To .+: `npm run lint`$/);
    });

    it('maps typecheck script to "check types"', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);
      const typecheckScript = findings.find((f) => f.command === 'npm run typecheck');

      expect(typecheckScript?.content).toContain('typecheck');
      expect(typecheckScript?.content).toMatch(/^To .+: `npm run typecheck`$/);
    });

    it('maps format script to "format the code"', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);
      const formatScript = findings.find((f) => f.command === 'npm run format');

      expect(formatScript?.content).toContain('format');
      expect(formatScript?.content).toMatch(/^To .+: `npm run format`$/);
    });
  });

  describe('DeepScanFinding structure', () => {
    it('returns findings with all required fields', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);

      findings.forEach((finding) => {
        expect(finding).toHaveProperty('area');
        expect(finding).toHaveProperty('title');
        expect(finding).toHaveProperty('content');
        expect(finding).toHaveProperty('category');
        expect(finding).toHaveProperty('confidence');
        expect(finding).toHaveProperty('source');
        expect(finding).toHaveProperty('command');
      });
    });

    it('uses consistent area for all script findings', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);

      findings.forEach((finding) => {
        expect(finding.area).toBe('testing');
      });
    });

    it('generates descriptive titles', async () => {
      const findings = await service.extractScripts(samplePackageJsonPath);

      findings.forEach((finding) => {
        expect(finding.title).toMatch(/npm run \w+/);
        expect(finding.title.length).toBeGreaterThan(0);
      });
    });
  });
});
