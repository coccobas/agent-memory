/**
 * Unit tests for MCP descriptor types and generators
 */

import { describe, it, expect } from 'vitest';
import {
  isActionBasedDescriptor,
  descriptorToTool,
  descriptorToHandler,
  generateFromDescriptors,
  type ToolDescriptor,
  type SimpleToolDescriptor,
  type ParamSchemas,
} from '../../src/mcp/descriptors/types.js';

describe('MCP Descriptor Types', () => {
  describe('isActionBasedDescriptor', () => {
    it('should return true for ToolDescriptor with actions', () => {
      const descriptor: ToolDescriptor = {
        name: 'test_tool',
        description: 'A test tool',
        actions: {
          create: { handler: () => 'created' },
        },
      };

      expect(isActionBasedDescriptor(descriptor)).toBe(true);
    });

    it('should return false for SimpleToolDescriptor', () => {
      const descriptor: SimpleToolDescriptor = {
        name: 'simple_tool',
        description: 'A simple tool',
        handler: () => 'result',
      };

      expect(isActionBasedDescriptor(descriptor)).toBe(false);
    });
  });

  describe('descriptorToTool', () => {
    it('should generate Tool from SimpleToolDescriptor', () => {
      const descriptor: SimpleToolDescriptor = {
        name: 'simple_tool',
        description: 'A simple tool',
        params: {
          name: { type: 'string', description: 'The name' },
          count: { type: 'number' },
        },
        required: ['name'],
      };

      const tool = descriptorToTool(descriptor);

      expect(tool.name).toBe('simple_tool');
      expect(tool.description).toBe('A simple tool');
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('name');
      expect(tool.inputSchema.properties).toHaveProperty('count');
      expect(tool.inputSchema.required).toEqual(['name']);
    });

    it('should generate Tool from ToolDescriptor with actions', () => {
      const descriptor: ToolDescriptor = {
        name: 'action_tool',
        description: 'Tool with actions',
        commonParams: {
          limit: { type: 'number', description: 'Max results' },
        },
        actions: {
          create: {
            params: { name: { type: 'string', description: 'Name to create' } },
            required: ['name'],
            handler: () => 'created',
          },
          list: {
            handler: () => 'listed',
          },
        },
      };

      const tool = descriptorToTool(descriptor);

      expect(tool.name).toBe('action_tool');
      expect(tool.inputSchema.properties).toHaveProperty('action');
      expect(tool.inputSchema.properties).toHaveProperty('limit');
      expect(tool.inputSchema.properties).toHaveProperty('name');
      expect(tool.inputSchema.required).toContain('action');
    });

    it('should include action enum values', () => {
      const descriptor: ToolDescriptor = {
        name: 'test',
        description: 'Test',
        actions: {
          add: { handler: () => {} },
          remove: { handler: () => {} },
          update: { handler: () => {} },
        },
      };

      const tool = descriptorToTool(descriptor);
      const actionProp = tool.inputSchema.properties?.action as { enum?: string[] };

      expect(actionProp.enum).toEqual(['add', 'remove', 'update']);
    });

    it('should handle params with enum values', () => {
      const descriptor: SimpleToolDescriptor = {
        name: 'test',
        description: 'Test',
        params: {
          type: {
            type: 'string',
            enum: ['a', 'b', 'c'],
            description: 'Type selection',
          },
        },
      };

      const tool = descriptorToTool(descriptor);
      const typeProp = tool.inputSchema.properties?.type as { enum?: string[] };

      expect(typeProp.enum).toEqual(['a', 'b', 'c']);
    });

    it('should handle array params with item types', () => {
      const descriptor: SimpleToolDescriptor = {
        name: 'test',
        description: 'Test',
        params: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of tags',
          },
        },
      };

      const tool = descriptorToTool(descriptor);
      const tagsProp = tool.inputSchema.properties?.tags as { items?: { type: string } };

      expect(tagsProp.items?.type).toBe('string');
    });

    it('should handle array params with enum items', () => {
      const descriptor: SimpleToolDescriptor = {
        name: 'test',
        description: 'Test',
        params: {
          types: {
            type: 'array',
            items: { type: 'string', enum: ['a', 'b'] },
          },
        },
      };

      const tool = descriptorToTool(descriptor);
      const typesProp = tool.inputSchema.properties?.types as { items?: { enum?: string[] } };

      expect(typesProp.items?.enum).toEqual(['a', 'b']);
    });

    it('should handle nested object properties', () => {
      const descriptor: SimpleToolDescriptor = {
        name: 'test',
        description: 'Test',
        params: {
          config: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              name: { type: 'string' },
            },
            required: ['enabled'],
          },
        },
      };

      const tool = descriptorToTool(descriptor);
      const configProp = tool.inputSchema.properties?.config as {
        properties?: Record<string, unknown>;
        required?: string[];
      };

      expect(configProp.properties).toHaveProperty('enabled');
      expect(configProp.properties).toHaveProperty('name');
      expect(configProp.required).toEqual(['enabled']);
    });

    it('should handle descriptor without params', () => {
      const descriptor: SimpleToolDescriptor = {
        name: 'no_params',
        description: 'Tool without params',
      };

      const tool = descriptorToTool(descriptor);

      expect(tool.inputSchema.properties).toEqual({});
      expect(tool.inputSchema.required).toBeUndefined();
    });

    it('should include tool-level required params', () => {
      const descriptor: ToolDescriptor = {
        name: 'test',
        description: 'Test',
        required: ['projectId'],
        actions: {
          get: { handler: () => {} },
        },
      };

      const tool = descriptorToTool(descriptor);

      expect(tool.inputSchema.required).toContain('action');
      expect(tool.inputSchema.required).toContain('projectId');
    });
  });

  describe('descriptorToHandler', () => {
    it('should create handler for SimpleToolDescriptor with legacy handler', () => {
      const descriptor: SimpleToolDescriptor = {
        name: 'test',
        description: 'Test',
        handler: (params: Record<string, unknown>) =>
          `Hello ${params.name as string}`,
      };

      const handler = descriptorToHandler(descriptor);
      const result = handler({} as never, { name: 'World' });

      expect(result).toBe('Hello World');
    });

    it('should create handler for SimpleToolDescriptor with contextHandler', () => {
      const descriptor: SimpleToolDescriptor = {
        name: 'test',
        description: 'Test',
        contextHandler: (ctx, params: Record<string, unknown>) =>
          `Context: ${params.value as string}`,
      };

      const handler = descriptorToHandler(descriptor);
      const result = handler({} as never, { value: 'test' });

      expect(result).toBe('Context: test');
    });

    it('should prefer contextHandler over legacy handler', () => {
      const descriptor: SimpleToolDescriptor = {
        name: 'test',
        description: 'Test',
        handler: () => 'legacy',
        contextHandler: () => 'context',
      };

      const handler = descriptorToHandler(descriptor);
      const result = handler({} as never, {});

      expect(result).toBe('context');
    });

    it('should throw if no handler defined for SimpleToolDescriptor', () => {
      const descriptor: SimpleToolDescriptor = {
        name: 'test',
        description: 'Test',
      };

      const handler = descriptorToHandler(descriptor);

      expect(() => handler({} as never, {})).toThrow('No handler defined for test');
    });

    it('should route actions for ToolDescriptor', () => {
      const descriptor: ToolDescriptor = {
        name: 'test',
        description: 'Test',
        actions: {
          create: { handler: () => 'created' },
          delete: { handler: () => 'deleted' },
        },
      };

      const handler = descriptorToHandler(descriptor);

      expect(handler({} as never, { action: 'create' })).toBe('created');
      expect(handler({} as never, { action: 'delete' })).toBe('deleted');
    });

    it('should throw for invalid action', () => {
      const descriptor: ToolDescriptor = {
        name: 'test',
        description: 'Test',
        actions: {
          create: { handler: () => 'created' },
        },
      };

      const handler = descriptorToHandler(descriptor);

      expect(() => handler({} as never, { action: 'invalid' })).toThrow(
        'Invalid action "invalid" for test'
      );
    });

    it('should include valid actions in error message', () => {
      const descriptor: ToolDescriptor = {
        name: 'test',
        description: 'Test',
        actions: {
          add: { handler: () => {} },
          remove: { handler: () => {} },
        },
      };

      const handler = descriptorToHandler(descriptor);

      try {
        handler({} as never, { action: 'invalid' });
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as Error).message).toContain('add');
        expect((e as Error).message).toContain('remove');
      }
    });

    it('should use contextHandler for actions when available', () => {
      const descriptor: ToolDescriptor = {
        name: 'test',
        description: 'Test',
        actions: {
          get: {
            contextHandler: (ctx, params) => `context: ${JSON.stringify(params)}`,
          },
        },
      };

      const handler = descriptorToHandler(descriptor);
      const result = handler({} as never, { action: 'get', id: '123' });

      expect(result).toBe('context: {"id":"123"}');
    });

    it('should throw if action has no handler', () => {
      const descriptor: ToolDescriptor = {
        name: 'test',
        description: 'Test',
        actions: {
          noHandler: {},
        },
      };

      const handler = descriptorToHandler(descriptor);

      expect(() => handler({} as never, { action: 'noHandler' })).toThrow(
        'No handler defined for action "noHandler"'
      );
    });

    it('should pass remaining params to action handler', () => {
      const descriptor: ToolDescriptor = {
        name: 'test',
        description: 'Test',
        actions: {
          create: {
            handler: (params: Record<string, unknown>) =>
              `name=${params.name}, value=${params.value}`,
          },
        },
      };

      const handler = descriptorToHandler(descriptor);
      const result = handler({} as never, { action: 'create', name: 'test', value: 42 });

      expect(result).toBe('name=test, value=42');
    });
  });

  describe('generateFromDescriptors', () => {
    it('should generate tools and handlers from multiple descriptors', () => {
      const descriptors = [
        {
          name: 'tool1',
          description: 'First tool',
          handler: () => 'tool1 result',
        } as SimpleToolDescriptor,
        {
          name: 'tool2',
          description: 'Second tool',
          actions: {
            do: { handler: () => 'tool2 do' },
          },
        } as ToolDescriptor,
      ];

      const { tools, handlers } = generateFromDescriptors(descriptors);

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('tool1');
      expect(tools[1].name).toBe('tool2');

      expect(handlers).toHaveProperty('tool1');
      expect(handlers).toHaveProperty('tool2');

      expect(handlers.tool1({} as never, {})).toBe('tool1 result');
      expect(handlers.tool2({} as never, { action: 'do' })).toBe('tool2 do');
    });

    it('should return empty arrays for empty input', () => {
      const { tools, handlers } = generateFromDescriptors([]);

      expect(tools).toEqual([]);
      expect(handlers).toEqual({});
    });
  });

  describe('ParamSchemas edge cases', () => {
    it('should handle complex nested structures', () => {
      const params: ParamSchemas = {
        complex: {
          type: 'object',
          properties: {
            nested: {
              type: 'object',
              properties: {
                deep: { type: 'string' },
              },
            },
            list: {
              type: 'array',
              items: { type: 'number' },
            },
          },
        },
      };

      const descriptor: SimpleToolDescriptor = {
        name: 'complex',
        description: 'Complex params',
        params,
      };

      const tool = descriptorToTool(descriptor);

      expect(tool.inputSchema.properties).toHaveProperty('complex');
    });

    it('should preserve descriptions', () => {
      const descriptor: SimpleToolDescriptor = {
        name: 'test',
        description: 'Main description',
        params: {
          field: {
            type: 'string',
            description: 'Field description',
          },
        },
      };

      const tool = descriptorToTool(descriptor);
      const fieldProp = tool.inputSchema.properties?.field as { description?: string };

      expect(fieldProp.description).toBe('Field description');
    });
  });
});
