/**
 * MCP Server for Agent Memory Database
 *
 * Tool Bundling: 45 individual tools consolidated into 11 action-based tools:
 * - memory_org (create, list)
 * - memory_project (create, list, get, update)
 * - memory_session (start, end, list)
 * - memory_tool (add, update, get, list, history, deactivate)
 * - memory_guideline (add, update, get, list, history, deactivate)
 * - memory_knowledge (add, update, get, list, history, deactivate)
 * - memory_tag (create, list, attach, detach, for_entry)
 * - memory_relation (create, list, delete)
 * - memory_file_lock (checkout, checkin, status, list, force_unlock)
 * - memory_query (search, context)
 * - memory_conflict (list, resolve)
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
import { queryHandlers } from './handlers/query.handler.js';
import { conflictHandlers } from './handlers/conflicts.handler.js';

// Import handlers
import { scopeHandlers } from './handlers/scopes.handler.js';
import { toolHandlers } from './handlers/tools.handler.js';
import { guidelineHandlers } from './handlers/guidelines.handler.js';
import { knowledgeHandlers } from './handlers/knowledge.handler.js';
import { tagHandlers } from './handlers/tags.handler.js';
import { relationHandlers } from './handlers/relations.handler.js';
import { fileLockHandlers } from './handlers/file_locks.handler.js';

// =============================================================================
// BUNDLED TOOL DEFINITIONS (11 tools instead of 45)
// =============================================================================

const TOOLS: Tool[] = [
  // -------------------------------------------------------------------------
  // ORGANIZATION MANAGEMENT
  // -------------------------------------------------------------------------
  {
    name: 'memory_org',
    description: 'Manage organizations. Actions: create, list',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list'],
          description: 'Action to perform',
        },
        // create params
        name: { type: 'string', description: 'Organization name (create)' },
        metadata: { type: 'object', description: 'Optional metadata (create)' },
        // list params
        limit: { type: 'number', description: 'Max results (list, default 20)' },
        offset: { type: 'number', description: 'Skip N results (list)' },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // PROJECT MANAGEMENT
  // -------------------------------------------------------------------------
  {
    name: 'memory_project',
    description: 'Manage projects. Actions: create, list, get, update',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'get', 'update'],
          description: 'Action to perform',
        },
        // create/update params
        id: { type: 'string', description: 'Project ID (get, update)' },
        name: { type: 'string', description: 'Project name' },
        orgId: { type: 'string', description: 'Parent organization ID' },
        description: { type: 'string', description: 'Project description' },
        rootPath: { type: 'string', description: 'Filesystem root path' },
        metadata: { type: 'object', description: 'Optional metadata' },
        // list params
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // SESSION MANAGEMENT
  // -------------------------------------------------------------------------
  {
    name: 'memory_session',
    description: 'Manage working sessions. Actions: start, end, list',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'end', 'list'],
          description: 'Action to perform',
        },
        // start params
        projectId: { type: 'string', description: 'Parent project ID (start)' },
        name: { type: 'string', description: 'Session name (start)' },
        purpose: { type: 'string', description: 'Session purpose (start)' },
        agentId: { type: 'string', description: 'Agent/IDE identifier (start)' },
        metadata: { type: 'object', description: 'Session metadata (start)' },
        // end params
        id: { type: 'string', description: 'Session ID (end)' },
        status: { type: 'string', enum: ['completed', 'discarded', 'active', 'paused'], description: 'End status (end) or filter (list)' },
        // list params
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // TOOLS REGISTRY
  // -------------------------------------------------------------------------
  {
    name: 'memory_tool',
    description: 'Manage tool definitions. Actions: add, update, get, list, history, deactivate',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'update', 'get', 'list', 'history', 'deactivate'],
          description: 'Action to perform',
        },
        // common params
        id: { type: 'string', description: 'Tool ID' },
        name: { type: 'string', description: 'Tool name' },
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'], description: 'Scope level' },
        scopeId: { type: 'string', description: 'Scope ID' },
        // add/update params
        category: { type: 'string', enum: ['mcp', 'cli', 'function', 'api'] },
        description: { type: 'string', description: 'What this tool does' },
        parameters: { type: 'object', description: 'Parameter schema' },
        examples: { type: 'array', description: 'Usage examples' },
        constraints: { type: 'string', description: 'Usage constraints' },
        createdBy: { type: 'string', description: 'Creator identifier' },
        changeReason: { type: 'string', description: 'Reason for update' },
        updatedBy: { type: 'string' },
        // get/list params
        inherit: { type: 'boolean', description: 'Search parent scopes (default true)' },
        includeInactive: { type: 'boolean' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // GUIDELINES
  // -------------------------------------------------------------------------
  {
    name: 'memory_guideline',
    description: 'Manage behavioral guidelines. Actions: add, update, get, list, history, deactivate',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'update', 'get', 'list', 'history', 'deactivate'],
          description: 'Action to perform',
        },
        // common params
        id: { type: 'string', description: 'Guideline ID' },
        name: { type: 'string', description: 'Guideline name' },
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        scopeId: { type: 'string' },
        // add/update params
        category: { type: 'string', description: 'Category (e.g., security, code_style)' },
        priority: { type: 'number', description: 'Priority 0-100' },
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
        changeReason: { type: 'string' },
        updatedBy: { type: 'string' },
        // get/list params
        inherit: { type: 'boolean' },
        includeInactive: { type: 'boolean' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // KNOWLEDGE
  // -------------------------------------------------------------------------
  {
    name: 'memory_knowledge',
    description: 'Manage knowledge entries. Actions: add, update, get, list, history, deactivate',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'update', 'get', 'list', 'history', 'deactivate'],
          description: 'Action to perform',
        },
        // common params
        id: { type: 'string', description: 'Knowledge ID' },
        title: { type: 'string', description: 'Knowledge title' },
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        scopeId: { type: 'string' },
        // add/update params
        category: { type: 'string', enum: ['decision', 'fact', 'context', 'reference'] },
        content: { type: 'string', description: 'The knowledge content' },
        source: { type: 'string', description: 'Where this knowledge came from' },
        confidence: { type: 'number', description: 'Confidence level 0-1' },
        validUntil: { type: 'string', description: 'Expiration date (ISO format)' },
        createdBy: { type: 'string' },
        changeReason: { type: 'string' },
        updatedBy: { type: 'string' },
        // get/list params
        inherit: { type: 'boolean' },
        includeInactive: { type: 'boolean' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // TAGS
  // -------------------------------------------------------------------------
  {
    name: 'memory_tag',
    description: 'Manage tags. Actions: create, list, attach, detach, for_entry',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'attach', 'detach', 'for_entry'],
          description: 'Action to perform',
        },
        // create params
        name: { type: 'string', description: 'Tag name (unique)' },
        category: { type: 'string', enum: ['language', 'domain', 'category', 'meta', 'custom'] },
        description: { type: 'string' },
        // attach/detach/for_entry params
        entryType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        entryId: { type: 'string' },
        tagId: { type: 'string', description: 'Tag ID' },
        tagName: { type: 'string', description: 'Tag name (creates if not exists)' },
        // list params
        isPredefined: { type: 'boolean' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // RELATIONS
  // -------------------------------------------------------------------------
  {
    name: 'memory_relation',
    description: 'Manage entry relations. Actions: create, list, delete',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'delete'],
          description: 'Action to perform',
        },
        // common params
        id: { type: 'string', description: 'Relation ID (delete)' },
        sourceType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        sourceId: { type: 'string' },
        targetType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        targetId: { type: 'string' },
        relationType: { type: 'string', enum: ['applies_to', 'depends_on', 'conflicts_with', 'related_to'] },
        createdBy: { type: 'string' },
        // list params
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // FILE LOCKS
  // -------------------------------------------------------------------------
  {
    name: 'memory_file_lock',
    description: 'Manage file locks for multi-agent coordination. Actions: checkout, checkin, status, list, force_unlock',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['checkout', 'checkin', 'status', 'list', 'force_unlock'],
          description: 'Action to perform',
        },
        // checkout/checkin/status/force_unlock params
        file_path: { type: 'string', description: 'Absolute filesystem path to the file' },
        agent_id: { type: 'string', description: 'Agent/IDE identifier' },
        // checkout params
        session_id: { type: 'string', description: 'Optional session reference' },
        project_id: { type: 'string', description: 'Optional project reference' },
        expires_in: { type: 'number', description: 'Lock timeout in seconds (default 3600)' },
        metadata: { type: 'object', description: 'Optional metadata' },
        // force_unlock params
        reason: { type: 'string', description: 'Reason for force unlock' },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // CROSS-REFERENCE QUERY
  // -------------------------------------------------------------------------
  {
    name: 'memory_query',
    description: 'Query and aggregate memory. Actions: search (cross-reference search), context (aggregated context for scope)',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'context'],
          description: 'Action to perform',
        },
        // search params
        types: {
          type: 'array',
          items: { type: 'string', enum: ['tools', 'guidelines', 'knowledge'] },
          description: 'Which sections to search (search)',
        },
        scope: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
            id: { type: 'string' },
            inherit: { type: 'boolean' },
          },
          description: 'Scope to search within (search)',
        },
        tags: {
          type: 'object',
          properties: {
            include: { type: 'array', items: { type: 'string' } },
            require: { type: 'array', items: { type: 'string' } },
            exclude: { type: 'array', items: { type: 'string' } },
          },
          description: 'Tag filters (search)',
        },
        search: { type: 'string', description: 'Free-text search (search)' },
        relatedTo: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
            id: { type: 'string' },
            relation: { type: 'string', enum: ['applies_to', 'depends_on', 'conflicts_with', 'related_to'] },
          },
          description: 'Find related entries (search)',
        },
        includeVersions: { type: 'boolean', description: 'Include version history (search)' },
        includeInactive: { type: 'boolean', description: 'Include inactive entries (search)' },
        // context params
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'], description: 'Scope type (context)' },
        scopeId: { type: 'string', description: 'Scope ID (context)' },
        inherit: { type: 'boolean', description: 'Include parent scopes (context, default true)' },
        // common params
        compact: { type: 'boolean', description: 'Return compact results' },
        limit: { type: 'number', description: 'Max results (search) or per type (context as limitPerType)' },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // CONFLICTS
  // -------------------------------------------------------------------------
  {
    name: 'memory_conflict',
    description: 'Manage version conflicts. Actions: list, resolve',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'resolve'],
          description: 'Action to perform',
        },
        // list params
        entryType: { type: 'string', enum: ['tool', 'guideline', 'knowledge'], description: 'Filter by entry type (list)' },
        resolved: { type: 'boolean', description: 'Filter by resolved status (list, default: unresolved only)' },
        // resolve params
        id: { type: 'string', description: 'Conflict ID (resolve)' },
        resolution: { type: 'string', description: 'Resolution description (resolve)' },
        resolvedBy: { type: 'string', description: 'Who resolved it (resolve)' },
        // common
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['action'],
    },
  },
];

// =============================================================================
// HANDLER DISPATCH - Action-based routing
// =============================================================================

// Bundled handlers that route by action
const bundledHandlers: Record<string, (params: Record<string, unknown>) => unknown> = {
  memory_org: (params) => {
    const { action, ...rest } = params;
    switch (action) {
      case 'create': return scopeHandlers.orgCreate(rest);
      case 'list': return scopeHandlers.orgList(rest);
      default: throw new Error(`Unknown action for memory_org: ${action}`);
    }
  },

  memory_project: (params) => {
    const { action, ...rest } = params;
    switch (action) {
      case 'create': return scopeHandlers.projectCreate(rest);
      case 'list': return scopeHandlers.projectList(rest);
      case 'get': return scopeHandlers.projectGet(rest);
      case 'update': return scopeHandlers.projectUpdate(rest);
      default: throw new Error(`Unknown action for memory_project: ${action}`);
    }
  },

  memory_session: (params) => {
    const { action, ...rest } = params;
    switch (action) {
      case 'start': return scopeHandlers.sessionStart(rest);
      case 'end': return scopeHandlers.sessionEnd(rest);
      case 'list': return scopeHandlers.sessionList(rest);
      default: throw new Error(`Unknown action for memory_session: ${action}`);
    }
  },

  memory_tool: (params) => {
    const { action, ...rest } = params;
    switch (action) {
      case 'add': return toolHandlers.add(rest);
      case 'update': return toolHandlers.update(rest);
      case 'get': return toolHandlers.get(rest);
      case 'list': return toolHandlers.list(rest);
      case 'history': return toolHandlers.history(rest);
      case 'deactivate': return toolHandlers.deactivate(rest);
      default: throw new Error(`Unknown action for memory_tool: ${action}`);
    }
  },

  memory_guideline: (params) => {
    const { action, ...rest } = params;
    switch (action) {
      case 'add': return guidelineHandlers.add(rest);
      case 'update': return guidelineHandlers.update(rest);
      case 'get': return guidelineHandlers.get(rest);
      case 'list': return guidelineHandlers.list(rest);
      case 'history': return guidelineHandlers.history(rest);
      case 'deactivate': return guidelineHandlers.deactivate(rest);
      default: throw new Error(`Unknown action for memory_guideline: ${action}`);
    }
  },

  memory_knowledge: (params) => {
    const { action, ...rest } = params;
    switch (action) {
      case 'add': return knowledgeHandlers.add(rest);
      case 'update': return knowledgeHandlers.update(rest);
      case 'get': return knowledgeHandlers.get(rest);
      case 'list': return knowledgeHandlers.list(rest);
      case 'history': return knowledgeHandlers.history(rest);
      case 'deactivate': return knowledgeHandlers.deactivate(rest);
      default: throw new Error(`Unknown action for memory_knowledge: ${action}`);
    }
  },

  memory_tag: (params) => {
    const { action, ...rest } = params;
    switch (action) {
      case 'create': return tagHandlers.create(rest);
      case 'list': return tagHandlers.list(rest);
      case 'attach': return tagHandlers.attach(rest);
      case 'detach': return tagHandlers.detach(rest);
      case 'for_entry': return tagHandlers.forEntry(rest);
      default: throw new Error(`Unknown action for memory_tag: ${action}`);
    }
  },

  memory_relation: (params) => {
    const { action, ...rest } = params;
    switch (action) {
      case 'create': return relationHandlers.create(rest);
      case 'list': return relationHandlers.list(rest);
      case 'delete': return relationHandlers.delete(rest);
      default: throw new Error(`Unknown action for memory_relation: ${action}`);
    }
  },

  memory_file_lock: (params) => {
    const { action, ...rest } = params;
    switch (action) {
      case 'checkout': return fileLockHandlers.checkout(rest);
      case 'checkin': return fileLockHandlers.checkin(rest);
      case 'status': return fileLockHandlers.status(rest);
      case 'list': return fileLockHandlers.list(rest);
      case 'force_unlock': return fileLockHandlers.forceUnlock(rest);
      default: throw new Error(`Unknown action for memory_file_lock: ${action}`);
    }
  },

  memory_query: (params) => {
    const { action, ...rest } = params;
    switch (action) {
      case 'search': return queryHandlers.query(rest);
      case 'context': {
        // Map limit to limitPerType for context action
        const contextParams = { ...rest };
        if ('limit' in contextParams && !('limitPerType' in contextParams)) {
          contextParams.limitPerType = contextParams.limit;
          delete contextParams.limit;
        }
        return queryHandlers.context(contextParams);
      }
      default: throw new Error(`Unknown action for memory_query: ${action}`);
    }
  },

  memory_conflict: (params) => {
    const { action, ...rest } = params;
    switch (action) {
      case 'list': return conflictHandlers.list(rest);
      case 'resolve': return conflictHandlers.resolve(rest);
      default: throw new Error(`Unknown action for memory_conflict: ${action}`);
    }
  },
};

// =============================================================================
// SERVER SETUP
// =============================================================================

export async function createServer(): Promise<Server> {
  const server = new Server(
    {
      name: 'agent-memory',
      version: '0.2.0', // Bumped for bundled tools
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

    const handler = bundledHandlers[name];
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
