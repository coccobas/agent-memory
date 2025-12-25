import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initHandlers } from '../../src/mcp/handlers/init.handler.js';
import * as connection from '../../src/db/connection.js';
import * as dbInit from '../../src/db/init.js';
import * as adminUtil from '../../src/utils/admin.js';

vi.mock('../../src/db/connection.js');
vi.mock('../../src/db/init.js');
vi.mock('../../src/utils/admin.js');

describe('Init Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminUtil.requireAdminKey).mockImplementation(() => {});
    vi.mocked(connection.getSqlite).mockReturnValue({} as any);
  });

  describe('init', () => {
    it('should initialize database successfully', () => {
      vi.mocked(dbInit.initializeDatabase).mockReturnValue({
        success: true,
        alreadyInitialized: false,
        migrationsApplied: ['001_init', '002_add_tables'],
        integrityVerified: true,
        integrityErrors: [],
        errors: [],
      });

      const result = initHandlers.init({});

      expect(result.success).toBe(true);
      expect(result.migrationCount).toBe(2);
      expect(result.message).toContain('Successfully applied 2 migration(s)');
    });

    it('should report already initialized', () => {
      vi.mocked(dbInit.initializeDatabase).mockReturnValue({
        success: true,
        alreadyInitialized: true,
        migrationsApplied: [],
        integrityVerified: true,
        integrityErrors: [],
        errors: [],
      });

      const result = initHandlers.init({});

      expect(result.success).toBe(true);
      expect(result.alreadyInitialized).toBe(true);
      expect(result.message).toBe('Database already initialized');
    });

    it('should report initialization failure', () => {
      vi.mocked(dbInit.initializeDatabase).mockReturnValue({
        success: false,
        alreadyInitialized: false,
        migrationsApplied: [],
        integrityVerified: false,
        integrityErrors: ['Table missing'],
        errors: ['Migration failed'],
      });

      const result = initHandlers.init({});

      expect(result.success).toBe(false);
      expect(result.message).toBe('Initialization failed');
      expect(result.errors).toContain('Migration failed');
    });

    it('should pass force option', () => {
      vi.mocked(dbInit.initializeDatabase).mockReturnValue({
        success: true,
        alreadyInitialized: false,
        migrationsApplied: [],
        integrityVerified: true,
        integrityErrors: [],
        errors: [],
      });

      initHandlers.init({ force: true });

      expect(dbInit.initializeDatabase).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ force: true })
      );
    });

    it('should pass verbose option', () => {
      vi.mocked(dbInit.initializeDatabase).mockReturnValue({
        success: true,
        alreadyInitialized: false,
        migrationsApplied: [],
        integrityVerified: true,
        integrityErrors: [],
        errors: [],
      });

      initHandlers.init({ verbose: true });

      expect(dbInit.initializeDatabase).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ verbose: true })
      );
    });

    it('should require admin key', () => {
      vi.mocked(adminUtil.requireAdminKey).mockImplementation(() => {
        throw new Error('Admin key required');
      });

      expect(() => initHandlers.init({})).toThrow('Admin key required');
    });
  });

  describe('verify', () => {
    it('should verify database integrity', () => {
      vi.mocked(dbInit.initializeDatabase).mockReturnValue({
        success: true,
        alreadyInitialized: true,
        migrationsApplied: [],
        integrityVerified: true,
        integrityErrors: [],
        errors: [],
      });

      const result = initHandlers.verify();

      expect(result.success).toBe(true);
      expect(result.integrityVerified).toBe(true);
      expect(result.message).toContain('verifed'); // Note: typo in source
    });

    it('should report integrity failures', () => {
      vi.mocked(dbInit.initializeDatabase).mockReturnValue({
        success: false,
        alreadyInitialized: false,
        migrationsApplied: [],
        integrityVerified: false,
        integrityErrors: ['Foreign key violation'],
        errors: [],
      });

      const result = initHandlers.verify();

      expect(result.integrityVerified).toBe(false);
      expect(result.message).toContain('Foreign key violation');
    });
  });

  describe('status', () => {
    it('should return ready status when initialized with no pending migrations', () => {
      vi.mocked(dbInit.getMigrationStatus).mockReturnValue({
        initialized: true,
        appliedMigrations: ['001_init', '002_tables'],
        pendingMigrations: [],
        totalMigrations: 2,
      });

      const result = initHandlers.status({});

      expect(result.initialized).toBe(true);
      expect(result.appliedCount).toBe(2);
      expect(result.pendingCount).toBe(0);
      expect(result.status).toBe('ready');
    });

    it('should return needs_migration status when there are pending migrations', () => {
      vi.mocked(dbInit.getMigrationStatus).mockReturnValue({
        initialized: true,
        appliedMigrations: ['001_init'],
        pendingMigrations: ['002_tables'],
        totalMigrations: 2,
      });

      const result = initHandlers.status({});

      expect(result.initialized).toBe(true);
      expect(result.pendingCount).toBe(1);
      expect(result.status).toBe('needs_migration');
    });

    it('should return not_initialized status when not initialized', () => {
      vi.mocked(dbInit.getMigrationStatus).mockReturnValue({
        initialized: false,
        appliedMigrations: [],
        pendingMigrations: ['001_init', '002_tables'],
        totalMigrations: 2,
      });

      const result = initHandlers.status({});

      expect(result.initialized).toBe(false);
      expect(result.status).toBe('not_initialized');
    });
  });

  describe('reset', () => {
    it('should require confirmation', () => {
      const result = initHandlers.reset({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('confirm=true');
    });

    it('should reset database when confirmed', () => {
      vi.mocked(dbInit.resetDatabase).mockReturnValue({
        success: true,
        migrationsApplied: ['001_init', '002_tables'],
        errors: [],
      });

      const result = initHandlers.reset({ confirm: true });

      expect(result.success).toBe(true);
      expect(result.migrationCount).toBe(2);
      expect(result.message).toContain('reset complete');
    });

    it('should report reset failure', () => {
      vi.mocked(dbInit.resetDatabase).mockReturnValue({
        success: false,
        migrationsApplied: [],
        errors: ['Failed to drop tables'],
      });

      const result = initHandlers.reset({ confirm: true });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Reset failed');
      expect(result.errors).toContain('Failed to drop tables');
    });

    it('should pass verbose option', () => {
      vi.mocked(dbInit.resetDatabase).mockReturnValue({
        success: true,
        migrationsApplied: [],
        errors: [],
      });

      initHandlers.reset({ confirm: true, verbose: true });

      expect(dbInit.resetDatabase).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ verbose: true })
      );
    });

    it('should require admin key', () => {
      vi.mocked(adminUtil.requireAdminKey).mockImplementation(() => {
        throw new Error('Admin key required');
      });

      expect(() => initHandlers.reset({ confirm: true })).toThrow('Admin key required');
    });
  });
});
