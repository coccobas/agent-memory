/**
 * Unit tests for type guard utilities
 */

import { describe, it, expect } from 'vitest';
import {
  isString,
  isNumber,
  isBoolean,
  isObject,
  isArray,
  isScopeType,
  isEntryType,
  isISODateString,
  validateParams,
  getParam,
  getOptionalParam,
  getRequiredParam,
  isToolCategory,
  isArrayOfObjects,
  isArrayOfStrings,
  isExamplesObject,
  isKnowledgeCategory,
  isTagCategory,
  isRelationType,
  isPermissionLevel,
  isPermissionAction,
  isConversationRole,
  isConversationStatus,
} from '../../src/utils/type-guards.js';

describe('Type Guards - Basic Types', () => {
  describe('isString', () => {
    it('should return true for strings', () => {
      expect(isString('hello')).toBe(true);
      expect(isString('')).toBe(true);
      expect(isString('123')).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString(true)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString([])).toBe(false);
      expect(isString({})).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should return true for valid numbers', () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(123)).toBe(true);
      expect(isNumber(-123)).toBe(true);
      expect(isNumber(1.5)).toBe(true);
    });

    it('should return false for NaN', () => {
      expect(isNumber(NaN)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isNumber('123')).toBe(false);
      expect(isNumber(true)).toBe(false);
      expect(isNumber(null)).toBe(false);
      expect(isNumber(undefined)).toBe(false);
    });
  });

  describe('isBoolean', () => {
    it('should return true for booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    it('should return false for non-booleans', () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean(null)).toBe(false);
      expect(isBoolean(undefined)).toBe(false);
    });
  });

  describe('isObject', () => {
    it('should return true for objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ key: 'value' })).toBe(true);
      expect(isObject({ nested: { value: 1 } })).toBe(true);
    });

    it('should return false for arrays', () => {
      expect(isObject([])).toBe(false);
      expect(isObject([1, 2, 3])).toBe(false);
    });

    it('should return false for null', () => {
      expect(isObject(null)).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isObject('string')).toBe(false);
      expect(isObject(123)).toBe(false);
      expect(isObject(true)).toBe(false);
      expect(isObject(undefined)).toBe(false);
    });
  });

  describe('isArray', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(['a', 'b'])).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('string')).toBe(false);
      expect(isArray(123)).toBe(false);
      expect(isArray(null)).toBe(false);
      expect(isArray(undefined)).toBe(false);
    });
  });
});

describe('Type Guards - Domain Types', () => {
  describe('isScopeType', () => {
    it('should return true for valid scope types', () => {
      expect(isScopeType('global')).toBe(true);
      expect(isScopeType('org')).toBe(true);
      expect(isScopeType('project')).toBe(true);
      expect(isScopeType('session')).toBe(true);
    });

    it('should return false for invalid scope types', () => {
      expect(isScopeType('invalid')).toBe(false);
      expect(isScopeType('')).toBe(false);
      expect(isScopeType(123)).toBe(false);
      expect(isScopeType(null)).toBe(false);
    });
  });

  describe('isEntryType', () => {
    it('should return true for valid entry types', () => {
      expect(isEntryType('tool')).toBe(true);
      expect(isEntryType('guideline')).toBe(true);
      expect(isEntryType('knowledge')).toBe(true);
    });

    it('should return false for invalid entry types', () => {
      expect(isEntryType('invalid')).toBe(false);
      expect(isEntryType('project')).toBe(false);
      expect(isEntryType(123)).toBe(false);
    });
  });

  describe('isISODateString', () => {
    it('should return true for valid ISO date strings', () => {
      expect(isISODateString('2024-01-01T00:00:00Z')).toBe(true);
      expect(isISODateString('2024-12-19T15:30:45.123Z')).toBe(true);
      expect(isISODateString('2024-01-01T00:00:00+00:00')).toBe(true);
    });

    it('should return false for invalid date strings', () => {
      expect(isISODateString('2024-01-01')).toBe(false); // Missing T
      expect(isISODateString('not-a-date')).toBe(false);
      expect(isISODateString('123')).toBe(false);
      expect(isISODateString(123)).toBe(false);
      expect(isISODateString(null)).toBe(false);
    });
  });

  describe('isToolCategory', () => {
    it('should return true for valid tool categories', () => {
      expect(isToolCategory('mcp')).toBe(true);
      expect(isToolCategory('cli')).toBe(true);
      expect(isToolCategory('function')).toBe(true);
      expect(isToolCategory('api')).toBe(true);
    });

    it('should return false for invalid categories', () => {
      expect(isToolCategory('invalid')).toBe(false);
      expect(isToolCategory('')).toBe(false);
    });
  });

  describe('isKnowledgeCategory', () => {
    it('should return true for valid knowledge categories', () => {
      expect(isKnowledgeCategory('decision')).toBe(true);
      expect(isKnowledgeCategory('fact')).toBe(true);
      expect(isKnowledgeCategory('context')).toBe(true);
      expect(isKnowledgeCategory('reference')).toBe(true);
    });

    it('should return false for invalid categories', () => {
      expect(isKnowledgeCategory('invalid')).toBe(false);
    });
  });

  describe('isTagCategory', () => {
    it('should return true for valid tag categories', () => {
      expect(isTagCategory('language')).toBe(true);
      expect(isTagCategory('domain')).toBe(true);
      expect(isTagCategory('category')).toBe(true);
      expect(isTagCategory('meta')).toBe(true);
      expect(isTagCategory('custom')).toBe(true);
    });

    it('should return false for invalid categories', () => {
      expect(isTagCategory('invalid')).toBe(false);
    });
  });

  describe('isRelationType', () => {
    it('should return true for valid relation types', () => {
      expect(isRelationType('applies_to')).toBe(true);
      expect(isRelationType('depends_on')).toBe(true);
      expect(isRelationType('conflicts_with')).toBe(true);
      expect(isRelationType('related_to')).toBe(true);
      expect(isRelationType('parent_task')).toBe(true);
      expect(isRelationType('subtask_of')).toBe(true);
    });

    it('should return false for invalid relation types', () => {
      expect(isRelationType('invalid')).toBe(false);
    });
  });

  describe('isPermissionLevel', () => {
    it('should return true for valid permission levels', () => {
      expect(isPermissionLevel('read')).toBe(true);
      expect(isPermissionLevel('write')).toBe(true);
      expect(isPermissionLevel('admin')).toBe(true);
    });

    it('should return false for invalid permission levels', () => {
      expect(isPermissionLevel('invalid')).toBe(false);
      expect(isPermissionLevel('delete')).toBe(false);
    });
  });

  describe('isPermissionAction', () => {
    it('should return true for valid permission actions', () => {
      expect(isPermissionAction('read')).toBe(true);
      expect(isPermissionAction('write')).toBe(true);
      expect(isPermissionAction('delete')).toBe(true);
    });

    it('should return false for invalid actions', () => {
      expect(isPermissionAction('invalid')).toBe(false);
      expect(isPermissionAction('admin')).toBe(false);
    });
  });

  describe('isConversationRole', () => {
    it('should return true for valid conversation roles', () => {
      expect(isConversationRole('user')).toBe(true);
      expect(isConversationRole('agent')).toBe(true);
      expect(isConversationRole('system')).toBe(true);
    });

    it('should return false for invalid roles', () => {
      expect(isConversationRole('invalid')).toBe(false);
    });
  });

  describe('isConversationStatus', () => {
    it('should return true for valid conversation statuses', () => {
      expect(isConversationStatus('active')).toBe(true);
      expect(isConversationStatus('completed')).toBe(true);
      expect(isConversationStatus('archived')).toBe(true);
    });

    it('should return false for invalid statuses', () => {
      expect(isConversationStatus('invalid')).toBe(false);
    });
  });
});

describe('Type Guards - Array Helpers', () => {
  describe('isArrayOfStrings', () => {
    it('should return true for arrays of strings', () => {
      expect(isArrayOfStrings([])).toBe(true);
      expect(isArrayOfStrings(['a', 'b', 'c'])).toBe(true);
      expect(isArrayOfStrings([''])).toBe(true);
    });

    it('should return false for arrays with non-strings', () => {
      expect(isArrayOfStrings([1, 2, 3])).toBe(false);
      expect(isArrayOfStrings(['a', 1])).toBe(false);
      expect(isArrayOfStrings([null])).toBe(false);
    });

    it('should return false for non-arrays', () => {
      expect(isArrayOfStrings({})).toBe(false);
      expect(isArrayOfStrings('string')).toBe(false);
    });
  });

  describe('isArrayOfObjects', () => {
    it('should return true for arrays of objects', () => {
      expect(isArrayOfObjects([])).toBe(true);
      expect(isArrayOfObjects([{}])).toBe(true);
      expect(isArrayOfObjects([{ a: 1 }, { b: 2 }])).toBe(true);
    });

    it('should return false for arrays with non-objects', () => {
      expect(isArrayOfObjects([1, 2, 3])).toBe(false);
      expect(isArrayOfObjects(['a', 'b'])).toBe(false);
      expect(isArrayOfObjects([{}] as unknown[])).toBe(true);
      expect(isArrayOfObjects([{ a: 1 }, 'b'])).toBe(false);
    });

    it('should return false for non-arrays', () => {
      expect(isArrayOfObjects({})).toBe(false);
    });
  });

  describe('isExamplesObject', () => {
    it('should return true for valid examples objects', () => {
      expect(isExamplesObject({})).toBe(true);
      expect(isExamplesObject({ good: ['example'] })).toBe(true);
      expect(isExamplesObject({ bad: ['example'] })).toBe(true);
      expect(isExamplesObject({ good: ['a'], bad: ['b'] })).toBe(true);
    });

    it('should return false for invalid examples objects', () => {
      expect(isExamplesObject({ good: 'string' })).toBe(false);
      expect(isExamplesObject({ bad: 123 })).toBe(false);
      expect(isExamplesObject({ good: ['a'], bad: 123 })).toBe(false);
      expect(isExamplesObject({ invalid: ['a'] })).toBe(true); // Extra keys allowed
    });

    it('should return false for non-objects', () => {
      expect(isExamplesObject([])).toBe(false);
      expect(isExamplesObject('string')).toBe(false);
    });
  });
});

describe('Parameter Helpers', () => {
  describe('getParam', () => {
    it('should return value when present and valid', () => {
      const params = { name: 'test', age: 25 };
      expect(getParam(params, 'name', isString)).toBe('test');
      expect(getParam(params, 'age', isNumber)).toBe(25);
    });

    it('should return default value when missing', () => {
      const params = { name: 'test' };
      expect(getParam(params, 'age', isNumber, 0)).toBe(0);
    });

    it('should throw when missing and no default', () => {
      const params = { name: 'test' };
      expect(() => getParam(params, 'age', isNumber)).toThrow("Parameter 'age' is required");
    });

    it('should throw when type is invalid', () => {
      const params = { age: 'not-a-number' };
      expect(() => getParam(params, 'age', isNumber)).toThrow("Parameter 'age' has invalid type");
    });
  });

  describe('getRequiredParam', () => {
    it('should return value when present and valid', () => {
      const params = { name: 'test' };
      expect(getRequiredParam(params, 'name', isString)).toBe('test');
    });

    it('should throw with default error when missing', () => {
      const params = {};
      expect(() => getRequiredParam(params, 'name', isString)).toThrow('name is required');
    });

    it('should throw with custom error when provided', () => {
      const params = {};
      expect(() => getRequiredParam(params, 'name', isString, 'Custom error')).toThrow(
        'Custom error'
      );
    });

    it('should throw when type is invalid', () => {
      const params = { name: 123 };
      expect(() => getRequiredParam(params, 'name', isString)).toThrow('name has invalid type');
    });
  });

  describe('getOptionalParam', () => {
    it('should return value when present and valid', () => {
      const params = { name: 'test' };
      expect(getOptionalParam(params, 'name', isString)).toBe('test');
    });

    it('should return undefined when missing', () => {
      const params = {};
      expect(getOptionalParam(params, 'name', isString)).toBeUndefined();
    });

    it('should throw when type is invalid', () => {
      const params = { name: 123 };
      expect(() => getOptionalParam(params, 'name', isString)).toThrow(
        "Parameter 'name' has invalid type"
      );
    });
  });

  describe('validateParams', () => {
    const validator = (
      params: Record<string, unknown>
    ): params is { name: string; age: number } => {
      return isString(params.name) && isNumber(params.age);
    };

    it('should return validated params when valid', () => {
      const params = { name: 'test', age: 25 };
      const result = validateParams(params, validator);
      expect(result).toEqual(params);
      expect(result.name).toBe('test');
      expect(result.age).toBe(25);
    });

    it('should throw when validation fails', () => {
      const params = { name: 'test', age: 'invalid' };
      expect(() => validateParams(params, validator)).toThrow('Parameter validation failed');
    });
  });
});



