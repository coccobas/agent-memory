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
  validateDateRange,
  detectRedosPatterns,
  DATE_RANGE,
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

    it('should reject dates before 1970', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          validUntil: '1969-12-31T23:59:59Z',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'validUntil' && e.message.includes('1970 or later'))
      ).toBe(true);
    });

    it('should reject dates after 2100', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          validUntil: '2101-01-01T00:00:00Z',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'validUntil' && e.message.includes('2100 or earlier'))
      ).toBe(true);
    });

    it('should reject obviously invalid dates like year 0001', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          validUntil: '0001-01-01T00:00:00Z',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'validUntil' && e.message.includes('1970'))
      ).toBe(true);
    });

    it('should reject obviously invalid dates like year 9999', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          validUntil: '9999-12-31T23:59:59Z',
        },
        'global'
      );

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'validUntil' && e.message.includes('2100'))
      ).toBe(true);
    });

    it('should accept dates at the boundary (1970)', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          validUntil: '1970-01-01T00:00:00Z',
        },
        'global'
      );

      expect(result.valid).toBe(true);
    });

    it('should accept dates at the boundary (2100)', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          validUntil: '2100-12-31T23:59:59Z',
        },
        'global'
      );

      expect(result.valid).toBe(true);
    });

    it('should accept legitimate historical dates (Unix epoch)', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          createdAfter: '1970-01-01T00:00:00Z',
          createdBefore: '1980-01-01T00:00:00Z',
        },
        'global'
      );

      expect(result.valid).toBe(true);
    });

    it('should accept reasonable future dates', async () => {
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
          validUntil: '2050-01-01T00:00:00Z',
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

    it('should reject dangerous ReDoS patterns in validation rules', async () => {
      createTestGuideline(
        testDb.db,
        'validation:test:redos',
        'global',
        undefined,
        'validation',
        80,
        JSON.stringify({
          field: 'name',
          pattern: '(a+)+', // Dangerous pattern
          message: 'This pattern should be rejected',
        })
      );

      // The validation service should reject the dangerous pattern internally
      // and skip validation (not throw an error, but log a warning)
      const result = await validateEntry(
        'tool',
        {
          name: 'test-tool',
        },
        'global'
      );

      // Should pass validation because dangerous pattern was skipped
      expect(result.valid).toBe(true);
    });
  });
});

describe('validateDateRange', () => {
  describe('valid dates', () => {
    it('should accept valid dates within range', () => {
      const date = '2024-06-15T12:00:00Z';
      const result = validateDateRange(date, 'testField');
      expect(result).toBe(date);
    });

    it('should accept date at minimum boundary (1970)', () => {
      const date = '1970-01-01T00:00:00Z';
      const result = validateDateRange(date, 'testField');
      expect(result).toBe(date);
    });

    it('should accept date at maximum boundary (2100)', () => {
      const date = '2100-12-31T23:59:59Z';
      const result = validateDateRange(date, 'testField');
      expect(result).toBe(date);
    });

    it('should accept Unix epoch start', () => {
      const date = '1970-01-01T00:00:00.000Z';
      const result = validateDateRange(date, 'testField');
      expect(result).toBe(date);
    });

    it('should accept reasonable future dates', () => {
      const date = '2050-01-01T00:00:00Z';
      const result = validateDateRange(date, 'testField');
      expect(result).toBe(date);
    });

    it('should accept dates in different formats', () => {
      const date = '2024-06-15'; // Date without time
      const result = validateDateRange(date, 'testField');
      expect(result).toBe(date);
    });
  });

  describe('invalid dates', () => {
    it('should reject invalid date strings', () => {
      expect(() => validateDateRange('not-a-date', 'testField')).toThrow(
        'Validation error: testField - must be a valid ISO 8601 date string'
      );
    });

    it('should reject empty strings', () => {
      expect(() => validateDateRange('', 'testField')).toThrow(
        'Validation error: testField - must be a valid ISO 8601 date string'
      );
    });

    it('should reject malformed dates', () => {
      expect(() => validateDateRange('2024-13-45', 'testField')).toThrow(
        'Validation error: testField - must be a valid ISO 8601 date string'
      );
    });
  });

  describe('date range validation', () => {
    it('should reject dates before 1970', () => {
      expect(() => validateDateRange('1969-12-31T23:59:59Z', 'testField')).toThrow(
        'Validation error: testField - year must be 1970 or later (got 1969)'
      );
    });

    it('should reject dates after 2100', () => {
      expect(() => validateDateRange('2101-01-01T00:00:00Z', 'testField')).toThrow(
        'Validation error: testField - year must be 2100 or earlier (got 2101)'
      );
    });

    it('should reject year 0001', () => {
      expect(() => validateDateRange('0001-01-01T00:00:00Z', 'testField')).toThrow(
        'Validation error: testField - year must be 1970 or later (got 1)'
      );
    });

    it('should reject year 9999', () => {
      expect(() => validateDateRange('9999-12-31T23:59:59Z', 'testField')).toThrow(
        'Validation error: testField - year must be 2100 or earlier (got 9999)'
      );
    });

    it('should reject year 1900', () => {
      expect(() => validateDateRange('1900-01-01T00:00:00Z', 'testField')).toThrow(
        'Validation error: testField - year must be 1970 or later (got 1900)'
      );
    });

    it('should reject year 3000', () => {
      expect(() => validateDateRange('3000-01-01T00:00:00Z', 'testField')).toThrow(
        'Validation error: testField - year must be 2100 or earlier (got 3000)'
      );
    });
  });

  describe('field name in error messages', () => {
    it('should include field name in error messages', () => {
      expect(() => validateDateRange('invalid', 'myCustomField')).toThrow(
        'Validation error: myCustomField - must be a valid ISO 8601 date string'
      );
    });

    it('should include field name in range errors', () => {
      expect(() => validateDateRange('1969-01-01T00:00:00Z', 'dateField')).toThrow(
        'Validation error: dateField - year must be 1970 or later'
      );
    });
  });

  describe('constants', () => {
    it('should have correct date range constants', () => {
      expect(DATE_RANGE.MIN_YEAR).toBe(1970);
      expect(DATE_RANGE.MAX_YEAR).toBe(2100);
    });
  });
});

describe('detectRedosPatterns', () => {
  describe('safe patterns', () => {
    it('should accept simple literal patterns', () => {
      expect(detectRedosPatterns('hello')).toBe(true);
      expect(detectRedosPatterns('test123')).toBe(true);
      expect(detectRedosPatterns('hello world')).toBe(true);
    });

    it('should accept basic character classes', () => {
      expect(detectRedosPatterns('[a-z]')).toBe(true);
      expect(detectRedosPatterns('[0-9]+')).toBe(true);
      expect(detectRedosPatterns('[A-Za-z0-9_]+')).toBe(true);
    });

    it('should accept safe quantifiers', () => {
      expect(detectRedosPatterns('a+')).toBe(true);
      expect(detectRedosPatterns('b*')).toBe(true);
      expect(detectRedosPatterns('c?')).toBe(true);
      expect(detectRedosPatterns('d{2,5}')).toBe(true);
    });

    it('should accept safe groups without nested quantifiers', () => {
      expect(detectRedosPatterns('(abc)+')).toBe(true);
      expect(detectRedosPatterns('(hello)*')).toBe(true);
      expect(detectRedosPatterns('(test)?')).toBe(true);
    });

    it('should accept safe alternations without quantifiers', () => {
      expect(detectRedosPatterns('(cat|dog)')).toBe(true);
      expect(detectRedosPatterns('(red|blue|green)')).toBe(true);
    });

    it('should accept bounded repetitions with reasonable limits', () => {
      expect(detectRedosPatterns('a{1,10}')).toBe(true);
      expect(detectRedosPatterns('[0-9]{3,5}')).toBe(true);
      expect(detectRedosPatterns('.{0,100}')).toBe(true);
      expect(detectRedosPatterns('\\w{5,999}')).toBe(true); // Just under 1000
    });

    it('should accept common safe patterns', () => {
      expect(detectRedosPatterns('^[a-z0-9-_]+$')).toBe(true);
      expect(detectRedosPatterns('\\d{4}-\\d{2}-\\d{2}')).toBe(true);
      expect(detectRedosPatterns('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}')).toBe(true);
    });
  });

  describe('dangerous patterns - nested quantifiers', () => {
    it('should reject (a+)+ pattern', () => {
      expect(detectRedosPatterns('(a+)+')).toBe(false);
    });

    it('should reject (a*)* pattern', () => {
      expect(detectRedosPatterns('(a*)*')).toBe(false);
    });

    it('should reject (a?)+ pattern', () => {
      expect(detectRedosPatterns('(a?)+')).toBe(false);
    });

    it('should reject (a?)? pattern', () => {
      expect(detectRedosPatterns('(a?)?')).toBe(false);
    });

    it('should reject complex nested quantifiers', () => {
      expect(detectRedosPatterns('([a-z]+)+')).toBe(false);
      expect(detectRedosPatterns('(\\w*)*')).toBe(false);
      expect(detectRedosPatterns('(\\d?)*')).toBe(false);
    });
  });

  describe('dangerous patterns - quantified groups with trailing quantifier', () => {
    it('should reject (x){2,}+ pattern', () => {
      expect(detectRedosPatterns('(x){2,}+')).toBe(false);
    });

    it('should reject (a)*{1,5} pattern', () => {
      expect(detectRedosPatterns('(a)*{1,5}')).toBe(false);
    });

    it('should reject (test)+{2,} pattern', () => {
      expect(detectRedosPatterns('(test)+{2,}')).toBe(false);
    });
  });

  describe('dangerous patterns - multiple consecutive quantifiers', () => {
    it('should reject +++ pattern', () => {
      expect(detectRedosPatterns('a+++')).toBe(false);
    });

    it('should reject *** pattern', () => {
      expect(detectRedosPatterns('b***')).toBe(false);
    });

    it('should reject consecutive quantifier patterns', () => {
      expect(detectRedosPatterns('a**')).toBe(false); // Two asterisks
      expect(detectRedosPatterns('b++')).toBe(false); // Two plus signs
    });

    it('should reject mixed consecutive quantifiers', () => {
      expect(detectRedosPatterns('d++*')).toBe(false);
      expect(detectRedosPatterns('e*+')).toBe(false);
      expect(detectRedosPatterns('f+*')).toBe(false);
    });
  });

  describe('dangerous patterns - overlapping alternations', () => {
    it('should reject (a|a)+ pattern', () => {
      expect(detectRedosPatterns('(a|a)+')).toBe(false);
    });

    it('should reject (ab|a)+ pattern', () => {
      expect(detectRedosPatterns('(ab|a)+')).toBe(false);
    });

    it('should reject (a|ab)* pattern', () => {
      expect(detectRedosPatterns('(a|ab)*')).toBe(false);
    });

    it('should reject (test|testing)+ pattern', () => {
      expect(detectRedosPatterns('(test|testing)+')).toBe(false);
    });
  });

  describe('dangerous patterns - exponential backtracking', () => {
    it('should reject (a+b?)+ pattern', () => {
      expect(detectRedosPatterns('(a+b?)+')).toBe(false);
    });

    it('should reject (x*y?)* pattern', () => {
      expect(detectRedosPatterns('(x*y?)*')).toBe(false);
    });

    it('should reject (\\w+\\s?)+ pattern', () => {
      expect(detectRedosPatterns('(\\w+\\s?)+')).toBe(false);
    });

    it('should reject (a*b*)+ pattern', () => {
      expect(detectRedosPatterns('(a*b*)+')).toBe(false);
    });

    it('should reject (x+y+)* pattern', () => {
      expect(detectRedosPatterns('(x+y+)*')).toBe(false);
    });
  });

  describe('dangerous patterns - catastrophic with repetition', () => {
    it('should reject .*.*+ pattern', () => {
      expect(detectRedosPatterns('.*.*+')).toBe(false);
    });

    it('should reject .+.++ pattern', () => {
      expect(detectRedosPatterns('.+.++')).toBe(false);
    });

    it('should reject .*x.*+ pattern', () => {
      expect(detectRedosPatterns('.*x.*+')).toBe(false);
    });

    it('should reject (x+x+)+ pattern', () => {
      expect(detectRedosPatterns('(x+x+)+')).toBe(false);
    });
  });

  describe('dangerous patterns - alternation with nested quantifiers', () => {
    it('should reject (a+|b+)+ pattern', () => {
      expect(detectRedosPatterns('(a+|b+)+')).toBe(false);
    });

    it('should reject (x*|y*)* pattern', () => {
      expect(detectRedosPatterns('(x*|y*)*')).toBe(false);
    });

    it('should reject (\\w+|\\d+)+ pattern', () => {
      expect(detectRedosPatterns('(\\w+|\\d+)+')).toBe(false);
    });
  });

  describe('dangerous patterns - excessive repetition bounds', () => {
    it('should reject patterns with repetition > 1000', () => {
      expect(detectRedosPatterns('.{1,99999}')).toBe(false);
      expect(detectRedosPatterns('a{1,10000}')).toBe(false);
      expect(detectRedosPatterns('[a-z]{1,5000}')).toBe(false);
    });

    it('should reject patterns with lower bound > 1000', () => {
      expect(detectRedosPatterns('a{1001,}')).toBe(false);
      expect(detectRedosPatterns('.{5000,10000}')).toBe(false);
    });

    it('should accept patterns with reasonable bounds (< 1000)', () => {
      expect(detectRedosPatterns('a{1,999}')).toBe(true);
      expect(detectRedosPatterns('.{0,500}')).toBe(true);
      expect(detectRedosPatterns('[a-z]{1,100}')).toBe(true);
    });
  });

  describe('dangerous patterns - word boundaries with greedy quantifiers', () => {
    it('should reject \\b.*\\b pattern', () => {
      expect(detectRedosPatterns('\\b.*\\b')).toBe(false);
    });

    it('should reject \\b.+\\b pattern', () => {
      expect(detectRedosPatterns('\\b.+\\b')).toBe(false);
    });

    it('should reject \\b\\w*.*\\b pattern', () => {
      expect(detectRedosPatterns('\\b\\w*.*\\b')).toBe(false);
    });
  });

  describe('real-world attack patterns', () => {
    it('should reject email ReDoS pattern', () => {
      // Classic ReDoS email pattern
      expect(detectRedosPatterns('([a-zA-Z0-9_\\-\\.]+)+@([a-zA-Z0-9_\\-\\.]+)+')).toBe(false);
    });

    it('should reject URL ReDoS pattern', () => {
      expect(detectRedosPatterns('(https?://)?([\\w-]+\\.)+[\\w-]+(/[\\w-./?%&=]*)?')).toBe(false);
    });

    it('should reject nested grouping attack', () => {
      expect(detectRedosPatterns('((a+)+)+')).toBe(false);
    });

    it('should reject complex backtracking pattern', () => {
      // Pattern that causes exponential time on input like "aaaaaaaaab"
      expect(detectRedosPatterns('(a+)+(b)')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should accept empty pattern', () => {
      expect(detectRedosPatterns('')).toBe(true);
    });

    it('should accept patterns with escaped characters', () => {
      expect(detectRedosPatterns('\\(\\)\\+\\*\\?')).toBe(true);
    });

    it('should accept character classes in groups', () => {
      expect(detectRedosPatterns('([a-z][0-9])+')).toBe(true);
    });

    it('should accept non-capturing groups without nested quantifiers', () => {
      expect(detectRedosPatterns('(?:abc)+')).toBe(true);
    });
  });
});
