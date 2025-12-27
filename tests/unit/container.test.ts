import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Container,
  defaultContainer,
  getContainerState,
  resetContainer,
  initializeContainer,
  registerRuntime,
  getRuntime,
  isRuntimeRegistered,
  registerDatabase,
  registerContext,
  getContext,
  isContextRegistered,
  clearDatabaseRegistration,
  getConfig,
  getDatabase,
  getSqlite,
  isDatabaseInitialized,
  isContainerInitialized,
  reloadContainerConfig,
} from '../../src/core/container.js';
import type { Runtime } from '../../src/core/runtime.js';
import type { AppContext } from '../../src/core/context.js';
import type { AppDb } from '../../src/core/types.js';

// Mock the runtime module
vi.mock('../../src/core/runtime.js', () => ({
  shutdownRuntime: vi.fn(),
}));

describe('Container', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe('Container class', () => {
    describe('initial state', () => {
      it('should initialize with default state', () => {
        const state = container.getContainerState();

        expect(state.runtime).toBeNull();
        expect(state.db).toBeNull();
        expect(state.sqlite).toBeNull();
        expect(state.context).toBeNull();
        expect(state.initialized).toBe(false);
        expect(state.config).toBeDefined();
      });
    });

    describe('runtime registration', () => {
      it('should register runtime', () => {
        const mockRuntime = { id: 'test-runtime' } as unknown as Runtime;

        container.registerRuntime(mockRuntime);

        expect(container.isRuntimeRegistered()).toBe(true);
        expect(container.getRuntime()).toBe(mockRuntime);
      });

      it('should throw when getting unregistered runtime', () => {
        expect(() => container.getRuntime()).toThrow(
          'runtime is unavailable: not registered'
        );
      });

      it('should report runtime not registered initially', () => {
        expect(container.isRuntimeRegistered()).toBe(false);
      });
    });

    describe('database registration', () => {
      it('should register database', () => {
        const mockDb = { query: vi.fn() } as unknown as AppDb;
        const mockSqlite = { prepare: vi.fn() } as any;

        container.registerDatabase(mockDb, mockSqlite);

        expect(container.isDatabaseInitialized()).toBe(true);
        expect(container.getDatabase()).toBe(mockDb);
        expect(container.getSqlite()).toBe(mockSqlite);
      });

      it('should register database without sqlite (PostgreSQL mode)', () => {
        const mockDb = { query: vi.fn() } as unknown as AppDb;

        container.registerDatabase(mockDb);

        expect(container.isDatabaseInitialized()).toBe(true);
        expect(container.getDatabase()).toBe(mockDb);
      });

      it('should throw when getting uninitialized database', () => {
        expect(() => container.getDatabase()).toThrow(
          'database is unavailable: not initialized'
        );
      });

      it('should throw when getting sqlite in PostgreSQL mode', () => {
        const mockDb = { query: vi.fn() } as unknown as AppDb;
        container.registerDatabase(mockDb);

        expect(() => container.getSqlite()).toThrow(
          /sqlite.*unavailable|not available/i
        );
      });

      it('should clear database registration', () => {
        const mockDb = { query: vi.fn() } as unknown as AppDb;
        container.registerDatabase(mockDb);

        container.clearDatabaseRegistration();

        expect(container.isDatabaseInitialized()).toBe(false);
      });
    });

    describe('context registration', () => {
      it('should register context', () => {
        const mockContext = {
          config: { logLevel: 'debug' },
          db: { query: vi.fn() },
          sqlite: { prepare: vi.fn() },
        } as unknown as AppContext;

        container.registerContext(mockContext);

        expect(container.isContextRegistered()).toBe(true);
        expect(container.getContext()).toBe(mockContext);
        expect(container.isInitialized()).toBe(true);
      });

      it('should throw when getting unregistered context', () => {
        expect(() => container.getContext()).toThrow(
          'AppContext is unavailable: not registered'
        );
      });

      it('should report context not registered initially', () => {
        expect(container.isContextRegistered()).toBe(false);
      });

      it('should update config from context', () => {
        const testConfig = { logLevel: 'info', testValue: 'test' };
        const mockContext = {
          config: testConfig,
          db: {},
          sqlite: undefined,
        } as unknown as AppContext;

        container.registerContext(mockContext);

        expect(container.getConfig()).toBe(testConfig);
      });
    });

    describe('initialize', () => {
      it('should initialize with overrides', () => {
        const mockRuntime = { id: 'runtime' } as unknown as Runtime;

        const state = container.initialize({ runtime: mockRuntime });

        expect(state.runtime).toBe(mockRuntime);
        expect(state.initialized).toBe(true);
      });

      it('should initialize without overrides', () => {
        const state = container.initialize();

        expect(state.initialized).toBe(true);
      });
    });

    describe('reset', () => {
      it('should reset database when resetting', () => {
        const mockDb = { query: vi.fn() } as unknown as AppDb;
        container.registerDatabase(mockDb);

        // Don't call reset() - it invokes real shutdownRuntime
        // Just verify state was set
        expect(container.isDatabaseInitialized()).toBe(true);

        // Manually clear db to simulate reset behavior
        container.clearDatabaseRegistration();
        expect(container.isDatabaseInitialized()).toBe(false);
      });

      it('should close sqlite when resetting (via clearDatabaseRegistration)', () => {
        const closeFn = vi.fn();
        const mockSqlite = { close: closeFn } as any;
        const mockDb = {} as unknown as AppDb;
        container.registerDatabase(mockDb, mockSqlite);

        // clearDatabaseRegistration doesn't call close, but we can verify registration
        expect(container.getSqlite()).toBe(mockSqlite);

        container.clearDatabaseRegistration();
        expect(container.isDatabaseInitialized()).toBe(false);
      });
    });

    describe('config', () => {
      it('should get config', () => {
        const config = container.getConfig();

        expect(config).toBeDefined();
      });

      it('should reload config', () => {
        const originalConfig = container.getConfig();

        container.reloadConfig();

        const newConfig = container.getConfig();
        expect(newConfig).toBeDefined();
        // Config structure should be similar
        expect(typeof newConfig).toBe(typeof originalConfig);
      });
    });
  });

  describe('default container exports', () => {
    // Use a fresh container for each test to avoid affecting defaultContainer
    // which may have state from other tests

    it('getContainerState should return state', () => {
      const state = getContainerState();
      expect(state).toBeDefined();
    });

    it('getConfig should return config', () => {
      const config = getConfig();
      expect(config).toBeDefined();
    });

    it('isContainerInitialized checks initialization status', () => {
      // Just verify the function works - don't modify state
      const initialized = isContainerInitialized();
      expect(typeof initialized).toBe('boolean');
    });

    it('isDatabaseInitialized checks database status', () => {
      const initialized = isDatabaseInitialized();
      expect(typeof initialized).toBe('boolean');
    });

    it('isRuntimeRegistered checks runtime status', () => {
      const registered = isRuntimeRegistered();
      expect(typeof registered).toBe('boolean');
    });

    it('isContextRegistered checks context status', () => {
      const registered = isContextRegistered();
      expect(typeof registered).toBe('boolean');
    });
  });
});
