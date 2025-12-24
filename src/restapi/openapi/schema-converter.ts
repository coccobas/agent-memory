/**
 * OpenAPI Schema Converter
 *
 * Converts MCP tool descriptors to OpenAPI 3.0 schemas
 */

import type {
  ParamSchema,
  ParamSchemas,
  AnyToolDescriptor,
  ToolDescriptor,
} from '../../mcp/descriptors/types.js';

// =============================================================================
// OpenAPI TYPES
// =============================================================================

export interface OpenAPISchema {
  type?: string;
  description?: string;
  enum?: readonly string[];
  items?: OpenAPISchema;
  properties?: Record<string, OpenAPISchema>;
  required?: readonly string[];
  default?: unknown;
  format?: string;
  example?: unknown;
}

export interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  description?: string;
  required?: boolean;
  schema: OpenAPISchema;
}

export interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content: {
    'application/json': {
      schema: OpenAPISchema;
    };
  };
}

export interface OpenAPIResponse {
  description: string;
  content?: {
    'application/json': {
      schema: OpenAPISchema;
      example?: unknown;
    };
  };
}

export interface OpenAPIOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
  security?: Array<Record<string, string[]>>;
}

export interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  patch?: OpenAPIOperation;
}

// =============================================================================
// CONVERSION FUNCTIONS
// =============================================================================

/**
 * Convert ParamSchema to OpenAPI schema
 */
export function paramSchemaToOpenAPI(schema: ParamSchema): OpenAPISchema {
  const openApiSchema: OpenAPISchema = {
    type: schema.type,
  };

  if (schema.description) {
    openApiSchema.description = schema.description;
  }

  if (schema.enum) {
    openApiSchema.enum = schema.enum;
  }

  if (schema.default !== undefined) {
    openApiSchema.default = schema.default;
  }

  // Handle array items
  if (schema.type === 'array' && schema.items) {
    if ('type' in schema.items) {
      const itemSchema: OpenAPISchema = { type: schema.items.type };
      if (schema.items.enum) {
        itemSchema.enum = schema.items.enum;
      }
      openApiSchema.items = itemSchema;
    } else {
      openApiSchema.items = paramSchemaToOpenAPI(schema.items as ParamSchema);
    }
  }

  // Handle object properties
  if (schema.type === 'object' && schema.properties) {
    openApiSchema.properties = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      openApiSchema.properties[key] = paramSchemaToOpenAPI(propSchema);
    }

    if (schema.required && schema.required.length > 0) {
      openApiSchema.required = schema.required;
    }
  }

  return openApiSchema;
}

/**
 * Convert ParamSchemas to OpenAPI properties object
 */
export function paramSchemasToProperties(params: ParamSchemas): Record<string, OpenAPISchema> {
  const properties: Record<string, OpenAPISchema> = {};

  for (const [name, schema] of Object.entries(params)) {
    properties[name] = paramSchemaToOpenAPI(schema);
  }

  return properties;
}

/**
 * Standard error responses for all endpoints
 */
export function getStandardResponses(): Record<string, OpenAPIResponse> {
  return {
    '200': {
      description: 'Success',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
            },
          },
          example: {
            success: true,
            data: {},
          },
        },
      },
    },
    '400': {
      description: 'Bad Request - Invalid parameters',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          example: {
            success: false,
            error: {
              code: 'E1000',
              message: 'Invalid request parameters',
            },
          },
        },
      },
    },
    '401': {
      description: 'Unauthorized - Invalid or missing authentication',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          example: {
            success: false,
            error: {
              code: 'E6001',
              message: 'Authentication required',
            },
          },
        },
      },
    },
    '403': {
      description: 'Forbidden - Insufficient permissions',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          example: {
            success: false,
            error: {
              code: 'E6000',
              message: 'Permission denied',
            },
          },
        },
      },
    },
    '404': {
      description: 'Not Found - Resource does not exist',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          example: {
            success: false,
            error: {
              code: 'E2001',
              message: 'Resource not found',
            },
          },
        },
      },
    },
    '429': {
      description: 'Too Many Requests - Rate limit exceeded',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          example: {
            success: false,
            error: {
              code: 'E9000',
              message: 'Rate limit exceeded',
            },
          },
        },
      },
    },
  };
}

/**
 * Type guard to check if descriptor has actions
 */
function isActionBasedDescriptor(descriptor: AnyToolDescriptor): descriptor is ToolDescriptor {
  return 'actions' in descriptor;
}

/**
 * Convert tool descriptor to OpenAPI path and operation
 */
export function descriptorToOpenAPIPath(descriptor: AnyToolDescriptor): {
  path: string;
  pathItem: OpenAPIPathItem;
} {
  const path = `/v1/tools/${descriptor.name}`;

  if (!isActionBasedDescriptor(descriptor)) {
    // Simple tool without actions
    const properties = descriptor.params ? paramSchemasToProperties(descriptor.params) : {};

    const operation: OpenAPIOperation = {
      summary: descriptor.description.split('\n')[0],
      description: descriptor.description,
      operationId: descriptor.name,
      tags: [descriptor.name.split('_')[1] || 'general'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties,
              required: descriptor.required ? [...descriptor.required] : undefined,
            },
          },
        },
      },
      responses: getStandardResponses(),
      security: [{ bearerAuth: [] }, { apiKey: [] }],
    };

    return {
      path,
      pathItem: { post: operation },
    };
  }

  // Action-based tool
  const actionNames = Object.keys(descriptor.actions);

  // Collect all params: common + action-specific
  const allParams: ParamSchemas = {
    ...(descriptor.commonParams ?? {}),
  };

  // Add action-specific params
  for (const actionDef of Object.values(descriptor.actions)) {
    if (actionDef.params) {
      Object.assign(allParams, actionDef.params);
    }
  }

  const properties = paramSchemasToProperties(allParams);

  // Add action enum to properties
  properties.action = {
    type: 'string',
    enum: actionNames,
    description: 'Action to perform',
  };

  // Build required list
  const required: string[] = ['action'];
  if (descriptor.required) {
    required.push(...descriptor.required);
  }

  const operation: OpenAPIOperation = {
    summary: descriptor.description.split('\n')[0],
    description: descriptor.description,
    operationId: descriptor.name,
    tags: [descriptor.name.split('_')[1] || 'general'],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties,
            required,
          },
        },
      },
    },
    responses: getStandardResponses(),
    security: [{ bearerAuth: [] }, { apiKey: [] }],
  };

  return {
    path,
    pathItem: { post: operation },
  };
}
