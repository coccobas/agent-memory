import { describe, it, expect } from 'vitest';
import {
  validateTextLength,
  validateJsonSize,
  validateArrayLength,
  SIZE_LIMITS,
} from '../../src/services/validation.service.js';
import { AgentMemoryError } from '../../src/core/errors.js';

describe('MCP Input Validation', () => {
  describe('Text Length Validation', () => {
    it('should accept text within size limit', () => {
      const validText = 'x'.repeat(SIZE_LIMITS.NAME_MAX_LENGTH);
      expect(() => {
        validateTextLength(validText, 'name', SIZE_LIMITS.NAME_MAX_LENGTH);
      }).not.toThrow();
    });

    it('should reject text exceeding name max length', () => {
      const oversizedText = 'x'.repeat(SIZE_LIMITS.NAME_MAX_LENGTH + 1);
      expect(() => {
        validateTextLength(oversizedText, 'name', SIZE_LIMITS.NAME_MAX_LENGTH);
      }).toThrow(AgentMemoryError);
      expect(() => {
        validateTextLength(oversizedText, 'name', SIZE_LIMITS.NAME_MAX_LENGTH);
      }).toThrow(`name exceeds maximum characters of ${SIZE_LIMITS.NAME_MAX_LENGTH}`);
    });

    it('should reject text exceeding title max length', () => {
      const oversizedText = 'x'.repeat(SIZE_LIMITS.TITLE_MAX_LENGTH + 1);
      expect(() => {
        validateTextLength(oversizedText, 'title', SIZE_LIMITS.TITLE_MAX_LENGTH);
      }).toThrow(AgentMemoryError);
    });

    it('should reject text exceeding content max length', () => {
      const oversizedText = 'x'.repeat(SIZE_LIMITS.CONTENT_MAX_LENGTH + 1);
      expect(() => {
        validateTextLength(oversizedText, 'content', SIZE_LIMITS.CONTENT_MAX_LENGTH);
      }).toThrow(AgentMemoryError);
    });

    it('should reject text exceeding description max length', () => {
      const oversizedText = 'x'.repeat(SIZE_LIMITS.DESCRIPTION_MAX_LENGTH + 1);
      expect(() => {
        validateTextLength(oversizedText, 'description', SIZE_LIMITS.DESCRIPTION_MAX_LENGTH);
      }).toThrow(AgentMemoryError);
    });

    it('should reject text exceeding rationale max length', () => {
      const oversizedText = 'x'.repeat(SIZE_LIMITS.RATIONALE_MAX_LENGTH + 1);
      expect(() => {
        validateTextLength(oversizedText, 'rationale', SIZE_LIMITS.RATIONALE_MAX_LENGTH);
      }).toThrow(AgentMemoryError);
    });

    it('should provide clear error messages', () => {
      const oversizedText = 'x'.repeat(SIZE_LIMITS.NAME_MAX_LENGTH + 1);
      try {
        validateTextLength(oversizedText, 'name', SIZE_LIMITS.NAME_MAX_LENGTH);
        expect.fail('Should have thrown AgentMemoryError');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentMemoryError);
        expect((error as AgentMemoryError).message).toContain('name');
        expect((error as AgentMemoryError).message).toContain('exceeds maximum characters of');
        expect((error as AgentMemoryError).message).toContain(String(SIZE_LIMITS.NAME_MAX_LENGTH));
      }
    });
  });

  describe('JSON Size Validation', () => {
    it('should accept JSON within size limit', () => {
      const validJson = { key: 'value' };
      expect(() => {
        validateJsonSize(validJson, 'metadata', SIZE_LIMITS.METADATA_MAX_BYTES);
      }).not.toThrow();
    });

    it('should reject JSON exceeding metadata max bytes', () => {
      const oversizedJson = {
        data: 'x'.repeat(SIZE_LIMITS.METADATA_MAX_BYTES),
      };
      expect(() => {
        validateJsonSize(oversizedJson, 'metadata', SIZE_LIMITS.METADATA_MAX_BYTES);
      }).toThrow(AgentMemoryError);
    });

    it('should reject JSON exceeding parameters max bytes', () => {
      const oversizedJson = {
        properties: Object.fromEntries(
          Array(1000)
            .fill(0)
            .map((_, i) => [`prop${i}`, { description: 'x'.repeat(1000) }])
        ),
      };
      expect(() => {
        validateJsonSize(oversizedJson, 'parameters', SIZE_LIMITS.PARAMETERS_MAX_BYTES);
      }).toThrow(AgentMemoryError);
    });

    it('should reject JSON exceeding examples max bytes', () => {
      const oversizedJson = {
        good: Array(1000).fill('x'.repeat(1000)),
        bad: Array(1000).fill('y'.repeat(1000)),
      };
      expect(() => {
        validateJsonSize(oversizedJson, 'examples', SIZE_LIMITS.EXAMPLES_MAX_BYTES);
      }).toThrow(AgentMemoryError);
    });

    it('should provide clear error messages', () => {
      const oversizedJson = {
        data: 'x'.repeat(SIZE_LIMITS.METADATA_MAX_BYTES),
      };
      try {
        validateJsonSize(oversizedJson, 'metadata', SIZE_LIMITS.METADATA_MAX_BYTES);
        expect.fail('Should have thrown AgentMemoryError');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentMemoryError);
        expect((error as AgentMemoryError).message).toContain('metadata');
        expect((error as AgentMemoryError).message).toContain('exceeds maximum');
        expect((error as AgentMemoryError).message).toContain(
          String(SIZE_LIMITS.METADATA_MAX_BYTES)
        );
      }
    });
  });

  describe('Array Length Validation', () => {
    it('should accept array within size limit', () => {
      const validArray = Array(SIZE_LIMITS.TAGS_MAX_COUNT).fill('tag');
      expect(() => {
        validateArrayLength(validArray, 'tags', SIZE_LIMITS.TAGS_MAX_COUNT);
      }).not.toThrow();
    });

    it('should reject array exceeding tags max count', () => {
      const oversizedArray = Array(SIZE_LIMITS.TAGS_MAX_COUNT + 1).fill('tag');
      expect(() => {
        validateArrayLength(oversizedArray, 'tags', SIZE_LIMITS.TAGS_MAX_COUNT);
      }).toThrow(AgentMemoryError);
    });

    it('should reject array exceeding examples max count', () => {
      const oversizedArray = Array(SIZE_LIMITS.EXAMPLES_MAX_COUNT + 1).fill('example');
      expect(() => {
        validateArrayLength(oversizedArray, 'examples', SIZE_LIMITS.EXAMPLES_MAX_COUNT);
      }).toThrow(AgentMemoryError);
    });

    it('should reject array exceeding bulk operation max', () => {
      const oversizedArray = Array(SIZE_LIMITS.BULK_OPERATION_MAX + 1).fill({
        name: 'entry',
      });
      expect(() => {
        validateArrayLength(oversizedArray, 'entries', SIZE_LIMITS.BULK_OPERATION_MAX);
      }).toThrow(AgentMemoryError);
    });

    it('should provide clear error messages', () => {
      const oversizedArray = Array(SIZE_LIMITS.TAGS_MAX_COUNT + 1).fill('tag');
      try {
        validateArrayLength(oversizedArray, 'tags', SIZE_LIMITS.TAGS_MAX_COUNT);
        expect.fail('Should have thrown AgentMemoryError');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentMemoryError);
        expect((error as AgentMemoryError).message).toContain('tags');
        expect((error as AgentMemoryError).message).toContain('exceeds maximum');
        expect((error as AgentMemoryError).message).toContain(String(SIZE_LIMITS.TAGS_MAX_COUNT));
      }
    });
  });

  describe('Edge Cases', () => {
    it('should accept empty strings', () => {
      expect(() => {
        validateTextLength('', 'name', SIZE_LIMITS.NAME_MAX_LENGTH);
      }).not.toThrow();
    });

    it('should accept empty arrays', () => {
      expect(() => {
        validateArrayLength([], 'tags', SIZE_LIMITS.TAGS_MAX_COUNT);
      }).not.toThrow();
    });

    it('should accept empty objects', () => {
      expect(() => {
        validateJsonSize({}, 'metadata', SIZE_LIMITS.METADATA_MAX_BYTES);
      }).not.toThrow();
    });

    it('should handle exactly at boundary (text)', () => {
      const boundaryText = 'x'.repeat(SIZE_LIMITS.NAME_MAX_LENGTH);
      expect(() => {
        validateTextLength(boundaryText, 'name', SIZE_LIMITS.NAME_MAX_LENGTH);
      }).not.toThrow();
    });

    it('should handle exactly at boundary (array)', () => {
      const boundaryArray = Array(SIZE_LIMITS.TAGS_MAX_COUNT).fill('tag');
      expect(() => {
        validateArrayLength(boundaryArray, 'tags', SIZE_LIMITS.TAGS_MAX_COUNT);
      }).not.toThrow();
    });

    it('should reject one over boundary (text)', () => {
      const overBoundaryText = 'x'.repeat(SIZE_LIMITS.NAME_MAX_LENGTH + 1);
      expect(() => {
        validateTextLength(overBoundaryText, 'name', SIZE_LIMITS.NAME_MAX_LENGTH);
      }).toThrow(AgentMemoryError);
    });

    it('should reject one over boundary (array)', () => {
      const overBoundaryArray = Array(SIZE_LIMITS.TAGS_MAX_COUNT + 1).fill('tag');
      expect(() => {
        validateArrayLength(overBoundaryArray, 'tags', SIZE_LIMITS.TAGS_MAX_COUNT);
      }).toThrow(AgentMemoryError);
    });
  });

  describe('SIZE_LIMITS Constants', () => {
    it('should have all required size limits defined', () => {
      expect(SIZE_LIMITS.NAME_MAX_LENGTH).toBeGreaterThan(0);
      expect(SIZE_LIMITS.TITLE_MAX_LENGTH).toBeGreaterThan(0);
      expect(SIZE_LIMITS.DESCRIPTION_MAX_LENGTH).toBeGreaterThan(0);
      expect(SIZE_LIMITS.CONTENT_MAX_LENGTH).toBeGreaterThan(0);
      expect(SIZE_LIMITS.RATIONALE_MAX_LENGTH).toBeGreaterThan(0);
      expect(SIZE_LIMITS.METADATA_MAX_BYTES).toBeGreaterThan(0);
      expect(SIZE_LIMITS.PARAMETERS_MAX_BYTES).toBeGreaterThan(0);
      expect(SIZE_LIMITS.EXAMPLES_MAX_BYTES).toBeGreaterThan(0);
      expect(SIZE_LIMITS.TAGS_MAX_COUNT).toBeGreaterThan(0);
      expect(SIZE_LIMITS.EXAMPLES_MAX_COUNT).toBeGreaterThan(0);
      expect(SIZE_LIMITS.BULK_OPERATION_MAX).toBeGreaterThan(0);
    });

    it('should have reasonable size limits', () => {
      // Text fields should have reasonable hierarchy
      expect(SIZE_LIMITS.NAME_MAX_LENGTH).toBeLessThan(SIZE_LIMITS.TITLE_MAX_LENGTH);
      expect(SIZE_LIMITS.TITLE_MAX_LENGTH).toBeLessThan(SIZE_LIMITS.CONTENT_MAX_LENGTH);
      expect(SIZE_LIMITS.DESCRIPTION_MAX_LENGTH).toBeLessThan(SIZE_LIMITS.CONTENT_MAX_LENGTH);

      // JSON fields should allow more space than basic metadata
      expect(SIZE_LIMITS.METADATA_MAX_BYTES).toBeLessThan(SIZE_LIMITS.EXAMPLES_MAX_BYTES);

      // Array counts should be reasonable (examples count < tags count is expected)
      expect(SIZE_LIMITS.EXAMPLES_MAX_COUNT).toBeLessThan(SIZE_LIMITS.TAGS_MAX_COUNT);
    });
  });
});
