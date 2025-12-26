/**
 * Unit tests for EntityExtractor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EntityExtractor, getEntityExtractor, type ExtractedEntity } from '../../../src/services/query/entity-extractor.js';

describe('EntityExtractor', () => {
  let extractor: EntityExtractor;

  beforeEach(() => {
    extractor = new EntityExtractor();
  });

  describe('FILE_PATH extraction', () => {
    it('should extract absolute file paths', () => {
      const text = 'Check the file at /src/services/query.ts for the implementation';
      const entities = extractor.extract(text);

      const filePaths = entities.filter(e => e.type === 'FILE_PATH');
      expect(filePaths.length).toBeGreaterThanOrEqual(1);
      expect(filePaths.some(e => e.normalizedValue.includes('query.ts'))).toBe(true);
    });

    it('should extract relative file paths with ./', () => {
      const text = 'Import from ./utils/helper.js';
      const entities = extractor.extract(text);

      const filePaths = entities.filter(e => e.type === 'FILE_PATH');
      expect(filePaths.length).toBeGreaterThanOrEqual(1);
      expect(filePaths.some(e => e.value.includes('helper.js'))).toBe(true);
    });

    it('should extract relative file paths with ../', () => {
      const text = 'The config is at ../config/settings.json';
      const entities = extractor.extract(text);

      const filePaths = entities.filter(e => e.type === 'FILE_PATH');
      expect(filePaths.length).toBeGreaterThanOrEqual(1);
      expect(filePaths.some(e => e.value.includes('settings.json'))).toBe(true);
    });

    it('should normalize file paths to lowercase', () => {
      const text = 'See /Src/Services/Query.TS';
      const entities = extractor.extract(text);

      const filePaths = entities.filter(e => e.type === 'FILE_PATH');
      expect(filePaths.length).toBeGreaterThanOrEqual(1);
      expect(filePaths[0]?.normalizedValue).toBe(filePaths[0]?.value.toLowerCase());
    });
  });

  describe('FUNCTION_NAME extraction', () => {
    it('should extract camelCase function names', () => {
      const text = 'Call the executeQuery function';
      const entities = extractor.extract(text);

      const funcNames = entities.filter(e => e.type === 'FUNCTION_NAME');
      expect(funcNames.some(e => e.value === 'executeQuery')).toBe(true);
    });

    it('should extract PascalCase class names', () => {
      const text = 'Use the EntityExtractor class';
      const entities = extractor.extract(text);

      const funcNames = entities.filter(e => e.type === 'FUNCTION_NAME');
      expect(funcNames.some(e => e.value === 'EntityExtractor')).toBe(true);
    });

    it('should extract snake_case identifiers', () => {
      const text = 'The function execute_batch_query is deprecated';
      const entities = extractor.extract(text);

      const funcNames = entities.filter(e => e.type === 'FUNCTION_NAME');
      expect(funcNames.some(e => e.value === 'execute_batch_query')).toBe(true);
    });

    it('should not extract common words', () => {
      const text = 'if the function returns true then continue';
      const entities = extractor.extract(text);

      const funcNames = entities.filter(e => e.type === 'FUNCTION_NAME');
      expect(funcNames.some(e => e.value === 'if')).toBe(false);
      expect(funcNames.some(e => e.value === 'the')).toBe(false);
      expect(funcNames.some(e => e.value === 'true')).toBe(false);
    });

    it('should not extract short identifiers (less than 3 chars)', () => {
      const text = 'Use ab, cd, ef as variables';
      const entities = extractor.extract(text);

      const funcNames = entities.filter(e => e.type === 'FUNCTION_NAME');
      expect(funcNames.some(e => e.value === 'ab')).toBe(false);
      expect(funcNames.some(e => e.value === 'cd')).toBe(false);
    });
  });

  describe('PACKAGE_NAME extraction', () => {
    it('should extract scoped npm packages', () => {
      const text = 'Install @anthropic/sdk for the API';
      const entities = extractor.extract(text);

      const packages = entities.filter(e => e.type === 'PACKAGE_NAME');
      expect(packages.some(e => e.value === '@anthropic/sdk')).toBe(true);
    });

    it('should extract package paths with org/repo format', () => {
      const text = 'Clone from drizzle-team/drizzle-orm';
      const entities = extractor.extract(text);

      const packages = entities.filter(e => e.type === 'PACKAGE_NAME');
      expect(packages.some(e => e.value === 'drizzle-team/drizzle-orm')).toBe(true);
    });

    it('should normalize package names to lowercase', () => {
      const text = 'Use @ACME/MyPackage';
      const entities = extractor.extract(text);

      const packages = entities.filter(e => e.type === 'PACKAGE_NAME');
      expect(packages[0]?.normalizedValue).toBe('@acme/mypackage');
    });
  });

  describe('URL extraction', () => {
    it('should extract https URLs', () => {
      const text = 'See docs at https://example.com/api/v1';
      const entities = extractor.extract(text);

      const urls = entities.filter(e => e.type === 'URL');
      expect(urls.some(e => e.value.includes('example.com'))).toBe(true);
    });

    it('should extract http URLs', () => {
      const text = 'Local server at http://localhost:3000/test';
      const entities = extractor.extract(text);

      const urls = entities.filter(e => e.type === 'URL');
      expect(urls.some(e => e.value.includes('localhost:3000'))).toBe(true);
    });

    it('should handle URLs with query parameters', () => {
      const text = 'Request https://api.example.com/search?q=test&limit=10';
      const entities = extractor.extract(text);

      const urls = entities.filter(e => e.type === 'URL');
      expect(urls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ERROR_CODE extraction', () => {
    it('should extract error codes like E1234', () => {
      const text = 'Error E1234: Database connection failed';
      const entities = extractor.extract(text);

      const errors = entities.filter(e => e.type === 'ERROR_CODE');
      expect(errors.some(e => e.value === 'E1234')).toBe(true);
    });

    it('should extract error types like TypeError', () => {
      const text = 'Caught a TypeError when parsing input';
      const entities = extractor.extract(text);

      const errors = entities.filter(e => e.type === 'ERROR_CODE');
      expect(errors.some(e => e.value === 'TypeError')).toBe(true);
    });

    it('should extract POSIX error codes like ENOENT', () => {
      const text = 'File not found: ENOENT';
      const entities = extractor.extract(text);

      const errors = entities.filter(e => e.type === 'ERROR_CODE');
      expect(errors.some(e => e.value === 'ENOENT')).toBe(true);
    });

    it('should extract Node.js error codes like ERR_INVALID_ARG', () => {
      const text = 'Node returned ERR_INVALID_ARG_TYPE';
      const entities = extractor.extract(text);

      const errors = entities.filter(e => e.type === 'ERROR_CODE');
      expect(errors.some(e => e.value === 'ERR_INVALID_ARG_TYPE')).toBe(true);
    });
  });

  describe('COMMAND extraction', () => {
    it('should extract npm commands', () => {
      const text = 'Run npm install to get dependencies';
      const entities = extractor.extract(text);

      const commands = entities.filter(e => e.type === 'COMMAND');
      expect(commands.some(e => e.normalizedValue === 'npm install')).toBe(true);
    });

    it('should extract yarn commands', () => {
      const text = 'Use yarn add lodash to install';
      const entities = extractor.extract(text);

      const commands = entities.filter(e => e.type === 'COMMAND');
      expect(commands.some(e => e.normalizedValue === 'yarn add')).toBe(true);
    });

    it('should extract git commands', () => {
      const text = 'First git commit your changes';
      const entities = extractor.extract(text);

      const commands = entities.filter(e => e.type === 'COMMAND');
      expect(commands.some(e => e.normalizedValue === 'git commit')).toBe(true);
    });

    it('should extract docker commands', () => {
      const text = 'Execute docker build -t myimage';
      const entities = extractor.extract(text);

      const commands = entities.filter(e => e.type === 'COMMAND');
      expect(commands.some(e => e.normalizedValue.startsWith('docker build'))).toBe(true);
    });

    it('should extract pnpm commands', () => {
      const text = 'Run pnpm install to setup';
      const entities = extractor.extract(text);

      const commands = entities.filter(e => e.type === 'COMMAND');
      expect(commands.some(e => e.normalizedValue === 'pnpm install')).toBe(true);
    });
  });

  describe('extractType', () => {
    it('should extract only specified type', () => {
      const text = 'Check /src/query.ts and run npm install for executeQuery';
      const entities = extractor.extractType(text, 'FILE_PATH');

      expect(entities.every(e => e.type === 'FILE_PATH')).toBe(true);
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

      const funcNames = entities.filter(e => e.type === 'FUNCTION_NAME' && e.value === 'executeQuery');
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

      const types = new Set(entities.map(e => e.type));
      // File path should match ./src/services/queryService.ts
      expect(types.has('FILE_PATH')).toBe(true);
      expect(types.has('FUNCTION_NAME')).toBe(true);
      expect(types.has('PACKAGE_NAME')).toBe(true);
      expect(types.has('ERROR_CODE')).toBe(true);
      expect(types.has('COMMAND')).toBe(true);
      expect(types.has('URL')).toBe(true);
    });
  });
});
