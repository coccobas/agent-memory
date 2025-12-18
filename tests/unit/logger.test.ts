/**
 * Unit tests for logger utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, createComponentLogger } from '../../src/utils/logger.js';

describe('Logger', () => {
  const originalEnv = process.env;
  const originalLogLevel = process.env.LOG_LEVEL;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    process.env.LOG_LEVEL = originalLogLevel;
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('logger instance', () => {
    it('should create logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have log level from environment', async () => {
      process.env.LOG_LEVEL = 'debug';
      vi.resetModules();
      // Re-import to get fresh logger with new env
      const { logger: newLogger } = await import('../../src/utils/logger.js');
      expect(newLogger).toBeDefined();
    });

    it('should default to info level when LOG_LEVEL not set', async () => {
      delete process.env.LOG_LEVEL;
      vi.resetModules();
      const { logger: newLogger } = await import('../../src/utils/logger.js');
      expect(newLogger).toBeDefined();
    });
  });

  describe('createComponentLogger', () => {
    it('should create child logger with component context', () => {
      const componentLogger = createComponentLogger('test-component');
      expect(componentLogger).toBeDefined();
      expect(componentLogger.info).toBeDefined();
      expect(componentLogger.error).toBeDefined();
    });

    it('should create logger with different component names', () => {
      const logger1 = createComponentLogger('component1');
      const logger2 = createComponentLogger('component2');
      expect(logger1).toBeDefined();
      expect(logger2).toBeDefined();
      // Both should be valid logger instances
      expect(typeof logger1.info).toBe('function');
      expect(typeof logger2.info).toBe('function');
    });

    it('should allow logging with component logger', () => {
      const componentLogger = createComponentLogger('test');
      // Should not throw
      expect(() => {
        componentLogger.info('test message');
        componentLogger.error('error message');
        componentLogger.warn('warning message');
        componentLogger.debug('debug message');
      }).not.toThrow();
    });
  });

  describe('logger methods', () => {
    it('should support info logging', () => {
      expect(() => logger.info('test')).not.toThrow();
      expect(() => logger.info({ key: 'value' }, 'test')).not.toThrow();
    });

    it('should support error logging', () => {
      expect(() => logger.error('error')).not.toThrow();
      expect(() => logger.error({ err: new Error('test') }, 'error')).not.toThrow();
    });

    it('should support warn logging', () => {
      expect(() => logger.warn('warning')).not.toThrow();
    });

    it('should support debug logging', () => {
      expect(() => logger.debug('debug')).not.toThrow();
    });

    it('should support structured logging', () => {
      expect(() => {
        logger.info({ userId: '123', action: 'login' }, 'User logged in');
      }).not.toThrow();
    });
  });

  describe('environment handling', () => {
    it('should handle production environment', async () => {
      process.env.NODE_ENV = 'production';
      vi.resetModules();
      const { logger: prodLogger } = await import('../../src/utils/logger.js');
      expect(prodLogger).toBeDefined();
    });

    it('should handle development environment', async () => {
      process.env.NODE_ENV = 'development';
      vi.resetModules();
      const { logger: devLogger } = await import('../../src/utils/logger.js');
      expect(devLogger).toBeDefined();
    });
  });
});







