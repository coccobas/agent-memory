import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveScopeChain,
  invalidateScopeChainCache,
  clearScopeChainCache,
} from '../../src/services/query/scope-chain.js';

// Mock the config
vi.mock('../../src/config/index.js', () => ({
  config: {
    cache: {
      scopeCacheTTLMs: 600000,
    },
  },
}));

// Mock the container
vi.mock('../../src/core/container.js', () => ({
  isRuntimeRegistered: vi.fn(() => false),
  getRuntime: vi.fn(() => ({
    memoryCoordinator: {
      register: vi.fn(),
    },
  })),
}));

// Valid UUIDs for testing (Task 4 added UUID validation)
// UUID format requires version (1-5 at position 15) and variant (8/9/a/b at position 20)
const TEST_PROJECT_1 = '00000000-0000-4000-8000-000000000001';
const TEST_PROJECT_2 = '00000000-0000-4000-8000-000000000002';
const TEST_ORG_1 = '00000000-0000-4000-8000-000000000010';
const TEST_SESSION_1 = '00000000-0000-4000-8000-000000000020';

// Helper to create mock DB with chainable select/from/where/get
function createMockDb(overrides?: {
  project?: { id: string; orgId?: string | null } | undefined;
  session?: { id: string; projectId?: string | null } | undefined;
}) {
  let lastTable: string | null = null;
  const drizzleNameSymbol = Symbol.for('drizzle:Name');

  const mockDb: any = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    get: vi.fn(),
  };

  mockDb.select.mockReturnValue(mockDb);
  mockDb.from.mockImplementation((table: any) => {
    // Detect table by drizzle:Name Symbol (how Drizzle identifies tables)
    lastTable = table?.[drizzleNameSymbol] || String(table);
    return mockDb;
  });
  mockDb.where.mockReturnValue(mockDb);
  mockDb.get.mockImplementation(() => {
    if (lastTable === 'projects') {
      return overrides?.project;
    }
    if (lastTable === 'sessions') {
      return overrides?.session;
    }
    return undefined;
  });

  return mockDb;
}

describe('Scope Chain Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearScopeChainCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Global Scope', () => {
    it('should return only global when input is undefined', () => {
      const mockDb = createMockDb();
      const result = resolveScopeChain(undefined, mockDb);

      expect(result).toEqual([{ scopeType: 'global', scopeId: null }]);
    });

    it('should return only global when type is global', () => {
      const mockDb = createMockDb();
      const result = resolveScopeChain({ type: 'global' }, mockDb);

      expect(result).toEqual([{ scopeType: 'global', scopeId: null }]);
    });

    it('should return only global when type is global with inherit false', () => {
      const mockDb = createMockDb();
      const result = resolveScopeChain({ type: 'global', inherit: false }, mockDb);

      expect(result).toEqual([{ scopeType: 'global', scopeId: null }]);
    });
  });

  describe('Org Scope', () => {
    it('should return org -> global chain when inherit is true', () => {
      const mockDb = createMockDb();
      const result = resolveScopeChain({ type: 'org', id: TEST_ORG_1 }, mockDb);

      expect(result).toEqual([
        { scopeType: 'org', scopeId: TEST_ORG_1 },
        { scopeType: 'global', scopeId: null },
      ]);
    });

    it('should return only org when inherit is false', () => {
      const mockDb = createMockDb();
      const result = resolveScopeChain({ type: 'org', id: TEST_ORG_1, inherit: false }, mockDb);

      expect(result).toEqual([{ scopeType: 'org', scopeId: TEST_ORG_1 }]);
    });

    it('should handle org with no id', () => {
      const mockDb = createMockDb();
      const result = resolveScopeChain({ type: 'org' }, mockDb);

      expect(result).toEqual([
        { scopeType: 'org', scopeId: null },
        { scopeType: 'global', scopeId: null },
      ]);
    });
  });

  describe('Project Scope', () => {
    it('should return project -> org -> global when project has orgId', () => {
      const mockDb = createMockDb({
        project: { id: TEST_PROJECT_1, orgId: TEST_ORG_1 },
      });
      const result = resolveScopeChain({ type: 'project', id: TEST_PROJECT_1 }, mockDb);

      expect(result).toEqual([
        { scopeType: 'project', scopeId: TEST_PROJECT_1 },
        { scopeType: 'org', scopeId: TEST_ORG_1 },
        { scopeType: 'global', scopeId: null },
      ]);
    });

    it('should return project -> org(null) -> global when project has no orgId', () => {
      const mockDb = createMockDb({
        project: { id: TEST_PROJECT_1, orgId: null },
      });
      const result = resolveScopeChain({ type: 'project', id: TEST_PROJECT_1 }, mockDb);

      expect(result).toEqual([
        { scopeType: 'project', scopeId: TEST_PROJECT_1 },
        { scopeType: 'org', scopeId: null },
        { scopeType: 'global', scopeId: null },
      ]);
    });

    it('should return project -> org(null) -> global when project not found', () => {
      const mockDb = createMockDb({ project: undefined });
      const result = resolveScopeChain({ type: 'project', id: TEST_PROJECT_1 }, mockDb);

      expect(result).toEqual([
        { scopeType: 'project', scopeId: TEST_PROJECT_1 },
        { scopeType: 'org', scopeId: null },
        { scopeType: 'global', scopeId: null },
      ]);
    });

    it('should return only project when inherit is false', () => {
      const mockDb = createMockDb();
      const result = resolveScopeChain(
        { type: 'project', id: TEST_PROJECT_1, inherit: false },
        mockDb
      );

      expect(result).toEqual([{ scopeType: 'project', scopeId: TEST_PROJECT_1 }]);
    });

    it('should handle project with no id', () => {
      const mockDb = createMockDb();
      const result = resolveScopeChain({ type: 'project' }, mockDb);

      expect(result).toEqual([
        { scopeType: 'project', scopeId: null },
        { scopeType: 'org', scopeId: null },
        { scopeType: 'global', scopeId: null },
      ]);
    });
  });

  describe('Session Scope', () => {
    it('should return full chain when session has project with org', () => {
      const mockDb = createMockDb({
        session: { id: TEST_SESSION_1, projectId: TEST_PROJECT_1 },
        project: { id: TEST_PROJECT_1, orgId: TEST_ORG_1 },
      });

      const result = resolveScopeChain({ type: 'session', id: TEST_SESSION_1 }, mockDb);

      expect(result).toEqual([
        { scopeType: 'session', scopeId: TEST_SESSION_1 },
        { scopeType: 'project', scopeId: TEST_PROJECT_1 },
        { scopeType: 'org', scopeId: TEST_ORG_1 },
        { scopeType: 'global', scopeId: null },
      ]);
    });

    it('should include null org when session project has no orgId', () => {
      const mockDb = createMockDb({
        session: { id: TEST_SESSION_1, projectId: TEST_PROJECT_1 },
        project: { id: TEST_PROJECT_1, orgId: null },
      });

      const result = resolveScopeChain({ type: 'session', id: TEST_SESSION_1 }, mockDb);

      expect(result).toEqual([
        { scopeType: 'session', scopeId: TEST_SESSION_1 },
        { scopeType: 'project', scopeId: TEST_PROJECT_1 },
        { scopeType: 'org', scopeId: null },
        { scopeType: 'global', scopeId: null },
      ]);
    });

    it('should include null project and org when session has no projectId', () => {
      const mockDb = createMockDb({
        session: { id: TEST_SESSION_1, projectId: null },
      });

      const result = resolveScopeChain({ type: 'session', id: TEST_SESSION_1 }, mockDb);

      expect(result).toEqual([
        { scopeType: 'session', scopeId: TEST_SESSION_1 },
        { scopeType: 'project', scopeId: null },
        { scopeType: 'org', scopeId: null },
        { scopeType: 'global', scopeId: null },
      ]);
    });

    it('should return only session when inherit is false', () => {
      const mockDb = createMockDb();
      const result = resolveScopeChain(
        { type: 'session', id: TEST_SESSION_1, inherit: false },
        mockDb
      );

      expect(result).toEqual([{ scopeType: 'session', scopeId: TEST_SESSION_1 }]);
    });

    it('should handle session with no id', () => {
      const mockDb = createMockDb();
      const result = resolveScopeChain({ type: 'session' }, mockDb);

      expect(result).toEqual([
        { scopeType: 'session', scopeId: null },
        { scopeType: 'project', scopeId: null },
        { scopeType: 'org', scopeId: null },
        { scopeType: 'global', scopeId: null },
      ]);
    });

    it('should handle session not found in database', () => {
      // When session is not found, DB returns undefined
      const mockDb = createMockDb({
        session: undefined,
      });

      const result = resolveScopeChain({ type: 'session', id: TEST_SESSION_1 }, mockDb);

      expect(result).toEqual([
        { scopeType: 'session', scopeId: TEST_SESSION_1 },
        { scopeType: 'project', scopeId: null },
        { scopeType: 'org', scopeId: null },
        { scopeType: 'global', scopeId: null },
      ]);
    });
  });

  describe('UUID Validation', () => {
    it('should accept valid UUID with hyphens', () => {
      const mockDb = createMockDb();
      expect(() =>
        resolveScopeChain({ type: 'project', id: TEST_PROJECT_1 }, mockDb)
      ).not.toThrow();
    });

    it('should accept valid UUID without hyphens', () => {
      const mockDb = createMockDb();
      expect(() =>
        resolveScopeChain({ type: 'project', id: '00000000000040008000000000000001' }, mockDb)
      ).not.toThrow();
    });

    it('should throw for invalid UUID format', () => {
      const mockDb = createMockDb();
      expect(() => resolveScopeChain({ type: 'project', id: 'not-a-valid-uuid' }, mockDb)).toThrow(
        /Invalid project ID format/
      );
    });

    it('should throw for too short UUID', () => {
      const mockDb = createMockDb();
      expect(() => resolveScopeChain({ type: 'project', id: '550e8400' }, mockDb)).toThrow(
        /Invalid project ID format/
      );
    });

    it('should throw for UUID with invalid characters', () => {
      const mockDb = createMockDb();
      expect(() =>
        resolveScopeChain({ type: 'project', id: 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz' }, mockDb)
      ).toThrow(/Invalid project ID format/);
    });

    it('should not validate UUID for global scope', () => {
      const mockDb = createMockDb();
      expect(() => resolveScopeChain({ type: 'global', id: 'anything' }, mockDb)).not.toThrow();
    });

    it('should allow undefined id without validation', () => {
      const mockDb = createMockDb();
      expect(() => resolveScopeChain({ type: 'project' }, mockDb)).not.toThrow();
    });

    it('should validate org scope UUID', () => {
      const mockDb = createMockDb();
      expect(() => resolveScopeChain({ type: 'org', id: 'invalid-uuid' }, mockDb)).toThrow(
        /Invalid org ID format/
      );
    });

    it('should validate session scope UUID', () => {
      const mockDb = createMockDb();
      expect(() => resolveScopeChain({ type: 'session', id: 'invalid-uuid' }, mockDb)).toThrow(
        /Invalid session ID format/
      );
    });
  });

  describe('Cache Behavior', () => {
    it('should cache resolved scope chain', () => {
      const mockDb = createMockDb({
        project: { id: TEST_PROJECT_1, orgId: TEST_ORG_1 },
      });

      const result1 = resolveScopeChain({ type: 'project', id: TEST_PROJECT_1 }, mockDb);
      expect(mockDb.get).toHaveBeenCalledTimes(1);

      mockDb.get.mockClear();

      // Second call should use cache
      const result2 = resolveScopeChain({ type: 'project', id: TEST_PROJECT_1 }, mockDb);
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(result2).toEqual(result1);
    });

    it('should invalidate cache', () => {
      const mockDb = createMockDb({
        project: { id: TEST_PROJECT_1, orgId: TEST_ORG_1 },
      });

      resolveScopeChain({ type: 'project', id: TEST_PROJECT_1 }, mockDb);
      mockDb.get.mockClear();

      invalidateScopeChainCache('project', TEST_PROJECT_1);

      resolveScopeChain({ type: 'project', id: TEST_PROJECT_1 }, mockDb);
      expect(mockDb.get).toHaveBeenCalled();
    });

    it('should handle different inputs separately', () => {
      const mockDb = createMockDb({
        project: { id: TEST_PROJECT_1, orgId: TEST_ORG_1 },
      });

      // Cache project 1
      resolveScopeChain({ type: 'project', id: TEST_PROJECT_1 }, mockDb);
      mockDb.get.mockClear();

      // Cache project 2 (different key)
      resolveScopeChain({ type: 'project', id: TEST_PROJECT_2 }, mockDb);
      expect(mockDb.get).toHaveBeenCalled();
    });

    it('should use different cache keys for different inherit values', () => {
      const mockDb = createMockDb();

      const result1 = resolveScopeChain(
        { type: 'project', id: TEST_PROJECT_1, inherit: true },
        mockDb
      );

      clearScopeChainCache();

      const result2 = resolveScopeChain(
        { type: 'project', id: TEST_PROJECT_1, inherit: false },
        mockDb
      );

      expect(result1.length).toBeGreaterThan(result2.length);
    });

    it('clearScopeChainCache should clear the cache', () => {
      const mockDb = createMockDb({
        project: { id: TEST_PROJECT_1, orgId: TEST_ORG_1 },
      });

      resolveScopeChain({ type: 'project', id: TEST_PROJECT_1 }, mockDb);
      mockDb.get.mockClear();

      clearScopeChainCache();

      resolveScopeChain({ type: 'project', id: TEST_PROJECT_1 }, mockDb);
      expect(mockDb.get).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should not add duplicate scopes', () => {
      const mockDb = createMockDb();
      const result = resolveScopeChain({ type: 'global' }, mockDb);

      const globalCount = result.filter((s) => s.scopeType === 'global').length;
      expect(globalCount).toBe(1);
    });

    it('should handle default inherit value (true)', () => {
      const mockDb = createMockDb();

      const result1 = resolveScopeChain({ type: 'org', id: TEST_ORG_1 }, mockDb);
      clearScopeChainCache();

      const result2 = resolveScopeChain({ type: 'org', id: TEST_ORG_1, inherit: true }, mockDb);

      expect(result1).toEqual(result2);
    });

    it('should always have at least global scope in result', () => {
      const mockDb = createMockDb();
      const result = resolveScopeChain({ type: 'global' }, mockDb);

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((s) => s.scopeType === 'global')).toBe(true);
    });
  });
});
