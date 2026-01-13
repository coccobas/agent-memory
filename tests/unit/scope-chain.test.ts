import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveScopeChain, invalidateScopeChainCache } from '../../src/services/query.service.js';
import * as connection from '../../src/db/connection.js';

vi.mock('../../src/db/connection.js');

// Valid UUIDs for testing (Task 4 added UUID validation)
// UUID format requires version (1-5 at position 15) and variant (8/9/a/b at position 20)
const TEST_PROJECT_1 = '00000000-0000-4000-8000-000000000001';
const TEST_PROJECT_2 = '00000000-0000-4000-8000-000000000002';
const TEST_ORG_1 = '00000000-0000-4000-8000-000000000010';

describe('Scope Chain Caching', () => {
  // defined mutable mock object
  const mockDb: any = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    get: vi.fn(),
  };

  // Chainable return
  mockDb.select.mockReturnValue(mockDb);
  mockDb.from.mockReturnValue(mockDb);
  mockDb.where.mockReturnValue(mockDb);

  beforeEach(() => {
    vi.resetAllMocks();
    // Setup default chain behavior again in case reset clears return values (it keeps implementations usually but let's be safe or just set ref)
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);

    vi.mocked(connection.getDb).mockReturnValue(mockDb);
    invalidateScopeChainCache(); // Clear cache
  });

  it('should cache resolved scope chain', () => {
    // Setup mock for project lookup
    mockDb.get.mockReturnValue({ orgId: TEST_ORG_1 });

    const input = { type: 'project' as const, id: TEST_PROJECT_1, inherit: true };

    // First call - should hit DB
    const result1 = resolveScopeChain(input, mockDb);
    expect(mockDb.get).toHaveBeenCalledTimes(1);
    expect(result1).toEqual([
      { scopeType: 'project', scopeId: TEST_PROJECT_1 },
      { scopeType: 'org', scopeId: TEST_ORG_1 },
      { scopeType: 'global', scopeId: null },
    ]);

    mockDb.get.mockClear();

    // Second call - should use cache
    const result2 = resolveScopeChain(input, mockDb);
    expect(mockDb.get).not.toHaveBeenCalled();
    expect(result2).toEqual(result1);
  });

  it('should invalidate cache', () => {
    mockDb.get.mockReturnValue({ orgId: TEST_ORG_1 });

    const input = { type: 'project' as const, id: TEST_PROJECT_1, inherit: true };

    resolveScopeChain(input, mockDb);
    mockDb.get.mockClear();

    invalidateScopeChainCache('project', TEST_PROJECT_1);

    resolveScopeChain(input, mockDb);
    expect(mockDb.get).toHaveBeenCalled();
  });

  it('should handle different inputs separately', () => {
    mockDb.get.mockReturnValue({ orgId: TEST_ORG_1 });

    // Cache project 1
    resolveScopeChain({ type: 'project', id: TEST_PROJECT_1 }, mockDb);
    mockDb.get.mockClear();

    // Cache project 2 (different key)
    resolveScopeChain({ type: 'project', id: TEST_PROJECT_2 }, mockDb);
    expect(mockDb.get).toHaveBeenCalled();
  });
});
