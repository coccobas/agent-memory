/**
 * MCP Server for Agent Memory Database
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { getDb, closeDb } from '../db/connection.js';
import { tagRepo } from '../db/repositories/tags.js';

// Import handlers
import { scopeHandlers } from './handlers/scopes.handler.js';
import { toolHandlers } from './handlers/tools.handler.js';
import { guidelineHandlers } from './handlers/guidelines.handler.js';
import { knowledgeHandlers } from './handlers/knowledge.handler.js';
import { tagHandlers } from './handlers/tags.handler.js';
import { relationHandlers } from './handlers/relations.handler.js';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const TOOLS: Tool[] = [
  // -------------------------------------------------------------------------
  // SCOPE MANAGEMENT
  // -------------------------------------------------------------------------
  {
    name: 'memory_org_create',
    description: 'Create a new organization',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Organization name' },
        metadata: { type: 'object', description: 'Optional metadata' },
      },
      required: ['name'],
    },
  },
  {
    name: 'memory_org_list',
    description: 'List all organizations',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default 20)' },
        offset: { type: 'number', description: 'Skip N results' },
      },
    },
  },
  {
    name: 'memory_project_create',
    description: 'Create a new project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        orgId: { type: 'string', description: 'Parent organization ID' },
        description: { type: 'string', description: 'Project description' },
        rootPath: { type: 'string', description: 'Filesystem root path' },
        metadata: { type: 'object', description: 'Optional metadata (goals, constraints, etc.)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'memory_project_list',
    description: 'List projects',
    inputSchema: {
      type: 'object',
      properties: {
        orgId: { type: 'string', description: 'Filter by organization' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'memory_project_get',
    description: 'Get project by ID or name',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'Project name' },
        orgId: { type: 'string', description: 'Organization ID (for name lookup)' },
      },
    },
  },
  {
    name: 'memory_project_update',
    description: 'Update a project',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Project ID' },
        name: { type: 'string' },
        description: { type: 'string' },
        rootPath: { type: 'string' },
        metadata: { type: 'object' },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_session_start',
    description: 'Start a new working session',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Parent project ID' },
        name: { type: 'string', description: 'Session name' },
        purpose: { type: 'string', description: 'What this session is for' },
        agentId: { type: 'string', description: 'Agent/IDE identifier' },
        metadata: { type: 'object', description: 'Session metadata (mode, etc.)' },
      },
    },
  },
  {
    name: 'memory_session_end',
    description: 'End a session',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Session ID' },
        status: { type: 'string', enum: ['completed', 'discarded'], description: 'End status' },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_session_list',
    description: 'List sessions',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Filter by project' },
        status: { type: 'string', enum: ['active', 'paused', 'completed', 'discarded'] },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },

  // -------------------------------------------------------------------------
  // TOOLS REGISTRY
  // -------------------------------------------------------------------------
  {
    name: 'memory_tool_add',
    description: 'Add a new tool definition',
    inputSchema: {
      type: 'object',
      properties: {
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'], description: 'Scope level' },
        scopeId: { type: 'string', description: 'Scope ID (required unless global)' },
        name: { type: 'string', description: 'Tool name (unique within scope)' },
        category: { type: 'string', enum: ['mcp', 'cli', 'function', 'api'] },
        description: { type: 'string', description: 'What this tool does' },
        parameters: { type: 'object', description: 'Parameter schema' },
        examples: { type: 'array', description: 'Usage examples' },
        constraints: { type: 'string', description: 'Usage constraints/guidelines' },
        createdBy: { type: 'string', description: 'Creator identifier' },
      },
      required: ['scopeType', 'name'],
    },
  },
  {
    name: 'memory_tool_update',
    description: 'Update a tool (creates new version)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Tool ID' },
        description: { type: 'string' },
        parameters: { type: 'object' },
        examples: { type: 'array' },
        constraints: { type: 'string' },
        changeReason: { type: 'string', description: 'Why this update was made' },
        updatedBy: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_tool_get',
    description: 'Get a tool by ID or name',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Tool ID' },
        name: { type: 'string', description: 'Tool name' },
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        scopeId: { type: 'string' },
        inherit: { type: 'boolean', description: 'Search parent scopes (default true)' },
      },
    },
  },
  {
    name: 'memory_tool_list',
    description: 'List tools',
    inputSchema: {
      type: 'object',
      properties: {
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        scopeId: { type: 'string' },
        category: { type: 'string', enum: ['mcp', 'cli', 'function', 'api'] },
        includeInactive: { type: 'boolean' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'memory_tool_history',
    description: 'Get version history for a tool',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Tool ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_tool_deactivate',
    description: 'Soft-delete a tool',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Tool ID' },
      },
      required: ['id'],
    },
  },

  // -------------------------------------------------------------------------
  // GUIDELINES
  // -------------------------------------------------------------------------
  {
    name: 'memory_guideline_add',
    description: 'Add a new guideline',
    inputSchema: {
      type: 'object',
      properties: {
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        scopeId: { type: 'string' },
        name: { type: 'string', description: 'Guideline name (unique within scope)' },
        category: { type: 'string', description: 'Category (e.g., security, code_style, behavior)' },
        priority: { type: 'number', description: 'Priority 0-100 (higher = more important)' },
        content: { type: 'string', description: 'The guideline text' },
        rationale: { type: 'string', description: 'Why this guideline exists' },
        examples: {
          type: 'object',
          properties: {
            bad: { type: 'array', items: { type: 'string' } },
            good: { type: 'array', items: { type: 'string' } },
          },
        },
        createdBy: { type: 'string' },
      },
      required: ['scopeType', 'name', 'content'],
    },
  },
  {
    name: 'memory_guideline_update',
    description: 'Update a guideline (creates new version)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Guideline ID' },
        category: { type: 'string' },
        priority: { type: 'number' },
        content: { type: 'string' },
        rationale: { type: 'string' },
        examples: { type: 'object' },
        changeReason: { type: 'string' },
        updatedBy: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_guideline_get',
    description: 'Get a guideline by ID or name',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        scopeId: { type: 'string' },
        inherit: { type: 'boolean' },
      },
    },
  },
  {
    name: 'memory_guideline_list',
    description: 'List guidelines (ordered by priority)',
    inputSchema: {
      type: 'object',
      properties: {
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        scopeId: { type: 'string' },
        category: { type: 'string' },
        includeInactive: { type: 'boolean' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'memory_guideline_history',
    description: 'Get version history for a guideline',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_guideline_deactivate',
    description: 'Soft-delete a guideline',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },

  // -------------------------------------------------------------------------
  // KNOWLEDGE
  // -------------------------------------------------------------------------
  {
    name: 'memory_knowledge_add',
    description: 'Add a knowledge entry',
    inputSchema: {
      type: 'object',
      properties: {
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        scopeId: { type: 'string' },
        title: { type: 'string', description: 'Knowledge title (unique within scope)' },
        category: { type: 'string', enum: ['decision', 'fact', 'context', 'reference'] },
        content: { type: 'string', description: 'The knowledge content' },
        source: { type: 'string', description: 'Where this knowledge came from' },
        confidence: { type: 'number', description: 'Confidence level 0-1' },
        validUntil: { type: 'string', description: 'Expiration date (ISO format)' },
        createdBy: { type: 'string' },
      },
      required: ['scopeType', 'title', 'content'],
    },
  },
  {
    name: 'memory_knowledge_update',
    description: 'Update a knowledge entry (creates new version)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        category: { type: 'string', enum: ['decision', 'fact', 'context', 'reference'] },
        content: { type: 'string' },
        source: { type: 'string' },
        confidence: { type: 'number' },
        validUntil: { type: 'string' },
        changeReason: { type: 'string' },
        updatedBy: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_knowledge_get',
    description: 'Get a knowledge entry by ID or title',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        scopeId: { type: 'string' },
        inherit: { type: 'boolean' },
      },
    },
  },
  {
    name: 'memory_knowledge_list',
    description: 'List knowledge entries',
    inputSchema: {
      type: 'object',
      properties: {
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        scopeId: { type: 'string' },
        category: { type: 'string', enum: ['decision', 'fact', 'context', 'reference'] },
        includeInactive: { type: 'boolean' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'memory_knowledge_history',
    description: 'Get version history for a knowledge entry',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_knowledge_deactivate',
    description: 'Soft-delete a knowledge entry',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },

  // -------------------------------------------------------------------------
  // TAGS
  // -------------------------------------------------------------------------
  {
    name: 'memory_tag_create',
    description: 'Create a new tag',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tag name (unique)' },
        category: { type: 'string', enum: ['language', 'domain', 'category', 'meta', 'custom'] },
        description: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'memory_tag_list',
    description: 'List tags',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['language', 'domain', 'category', 'meta', 'custom'] },
        isPredefined: { type: 'boolean' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'memory_tag_attach',
    description: 'Attach a tag to an entry',
    inputSchema: {
      type: 'object',
      properties: {
        entryType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        entryId: { type: 'string' },
        tagId: { type: 'string', description: 'Tag ID (or use tagName)' },
        tagName: { type: 'string', description: 'Tag name (creates if not exists)' },
      },
      required: ['entryType', 'entryId'],
    },
  },
  {
    name: 'memory_tag_detach',
    description: 'Remove a tag from an entry',
    inputSchema: {
      type: 'object',
      properties: {
        entryType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        entryId: { type: 'string' },
        tagId: { type: 'string' },
      },
      required: ['entryType', 'entryId', 'tagId'],
    },
  },
  {
    name: 'memory_tags_for_entry',
    description: 'Get all tags for an entry',
    inputSchema: {
      type: 'object',
      properties: {
        entryType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        entryId: { type: 'string' },
      },
      required: ['entryType', 'entryId'],
    },
  },

  // -------------------------------------------------------------------------
  // RELATIONS
  // -------------------------------------------------------------------------
  {
    name: 'memory_relation_create',
    description: 'Create a relation between entries',
    inputSchema: {
      type: 'object',
      properties: {
        sourceType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        sourceId: { type: 'string' },
        targetType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        targetId: { type: 'string' },
        relationType: { type: 'string', enum: ['applies_to', 'depends_on', 'conflicts_with', 'related_to'] },
        createdBy: { type: 'string' },
      },
      required: ['sourceType', 'sourceId', 'targetType', 'targetId', 'relationType'],
    },
  },
  {
    name: 'memory_relation_list',
    description: 'List relations',
    inputSchema: {
      type: 'object',
      properties: {
        sourceType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        sourceId: { type: 'string' },
        targetType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        targetId: { type: 'string' },
        relationType: { type: 'string', enum: ['applies_to', 'depends_on', 'conflicts_with', 'related_to'] },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'memory_relation_delete',
    description: 'Delete a relation',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Relation ID' },
        sourceType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        sourceId: { type: 'string' },
        targetType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        targetId: { type: 'string' },
        relationType: { type: 'string', enum: ['applies_to', 'depends_on', 'conflicts_with', 'related_to'] },
      },
    },
  },
];

// =============================================================================
// HANDLER DISPATCH
// =============================================================================

type HandlerFunction = (params: Record<string, unknown>) => unknown;

const handlers: Record<string, HandlerFunction> = {
  // Scopes
  memory_org_create: scopeHandlers.orgCreate,
  memory_org_list: scopeHandlers.orgList,
  memory_project_create: scopeHandlers.projectCreate,
  memory_project_list: scopeHandlers.projectList,
  memory_project_get: scopeHandlers.projectGet,
  memory_project_update: scopeHandlers.projectUpdate,
  memory_session_start: scopeHandlers.sessionStart,
  memory_session_end: scopeHandlers.sessionEnd,
  memory_session_list: scopeHandlers.sessionList,

  // Tools
  memory_tool_add: toolHandlers.add,
  memory_tool_update: toolHandlers.update,
  memory_tool_get: toolHandlers.get,
  memory_tool_list: toolHandlers.list,
  memory_tool_history: toolHandlers.history,
  memory_tool_deactivate: toolHandlers.deactivate,

  // Guidelines
  memory_guideline_add: guidelineHandlers.add,
  memory_guideline_update: guidelineHandlers.update,
  memory_guideline_get: guidelineHandlers.get,
  memory_guideline_list: guidelineHandlers.list,
  memory_guideline_history: guidelineHandlers.history,
  memory_guideline_deactivate: guidelineHandlers.deactivate,

  // Knowledge
  memory_knowledge_add: knowledgeHandlers.add,
  memory_knowledge_update: knowledgeHandlers.update,
  memory_knowledge_get: knowledgeHandlers.get,
  memory_knowledge_list: knowledgeHandlers.list,
  memory_knowledge_history: knowledgeHandlers.history,
  memory_knowledge_deactivate: knowledgeHandlers.deactivate,

  // Tags
  memory_tag_create: tagHandlers.create,
  memory_tag_list: tagHandlers.list,
  memory_tag_attach: tagHandlers.attach,
  memory_tag_detach: tagHandlers.detach,
  memory_tags_for_entry: tagHandlers.forEntry,

  // Relations
  memory_relation_create: relationHandlers.create,
  memory_relation_list: relationHandlers.list,
  memory_relation_delete: relationHandlers.delete,
};

// =============================================================================
// SERVER SETUP
// =============================================================================

export async function createServer(): Promise<Server> {
  const server = new Server(
    {
      name: 'agent-memory',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Initialize database
  getDb();

  // Seed predefined tags
  tagRepo.seedPredefined();

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const handler = handlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      const result = handler(args ?? {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: message }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function runServer(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    closeDb();
    process.exit(0);
  });
}
