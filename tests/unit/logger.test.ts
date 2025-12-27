import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createComponentLogger, logger } from '../../src/utils/logger.js';

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createComponentLogger', () => {
    it('should create a child logger', () => {
      const childLogger = createComponentLogger('test-component');
      expect(childLogger).toBeDefined();
    });

    it('should return logger with logging methods', () => {
      const childLogger = createComponentLogger('test-component');
      expect(typeof childLogger.info).toBe('function');
      expect(typeof childLogger.warn).toBe('function');
      expect(typeof childLogger.error).toBe('function');
      expect(typeof childLogger.debug).toBe('function');
    });

    it('should create different loggers for different components', () => {
      const loggerA = createComponentLogger('component-a');
      const loggerB = createComponentLogger('component-b');

      // Both should be defined
      expect(loggerA).toBeDefined();
      expect(loggerB).toBeDefined();
    });

    it('should return loggers with trace and fatal methods', () => {
      const childLogger = createComponentLogger('test-component');
      expect(typeof childLogger.trace).toBe('function');
      expect(typeof childLogger.fatal).toBe('function');
    });
  });

  describe('logger instance', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have logging methods', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have child method', () => {
      expect(typeof logger.child).toBe('function');
    });

    it('should have trace and fatal methods', () => {
      expect(typeof logger.trace).toBe('function');
      expect(typeof logger.fatal).toBe('function');
    });

    it('should have isLevelEnabled method', () => {
      expect(typeof logger.isLevelEnabled).toBe('function');
    });

    it('should have flush method', () => {
      expect(typeof logger.flush).toBe('function');
    });

    it('should have a valid log level', () => {
      const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];
      expect(validLevels).toContain(logger.level);
    });
  });

  describe('child logger bindings', () => {
    it('should create child logger with custom bindings', () => {
      const child = logger.child({ requestId: 'test-123' });
      expect(child).toBeDefined();
      expect(typeof child.info).toBe('function');
    });

    it('should create nested child loggers', () => {
      const child1 = logger.child({ component: 'parent' });
      const child2 = child1.child({ subComponent: 'child' });
      expect(child2).toBeDefined();
      expect(typeof child2.info).toBe('function');
    });
  });
});

