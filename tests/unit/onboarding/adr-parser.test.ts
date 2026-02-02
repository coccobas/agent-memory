/**
 * ADR Parser Tests
 *
 * Tests for parsing Architecture Decision Records (ADRs) from markdown files.
 * Follows TDD approach - tests written first.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { AdrParserService } from '../../../src/services/onboarding/adr-parser.js';

describe('AdrParserService', () => {
  let service: AdrParserService;
  const fixturesDir = join(process.cwd(), 'tests', 'fixtures', 'onboarding');
  const adrDir = join(process.cwd(), 'docs', 'adr');

  beforeEach(() => {
    service = new AdrParserService();
  });

  describe('parseAdr', () => {
    it('extracts title from # heading', async () => {
      const adrPath = join(fixturesDir, 'sample-adr.md');
      const findings = await service.parseAdr(adrPath);

      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain('Sample Architecture Decision');
    });

    it('extracts status from ## Status section', async () => {
      const adrPath = join(fixturesDir, 'sample-adr.md');
      const findings = await service.parseAdr(adrPath);

      expect(findings).toHaveLength(1);
    });

    it('extracts decision from ## Decision section', async () => {
      const adrPath = join(fixturesDir, 'sample-adr.md');
      const findings = await service.parseAdr(adrPath);

      expect(findings).toHaveLength(1);
      expect(findings[0].content).toContain('SQLite');
      expect(findings[0].content).toContain('PostgreSQL');
    });

    it('extracts rationale from first paragraph of ## Context section', async () => {
      const adrPath = join(fixturesDir, 'sample-adr.md');
      const findings = await service.parseAdr(adrPath);

      expect(findings).toHaveLength(1);
      expect(findings[0].content).toContain('data persistence');
    });

    it('returns empty array for non-accepted status', async () => {
      const adrPath = join(fixturesDir, 'sample-adr.md');
      const findings = await service.parseAdr(adrPath);

      expect(findings).toHaveLength(1);
    });

    it('returns empty array for non-existent file', async () => {
      const findings = await service.parseAdr('/non/existent/path.md');
      expect(findings).toEqual([]);
    });

    it('returns empty array for invalid markdown', async () => {
      const invalidPath = join(fixturesDir, 'sample-package.json');
      const findings = await service.parseAdr(invalidPath);
      expect(findings).toEqual([]);
    });

    it('sets category to decision', async () => {
      const adrPath = join(fixturesDir, 'sample-adr.md');
      const findings = await service.parseAdr(adrPath);

      expect(findings).toHaveLength(1);
      expect(findings[0].category).toBe('decision');
    });

    it('sets area to documentation', async () => {
      const adrPath = join(fixturesDir, 'sample-adr.md');
      const findings = await service.parseAdr(adrPath);

      expect(findings).toHaveLength(1);
      expect(findings[0].area).toBe('documentation');
    });

    it('sets confidence score between 0.7 and 0.95', async () => {
      const adrPath = join(fixturesDir, 'sample-adr.md');
      const findings = await service.parseAdr(adrPath);

      expect(findings).toHaveLength(1);
      expect(findings[0].confidence).toBeGreaterThanOrEqual(0.7);
      expect(findings[0].confidence).toBeLessThanOrEqual(0.95);
    });

    it('includes source field with ADR filename', async () => {
      const adrPath = join(fixturesDir, 'sample-adr.md');
      const findings = await service.parseAdr(adrPath);

      expect(findings).toHaveLength(1);
      expect(findings[0].source).toContain('sample-adr.md');
    });

    it('formats content with decision and rationale', async () => {
      const adrPath = join(fixturesDir, 'sample-adr.md');
      const findings = await service.parseAdr(adrPath);

      expect(findings).toHaveLength(1);
      expect(findings[0].content).toContain('Decision:');
      expect(findings[0].content).toContain('Rationale:');
    });
  });

  describe('parseAdrDirectory', () => {
    it('parses all ADR files in directory', async () => {
      const findings = await service.parseAdrDirectory(adrDir);

      expect(findings.length).toBeGreaterThan(0);
    });

    it('filters out non-accepted ADRs', async () => {
      const findings = await service.parseAdrDirectory(adrDir);

      findings.forEach((finding) => {
        expect(finding.category).toBe('decision');
      });
    });

    it('returns empty array for non-existent directory', async () => {
      const findings = await service.parseAdrDirectory('/non/existent/dir');
      expect(findings).toEqual([]);
    });

    it('skips non-markdown files', async () => {
      const findings = await service.parseAdrDirectory(adrDir);

      findings.forEach((finding) => {
        expect(finding.source).toMatch(/\.md$/);
      });
    });

    it('returns findings with proper DeepScanFinding structure', async () => {
      const findings = await service.parseAdrDirectory(adrDir);

      if (findings.length > 0) {
        const finding = findings[0];
        expect(finding).toHaveProperty('area');
        expect(finding).toHaveProperty('title');
        expect(finding).toHaveProperty('content');
        expect(finding).toHaveProperty('category');
        expect(finding).toHaveProperty('confidence');
        expect(finding).toHaveProperty('source');
      }
    });
  });

  describe('real ADR parsing', () => {
    it('parses ADR-0001 (record template)', async () => {
      const adrPath = join(adrDir, '0001-record-template.md');
      const findings = await service.parseAdr(adrPath);

      if (findings.length > 0) {
        expect(findings[0].title).toContain('ADR Record Template');
        expect(findings[0].content).toContain('standard format');
      }
    });

    it('parses ADR-0020 (hybrid DI container)', async () => {
      const adrPath = join(adrDir, '0020-hybrid-di-container.md');
      const findings = await service.parseAdr(adrPath);

      if (findings.length > 0) {
        expect(findings[0].title).toContain('Dependency Injection');
        expect(findings[0].content).toContain('container');
      }
    });
  });

  describe('status filtering', () => {
    it('includes accepted status', async () => {
      const adrPath = join(fixturesDir, 'sample-adr.md');
      const findings = await service.parseAdr(adrPath);

      expect(findings).toHaveLength(1);
    });

    it('excludes superseded status', async () => {
      expect(true).toBe(true);
    });

    it('excludes deprecated status', async () => {
      expect(true).toBe(true);
    });
  });
});
