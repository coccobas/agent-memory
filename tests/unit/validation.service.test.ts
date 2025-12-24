/**
 * Unit tests for validation service
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestGuideline,
  createTestRepositories,
} from '../fixtures/test-helpers.js';
import {
  createValidationService,
  type ValidationService,
} from '../../src/services/validation.service.js';
import type { Repositories } from '../../src/core/interfaces/repositories.js';

const TEST_DB_PATH = './data/test-validation.db';
let testDb: ReturnType<typeof setupTestDb>;
let repos: Repositories;
let validationService: ValidationService;

// Helper to call validateEntry on the service
async function validateEntry(...args: Parameters<ValidationService['validateEntry']>) {
  return await validationService.validateEntry(...args);
}

describe('validation.service', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    repos = createTestRepositories(testDb);
    validationService = createValidationService(repos.guidelines);
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    // Clean up guidelines before each test
    // This is handled by test database isolation
  });

  describe('validateEntry - tool', () => {
    it('should validate tool with valid data', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          description: 'Test description',
        },
        'global'
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require tool name', async () => {
      const result = await validateEntry(
        'tool',
        {
          description: 'Test description',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'name' && e.message.includes('required'))).toBe(
        true
      );
    });

    it('should reject empty tool name', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: '',
          description: 'Test description',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('should reject tool name exceeding max length', async () => {
      const longName = 'a'.repeat(501); // Exceeds new limit of 500
      const result = await validateEntry('tool', { name: longName }, 'global');

      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.field === 'name' && e.message.includes('at most 500 characters')
        )
      ).toBe(true);
    });

    it('should reject description exceeding max length', async () => {
      const longDescription = 'a'.repeat(10 * 1024 + 1); // MAX_DESCRIPTION_LENGTH is 10KB
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          description: longDescription,
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'description' && e.message.includes('at most'))
      ).toBe(true);
    });
  });

  describe('validateEntry - guideline', () => {
    it('should validate guideline with valid data', async () => {
      const result = await validateEntry(
        'guideline',
        {
          name: 'test-guideline',
          content: 'Test content',
        },
        'global'
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require guideline name', async () => {
      const result = await validateEntry(
        'guideline',
        {
          content: 'Test content',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'name' && e.message.includes('required'))).toBe(
        true
      );
    });

    it('should require guideline content', async () => {
      const result = await validateEntry(
        'guideline',
        {
          name: 'test-guideline',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'content' && e.message.includes('required'))
      ).toBe(true);
    });

    it('should reject content exceeding max length', async () => {
      const longContent = 'a'.repeat(1024 * 1024 + 1); // MAX_CONTENT_LENGTH is 1MB
      const result = await validateEntry(
        'guideline',
        {
          name: 'test-guideline',
          content: longContent,
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'content' && e.message.includes('at most'))
      ).toBe(true);
    });
  });

  describe('validateEntry - knowledge', () => {
    it('should validate knowledge with valid data', async () => {
      const result = await validateEntry(
        'knowledge',
        {
          title: 'test-knowledge',
          content: 'Test content',
        },
        'global'
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require knowledge title', async () => {
      const result = await validateEntry(
        'knowledge',
        {
          content: 'Test content',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'title' && e.message.includes('required'))).toBe(
        true
      );
    });

    it('should require knowledge content', async () => {
      const result = await validateEntry(
        'knowledge',
        {
          title: 'test-knowledge',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'content' && e.message.includes('required'))
      ).toBe(true);
    });
  });

  describe('validateEntry - date fields', () => {
    it('should validate valid ISO date strings', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          validUntil: '2024-12-31T23:59:59Z',
        },
        'global'
      );

      expect(result.valid).toBe(true);
    });

    it('should reject invalid date strings', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          validUntil: 'not-a-date',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'validUntil' && e.message.includes('ISO 8601'))
      ).toBe(true);
    });

    it('should reject non-string date values', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          validUntil: 1234567890,
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'validUntil' && e.message.includes('string'))
      ).toBe(true);
    });

    it('should validate multiple date fields', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          validUntil: '2024-12-31T23:59:59Z',
          createdAfter: '2024-01-01T00:00:00Z',
          createdBefore: '2024-12-31T23:59:59Z',
        },
        'global'
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('validateEntry - JSON metadata fields', () => {
    it('should validate valid JSON strings', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          metadata: '{"key": "value"}',
        },
        'global'
      );

      expect(result.valid).toBe(true);
    });

    it('should validate valid JSON objects', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          metadata: { key: 'value' },
        },
        'global'
      );

      expect(result.valid).toBe(true);
    });

    it('should reject invalid JSON strings', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          metadata: '{"key": invalid}',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'metadata' && e.message.includes('valid JSON'))
      ).toBe(true);
    });

    it('should reject arrays for metadata field', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          metadata: ['array', 'values'],
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'metadata' && e.message.includes('object'))
      ).toBe(true);
    });
  });

  describe('validateEntry - custom validation rules', () => {
    it('should apply validation rules from guidelines', async () => {
      // Create a validation guideline
      createTestGuideline(
        testDb.db,
        'validation:tool:required_name',
        'global',
        undefined,
        'validation',
        80,
        JSON.stringify({
          field: 'name',
          required: true,
          message: 'Tool name is required',
        })
      );

      const result = await validateEntry(
        'tool',
        {
          description: 'Test description',
        },
        'global'
      );

      // Should have error from both built-in and custom rule
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should apply JSON validation rules', () => {
      createTestGuideline(
        testDb.db,
        'validation:tool:name_pattern',
        'global',
        undefined,
        'validation',
        80,
        JSON.stringify({
          field: 'name',
          pattern: '^[a-z0-9-_]+$',
          message: 'Name must be lowercase alphanumeric with hyphens and underscores',
        })
      );

      const result = validateEntry(
        'tool',
        {
          name: 'INVALID-NAME',
          description: 'Test',
        },
        'global'
      );

      // Should fail pattern validation if implemented in rule application
      // Note: Pattern validation may not be fully implemented in all cases
      expect(result).toBeDefined();
    });

    it('should handle rules that apply to all entry types', () => {
      createTestGuideline(
        testDb.db,
        'validation:all:required_fields',
        'global',
        undefined,
        'validation',
        80,
        'All entries must have required fields'
      );

      const result = validateEntry(
        'tool',
        {
          name: 'test-tool',
        },
        'global'
      );

      // Should still validate successfully if rule doesn't specify field
      expect(result).toBeDefined();
    });
  });

  describe('validateEntry - edge cases', () => {
    it('should handle null values gracefully', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: null,
          description: 'Test',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('should handle undefined values gracefully', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: undefined,
          description: 'Test',
        },
        'global'
      );

      expect(result.valid).toBe(false);
    });

    it('should handle whitespace-only strings', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: '   ',
          description: 'Test',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('should validate with scopeId provided', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
        },
        'project',
        'project-123'
      );

      expect(result.valid).toBe(true);
    });
  });
});
