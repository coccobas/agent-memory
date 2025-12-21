/**
 * Unified Tool Descriptor System
 *
 * Provides a single source of truth for MCP tool definitions.
 * Each descriptor defines:
 * - Tool metadata (name, description)
 * - Action schemas (params with JSONSchema types)
 * - Action handlers (functions to execute)
 *
 * Generators produce:
 * - TOOLS array for MCP ListToolsRequest
 * - bundledHandlers for dispatch routing
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// PARAM SCHEMA TYPES
// =============================================================================

/**
 * JSON Schema type definitions for tool parameters
 */
export type JsonSchemaType = 'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * Parameter definition with JSONSchema properties
 */
export interface ParamSchema {
  type: JsonSchemaType;
  description?: string;
  enum?: readonly string[];
  items?: ParamSchema | { type: JsonSchemaType; enum?: readonly string[] };
  properties?: Record<string, ParamSchema>;
  required?: readonly string[];
  default?: unknown;
}

/**
 * Collection of parameter schemas keyed by param name
 */
export type ParamSchemas = Record<string, ParamSchema>;

// =============================================================================
// ACTION HANDLER TYPES
// =============================================================================

/**
 * Generic action handler function type
 * Handlers receive params (without 'action') and return a result
 */
export type ActionHandler<TParams = Record<string, unknown>, TResult = unknown> = (
  params: TParams
) => TResult | Promise<TResult>;

// =============================================================================
// ACTION DESCRIPTOR
// =============================================================================

/**
 * Describes a single action within a tool
 */
export interface ActionDescriptor<TParams = Record<string, unknown>> {
  /**
   * Parameter schemas for this action
   * These are merged with common params in the tool descriptor
   */
  params?: ParamSchemas;

  /**
   * Required params specific to this action
   */
  required?: readonly string[];

  /**
   * Handler function for this action
   */
  handler: ActionHandler<TParams>;
}

// =============================================================================
// TOOL DESCRIPTOR
// =============================================================================

/**
 * Complete descriptor for a bundled MCP tool
 *
 * @example
 * ```typescript
 * const memoryOrgDescriptor: ToolDescriptor = {
 *   name: 'memory_org',
 *   description: 'Manage organizations. Actions: create, list',
 *   commonParams: {
 *     limit: { type: 'number', description: 'Max results' },
 *   },
 *   actions: {
 *     create: {
 *       params: { name: { type: 'string', description: 'Org name' } },
 *       required: ['name'],
 *       handler: scopeHandlers.orgCreate,
 *     },
 *     list: {
 *       handler: scopeHandlers.orgList,
 *     },
 *   },
 * };
 * ```
 */
export interface ToolDescriptor {
  /**
   * Tool name (e.g., 'memory_org')
   */
  name: string;

  /**
   * Tool description shown to LLM
   */
  description: string;

  /**
   * Parameters shared across all actions
   */
  commonParams?: ParamSchemas;

  /**
   * Map of action names to their descriptors
   */
  actions: Record<string, ActionDescriptor>;

  /**
   * Additional required params at tool level (besides 'action')
   */
  required?: readonly string[];
}

/**
 * Descriptor for tools without action routing (e.g., memory_health)
 */
export interface SimpleToolDescriptor {
  name: string;
  description: string;
  params?: ParamSchemas;
  required?: readonly string[];
  handler: ActionHandler;
}

/**
 * Union type for all descriptor types
 */
export type AnyToolDescriptor = ToolDescriptor | SimpleToolDescriptor;

/**
 * Type guard to check if descriptor has actions
 */
export function isActionBasedDescriptor(
  descriptor: AnyToolDescriptor
): descriptor is ToolDescriptor {
  return 'actions' in descriptor;
}

// =============================================================================
// GENERATOR FUNCTIONS
// =============================================================================

/**
 * Convert ParamSchemas to JSONSchema properties format
 */
function toJsonSchemaProperties(
  params: ParamSchemas
): Record<string, Record<string, unknown>> {
  const properties: Record<string, Record<string, unknown>> = {};

  for (const [name, schema] of Object.entries(params)) {
    const prop: Record<string, unknown> = { type: schema.type };

    if (schema.description) prop.description = schema.description;
    if (schema.enum) prop.enum = [...schema.enum];
    if (schema.items) {
      if ('type' in schema.items) {
        const itemProp: Record<string, unknown> = { type: schema.items.type };
        if (schema.items.enum) itemProp.enum = [...schema.items.enum];
        prop.items = itemProp;
      } else {
        prop.items = toJsonSchemaProperties({ item: schema.items as ParamSchema }).item;
      }
    }
    if (schema.properties) {
      prop.properties = toJsonSchemaProperties(schema.properties);
    }
    if (schema.required) {
      prop.required = [...schema.required];
    }

    properties[name] = prop;
  }

  return properties;
}

/**
 * Generate MCP Tool definition from a ToolDescriptor
 */
export function descriptorToTool(descriptor: AnyToolDescriptor): Tool {
  if (!isActionBasedDescriptor(descriptor)) {
    // Simple tool without actions
    return {
      name: descriptor.name,
      description: descriptor.description,
      inputSchema: {
        type: 'object',
        properties: descriptor.params ? toJsonSchemaProperties(descriptor.params) : {},
        required: descriptor.required ? [...descriptor.required] : undefined,
      },
    };
  }

  // Action-based tool
  const actionNames = Object.keys(descriptor.actions);

  // Merge all params: common + action-specific
  const allParams: ParamSchemas = {
    action: {
      type: 'string',
      enum: actionNames,
      description: 'Action to perform',
    },
    ...(descriptor.commonParams ?? {}),
  };

  // Collect all action-specific params
  for (const actionDef of Object.values(descriptor.actions)) {
    if (actionDef.params) {
      Object.assign(allParams, actionDef.params);
    }
  }

  // Build required list
  const required: string[] = ['action'];
  if (descriptor.required) {
    required.push(...descriptor.required);
  }

  return {
    name: descriptor.name,
    description: descriptor.description,
    inputSchema: {
      type: 'object',
      properties: toJsonSchemaProperties(allParams),
      required,
    },
  };
}

/**
 * Generate action dispatcher from a ToolDescriptor
 */
export function descriptorToHandler(
  descriptor: AnyToolDescriptor
): (params: Record<string, unknown>) => unknown {
  if (!isActionBasedDescriptor(descriptor)) {
    // Simple tool - just call the handler
    return descriptor.handler;
  }

  // Action-based tool - route by action
  return (params: Record<string, unknown>) => {
    const { action, ...rest } = params;
    const actionDef = descriptor.actions[action as string];

    if (!actionDef) {
      // Import dynamically to avoid circular deps
      const validActions = Object.keys(descriptor.actions);
      throw new Error(
        `Invalid action "${action}" for ${descriptor.name}. ` +
          `Valid actions: ${validActions.join(', ')}`
      );
    }

    return actionDef.handler(rest);
  };
}

/**
 * Generate both TOOLS array and handlers from descriptors
 */
export function generateFromDescriptors(descriptors: AnyToolDescriptor[]): {
  tools: Tool[];
  handlers: Record<string, (params: Record<string, unknown>) => unknown>;
} {
  const tools: Tool[] = [];
  const handlers: Record<string, (params: Record<string, unknown>) => unknown> = {};

  for (const descriptor of descriptors) {
    tools.push(descriptorToTool(descriptor));
    handlers[descriptor.name] = descriptorToHandler(descriptor);
  }

  return { tools, handlers };
}
