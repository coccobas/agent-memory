/**
 * OpenAPI Specification Generator
 *
 * Generates complete OpenAPI 3.0 specification from MCP tool descriptors
 */

import { allDescriptors } from '../../mcp/descriptors/index.js';
import { descriptorToOpenAPIPath, type OpenAPIPathItem } from './schema-converter.js';
import { VERSION } from '../../version.js';

// =============================================================================
// OpenAPI SPEC TYPES
// =============================================================================

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
    contact?: {
      name: string;
      url: string;
    };
    license?: {
      name: string;
      url: string;
    };
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, OpenAPIPathItem>;
  components: {
    securitySchemes: Record<
      string,
      {
        type: string;
        scheme?: string;
        bearerFormat?: string;
        in?: string;
        name?: string;
      }
    >;
  };
  tags?: Array<{
    name: string;
    description: string;
  }>;
}

// =============================================================================
// SPEC GENERATION
// =============================================================================

/**
 * Generate complete OpenAPI 3.0 specification
 */
export function generateOpenAPISpec(): OpenAPISpec {
  const paths: Record<string, OpenAPIPathItem> = {};

  // Add list tools endpoint
  paths['/v1/tools'] = {
    get: {
      summary: 'List all available tools',
      description: 'Returns a list of all MCP tools available in the system',
      operationId: 'listTools',
      tags: ['tools'],
      responses: {
        '200': {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: {
                    type: 'object',
                    properties: {
                      tools: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            description: { type: 'string' },
                            inputSchema: { type: 'object' },
                          },
                        },
                      },
                    },
                  },
                },
              },
              example: {
                success: true,
                data: {
                  tools: [
                    {
                      name: 'memory_knowledge',
                      description: 'Manage knowledge entries',
                      inputSchema: {},
                    },
                  ],
                },
              },
            },
          },
        },
      },
      security: [{ bearerAuth: [] }, { apiKey: [] }],
    },
  };

  // Add OpenAPI spec endpoint (self-reference)
  paths['/v1/openapi.json'] = {
    get: {
      summary: 'Get OpenAPI specification',
      description: 'Returns the OpenAPI 3.0 specification for this API',
      operationId: 'getOpenAPISpec',
      tags: ['meta'],
      responses: {
        '200': {
          description: 'OpenAPI specification',
          content: {
            'application/json': {
              schema: {
                type: 'object',
              },
            },
          },
        },
      },
    },
  };

  // Convert all descriptors to paths
  for (const descriptor of allDescriptors) {
    const { path, pathItem } = descriptorToOpenAPIPath(descriptor);
    paths[path] = pathItem;
  }

  // Define tags for grouping
  const tags = [
    { name: 'tools', description: 'Tool management and listing' },
    { name: 'meta', description: 'API metadata and documentation' },
    { name: 'org', description: 'Organization management' },
    { name: 'project', description: 'Project management' },
    { name: 'session', description: 'Session management' },
    { name: 'knowledge', description: 'Knowledge entry management' },
    { name: 'guideline', description: 'Guideline management' },
    { name: 'tool', description: 'Tool registry management' },
    { name: 'tag', description: 'Tag management' },
    { name: 'relation', description: 'Relationship management' },
    { name: 'query', description: 'Search and query operations' },
    { name: 'task', description: 'Task decomposition' },
    { name: 'voting', description: 'Multi-agent voting' },
    { name: 'analytics', description: 'Analytics and metrics' },
    { name: 'permission', description: 'Permission management' },
    { name: 'conflict', description: 'Conflict resolution' },
    { name: 'health', description: 'Health checks' },
    { name: 'backup', description: 'Backup and restore' },
    { name: 'init', description: 'System initialization' },
    { name: 'export', description: 'Data export' },
    { name: 'import', description: 'Data import' },
    { name: 'conversation', description: 'Conversation history' },
    { name: 'verify', description: 'Data verification' },
    { name: 'hook', description: 'Hook management' },
    { name: 'observe', description: 'Auto-capture observations' },
    { name: 'consolidate', description: 'Memory consolidation' },
    { name: 'review', description: 'Review candidates' },
    { name: 'lock', description: 'File lock management' },
  ];

  const spec: OpenAPISpec = {
    openapi: '3.0.3',
    info: {
      title: 'Agent Memory REST API',
      version: VERSION,
      description: `REST API for Agent Memory - Structured memory backend for AI agents.

This API provides access to all MCP (Model Context Protocol) tools via HTTP endpoints.
Each tool is accessible at \`/v1/tools/{toolName}\` with a POST request containing
the action and parameters.

## Authentication
The API supports two authentication methods:
- **Bearer Token**: Pass JWT token in Authorization header
- **API Key**: Pass API key in X-API-Key header

## Rate Limiting
All endpoints are subject to rate limiting. Default limits:
- 100 requests per minute per IP
- 1000 requests per hour per API key

## Error Codes
- E1000-E1999: Validation errors
- E2000-E2999: Not found errors
- E3000-E3999: Conflict errors
- E4000-E4999: Business logic errors
- E5000-E5999: Database errors
- E6000-E6999: Permission errors
- E9000-E9999: Rate limiting and system errors
`,
      contact: {
        name: 'Agent Memory',
        url: 'https://github.com/cyanheads/agent-memory',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3100',
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    },
    paths,
    tags,
  };

  return spec;
}
