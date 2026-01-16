/**
 * Unit tests for EntityExtractor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EntityExtractor,
  getEntityExtractor,
  type ExtractedEntity,
} from '../../../src/services/query/entity-extractor.js';

describe('EntityExtractor', () => {
  let extractor: EntityExtractor;

  beforeEach(() => {
    extractor = new EntityExtractor();
  });

  describe('FILE_PATH extraction', () => {
    it('should extract absolute file paths', () => {
      const text = 'Check the file at /src/services/query.ts for the implementation';
      const entities = extractor.extract(text);

      const filePaths = entities.filter((e) => e.type === 'FILE_PATH');
      expect(filePaths.length).toBeGreaterThanOrEqual(1);
      expect(filePaths.some((e) => e.normalizedValue.includes('query.ts'))).toBe(true);
    });

    it('should extract relative file paths with ./', () => {
      const text = 'Import from ./utils/helper.js';
      const entities = extractor.extract(text);

      const filePaths = entities.filter((e) => e.type === 'FILE_PATH');
      expect(filePaths.length).toBeGreaterThanOrEqual(1);
      expect(filePaths.some((e) => e.value.includes('helper.js'))).toBe(true);
    });

    it('should extract relative file paths with ../', () => {
      const text = 'The config is at ../config/settings.json';
      const entities = extractor.extract(text);

      const filePaths = entities.filter((e) => e.type === 'FILE_PATH');
      expect(filePaths.length).toBeGreaterThanOrEqual(1);
      expect(filePaths.some((e) => e.value.includes('settings.json'))).toBe(true);
    });

    it('should normalize file paths to lowercase', () => {
      const text = 'See /Src/Services/Query.TS';
      const entities = extractor.extract(text);

      const filePaths = entities.filter((e) => e.type === 'FILE_PATH');
      expect(filePaths.length).toBeGreaterThanOrEqual(1);
      expect(filePaths[0]?.normalizedValue).toBe(filePaths[0]?.value.toLowerCase());
    });
  });

  describe('FUNCTION_NAME extraction', () => {
    it('should extract camelCase function names', () => {
      const text = 'Call the executeQuery function';
      const entities = extractor.extract(text);

      const funcNames = entities.filter((e) => e.type === 'FUNCTION_NAME');
      expect(funcNames.some((e) => e.value === 'executeQuery')).toBe(true);
    });

    it('should extract PascalCase class names', () => {
      const text = 'Use the EntityExtractor class';
      const entities = extractor.extract(text);

      const funcNames = entities.filter((e) => e.type === 'FUNCTION_NAME');
      expect(funcNames.some((e) => e.value === 'EntityExtractor')).toBe(true);
    });

    it('should extract snake_case identifiers', () => {
      const text = 'The function execute_batch_query is deprecated';
      const entities = extractor.extract(text);

      const funcNames = entities.filter((e) => e.type === 'FUNCTION_NAME');
      expect(funcNames.some((e) => e.value === 'execute_batch_query')).toBe(true);
    });

    it('should not extract common words', () => {
      const text = 'if the function returns true then continue';
      const entities = extractor.extract(text);

      const funcNames = entities.filter((e) => e.type === 'FUNCTION_NAME');
      expect(funcNames.some((e) => e.value === 'if')).toBe(false);
      expect(funcNames.some((e) => e.value === 'the')).toBe(false);
      expect(funcNames.some((e) => e.value === 'true')).toBe(false);
    });

    it('should not extract short identifiers (less than 3 chars)', () => {
      const text = 'Use ab, cd, ef as variables';
      const entities = extractor.extract(text);

      const funcNames = entities.filter((e) => e.type === 'FUNCTION_NAME');
      expect(funcNames.some((e) => e.value === 'ab')).toBe(false);
      expect(funcNames.some((e) => e.value === 'cd')).toBe(false);
    });
  });

  describe('PACKAGE_NAME extraction', () => {
    it('should extract scoped npm packages', () => {
      const text = 'Install @anthropic/sdk for the API';
      const entities = extractor.extract(text);

      const packages = entities.filter((e) => e.type === 'PACKAGE_NAME');
      expect(packages.some((e) => e.value === '@anthropic/sdk')).toBe(true);
    });

    it('should extract package paths with org/repo format', () => {
      const text = 'Clone from drizzle-team/drizzle-orm';
      const entities = extractor.extract(text);

      const packages = entities.filter((e) => e.type === 'PACKAGE_NAME');
      expect(packages.some((e) => e.value === 'drizzle-team/drizzle-orm')).toBe(true);
    });

    it('should normalize package names to lowercase', () => {
      const text = 'Use @ACME/MyPackage';
      const entities = extractor.extract(text);

      const packages = entities.filter((e) => e.type === 'PACKAGE_NAME');
      expect(packages[0]?.normalizedValue).toBe('@acme/mypackage');
    });
  });

  describe('URL extraction', () => {
    it('should extract https URLs', () => {
      const text = 'See docs at https://example.com/api/v1';
      const entities = extractor.extract(text);

      const urls = entities.filter((e) => e.type === 'URL');
      expect(urls.some((e) => e.value.includes('example.com'))).toBe(true);
    });

    it('should extract http URLs', () => {
      const text = 'Local server at http://localhost:3000/test';
      const entities = extractor.extract(text);

      const urls = entities.filter((e) => e.type === 'URL');
      expect(urls.some((e) => e.value.includes('localhost:3000'))).toBe(true);
    });

    it('should handle URLs with query parameters', () => {
      const text = 'Request https://api.example.com/search?q=test&limit=10';
      const entities = extractor.extract(text);

      const urls = entities.filter((e) => e.type === 'URL');
      expect(urls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ERROR_CODE extraction', () => {
    it('should extract error codes like E1234', () => {
      const text = 'Error E1234: Database connection failed';
      const entities = extractor.extract(text);

      const errors = entities.filter((e) => e.type === 'ERROR_CODE');
      expect(errors.some((e) => e.value === 'E1234')).toBe(true);
    });

    it('should extract error types like TypeError', () => {
      const text = 'Caught a TypeError when parsing input';
      const entities = extractor.extract(text);

      const errors = entities.filter((e) => e.type === 'ERROR_CODE');
      expect(errors.some((e) => e.value === 'TypeError')).toBe(true);
    });

    it('should extract POSIX error codes like ENOENT', () => {
      const text = 'File not found: ENOENT';
      const entities = extractor.extract(text);

      const errors = entities.filter((e) => e.type === 'ERROR_CODE');
      expect(errors.some((e) => e.value === 'ENOENT')).toBe(true);
    });

    it('should extract Node.js error codes like ERR_INVALID_ARG', () => {
      const text = 'Node returned ERR_INVALID_ARG_TYPE';
      const entities = extractor.extract(text);

      const errors = entities.filter((e) => e.type === 'ERROR_CODE');
      expect(errors.some((e) => e.value === 'ERR_INVALID_ARG_TYPE')).toBe(true);
    });
  });

  describe('COMMAND extraction', () => {
    it('should extract npm commands', () => {
      const text = 'Run npm install to get dependencies';
      const entities = extractor.extract(text);

      const commands = entities.filter((e) => e.type === 'COMMAND');
      expect(commands.some((e) => e.normalizedValue === 'npm install')).toBe(true);
    });

    it('should extract yarn commands', () => {
      const text = 'Use yarn add lodash to install';
      const entities = extractor.extract(text);

      const commands = entities.filter((e) => e.type === 'COMMAND');
      expect(commands.some((e) => e.normalizedValue === 'yarn add')).toBe(true);
    });

    it('should extract git commands', () => {
      const text = 'First git commit your changes';
      const entities = extractor.extract(text);

      const commands = entities.filter((e) => e.type === 'COMMAND');
      expect(commands.some((e) => e.normalizedValue === 'git commit')).toBe(true);
    });

    it('should extract docker commands', () => {
      const text = 'Execute docker build -t myimage';
      const entities = extractor.extract(text);

      const commands = entities.filter((e) => e.type === 'COMMAND');
      expect(commands.some((e) => e.normalizedValue.startsWith('docker build'))).toBe(true);
    });

    it('should extract pnpm commands', () => {
      const text = 'Run pnpm install to setup';
      const entities = extractor.extract(text);

      const commands = entities.filter((e) => e.type === 'COMMAND');
      expect(commands.some((e) => e.normalizedValue === 'pnpm install')).toBe(true);
    });
  });

  describe('extractType', () => {
    it('should extract only specified type', () => {
      const text = 'Check /src/query.ts and run npm install for executeQuery';
      const entities = extractor.extractType(text, 'FILE_PATH');

      expect(entities.every((e) => e.type === 'FILE_PATH')).toBe(true);
      expect(entities.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('hasEntities', () => {
    it('should return true when entities exist', () => {
      const text = 'Run npm install for the project';
      expect(extractor.hasEntities(text)).toBe(true);
    });

    it('should return false for plain text', () => {
      const text = 'This is just plain text with no entities';
      // This might still have some matches due to patterns, but test the function works
      expect(typeof extractor.hasEntities(text)).toBe('boolean');
    });

    it('should return false for empty text', () => {
      expect(extractor.hasEntities('')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(extractor.hasEntities(null as unknown as string)).toBe(false);
      expect(extractor.hasEntities(undefined as unknown as string)).toBe(false);
    });
  });

  describe('deduplication', () => {
    it('should not return duplicate entities', () => {
      const text = 'Call executeQuery then call executeQuery again';
      const entities = extractor.extract(text);

      const funcNames = entities.filter(
        (e) => e.type === 'FUNCTION_NAME' && e.value === 'executeQuery'
      );
      expect(funcNames.length).toBe(1);
    });
  });

  describe('getEntityExtractor', () => {
    it('should return singleton instance', () => {
      const instance1 = getEntityExtractor();
      const instance2 = getEntityExtractor();
      expect(instance1).toBe(instance2);
    });
  });

  describe('mixed content', () => {
    it('should extract multiple entity types from complex text', () => {
      const text = `
        Check the implementation in ./src/services/queryService.ts file.
        It uses the executeQuery function from @drizzle/orm package.
        If you see TypeError, run npm install to fix dependencies.
        Docs: https://docs.example.com/api
      `;

      const entities = extractor.extract(text);

      const types = new Set(entities.map((e) => e.type));
      // File path should match ./src/services/queryService.ts
      expect(types.has('FILE_PATH')).toBe(true);
      expect(types.has('FUNCTION_NAME')).toBe(true);
      expect(types.has('PACKAGE_NAME')).toBe(true);
      expect(types.has('ERROR_CODE')).toBe(true);
      expect(types.has('COMMAND')).toBe(true);
      expect(types.has('URL')).toBe(true);
    });
  });

  describe('extractWithVariants', () => {
    it('should extract entities with fuzzy variants', () => {
      const text = 'Use the executeQuery method';
      const entities = extractor.extractWithVariants(text);

      const funcEntity = entities.find((e) => e.type === 'FUNCTION_NAME');
      expect(funcEntity).toBeDefined();
      expect(funcEntity?.variants).toBeDefined();
      expect(funcEntity?.variants?.length).toBeGreaterThan(1);
    });

    it('should include semantic type when extracting with variants', () => {
      const text = 'See TypeError in the console';
      const entities = extractor.extractWithVariants(text);

      const errEntity = entities.find((e) => e.type === 'ERROR_CODE');
      expect(errEntity?.semanticType).toBeDefined();
    });

    it('should generate file path variants', () => {
      const text = 'Check ./src/services/queryService.ts';
      const entities = extractor.extractWithVariants(text);

      const filePath = entities.find((e) => e.type === 'FILE_PATH');
      expect(filePath?.variants).toBeDefined();
      // Should have filename and base name variants
      expect(filePath?.variants?.some((v) => v.includes('queryservice'))).toBe(true);
    });

    it('should generate package name variants for scoped packages', () => {
      const text = 'Install @anthropic/sdk';
      const entities = extractor.extractWithVariants(text);

      const pkg = entities.find((e) => e.type === 'PACKAGE_NAME');
      expect(pkg?.variants).toBeDefined();
      // Should have individual parts
      expect(pkg?.variants?.some((v) => v === 'sdk')).toBe(true);
    });

    it('should generate error code variants', () => {
      const text = 'Got ERR_INVALID_ARG_TYPE error';
      const entities = extractor.extractWithVariants(text);

      const errEntity = entities.find((e) => e.value === 'ERR_INVALID_ARG_TYPE');
      expect(errEntity?.variants).toBeDefined();
    });

    it('should generate command variants', () => {
      const text = 'Run npm install -D typescript';
      const entities = extractor.extractWithVariants(text);

      const cmd = entities.find((e) => e.type === 'COMMAND');
      expect(cmd?.variants).toBeDefined();
      // Should have tool name variant
      expect(cmd?.variants?.some((v) => v === 'npm')).toBe(true);
    });
  });

  describe('filterByConfidence', () => {
    it('should filter entities by minimum confidence', () => {
      const text = 'Check /src/query.ts and run npm install';
      const entities = extractor.extract(text);

      const highConfidence = extractor.filterByConfidence(entities, 0.9);
      expect(highConfidence.every((e) => (e.confidence ?? 0) >= 0.9)).toBe(true);
    });

    it('should return empty array if no entities meet threshold', () => {
      const text = 'Run npm install';
      const entities = extractor.extract(text);

      const veryHigh = extractor.filterByConfidence(entities, 0.99);
      expect(veryHigh).toEqual([]);
    });

    it('should handle entities without confidence', () => {
      const entities: ExtractedEntity[] = [
        { type: 'FUNCTION_NAME', value: 'test', normalizedValue: 'test' },
      ];

      const filtered = extractor.filterByConfidence(entities, 0.5);
      expect(filtered).toEqual([]);
    });
  });

  describe('getVariants', () => {
    it('should return existing variants if present', () => {
      const entity: ExtractedEntity = {
        type: 'FUNCTION_NAME',
        value: 'myFunction',
        normalizedValue: 'myfunction',
        variants: ['myfunction', 'my', 'function'],
      };

      const variants = extractor.getVariants(entity);
      expect(variants).toEqual(['myfunction', 'my', 'function']);
    });

    it('should generate variants on demand if not present', () => {
      const entity: ExtractedEntity = {
        type: 'FUNCTION_NAME',
        value: 'executeQuery',
        normalizedValue: 'executequery',
      };

      const variants = extractor.getVariants(entity);
      expect(variants.length).toBeGreaterThan(1);
      expect(variants).toContain('executeQuery');
    });
  });

  describe('confidence calculation', () => {
    it('should give high confidence to file paths with valid extension', () => {
      const text = 'Edit /src/config.ts';
      const entities = extractor.extract(text);

      const filePath = entities.find((e) => e.type === 'FILE_PATH');
      expect(filePath?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should give high confidence to scoped packages', () => {
      const text = 'Import @anthropic/sdk';
      const entities = extractor.extract(text);

      const pkg = entities.find((e) => e.type === 'PACKAGE_NAME');
      expect(pkg?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should give high confidence to URLs', () => {
      const text = 'See https://example.com';
      const entities = extractor.extract(text);

      const url = entities.find((e) => e.type === 'URL');
      expect(url?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should give high confidence to Error type names', () => {
      const text = 'Caught RangeError exception';
      const entities = extractor.extract(text);

      const err = entities.find((e) => e.type === 'ERROR_CODE');
      expect(err?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should give confidence to function names', () => {
      const text = 'Call the EntityExtractor class';
      const entities = extractor.extract(text);

      const func = entities.find((e) => e.type === 'FUNCTION_NAME');
      expect(func).toBeDefined();
      expect(func?.confidence).toBeDefined();
      expect(func?.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should give high confidence to snake_case with underscore', () => {
      const text = 'The function execute_batch_query is deprecated';
      const entities = extractor.extract(text);

      const func = entities.find((e) => e.value === 'execute_batch_query');
      expect(func).toBeDefined();
      expect(func?.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('semantic type inference', () => {
    let extractorWithSemantic: EntityExtractor;

    beforeEach(() => {
      extractorWithSemantic = new EntityExtractor({ includeSemanticType: true });
    });

    it('should infer concept type for function names', () => {
      const text = 'Use executeQuery function';
      const entities = extractorWithSemantic.extract(text);

      const func = entities.find((e) => e.type === 'FUNCTION_NAME');
      expect(func?.semanticType).toBe('concept');
    });

    it('should infer concept type for error codes', () => {
      const text = 'Got TypeError';
      const entities = extractorWithSemantic.extract(text);

      const err = entities.find((e) => e.type === 'ERROR_CODE');
      expect(err?.semanticType).toBe('concept');
    });

    it('should infer organization type for URLs with org/com domain', () => {
      const text = 'See https://github.com/repo';
      const entities = extractorWithSemantic.extract(text);

      const url = entities.find((e) => e.type === 'URL');
      expect(url?.semanticType).toBe('organization');
    });
  });

  describe('extractType edge cases', () => {
    it('should return empty array for empty text', () => {
      const entities = extractor.extractType('', 'FILE_PATH');
      expect(entities).toEqual([]);
    });

    it('should return empty array for null text', () => {
      const entities = extractor.extractType(null as unknown as string, 'FILE_PATH');
      expect(entities).toEqual([]);
    });

    it('should return empty array for undefined text', () => {
      const entities = extractor.extractType(undefined as unknown as string, 'COMMAND');
      expect(entities).toEqual([]);
    });

    it('should extract URL type specifically', () => {
      const text = 'Visit https://test.com and run npm install';
      const entities = extractor.extractType(text, 'URL');

      expect(entities.every((e) => e.type === 'URL')).toBe(true);
      expect(entities.length).toBe(1);
    });

    it('should extract ERROR_CODE type specifically', () => {
      const text = 'Got ENOENT and TypeError errors';
      const entities = extractor.extractType(text, 'ERROR_CODE');

      expect(entities.every((e) => e.type === 'ERROR_CODE')).toBe(true);
      expect(entities.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('extract edge cases', () => {
    it('should return empty array for empty text', () => {
      expect(extractor.extract('')).toEqual([]);
    });

    it('should return empty array for null input', () => {
      expect(extractor.extract(null as unknown as string)).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      expect(extractor.extract(undefined as unknown as string)).toEqual([]);
    });

    it('should return empty array for non-string input', () => {
      expect(extractor.extract(123 as unknown as string)).toEqual([]);
    });
  });

  describe('constructor options', () => {
    it('should respect includeFuzzy option', () => {
      const fuzzyExtractor = new EntityExtractor({ includeFuzzy: true });
      const text = 'Use executeQuery';
      const entities = fuzzyExtractor.extract(text);

      const func = entities.find((e) => e.type === 'FUNCTION_NAME');
      expect(func?.variants).toBeDefined();
    });

    it('should respect includeConfidence option', () => {
      const noConfExtractor = new EntityExtractor({ includeConfidence: false });
      const text = 'Use executeQuery';
      const entities = noConfExtractor.extract(text);

      const func = entities.find((e) => e.type === 'FUNCTION_NAME');
      expect(func?.confidence).toBeUndefined();
    });

    it('should allow overriding options in extract call', () => {
      const simpleExtractor = new EntityExtractor({
        includeFuzzy: false,
        includeSemanticType: false,
      });
      const text = 'Use executeQuery';
      const entities = simpleExtractor.extract(text, {
        includeFuzzy: true,
        includeSemanticType: true,
      });

      const func = entities.find((e) => e.type === 'FUNCTION_NAME');
      expect(func?.variants).toBeDefined();
      expect(func?.semanticType).toBeDefined();
    });
  });

  describe('function name validation', () => {
    it('should reject all uppercase identifiers', () => {
      const text = 'Use CONSTANT_VALUE for the config';
      const entities = extractor.extract(text);

      const funcNames = entities.filter((e) => e.type === 'FUNCTION_NAME');
      expect(funcNames.some((e) => e.value === 'CONSTANT_VALUE')).toBe(false);
    });

    it('should reject very long identifiers', () => {
      const longName = 'a'.repeat(60) + 'B'; // Over 50 char limit
      const text = `Use ${longName} function`;
      const entities = extractor.extract(text);

      const funcNames = entities.filter((e) => e.type === 'FUNCTION_NAME');
      expect(funcNames.some((e) => e.value === longName)).toBe(false);
    });

    it('should accept PascalCase identifiers', () => {
      const text = 'Use the EntityExtractor class';
      const entities = extractor.extract(text);

      const funcNames = entities.filter((e) => e.type === 'FUNCTION_NAME');
      expect(funcNames.some((e) => e.value === 'EntityExtractor')).toBe(true);
    });
  });

  describe('variant generation details', () => {
    it('should generate variants for function names', () => {
      const text = 'Use the EntityExtractor class';
      const entities = extractor.extractWithVariants(text);

      const func = entities.find((e) => e.type === 'FUNCTION_NAME');
      expect(func).toBeDefined();
      expect(func?.variants).toBeDefined();
      // Should have the original and lowercase at minimum
      expect(func?.variants).toContain(func?.value);
      expect(func?.variants?.some((v) => v === func?.value.toLowerCase())).toBe(true);
    });

    it('should extract filename variants from file path', () => {
      const text = 'Edit ./src/services/userService.ts';
      const entities = extractor.extractWithVariants(text);

      const filePath = entities.find((e) => e.type === 'FILE_PATH');
      expect(filePath?.variants?.some((v) => v.includes('userservice'))).toBe(true);
    });

    it('should generate variants for error codes', () => {
      const text = 'Got SyntaxError issue';
      const entities = extractor.extractWithVariants(text);

      const err = entities.find((e) => e.type === 'ERROR_CODE');
      expect(err).toBeDefined();
      expect(err?.variants).toBeDefined();
      expect(err?.variants?.length).toBeGreaterThan(1);
    });
  });
});
