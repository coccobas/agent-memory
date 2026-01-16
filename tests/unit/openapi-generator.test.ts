/**
 * OpenAPI Generator Tests
 */

import { describe, it, expect } from 'vitest';
import { generateOpenAPISpec } from '../../src/restapi/openapi/generator.js';
import {
  paramSchemaToOpenAPI,
  paramSchemasToProperties,
  descriptorToOpenAPIPath,
} from '../../src/restapi/openapi/schema-converter.js';
import type { ParamSchema, ParamSchemas, ToolDescriptor } from '../../src/mcp/descriptors/types.js';

describe('OpenAPI Schema Converter', () => {
  describe('paramSchemaToOpenAPI', () => {
    it('should convert basic string schema', () => {
      const schema: ParamSchema = {
        type: 'string',
        description: 'A test string',
      };

      const result = paramSchemaToOpenAPI(schema);

      expect(result).toEqual({
        type: 'string',
        description: 'A test string',
      });
    });

    it('should convert schema with enum', () => {
      const schema: ParamSchema = {
        type: 'string',
        enum: ['option1', 'option2'],
        description: 'Choice field',
      };

      const result = paramSchemaToOpenAPI(schema);

      expect(result).toEqual({
        type: 'string',
        enum: ['option1', 'option2'],
        description: 'Choice field',
      });
    });

    it('should convert array schema', () => {
      const schema: ParamSchema = {
        type: 'array',
        items: { type: 'string' },
        description: 'String array',
      };

      const result = paramSchemaToOpenAPI(schema);

      expect(result).toEqual({
        type: 'array',
        items: { type: 'string' },
        description: 'String array',
      });
    });

    it('should convert object schema with properties', () => {
      const schema: ParamSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name field' },
          age: { type: 'number', description: 'Age field' },
        },
        required: ['name'],
      };

      const result = paramSchemaToOpenAPI(schema);

      expect(result).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name field' },
          age: { type: 'number', description: 'Age field' },
        },
        required: ['name'],
      });
    });

    it('should convert schema with default value', () => {
      const schema: ParamSchema = {
        type: 'number',
        default: 42,
        description: 'Number with default',
      };

      const result = paramSchemaToOpenAPI(schema);

      expect(result).toEqual({
        type: 'number',
        default: 42,
        description: 'Number with default',
      });
    });
  });

  describe('paramSchemasToProperties', () => {
    it('should convert multiple param schemas', () => {
      const schemas: ParamSchemas = {
        name: { type: 'string', description: 'Name' },
        count: { type: 'number', description: 'Count' },
        active: { type: 'boolean', description: 'Is active' },
      };

      const result = paramSchemasToProperties(schemas);

      expect(result).toEqual({
        name: { type: 'string', description: 'Name' },
        count: { type: 'number', description: 'Count' },
        active: { type: 'boolean', description: 'Is active' },
      });
    });
  });

  describe('descriptorToOpenAPIPath', () => {
    it('should convert action-based descriptor', () => {
      const descriptor: ToolDescriptor = {
        name: 'test_tool',
        description: 'A test tool\nWith multiple lines',
        commonParams: {
          id: { type: 'string', description: 'ID' },
        },
        actions: {
          get: {
            params: {
              includeDeleted: { type: 'boolean', description: 'Include deleted' },
            },
          },
          list: {
            params: {
              limit: { type: 'number', description: 'Max results' },
            },
          },
        },
      };

      const result = descriptorToOpenAPIPath(descriptor);

      expect(result.path).toBe('/v1/tools/test_tool');
      expect(result.pathItem.post).toBeDefined();
      expect(result.pathItem.post?.summary).toBe('A test tool');
      expect(result.pathItem.post?.operationId).toBe('test_tool');
      expect(
        result.pathItem.post?.requestBody?.content['application/json'].schema.properties
      ).toHaveProperty('action');
      expect(
        result.pathItem.post?.requestBody?.content['application/json'].schema.properties?.action
      ).toEqual({
        type: 'string',
        enum: ['get', 'list'],
        description: 'Action to perform',
      });
    });

    it('should include all params from common and actions', () => {
      const descriptor: ToolDescriptor = {
        name: 'test_tool',
        description: 'Test',
        commonParams: {
          common1: { type: 'string' },
        },
        actions: {
          action1: {
            params: {
              specific1: { type: 'number' },
            },
          },
          action2: {
            params: {
              specific2: { type: 'boolean' },
            },
          },
        },
      };

      const result = descriptorToOpenAPIPath(descriptor);

      const props =
        result.pathItem.post?.requestBody?.content['application/json'].schema.properties;
      expect(props).toHaveProperty('common1');
      expect(props).toHaveProperty('specific1');
      expect(props).toHaveProperty('specific2');
      expect(props).toHaveProperty('action');
    });

    it('should include required fields', () => {
      const descriptor: ToolDescriptor = {
        name: 'test_tool',
        description: 'Test',
        required: ['id'],
        commonParams: {
          id: { type: 'string' },
        },
        actions: {
          get: {},
        },
      };

      const result = descriptorToOpenAPIPath(descriptor);

      const required =
        result.pathItem.post?.requestBody?.content['application/json'].schema.required;
      expect(required).toContain('action');
      expect(required).toContain('id');
    });

    it('should add security requirements', () => {
      const descriptor: ToolDescriptor = {
        name: 'test_tool',
        description: 'Test',
        actions: {
          get: {},
        },
      };

      const result = descriptorToOpenAPIPath(descriptor);

      expect(result.pathItem.post?.security).toEqual([{ bearerAuth: [] }, { apiKey: [] }]);
    });

    it('should include standard error responses', () => {
      const descriptor: ToolDescriptor = {
        name: 'test_tool',
        description: 'Test',
        actions: {
          get: {},
        },
      };

      const result = descriptorToOpenAPIPath(descriptor);

      const responses = result.pathItem.post?.responses;
      expect(responses).toHaveProperty('200');
      expect(responses).toHaveProperty('400');
      expect(responses).toHaveProperty('401');
      expect(responses).toHaveProperty('403');
      expect(responses).toHaveProperty('404');
      expect(responses).toHaveProperty('429');
    });
  });
});

describe('OpenAPI Spec Generator', () => {
  describe('generateOpenAPISpec', () => {
    it('should generate valid OpenAPI 3.0 spec', () => {
      const spec = generateOpenAPISpec();

      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info).toBeDefined();
      expect(spec.info.title).toBe('Agent Memory REST API');
      expect(spec.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should include server configuration', () => {
      const spec = generateOpenAPISpec();

      expect(spec.servers).toBeDefined();
      expect(spec.servers.length).toBeGreaterThan(0);
      expect(spec.servers[0].url).toBe('http://localhost:3100');
    });

    it('should include security schemes', () => {
      const spec = generateOpenAPISpec();

      expect(spec.components.securitySchemes).toBeDefined();
      expect(spec.components.securitySchemes.bearerAuth).toEqual({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      });
      expect(spec.components.securitySchemes.apiKey).toEqual({
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      });
    });

    it('should include list tools endpoint', () => {
      const spec = generateOpenAPISpec();

      expect(spec.paths['/v1/tools']).toBeDefined();
      expect(spec.paths['/v1/tools'].get).toBeDefined();
      expect(spec.paths['/v1/tools'].get?.operationId).toBe('listTools');
    });

    it('should include OpenAPI spec endpoint', () => {
      const spec = generateOpenAPISpec();

      expect(spec.paths['/v1/openapi.json']).toBeDefined();
      expect(spec.paths['/v1/openapi.json'].get).toBeDefined();
      expect(spec.paths['/v1/openapi.json'].get?.operationId).toBe('getOpenAPISpec');
    });

    it('should include paths for all descriptors', () => {
      const spec = generateOpenAPISpec();

      // Should have more paths than just the two meta endpoints
      expect(Object.keys(spec.paths).length).toBeGreaterThan(2);

      // Check for some known tool paths
      expect(spec.paths['/v1/tools/memory_knowledge']).toBeDefined();
      expect(spec.paths['/v1/tools/memory_guideline']).toBeDefined();
      expect(spec.paths['/v1/tools/memory_query']).toBeDefined();
    });

    it('should include tags for grouping', () => {
      const spec = generateOpenAPISpec();

      expect(spec.tags).toBeDefined();
      expect(spec.tags?.length).toBeGreaterThan(0);

      const tagNames = spec.tags?.map((t) => t.name);
      expect(tagNames).toContain('knowledge');
      expect(tagNames).toContain('guideline');
      expect(tagNames).toContain('query');
    });

    it('should have proper contact and license info', () => {
      const spec = generateOpenAPISpec();

      expect(spec.info.contact).toBeDefined();
      expect(spec.info.contact?.url).toContain('github.com');

      expect(spec.info.license).toBeDefined();
      expect(spec.info.license?.name).toBe('MIT');
    });
  });
});
