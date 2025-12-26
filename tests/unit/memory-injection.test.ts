/**
 * Memory Injection Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MemoryInjectionService,
  resetMemoryInjectionService,
  type MemoryInjectionRequest,
  type InjectableToolType,
} from '../../src/services/memory-injection.service.js';

// Mock DbClient
const mockDb = {} as any;

describe('MemoryInjectionService', () => {
  let service: MemoryInjectionService;

  beforeEach(() => {
    resetMemoryInjectionService();
    service = new MemoryInjectionService(mockDb);
  });

  describe('shouldInject()', () => {
    it('should return true for Edit tool', () => {
      expect(service.shouldInject('Edit')).toBe(true);
    });

    it('should return true for Write tool', () => {
      expect(service.shouldInject('Write')).toBe(true);
    });

    it('should return true for Bash tool', () => {
      expect(service.shouldInject('Bash')).toBe(true);
    });

    it('should return false for Read tool (not in default config)', () => {
      expect(service.shouldInject('Read')).toBe(false);
    });

    it('should return false for unknown tools', () => {
      expect(service.shouldInject('UnknownTool')).toBe(false);
    });

    it('should return false when disabled', () => {
      service.updateConfig({ enabled: false });
      expect(service.shouldInject('Edit')).toBe(false);
    });
  });

  describe('getContext()', () => {
    it('should skip injection for non-injectable tools', async () => {
      const request: MemoryInjectionRequest = {
        toolName: 'Read',
        toolParams: { file_path: '/test/file.ts' },
      };

      const result = await service.getContext(request);

      expect(result.success).toBe(true);
      expect(result.injectedContext).toBe('');
      expect(result.entries).toHaveLength(0);
      expect(result.message).toContain('skipped');
    });

    it('should skip injection when disabled', async () => {
      service.updateConfig({ enabled: false });

      const request: MemoryInjectionRequest = {
        toolName: 'Edit',
        toolParams: { file_path: '/test/file.ts' },
      };

      const result = await service.getContext(request);

      expect(result.success).toBe(true);
      expect(result.injectedContext).toBe('');
    });

    it('should process Edit tool requests', async () => {
      const request: MemoryInjectionRequest = {
        toolName: 'Edit',
        toolParams: {
          file_path: '/src/components/Button.tsx',
          new_string: 'const Button = () => { return <button>Click</button> }',
        },
        projectId: 'test-project',
      };

      const result = await service.getContext(request);

      expect(result.success).toBe(true);
      expect(result.detectedIntent).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should process Bash tool requests', async () => {
      const request: MemoryInjectionRequest = {
        toolName: 'Bash',
        toolParams: {
          command: 'npm run build',
        },
        projectId: 'test-project',
      };

      const result = await service.getContext(request);

      expect(result.success).toBe(true);
      expect(result.detectedIntent).toBeDefined();
    });

    it('should use conversation context when provided', async () => {
      const request: MemoryInjectionRequest = {
        toolName: 'Edit',
        conversationContext: 'I need to add error handling to this function',
        toolParams: { file_path: '/src/api/handler.ts' },
      };

      const result = await service.getContext(request);

      // Should detect debug/error-related intent
      expect(result.success).toBe(true);
    });

    it('should respect maxLength setting', async () => {
      const request: MemoryInjectionRequest = {
        toolName: 'Edit',
        toolParams: { file_path: '/test.ts' },
        maxLength: 100,
      };

      const result = await service.getContext(request);

      expect(result.success).toBe(true);
      // Even if we had entries, they would be truncated
      expect(result.injectedContext.length).toBeLessThanOrEqual(120); // 100 + truncation message
    });
  });

  describe('getConfig()', () => {
    it('should return default configuration', () => {
      const config = service.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.defaultFormat).toBe('markdown');
      expect(config.defaultMaxEntries).toBe(5);
      expect(config.injectableTools).toContain('Edit');
      expect(config.injectableTools).toContain('Write');
      expect(config.injectableTools).toContain('Bash');
    });
  });

  describe('updateConfig()', () => {
    it('should update configuration', () => {
      service.updateConfig({
        defaultMaxEntries: 10,
        defaultFormat: 'json',
      });

      const config = service.getConfig();

      expect(config.defaultMaxEntries).toBe(10);
      expect(config.defaultFormat).toBe('json');
      // Other values should remain unchanged
      expect(config.enabled).toBe(true);
    });

    it('should add new injectable tools', () => {
      service.updateConfig({
        injectableTools: ['Edit', 'Write', 'Bash', 'Read', 'Glob'],
      });

      expect(service.shouldInject('Read')).toBe(true);
      expect(service.shouldInject('Glob')).toBe(true);
    });
  });

  describe('format options', () => {
    it('should support markdown format', async () => {
      const request: MemoryInjectionRequest = {
        toolName: 'Edit',
        format: 'markdown',
        toolParams: { file_path: '/test.ts' },
      };

      const result = await service.getContext(request);

      expect(result.success).toBe(true);
      // With no entries, should be empty
      expect(result.injectedContext).toBe('');
    });

    it('should support json format', async () => {
      const request: MemoryInjectionRequest = {
        toolName: 'Edit',
        format: 'json',
        toolParams: { file_path: '/test.ts' },
      };

      const result = await service.getContext(request);

      expect(result.success).toBe(true);
    });

    it('should support natural_language format', async () => {
      const request: MemoryInjectionRequest = {
        toolName: 'Edit',
        format: 'natural_language',
        toolParams: { file_path: '/test.ts' },
      };

      const result = await service.getContext(request);

      expect(result.success).toBe(true);
    });
  });

  describe('intent detection integration', () => {
    it('should detect how-to intent for procedural queries', async () => {
      const request: MemoryInjectionRequest = {
        toolName: 'Edit',
        conversationContext: 'How do I add a new component?',
        toolParams: { file_path: '/src/components/New.tsx' },
      };

      const result = await service.getContext(request);

      expect(result.detectedIntent).toBe('how_to');
    });

    it('should detect debug intent for error-related queries', async () => {
      const request: MemoryInjectionRequest = {
        toolName: 'Bash',
        conversationContext: 'Fix the build error in the tests',
        toolParams: { command: 'npm run test' },
      };

      const result = await service.getContext(request);

      expect(result.detectedIntent).toBe('debug');
    });

    it('should detect configure intent for setup queries', async () => {
      const request: MemoryInjectionRequest = {
        toolName: 'Edit',
        conversationContext: 'Configure the database connection settings',
        toolParams: { file_path: '/config/database.ts' },
      };

      const result = await service.getContext(request);

      expect(result.detectedIntent).toBe('configure');
    });
  });
});
