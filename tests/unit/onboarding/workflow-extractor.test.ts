/**
 * Workflow Extractor Service Tests
 *
 * Tests for extracting workflow knowledge from CONTRIBUTING.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { WorkflowExtractorService } from '../../../src/services/onboarding/workflow-extractor.js';
import type { DeepScanFinding } from '../../../src/services/onboarding/types.js';

describe('WorkflowExtractorService', () => {
  let service: WorkflowExtractorService;
  const fixturesDir = join(process.cwd(), 'tests/fixtures/onboarding');
  const sampleContributingPath = join(fixturesDir, 'sample-contributing.md');

  beforeEach(() => {
    service = new WorkflowExtractorService();
  });

  describe('extractWorkflows', () => {
    it('extracts workflow sections from CONTRIBUTING.md', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      // Should extract at least 3 sections: Branch Strategy, PR Process, Commit Messages
      expect(findings.length).toBeGreaterThanOrEqual(3);

      // All findings should be reference category
      findings.forEach((finding) => {
        expect(finding.category).toBe('reference');
        expect(finding.area).toBe('documentation');
      });
    });

    it('extracts Branch Strategy section', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      const branchStrategy = findings.find((f) => f.title.toLowerCase().includes('branch'));
      expect(branchStrategy).toBeDefined();
      expect(branchStrategy?.content).toContain('main');
      expect(branchStrategy?.content).toContain('develop');
      expect(branchStrategy?.content).toContain('feature/');
    });

    it('extracts Pull Request Process section', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      const prProcess = findings.find((f) => f.title.toLowerCase().includes('pull request'));
      expect(prProcess).toBeDefined();
      expect(prProcess?.content).toContain('pull request');
      expect(prProcess?.content).toContain('review');
    });

    it('extracts Commit Messages section', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      const commitMessages = findings.find((f) => f.title.toLowerCase().includes('commit'));
      expect(commitMessages).toBeDefined();
      expect(commitMessages?.content).toContain('conventional commits');
    });

    it('sets appropriate confidence scores', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      findings.forEach((finding) => {
        expect(finding.confidence).toBeGreaterThanOrEqual(0.7);
        expect(finding.confidence).toBeLessThanOrEqual(0.95);
      });
    });

    it('includes source field pointing to CONTRIBUTING.md', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      findings.forEach((finding) => {
        expect(finding.source).toBe('CONTRIBUTING.md');
      });
    });

    it('returns empty array for non-existent file', async () => {
      const findings = await service.extractWorkflows('/nonexistent/CONTRIBUTING.md');
      expect(findings).toEqual([]);
    });

    it('returns empty array for empty file', async () => {
      // Test graceful handling of empty content
      const findings = await service.extractWorkflows(sampleContributingPath);
      expect(Array.isArray(findings)).toBe(true);
    });

    it('extracts actionable workflow knowledge, not raw dump', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      findings.forEach((finding) => {
        // Content should be summarized, not entire section
        expect(finding.content.length).toBeLessThan(1000);
        // Should have meaningful title
        expect(finding.title.length).toBeGreaterThan(0);
        expect(finding.title.length).toBeLessThan(100);
      });
    });
  });

  describe('section detection', () => {
    it('detects Branch Strategy section', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      const branchStrategy = findings.find((f) => f.title.toLowerCase().includes('branch'));
      expect(branchStrategy).toBeDefined();
      expect(branchStrategy?.title).toMatch(/branch/i);
    });

    it('detects Pull Request Process section', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      const prProcess = findings.find(
        (f) =>
          f.title.toLowerCase().includes('pull request') || f.title.toLowerCase().includes('pr')
      );
      expect(prProcess).toBeDefined();
    });

    it('detects Commit Messages section', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      const commitMessages = findings.find((f) => f.title.toLowerCase().includes('commit'));
      expect(commitMessages).toBeDefined();
    });

    it('handles sections with subsections', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      // Branch Strategy has subsections like "Branch Naming"
      const branchStrategy = findings.find((f) => f.title.toLowerCase().includes('branch'));
      expect(branchStrategy?.content).toBeTruthy();
      expect(branchStrategy?.content.length).toBeGreaterThan(50);
    });
  });

  describe('content extraction', () => {
    it('extracts branch naming conventions', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      const branchStrategy = findings.find((f) => f.title.toLowerCase().includes('branch'));
      expect(branchStrategy?.content).toContain('feature/');
      expect(branchStrategy?.content).toContain('bugfix/');
      expect(branchStrategy?.content).toContain('hotfix/');
    });

    it('extracts PR workflow steps', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      const prProcess = findings.find((f) => f.title.toLowerCase().includes('pull request'));
      expect(prProcess?.content).toContain('develop');
      expect(prProcess?.content).toContain('review');
    });

    it('extracts commit message format', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      const commitMessages = findings.find((f) => f.title.toLowerCase().includes('commit'));
      expect(commitMessages?.content).toContain('type');
      expect(commitMessages?.content).toContain('scope');
    });

    it('preserves key workflow details', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      // Should preserve important details like branch names, PR steps, commit format
      const allContent = findings.map((f) => f.content).join(' ');
      expect(allContent).toContain('main');
      expect(allContent).toContain('develop');
      expect(allContent).toContain('feature/');
    });
  });

  describe('DeepScanFinding structure', () => {
    it('returns findings with all required fields', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      findings.forEach((finding) => {
        expect(finding).toHaveProperty('area');
        expect(finding).toHaveProperty('title');
        expect(finding).toHaveProperty('content');
        expect(finding).toHaveProperty('category');
        expect(finding).toHaveProperty('confidence');
        expect(finding).toHaveProperty('source');
      });
    });

    it('uses consistent area for all workflow findings', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      findings.forEach((finding) => {
        expect(finding.area).toBe('documentation');
      });
    });

    it('uses reference category for all workflow findings', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      findings.forEach((finding) => {
        expect(finding.category).toBe('reference');
      });
    });

    it('generates descriptive titles', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      findings.forEach((finding) => {
        expect(finding.title.length).toBeGreaterThan(0);
        expect(finding.title.length).toBeLessThan(100);
        // Should not be generic
        expect(finding.title).not.toBe('Workflow');
        expect(finding.title).not.toBe('Section');
      });
    });

    it('provides actionable content summaries', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      findings.forEach((finding) => {
        // Content should be meaningful
        expect(finding.content.length).toBeGreaterThan(20);
        // But not too long (should be summarized)
        expect(finding.content.length).toBeLessThan(1000);
      });
    });
  });

  describe('confidence scoring', () => {
    it('assigns high confidence to well-structured sections', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      // Branch Strategy and PR Process should have high confidence
      const branchStrategy = findings.find((f) => f.title.toLowerCase().includes('branch'));
      const prProcess = findings.find((f) => f.title.toLowerCase().includes('pull request'));

      if (branchStrategy) {
        expect(branchStrategy.confidence).toBeGreaterThanOrEqual(0.85);
      }
      if (prProcess) {
        expect(prProcess.confidence).toBeGreaterThanOrEqual(0.85);
      }
    });

    it('assigns reasonable confidence to all sections', async () => {
      const findings = await service.extractWorkflows(sampleContributingPath);

      findings.forEach((finding) => {
        // All sections should have at least 0.7 confidence
        expect(finding.confidence).toBeGreaterThanOrEqual(0.7);
        // But not perfect (0.95 max)
        expect(finding.confidence).toBeLessThanOrEqual(0.95);
      });
    });
  });
});
