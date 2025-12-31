import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  createTestProject,
  type TestDb,
} from '../fixtures/test-helpers.js';
import type { IEvidenceRepository } from '../../src/db/repositories/evidence.js';

const TEST_DB_PATH = './data/test-memory-evidence.db';
let testDb: TestDb;
let evidenceRepo: IEvidenceRepository;

describe('evidenceRepo', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    const repos = createTestRepositories(testDb);
    evidenceRepo = repos.evidence!;
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('create', () => {
    it('should create evidence with minimal fields', async () => {
      const evidence = await evidenceRepo.create({
        scopeType: 'global',
        title: 'Test Screenshot',
        evidenceType: 'screenshot',
      });

      expect(evidence).toBeDefined();
      expect(evidence.id).toMatch(/^ev_/);
      expect(evidence.title).toBe('Test Screenshot');
      expect(evidence.evidenceType).toBe('screenshot');
      expect(evidence.isActive).toBe(true);
      expect(evidence.capturedAt).toBeDefined();
    });

    it('should create evidence with inline content', async () => {
      const evidence = await evidenceRepo.create({
        scopeType: 'global',
        title: 'Error Log',
        description: 'Stack trace from production error',
        evidenceType: 'log',
        content: 'Error: Connection timeout at line 42',
        source: 'production-server',
        capturedBy: 'monitoring-agent',
        tags: ['error', 'production'],
        metadata: { severity: 'high' },
        createdBy: 'test-agent',
      });

      expect(evidence.content).toBe('Error: Connection timeout at line 42');
      expect(evidence.source).toBe('production-server');
      expect(evidence.capturedBy).toBe('monitoring-agent');
      expect(evidence.createdBy).toBe('test-agent');
    });

    it('should create evidence with file path', async () => {
      const evidence = await evidenceRepo.create({
        scopeType: 'global',
        title: 'Screenshot of Bug',
        evidenceType: 'screenshot',
        filePath: '/var/evidence/screenshots/bug-123.png',
        fileName: 'bug-123.png',
        mimeType: 'image/png',
        fileSize: 245678,
        checksum: 'sha256:abc123def456',
      });

      expect(evidence.filePath).toBe('/var/evidence/screenshots/bug-123.png');
      expect(evidence.fileName).toBe('bug-123.png');
      expect(evidence.mimeType).toBe('image/png');
      expect(evidence.fileSize).toBe(245678);
      expect(evidence.checksum).toBe('sha256:abc123def456');
    });

    it('should create evidence with URL', async () => {
      const evidence = await evidenceRepo.create({
        scopeType: 'global',
        title: 'External Documentation',
        evidenceType: 'link',
        url: 'https://docs.example.com/api/v2/auth',
        source: 'documentation',
      });

      expect(evidence.url).toBe('https://docs.example.com/api/v2/auth');
      expect(evidence.evidenceType).toBe('link');
    });

    it('should create code snippet evidence', async () => {
      const project = createTestProject(testDb.db, 'Code Project');

      const evidence = await evidenceRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        title: 'Bug Location',
        evidenceType: 'snippet',
        content: 'if (user.isActive === true) {\n  return auth;\n}',
        language: 'typescript',
        sourceFile: 'src/auth/validator.ts',
        startLine: 42,
        endLine: 44,
      });

      expect(evidence.evidenceType).toBe('snippet');
      expect(evidence.language).toBe('typescript');
      expect(evidence.sourceFile).toBe('src/auth/validator.ts');
      expect(evidence.startLine).toBe(42);
      expect(evidence.endLine).toBe(44);
    });

    it('should create benchmark evidence', async () => {
      const evidence = await evidenceRepo.create({
        scopeType: 'global',
        title: 'API Response Time',
        evidenceType: 'benchmark',
        metric: 'response_time_p99',
        value: 245.5,
        unit: 'ms',
        baseline: 200.0,
        source: 'load-test-run-42',
      });

      expect(evidence.evidenceType).toBe('benchmark');
      expect(evidence.metric).toBe('response_time_p99');
      expect(evidence.value).toBe(245.5);
      expect(evidence.unit).toBe('ms');
      expect(evidence.baseline).toBe(200.0);
    });

    it('should create quote evidence', async () => {
      const evidence = await evidenceRepo.create({
        scopeType: 'global',
        title: 'Customer Feedback',
        evidenceType: 'quote',
        content: 'The new login flow is confusing - John Doe, Support Ticket #1234',
        source: 'customer-feedback',
      });

      expect(evidence.evidenceType).toBe('quote');
      expect(evidence.source).toBe('customer-feedback');
    });
  });

  describe('getById', () => {
    it('should retrieve evidence by ID', async () => {
      const created = await evidenceRepo.create({
        scopeType: 'global',
        title: 'Test evidence for getById',
        evidenceType: 'log',
      });

      const found = await evidenceRepo.getById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe('Test evidence for getById');
    });

    it('should return undefined for non-existent ID', async () => {
      const found = await evidenceRepo.getById('ev_nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list evidence by type', async () => {
      await evidenceRepo.create({
        scopeType: 'global',
        title: 'Screenshot 1',
        evidenceType: 'screenshot',
      });

      await evidenceRepo.create({
        scopeType: 'global',
        title: 'Screenshot 2',
        evidenceType: 'screenshot',
      });

      const screenshots = await evidenceRepo.listByType('screenshot');
      expect(screenshots.length).toBeGreaterThanOrEqual(2);
      expect(screenshots.every((e) => e.evidenceType === 'screenshot')).toBe(true);
    });

    it('should list evidence by source', async () => {
      await evidenceRepo.create({
        scopeType: 'global',
        title: 'Log from source A',
        evidenceType: 'log',
        source: 'source-alpha',
      });

      const fromSourceA = await evidenceRepo.listBySource('source-alpha');
      expect(fromSourceA.length).toBeGreaterThan(0);
      expect(fromSourceA.every((e) => e.source === 'source-alpha')).toBe(true);
    });

    it('should filter by scope', async () => {
      const project = createTestProject(testDb.db, 'Evidence Project');

      await evidenceRepo.create({
        scopeType: 'project',
        scopeId: project.id,
        title: 'Project-specific evidence',
        evidenceType: 'output',
      });

      const projectEvidence = await evidenceRepo.list({
        scopeType: 'project',
        scopeId: project.id,
      });

      expect(projectEvidence.length).toBeGreaterThan(0);
      expect(projectEvidence.every((e) => e.scopeId === project.id)).toBe(true);
    });
  });

  describe('getByUrl and getByFilePath', () => {
    it('should find evidence by URL', async () => {
      const uniqueUrl = `https://example.com/unique-${Date.now()}`;

      await evidenceRepo.create({
        scopeType: 'global',
        title: 'URL-based evidence',
        evidenceType: 'link',
        url: uniqueUrl,
      });

      const found = await evidenceRepo.getByUrl(uniqueUrl);
      expect(found).toBeDefined();
      expect(found!.url).toBe(uniqueUrl);
    });

    it('should find evidence by file path', async () => {
      const uniquePath = `/var/evidence/unique-${Date.now()}.png`;

      await evidenceRepo.create({
        scopeType: 'global',
        title: 'File-based evidence',
        evidenceType: 'screenshot',
        filePath: uniquePath,
      });

      const found = await evidenceRepo.getByFilePath(uniquePath);
      expect(found).toBeDefined();
      expect(found!.filePath).toBe(uniquePath);
    });

    it('should not find deactivated evidence by URL', async () => {
      const url = `https://example.com/deactivated-${Date.now()}`;

      const created = await evidenceRepo.create({
        scopeType: 'global',
        title: 'To be deactivated',
        evidenceType: 'link',
        url,
      });

      await evidenceRepo.deactivate(created.id);

      const found = await evidenceRepo.getByUrl(url);
      expect(found).toBeUndefined();
    });
  });

  describe('deactivate (immutability)', () => {
    it('should deactivate evidence (soft-delete)', async () => {
      const evidence = await evidenceRepo.create({
        scopeType: 'global',
        title: 'To be deactivated',
        evidenceType: 'log',
      });

      const result = await evidenceRepo.deactivate(evidence.id);
      expect(result).toBe(true);

      const deactivated = await evidenceRepo.getById(evidence.id);
      expect(deactivated!.isActive).toBe(false);
    });

    it('should not list deactivated evidence by default', async () => {
      const evidence = await evidenceRepo.create({
        scopeType: 'global',
        title: 'Hidden evidence',
        evidenceType: 'log',
        source: 'hidden-source',
      });

      await evidenceRepo.deactivate(evidence.id);

      // List without includeInactive should not include it
      const active = await evidenceRepo.list({ includeInactive: false });
      expect(active.find((e) => e.id === evidence.id)).toBeUndefined();

      // List with includeInactive should include it
      const all = await evidenceRepo.list({ includeInactive: true });
      expect(all.find((e) => e.id === evidence.id)).toBeDefined();
    });
  });

  describe('immutability constraints', () => {
    it('should have no update method (evidence is immutable)', () => {
      // Verify that the repository interface does not have an update method
      expect((evidenceRepo as unknown as Record<string, unknown>).update).toBeUndefined();
    });

    it('should have no delete method (evidence cannot be permanently removed)', () => {
      // Verify that the repository interface does not have a delete method
      expect((evidenceRepo as unknown as Record<string, unknown>).delete).toBeUndefined();
    });
  });

  describe('all evidence types', () => {
    const evidenceTypes = [
      'screenshot',
      'log',
      'snippet',
      'output',
      'benchmark',
      'link',
      'document',
      'quote',
      'other',
    ] as const;

    for (const evidenceType of evidenceTypes) {
      it(`should create evidence of type: ${evidenceType}`, async () => {
        const evidence = await evidenceRepo.create({
          scopeType: 'global',
          title: `Test ${evidenceType}`,
          evidenceType,
        });

        expect(evidence.evidenceType).toBe(evidenceType);
      });
    }
  });
});
