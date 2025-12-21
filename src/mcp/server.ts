/**
 * MCP Server for Agent Memory Database
 *
 * Tool Bundling: 45+ individual tools consolidated into 25 action-based tools:
 * - memory_org (create, list)
 * - memory_project (create, list, get, update)
 * - memory_session (start, end, list)
 * - memory_tool (add, update, get, list, history, deactivate, delete)
 * - memory_guideline (add, update, get, list, history, deactivate, delete)
 * - memory_knowledge (add, update, get, list, history, deactivate, delete)
 * - memory_tag (create, list, attach, detach, for_entry)
 * - memory_relation (create, list, delete)
 * - memory_file_lock (checkout, checkin, status, list, force_unlock)
 * - memory_query (search, context)
 * - memory_conflict (list, resolve)
 * - memory_init (init, status, reset)
 * - memory_export (export)
 * - memory_import (import)
 * - memory_task (add, get, list)
 * - memory_voting (record_vote, get_consensus, list_votes, get_stats)
 * - memory_analytics (get_stats, get_trends)
 * - memory_permission (grant, revoke, check, list)
 * - memory_health (health check)
 * - memory_backup (create, list, cleanup, restore)
 * - memory_consolidate (find_similar, dedupe, merge, abstract, archive_stale)
 * - memory_conversation (start, add_message, get, list, update, link_context, get_context, search, end, archive)
 * - memory_hook (generate, install, status, uninstall)
 * - memory_verify (pre_check, post_check, acknowledge, status)
 * - memory_observe (extract, draft, commit, status)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import {
  getDb,
  closeDb,
  getSqlite,
  getDbWithHealthCheck,
  startHealthCheckInterval,
} from '../db/connection.js';
import { cleanupExpiredLocks, cleanupStaleLocks } from '../db/repositories/file_locks.js';
import { tagRepo } from '../db/repositories/tags.js';
import { queryHandlers } from './handlers/query.handler.js';
import { conflictHandlers } from './handlers/conflicts.handler.js';
import { getQueryCacheStats } from '../services/query.service.js';
import { formatError, createInvalidActionError } from './errors.js';
import { formatOutput } from '../utils/compact-formatter.js';
import { logger } from '../utils/logger.js';

// Import handlers
import { scopeHandlers } from './handlers/scopes.handler.js';
import { toolHandlers } from './handlers/tools.handler.js';
import { guidelineHandlers } from './handlers/guidelines.handler.js';
import { knowledgeHandlers } from './handlers/knowledge.handler.js';
import { tagHandlers } from './handlers/tags.handler.js';
import { relationHandlers } from './handlers/relations.handler.js';
import { fileLockHandlers } from './handlers/file_locks.handler.js';
import { initHandlers } from './handlers/init.handler.js';
import { exportHandlers } from './handlers/export.handler.js';
import { importHandlers } from './handlers/import.handler.js';
import {
  taskHandlers,
  type TaskAddParams,
  type TaskGetParams,
  type TaskListParams,
} from './handlers/tasks.handler.js';
import { votingHandlers } from './handlers/voting.handler.js';
import { analyticsHandlers } from './handlers/analytics.handler.js';
import type {
  OrgCreateParams,
  OrgListParams,
  ProjectCreateParams,
  ProjectListParams,
  ProjectGetParams,
  ProjectUpdateParams,
  ProjectDeleteParams,
  SessionStartParams,
  SessionEndParams,
  SessionListParams,
  TagCreateParams,
  TagListParams,
  TagAttachParams,
  TagDetachParams,
  TagsForEntryParams,
  FileCheckoutParams,
  FileCheckinParams,
  FileLockStatusParams,
  FileLockListParams,
  FileLockForceUnlockParams,
  ConflictListParams,
  ConflictResolveParams,
  VotingRecordVoteParams,
  VotingGetConsensusParams,
  VotingListVotesParams,
  VotingGetStatsParams,
  AnalyticsGetStatsParams,
  AnalyticsGetTrendsParams,
  AnalyticsGetSubtaskStatsParams,
  AnalyticsGetErrorCorrelationParams,
  AnalyticsGetLowDiversityParams,
  ConsolidationParams,
} from './types.js';
import { permissionHandlers } from './handlers/permissions.handler.js';
import { conversationHandlers } from './handlers/conversations.handler.js';
import { backupHandlers } from './handlers/backup.handler.js';
import { verificationHandlers } from './handlers/verification.handler.js';
import { hooksHandlers } from './handlers/hooks.handler.js';
import { observeHandlers } from './handlers/observe.handler.js';
import { handleConsolidation, consolidationTool } from './handlers/consolidation.handler.js';
import { reviewHandlers } from './handlers/review.handler.js';
import { checkRateLimits } from '../utils/rate-limiter.js';
import { VERSION } from '../version.js';

/**
 * Type assertion helper for MCP params.
 * MCP provides params as Record<string, unknown> at runtime, but handlers
 * expect typed params. This helper provides a clean cast while preserving
 * runtime validation in handlers.
 */
function asParams<T>(params: Record<string, unknown>): T {
  return params as T;
}

// =============================================================================
// BUNDLED TOOL DEFINITIONS (20 tools)
// =============================================================================

export const TOOLS: Tool[] = [
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
    description: `Manage working sessions (group related work together).

Actions: start, end, list

Workflow: Start a session at beginning of a task, end when complete. Sessions group related memory entries.
Example: {"action":"start","projectId":"proj-123","name":"Add auth feature","purpose":"Implement user authentication"}`,
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
        status: {
          type: 'string',
          enum: ['completed', 'discarded', 'active', 'paused'],
          description: 'End status (end) or filter (list)',
        },
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
    description: `Manage tool definitions (store reusable tool patterns for future reference).

Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete

When to store: After successfully using a tool/command that could be reused.
Example: {"action":"add","name":"docker-build","description":"Build Docker image","scopeType":"project","category":"cli"}`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'add',
            'update',
            'get',
            'list',
            'history',
            'deactivate',
            'delete',
            'bulk_add',
            'bulk_update',
            'bulk_delete',
          ],
          description: 'Action to perform',
        },
        // common params
        id: { type: 'string', description: 'Tool ID' },
        name: { type: 'string', description: 'Tool name' },
        scopeType: {
          type: 'string',
          enum: ['global', 'org', 'project', 'session'],
          description: 'Scope level',
        },
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
    description: `Manage coding/behavioral guidelines (rules the AI should follow).

Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete

When to store: When user establishes a coding standard, pattern preference, or rule.
Example: {"action":"add","name":"no-any","content":"Never use 'any' type","scopeType":"project","category":"code_style","priority":90}`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'add',
            'update',
            'get',
            'list',
            'history',
            'deactivate',
            'delete',
            'bulk_add',
            'bulk_update',
            'bulk_delete',
          ],
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
    description: `Manage knowledge entries (facts, decisions, context to remember).

Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete

When to store: After making a decision, learning a fact, or establishing context worth remembering.
Example: {"action":"add","title":"API uses REST","content":"This project uses REST API, not GraphQL","scopeType":"project","category":"decision"}`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'add',
            'update',
            'get',
            'list',
            'history',
            'deactivate',
            'delete',
            'bulk_add',
            'bulk_update',
            'bulk_delete',
          ],
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
        agentId: { type: 'string', description: 'Agent identifier for access control/auditing' },
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
        agentId: { type: 'string', description: 'Agent identifier for access control/auditing' },
        // common params
        id: { type: 'string', description: 'Relation ID (delete)' },
        sourceType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        sourceId: { type: 'string' },
        targetType: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'project'] },
        targetId: { type: 'string' },
        relationType: {
          type: 'string',
          enum: [
            'applies_to',
            'depends_on',
            'conflicts_with',
            'related_to',
            'parent_task',
            'subtask_of',
          ],
        },
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
    description:
      'Manage file locks for multi-agent coordination. Actions: checkout, checkin, status, list, force_unlock',
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
    description: `Query and aggregate memory. **IMPORTANT: Call this FIRST at conversation start with action:"context" to load project context.**

Actions:
- context: Get aggregated context for a scope (RECOMMENDED FIRST CALL)
- search: Cross-reference search with filters

Quick start: {"action":"context","scopeType":"project","inherit":true}`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'context'],
          description: 'Action to perform',
        },
        // auth/identity (required for permission checks)
        agentId: { type: 'string', description: 'Agent identifier for access control/auditing' },
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
            relation: {
              type: 'string',
              enum: ['applies_to', 'depends_on', 'conflicts_with', 'related_to'],
            },
            depth: {
              type: 'number',
              description: 'Max traversal depth 1-5 (default: 1)',
            },
            direction: {
              type: 'string',
              enum: ['forward', 'backward', 'both'],
              description: 'Traversal direction (default: both)',
            },
            maxResults: {
              type: 'number',
              description: 'Limit results from traversal (default: 100)',
            },
          },
          description: 'Find related entries (search)',
        },
        followRelations: {
          type: 'boolean',
          description: 'Expand search results to include related entries',
        },
        includeVersions: { type: 'boolean', description: 'Include version history (search)' },
        includeInactive: { type: 'boolean', description: 'Include inactive entries (search)' },
        // FTS5 and advanced filtering params
        useFts5: {
          type: 'boolean',
          description: 'Use FTS5 full-text search instead of LIKE queries (default: false)',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Field-specific search: ["name", "description"]',
        },
        fuzzy: { type: 'boolean', description: 'Enable typo tolerance (Levenshtein distance)' },
        createdAfter: { type: 'string', description: 'Filter by creation date (ISO timestamp)' },
        createdBefore: { type: 'string', description: 'Filter by creation date (ISO timestamp)' },
        updatedAfter: { type: 'string', description: 'Filter by update date (ISO timestamp)' },
        updatedBefore: { type: 'string', description: 'Filter by update date (ISO timestamp)' },
        priority: {
          type: 'object',
          properties: {
            min: { type: 'number' },
            max: { type: 'number' },
          },
          description: 'Filter guidelines by priority range (0-100)',
        },
        regex: { type: 'boolean', description: 'Use regex instead of simple match' },
        semanticSearch: {
          type: 'boolean',
          description: 'Enable semantic/vector search (default: true if embeddings available)',
        },
        semanticThreshold: {
          type: 'number',
          description: 'Minimum similarity score for semantic results (0-1, default: 0.7)',
        },
        // context params
        scopeType: {
          type: 'string',
          enum: ['global', 'org', 'project', 'session'],
          description: 'Scope type (context)',
        },
        scopeId: { type: 'string', description: 'Scope ID (context)' },
        inherit: { type: 'boolean', description: 'Include parent scopes (context, default true)' },
        // common params
        compact: { type: 'boolean', description: 'Return compact results' },
        limit: {
          type: 'number',
          description: 'Max results (search) or per type (context as limitPerType)',
        },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // TASK DECOMPOSITION
  // -------------------------------------------------------------------------
  {
    name: 'memory_task',
    description: 'Manage task decomposition. Actions: add, get, list',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'get', 'list'],
          description: 'Action to perform',
        },
        // add params
        parentTask: { type: 'string', description: 'ID of parent task (add)' },
        subtasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of subtask descriptions/names (add)',
        },
        decompositionStrategy: {
          type: 'string',
          enum: ['maximal', 'balanced', 'minimal'],
          description: 'Decomposition strategy (add)',
        },
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        scopeId: { type: 'string' },
        projectId: { type: 'string', description: 'For storing decomposition metadata (add)' },
        createdBy: { type: 'string' },
        // get params
        taskId: { type: 'string', description: 'Task ID (get)' },
        // list params
        parentTaskId: { type: 'string', description: 'Filter by parent task ID (list)' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // MULTI-AGENT VOTING
  // -------------------------------------------------------------------------
  {
    name: 'memory_voting',
    description:
      'Manage multi-agent voting and consensus. Actions: record_vote, get_consensus, list_votes, get_stats',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['record_vote', 'get_consensus', 'list_votes', 'get_stats'],
          description: 'Action to perform',
        },
        // record_vote params
        taskId: { type: 'string', description: 'Task ID (references knowledge/tool entry)' },
        agentId: { type: 'string', description: 'Agent identifier' },
        voteValue: {
          type: 'object',
          description: 'Agent vote value (any JSON-serializable value)',
        },
        confidence: { type: 'number', description: 'Confidence level 0-1 (default: 1.0)' },
        reasoning: { type: 'string', description: 'Reasoning for this vote' },
        // get_consensus params
        k: {
          type: 'number',
          description: 'Number of votes ahead required for consensus (default: 1)',
        },
        // list_votes and get_stats use taskId
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // USAGE ANALYTICS
  // -------------------------------------------------------------------------
  {
    name: 'memory_analytics',
    description:
      'Get usage analytics and trends from audit log. Actions: get_stats, get_trends, get_subtask_stats, get_error_correlation, get_low_diversity',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'get_stats',
            'get_trends',
            'get_subtask_stats',
            'get_error_correlation',
            'get_low_diversity',
          ],
          description: 'Action to perform',
        },
        // Filter params (get_stats, get_trends)
        scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
        scopeId: { type: 'string', description: 'Scope ID to filter by' },
        startDate: { type: 'string', description: 'Start date filter (ISO timestamp)' },
        endDate: { type: 'string', description: 'End date filter (ISO timestamp)' },
        // get_subtask_stats params
        projectId: { type: 'string', description: 'Project ID for subtask stats' },
        subtaskType: { type: 'string', description: 'Filter by subtask type' },
        // get_error_correlation params
        agentA: { type: 'string', description: 'First agent ID for correlation' },
        agentB: { type: 'string', description: 'Second agent ID for correlation' },
        timeWindow: {
          type: 'object',
          description: 'Time window for correlation analysis',
          properties: {
            start: { type: 'string' },
            end: { type: 'string' },
          },
        },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // PERMISSIONS
  // -------------------------------------------------------------------------
  {
    name: 'memory_permission',
    description: 'Manage permissions. Actions: grant, revoke, check, list',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['grant', 'revoke', 'check', 'list'],
          description: 'Action to perform',
        },
        // admin auth (required for grant/revoke/list)
        admin_key: { type: 'string', description: 'Admin key (grant, revoke, list)' },
        // grant params
        agent_id: { type: 'string', description: 'Agent identifier (grant, revoke, check, list)' },
        scope_type: {
          type: 'string',
          enum: ['global', 'org', 'project', 'session'],
          description: 'Scope type (grant, revoke, check, list)',
        },
        scope_id: { type: 'string', description: 'Scope ID (grant, revoke, check, list)' },
        entry_type: {
          type: 'string',
          enum: ['tool', 'guideline', 'knowledge'],
          description: 'Entry type (grant, revoke, check, list)',
        },
        permission: {
          type: 'string',
          enum: ['read', 'write', 'admin'],
          description: 'Permission level (grant)',
        },
        created_by: { type: 'string', description: 'Creator identifier (grant)' },
        // revoke params
        permission_id: { type: 'string', description: 'Permission ID (revoke)' },
        // check params - 'action' field here refers to the permission action to check (read/write)
        // Note: The tool action is 'check', but the handler also uses 'action' for the permission action
        // list params
        limit: { type: 'number', description: 'Max results (list, default: all)' },
        offset: { type: 'number', description: 'Skip N results (list)' },
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
        entryType: {
          type: 'string',
          enum: ['tool', 'guideline', 'knowledge'],
          description: 'Filter by entry type (list)',
        },
        resolved: {
          type: 'boolean',
          description: 'Filter by resolved status (list, default: unresolved only)',
        },
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

  // -------------------------------------------------------------------------
  // HEALTH CHECK
  // -------------------------------------------------------------------------
  {
    name: 'memory_health',
    description: `Check server health and database status. Returns version, database stats, and cache info.

Use this to verify the memory server is working or to get entry counts.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // -------------------------------------------------------------------------
  // DATABASE BACKUP
  // -------------------------------------------------------------------------
  {
    name: 'memory_backup',
    description:
      'Manage database backups. Actions: create (create backup), list (list all backups), cleanup (remove old backups), restore (restore from backup)',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'cleanup', 'restore'],
          description: 'Action to perform',
        },
        admin_key: { type: 'string', description: 'Admin key (required)' },
        // create params
        name: {
          type: 'string',
          description: 'Custom backup name (create, optional)',
        },
        // cleanup params
        keepCount: {
          type: 'number',
          description: 'Number of backups to keep (cleanup, default: 5)',
        },
        // restore params
        filename: {
          type: 'string',
          description: 'Backup filename to restore (restore)',
        },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // DATABASE INITIALIZATION
  // -------------------------------------------------------------------------
  {
    name: 'memory_init',
    description:
      'Manage database initialization and migrations. Actions: init (initialize/migrate), status (check migration status), reset (reset database - WARNING: deletes all data)',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['init', 'status', 'reset', 'verify'],
          description: 'Action to perform',
        },
        admin_key: { type: 'string', description: 'Admin key (required for init/reset)' },
        // init params
        force: {
          type: 'boolean',
          description: 'Force re-initialization even if already initialized (init)',
        },
        verbose: { type: 'boolean', description: 'Enable verbose output (init, reset)' },
        // reset params
        confirm: {
          type: 'boolean',
          description:
            'Confirm database reset - required for reset action. WARNING: This deletes all data!',
        },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // EXPORT
  // -------------------------------------------------------------------------
  {
    name: 'memory_export',
    description: 'Export memory entries to various formats. Actions: export',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['export'],
          description: 'Action to perform',
        },
        agentId: { type: 'string', description: 'Agent identifier for access control/auditing' },
        admin_key: { type: 'string', description: 'Admin key (required when writing to disk)' },
        format: {
          type: 'string',
          enum: ['json', 'markdown', 'yaml', 'openapi'],
          description: 'Export format (default: json)',
        },
        types: {
          type: 'array',
          items: { type: 'string', enum: ['tools', 'guidelines', 'knowledge'] },
          description: 'Entry types to export (default: all)',
        },
        scopeType: {
          type: 'string',
          enum: ['global', 'org', 'project', 'session'],
          description: 'Scope type to export from',
        },
        scopeId: { type: 'string', description: 'Scope ID (required if scopeType specified)' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags (include entries with any of these tags)',
        },
        includeVersions: {
          type: 'boolean',
          description: 'Include version history in export (default: false)',
        },
        includeInactive: {
          type: 'boolean',
          description: 'Include inactive/deleted entries (default: false)',
        },
        filename: {
          type: 'string',
          description:
            'Optional filename to save export to configured export directory. If not provided, content is returned in response only.',
        },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // IMPORT
  // -------------------------------------------------------------------------
  {
    name: 'memory_import',
    description: 'Import memory entries from various formats. Actions: import',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['import'],
          description: 'Action to perform',
        },
        admin_key: { type: 'string', description: 'Admin key (required)' },
        content: {
          type: 'string',
          description: 'Content to import (JSON string, YAML string, Markdown, or OpenAPI spec)',
        },
        format: {
          type: 'string',
          enum: ['json', 'yaml', 'markdown', 'openapi'],
          description: 'Import format (default: json, auto-detected if possible)',
        },
        conflictStrategy: {
          type: 'string',
          enum: ['skip', 'update', 'replace', 'error'],
          description: 'How to handle conflicts with existing entries (default: update)',
        },
        scopeMapping: {
          type: 'object',
          description:
            'Map scope IDs from import to target scopes: { "oldScopeId": { "type": "org|project|session", "id": "newScopeId" } }',
        },
        generateNewIds: {
          type: 'boolean',
          description:
            'Generate new IDs for imported entries instead of preserving originals (default: false)',
        },
        importedBy: { type: 'string', description: 'Agent ID or identifier for audit trail' },
      },
      required: ['action', 'content'],
    },
  },

  // -------------------------------------------------------------------------
  // CONVERSATION HISTORY
  // -------------------------------------------------------------------------
  {
    name: 'memory_conversation',
    description:
      'Manage conversation history. Actions: start, add_message, get, list, update, link_context, get_context, search, end, archive',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'start',
            'add_message',
            'get',
            'list',
            'update',
            'link_context',
            'get_context',
            'search',
            'end',
            'archive',
          ],
          description: 'Action to perform',
        },
        // start params
        sessionId: { type: 'string', description: 'Session ID (start)' },
        projectId: { type: 'string', description: 'Project ID (start)' },
        agentId: {
          type: 'string',
          description: 'Agent ID (start, add_message, etc.)',
        },
        title: { type: 'string', description: 'Conversation title (start, update)' },
        metadata: { type: 'object', description: 'Optional metadata (start, update)' },
        // add_message params
        conversationId: {
          type: 'string',
          description: 'Conversation ID (add_message, get, update, etc.)',
        },
        role: {
          type: 'string',
          enum: ['user', 'agent', 'system'],
          description: 'Message role (add_message)',
        },
        content: { type: 'string', description: 'Message content (add_message)' },
        contextEntries: {
          type: 'array',
          description: 'Memory entries used (add_message)',
        },
        toolsUsed: { type: 'array', description: 'Tools invoked (add_message)' },
        // get params
        includeMessages: { type: 'boolean', description: 'Include messages (get)' },
        includeContext: { type: 'boolean', description: 'Include context links (get)' },
        // list params
        status: {
          type: 'string',
          enum: ['active', 'completed', 'archived'],
          description: 'Filter by status (list)',
        },
        // link_context params
        messageId: { type: 'string', description: 'Message ID (link_context)' },
        entryType: {
          type: 'string',
          enum: ['tool', 'guideline', 'knowledge'],
          description: 'Entry type (link_context, get_context)',
        },
        entryId: { type: 'string', description: 'Entry ID (link_context, get_context)' },
        relevanceScore: {
          type: 'number',
          description: 'Relevance score 0-1 (link_context)',
        },
        // search params
        search: { type: 'string', description: 'Search query (search)' },
        // end params
        generateSummary: {
          type: 'boolean',
          description: 'Generate summary when ending (end)',
        },
        // common params
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // VERIFICATION
  // -------------------------------------------------------------------------
  {
    name: 'memory_verify',
    description: `Verify actions against critical guidelines with active intervention.

Actions:
- pre_check: REQUIRED before file modifications or code generation. Returns {blocked: true} if violation detected.
- post_check: Log completed action for compliance tracking
- acknowledge: Acknowledge critical guidelines for session
- status: Get verification status for a session

IMPORTANT: Agents MUST call pre_check before significant actions.
If blocked=true is returned, DO NOT proceed with the action.`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['pre_check', 'post_check', 'acknowledge', 'status'],
          description: 'Verification action to perform',
        },
        sessionId: {
          type: 'string',
          description: 'Current session ID',
        },
        projectId: {
          type: 'string',
          description: 'Project ID (optional, derived from session if not provided)',
        },
        proposedAction: {
          type: 'object',
          description: 'Action to verify (pre_check)',
          properties: {
            type: {
              type: 'string',
              enum: ['file_write', 'code_generate', 'api_call', 'command', 'other'],
              description: 'Type of action',
            },
            description: { type: 'string', description: 'Description of action' },
            filePath: { type: 'string', description: 'File path (if applicable)' },
            content: { type: 'string', description: 'Content being created/modified' },
            metadata: { type: 'object', description: 'Additional metadata' },
          },
          required: ['type'],
        },
        completedAction: {
          type: 'object',
          description: 'Completed action to log (post_check)',
        },
        content: {
          type: 'string',
          description: 'Response content to verify (post_check alternative)',
        },
        guidelineIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Guideline IDs to acknowledge (acknowledge)',
        },
        agentId: {
          type: 'string',
          description: 'Agent identifier',
        },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // HOOK MANAGEMENT
  // -------------------------------------------------------------------------
  {
    name: 'memory_hook',
    description: `Generate and manage IDE verification hooks.

Actions:
- generate: Generate hook files without installing (returns content and instructions)
- install: Generate and install hooks to the filesystem
- status: Check if hooks are installed for a project
- uninstall: Remove installed hooks

Supported IDEs: claude (Claude Code), cursor (Cursor), vscode (VS Code)`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['generate', 'install', 'status', 'uninstall'],
          description: 'Action to perform',
        },
        ide: {
          type: 'string',
          enum: ['claude', 'cursor', 'vscode'],
          description: 'Target IDE',
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        projectId: {
          type: 'string',
          description: 'Project ID for loading guidelines (optional)',
        },
        sessionId: {
          type: 'string',
          description: 'Session ID for loading guidelines (optional)',
        },
      },
      required: ['action', 'ide', 'projectPath'],
    },
  },

  // -------------------------------------------------------------------------
  // AUTO-CAPTURE OBSERVATION
  // -------------------------------------------------------------------------
  {
    name: 'memory_observe',
    description: `Extract memory entries from conversation/code context using LLM analysis.

Actions:
- extract: Analyze context and extract guidelines, knowledge, and tool patterns
- draft: Return strict schema + prompt template for client-assisted extraction
- commit: Store client-extracted entries (supports auto-promote)
- status: Check extraction service availability

When to use: After meaningful conversations or code reviews to capture decisions, facts, and patterns.
Example: {"action":"extract","context":"User said we should always use TypeScript strict mode...","scopeType":"project","scopeId":"proj-123","autoStore":true}

Returns extracted entries with confidence scores and duplicate detection.`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['extract', 'draft', 'commit', 'status'],
          description: 'Action to perform',
        },
        context: {
          type: 'string',
          description: 'Raw conversation or code context to analyze',
        },
        contextType: {
          type: 'string',
          enum: ['conversation', 'code', 'mixed'],
          description: 'Type of context (default: mixed)',
        },
        scopeType: {
          type: 'string',
          enum: ['global', 'org', 'project', 'session'],
          description: 'Scope for extracted entries (default: project)',
        },
        scopeId: {
          type: 'string',
          description: 'Scope ID (required for non-global scopes)',
        },
        autoStore: {
          type: 'boolean',
          description: 'Automatically store entries above confidence threshold (default: false)',
        },
        confidenceThreshold: {
          type: 'number',
          description: 'Minimum confidence to auto-store (0-1, default: 0.7)',
        },
        focusAreas: {
          type: 'array',
          items: { type: 'string', enum: ['decisions', 'facts', 'rules', 'tools'] },
          description: 'Focus extraction on specific types',
        },
        agentId: {
          type: 'string',
          description: 'Agent identifier for audit',
        },
        sessionId: {
          type: 'string',
          description: 'Session ID (required for draft/commit)',
        },
        projectId: {
          type: 'string',
          description: 'Project ID (optional, enables project auto-promote)',
        },
        entries: {
          type: 'array',
          description: 'Client-extracted entries (required for commit)',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['guideline', 'knowledge', 'tool'] },
              name: { type: 'string' },
              title: { type: 'string' },
              content: { type: 'string' },
              category: { type: 'string' },
              priority: { type: 'number' },
              confidence: { type: 'number' },
              rationale: { type: 'string' },
              suggestedTags: { type: 'array', items: { type: 'string' } },
            },
            required: ['type', 'content', 'confidence'],
          },
        },
        autoPromote: {
          type: 'boolean',
          description:
            'If true, entries above threshold can be stored at project scope when projectId is provided (default: on)',
        },
        autoPromoteThreshold: {
          type: 'number',
          description: 'Confidence threshold for auto-promotion (0-1, default: 0.85)',
        },
      },
      required: ['action'],
    },
  },

  // -------------------------------------------------------------------------
  // MEMORY CONSOLIDATION
  // -------------------------------------------------------------------------
  consolidationTool,

  // -------------------------------------------------------------------------
  // REVIEW CANDIDATES
  // -------------------------------------------------------------------------
  {
    name: 'memory_review',
    description: `Review candidate memory entries from a session.

Actions:
- list: List all candidates pending review in a session
- show: Show full details of a specific candidate
- approve: Promote candidate to project scope
- reject: Deactivate/reject candidate
- skip: Remove from review queue without action

Use this tool to review entries extracted during a session before promoting them to project scope.
Example: {"action":"list","sessionId":"sess-123"}`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'show', 'approve', 'reject', 'skip'],
          description: 'Action to perform',
        },
        sessionId: {
          type: 'string',
          description: 'Session ID to review candidates from',
        },
        entryId: {
          type: 'string',
          description: 'Entry ID or short ID (for show, approve, reject, skip)',
        },
        projectId: {
          type: 'string',
          description: 'Target project ID for approved entries (optional, derived from session if not provided)',
        },
      },
      required: ['action', 'sessionId'],
    },
  },
];

// =============================================================================
// HANDLER DISPATCH - Action-based routing
// =============================================================================

type ActionHandler = (params: Record<string, unknown>) => unknown;
type ActionRegistry = Record<string, ActionHandler>;

/**
 * Creates an action dispatcher from a registry of action handlers.
 * Eliminates repetitive switch statements for action-based routing.
 *
 * @param toolName - Name of the tool for error messages
 * @param registry - Map of action names to handler functions
 * @returns A bundled handler that routes by action
 */
function createActionDispatcher(
  toolName: string,
  registry: ActionRegistry
): (params: Record<string, unknown>) => unknown {
  return (params: Record<string, unknown>) => {
    const { action, ...rest } = params;
    const handler = registry[action as string];
    if (!handler) {
      throw createInvalidActionError(toolName, String(action), Object.keys(registry));
    }
    return handler(rest);
  };
}

// =============================================================================
// ACTION REGISTRIES - Define action→handler mappings
// =============================================================================

const orgActions: ActionRegistry = {
  create: (p) => scopeHandlers.orgCreate(asParams<OrgCreateParams & { adminKey?: string }>(p)),
  list: (p) => scopeHandlers.orgList(asParams<OrgListParams>(p)),
};

const projectActions: ActionRegistry = {
  create: (p) => scopeHandlers.projectCreate(asParams<ProjectCreateParams & { adminKey?: string }>(p)),
  list: (p) => scopeHandlers.projectList(asParams<ProjectListParams>(p)),
  get: (p) => scopeHandlers.projectGet(asParams<ProjectGetParams>(p)),
  update: (p) => scopeHandlers.projectUpdate(asParams<ProjectUpdateParams & { adminKey?: string }>(p)),
  delete: (p) => scopeHandlers.projectDelete(asParams<ProjectDeleteParams & { adminKey?: string }>(p)),
};

const sessionActions: ActionRegistry = {
  start: (p) => scopeHandlers.sessionStart(asParams<SessionStartParams>(p)),
  end: (p) => scopeHandlers.sessionEnd(asParams<SessionEndParams>(p)),
  list: (p) => scopeHandlers.sessionList(asParams<SessionListParams>(p)),
};

const toolActions: ActionRegistry = {
  add: toolHandlers.add,
  update: toolHandlers.update,
  get: toolHandlers.get,
  list: toolHandlers.list,
  history: toolHandlers.history,
  deactivate: toolHandlers.deactivate,
  delete: toolHandlers.delete,
  bulk_add: toolHandlers.bulk_add,
  bulk_update: toolHandlers.bulk_update,
  bulk_delete: toolHandlers.bulk_delete,
};

const guidelineActions: ActionRegistry = {
  add: guidelineHandlers.add,
  update: guidelineHandlers.update,
  get: guidelineHandlers.get,
  list: guidelineHandlers.list,
  history: guidelineHandlers.history,
  deactivate: guidelineHandlers.deactivate,
  delete: guidelineHandlers.delete,
  bulk_add: guidelineHandlers.bulk_add,
  bulk_update: guidelineHandlers.bulk_update,
  bulk_delete: guidelineHandlers.bulk_delete,
};

const knowledgeActions: ActionRegistry = {
  add: knowledgeHandlers.add,
  update: knowledgeHandlers.update,
  get: knowledgeHandlers.get,
  list: knowledgeHandlers.list,
  history: knowledgeHandlers.history,
  deactivate: knowledgeHandlers.deactivate,
  delete: knowledgeHandlers.delete,
  bulk_add: knowledgeHandlers.bulk_add,
  bulk_update: knowledgeHandlers.bulk_update,
  bulk_delete: knowledgeHandlers.bulk_delete,
};

const tagActions: ActionRegistry = {
  create: (p) => tagHandlers.create(asParams<TagCreateParams>(p)),
  list: (p) => tagHandlers.list(asParams<TagListParams>(p)),
  attach: (p) => tagHandlers.attach(asParams<TagAttachParams>(p)),
  detach: (p) => tagHandlers.detach(asParams<TagDetachParams>(p)),
  for_entry: (p) => tagHandlers.forEntry(asParams<TagsForEntryParams>(p)),
};

const relationActions: ActionRegistry = {
  create: relationHandlers.create,
  list: relationHandlers.list,
  delete: relationHandlers.delete,
};

const fileLockActions: ActionRegistry = {
  checkout: (p) => fileLockHandlers.checkout(asParams<FileCheckoutParams>(p)),
  checkin: (p) => fileLockHandlers.checkin(asParams<FileCheckinParams>(p)),
  status: (p) => fileLockHandlers.status(asParams<FileLockStatusParams>(p)),
  list: (p) => fileLockHandlers.list(asParams<FileLockListParams>(p)),
  force_unlock: (p) => fileLockHandlers.forceUnlock(asParams<FileLockForceUnlockParams>(p)),
};

const conflictActions: ActionRegistry = {
  list: (p) => conflictHandlers.list(asParams<ConflictListParams>(p)),
  resolve: (p) => conflictHandlers.resolve(asParams<ConflictResolveParams>(p)),
};

const taskActions: ActionRegistry = {
  add: (p) => taskHandlers.add(p as unknown as TaskAddParams),
  get: (p) => taskHandlers.get(p as unknown as TaskGetParams),
  list: (p) => taskHandlers.list(p as unknown as TaskListParams),
};

const votingActions: ActionRegistry = {
  record_vote: (p) => votingHandlers.record_vote(asParams<VotingRecordVoteParams>(p)),
  get_consensus: (p) => votingHandlers.get_consensus(asParams<VotingGetConsensusParams>(p)),
  list_votes: (p) => votingHandlers.list_votes(asParams<VotingListVotesParams>(p)),
  get_stats: (p) => votingHandlers.get_stats(asParams<VotingGetStatsParams>(p)),
};

const analyticsActions: ActionRegistry = {
  get_stats: (p) => analyticsHandlers.get_stats(asParams<AnalyticsGetStatsParams>(p)),
  get_trends: (p) => analyticsHandlers.get_trends(asParams<AnalyticsGetTrendsParams>(p)),
  get_subtask_stats: (p) => analyticsHandlers.get_subtask_stats(asParams<AnalyticsGetSubtaskStatsParams>(p)),
  get_error_correlation: (p) => analyticsHandlers.get_error_correlation(asParams<AnalyticsGetErrorCorrelationParams>(p)),
  get_low_diversity: (p) => analyticsHandlers.get_low_diversity(asParams<AnalyticsGetLowDiversityParams>(p)),
};

const permissionActions: ActionRegistry = {
  grant: permissionHandlers.grant,
  revoke: permissionHandlers.revoke,
  check: permissionHandlers.check,
  list: permissionHandlers.list,
};

const initActions: ActionRegistry = {
  init: initHandlers.init,
  status: initHandlers.status,
  reset: initHandlers.reset,
  verify: initHandlers.verify,
};

const backupActions: ActionRegistry = {
  create: (p) => backupHandlers.create(p as { name?: string }),
  list: backupHandlers.list,
  cleanup: (p) => backupHandlers.cleanup(p as { keepCount?: number }),
  restore: (p) => backupHandlers.restore(p as { filename: string }),
};

const exportActions: ActionRegistry = {
  export: exportHandlers.export,
};

const importActions: ActionRegistry = {
  import: importHandlers.import,
};

const conversationActions: ActionRegistry = {
  start: conversationHandlers.start,
  add_message: conversationHandlers.addMessage,
  get: conversationHandlers.get,
  list: conversationHandlers.list,
  update: conversationHandlers.update,
  link_context: conversationHandlers.linkContext,
  get_context: conversationHandlers.getContext,
  search: conversationHandlers.search,
  end: conversationHandlers.end,
  archive: conversationHandlers.archive,
};

const verifyActions: ActionRegistry = {
  pre_check: verificationHandlers.preCheck,
  post_check: verificationHandlers.postCheck,
  acknowledge: verificationHandlers.acknowledge,
  status: verificationHandlers.status,
};

const hookActions: ActionRegistry = {
  generate: hooksHandlers.generate,
  install: hooksHandlers.install,
  status: hooksHandlers.status,
  uninstall: hooksHandlers.uninstall,
};

const observeActions: ActionRegistry = {
  extract: observeHandlers.extract,
  draft: observeHandlers.draft,
  commit: observeHandlers.commit,
  status: () => observeHandlers.status(),
};

const reviewActions: ActionRegistry = {
  list: (p) => reviewHandlers.list(p as { sessionId: string }),
  show: (p) => reviewHandlers.show(p as { sessionId: string; entryId: string }),
  approve: (p) => reviewHandlers.approve(p as { sessionId: string; entryId: string; projectId?: string }),
  reject: (p) => reviewHandlers.reject(p as { sessionId: string; entryId: string }),
  skip: (p) => reviewHandlers.skip(p as { sessionId: string; entryId: string }),
};

// =============================================================================
// BUNDLED HANDLERS - Using registry pattern
// =============================================================================

// Bundled handlers that route by action
const bundledHandlers: Record<string, (params: Record<string, unknown>) => unknown> = {
  memory_org: createActionDispatcher('memory_org', orgActions),
  memory_project: createActionDispatcher('memory_project', projectActions),
  memory_session: createActionDispatcher('memory_session', sessionActions),
  memory_tool: createActionDispatcher('memory_tool', toolActions),
  memory_guideline: createActionDispatcher('memory_guideline', guidelineActions),
  memory_knowledge: createActionDispatcher('memory_knowledge', knowledgeActions),
  memory_tag: createActionDispatcher('memory_tag', tagActions),
  memory_relation: createActionDispatcher('memory_relation', relationActions),
  memory_file_lock: createActionDispatcher('memory_file_lock', fileLockActions),
  memory_conflict: createActionDispatcher('memory_conflict', conflictActions),
  memory_task: createActionDispatcher('memory_task', taskActions),
  memory_voting: createActionDispatcher('memory_voting', votingActions),
  memory_analytics: createActionDispatcher('memory_analytics', analyticsActions),
  memory_permission: createActionDispatcher('memory_permission', permissionActions),
  memory_init: createActionDispatcher('memory_init', initActions),
  memory_backup: createActionDispatcher('memory_backup', backupActions),
  memory_export: createActionDispatcher('memory_export', exportActions),
  memory_import: createActionDispatcher('memory_import', importActions),
  memory_conversation: createActionDispatcher('memory_conversation', conversationActions),
  memory_verify: createActionDispatcher('memory_verify', verifyActions),
  memory_hook: createActionDispatcher('memory_hook', hookActions),
  memory_observe: createActionDispatcher('memory_observe', observeActions),
  memory_consolidate: (params) => handleConsolidation(asParams<ConsolidationParams>(params)),
  memory_review: createActionDispatcher('memory_review', reviewActions),

  // Special handlers that need custom logic beyond simple dispatch
  memory_query: (params) => {
    const { action, ...rest } = params;
    if (action === 'search') {
      return queryHandlers.query(rest);
    }
    if (action === 'context') {
      // Map limit to limitPerType for context action
      const contextParams = { ...rest };
      if ('limit' in contextParams && !('limitPerType' in contextParams)) {
        contextParams.limitPerType = contextParams.limit;
        delete contextParams.limit;
      }
      return queryHandlers.context(contextParams);
    }
    throw createInvalidActionError('memory_query', String(action), ['search', 'context']);
  },

  // memory_health has no action parameter - it's a simple status check
  memory_health: () => {
    const sqlite = getSqlite();
    const cacheStats = getQueryCacheStats();

    const stats: {
      serverVersion: string;
      status: string;
      database: {
        type: string;
        inMemory: boolean;
        walEnabled: boolean;
        error?: string;
      };
      cache: ReturnType<typeof getQueryCacheStats>;
      tables: Record<string, number>;
    } = {
      serverVersion: VERSION,
      status: 'healthy',
      database: {
        type: 'SQLite',
        inMemory: false,
        walEnabled: true,
      },
      cache: cacheStats,
      tables: {},
    };

    try {
      stats.tables = {
        organizations: (sqlite.prepare('SELECT COUNT(*) as count FROM organizations').get() as { count: number }).count,
        projects: (sqlite.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number }).count,
        sessions: (sqlite.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count,
        tools: (sqlite.prepare('SELECT COUNT(*) as count FROM tools WHERE is_active = 1').get() as { count: number }).count,
        guidelines: (sqlite.prepare('SELECT COUNT(*) as count FROM guidelines WHERE is_active = 1').get() as { count: number }).count,
        knowledge: (sqlite.prepare('SELECT COUNT(*) as count FROM knowledge WHERE is_active = 1').get() as { count: number }).count,
        tags: (sqlite.prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number }).count,
        fileLocks: (sqlite.prepare('SELECT COUNT(*) as count FROM file_locks').get() as { count: number }).count,
        conflicts: (sqlite.prepare('SELECT COUNT(*) as count FROM conflict_log WHERE resolved = 0').get() as { count: number }).count,
      };
    } catch (error) {
      stats.status = 'error';
      stats.database.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return stats;
  },
};

// =============================================================================
// SERVER SETUP
// =============================================================================

export async function createServer(): Promise<Server> {
  logger.debug('Creating server...');

  const server = new Server(
    {
      name: 'agent-memory',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  logger.debug('Server instance created');

  // Initialize database (with more defensive error handling)
  try {
    logger.info('Initializing database...');
    // P2-T1: Use health check aware connection
    await getDbWithHealthCheck();
    startHealthCheckInterval();
    logger.info('Database initialized successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.fatal(
      {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Database initialization failed'
    );
    // Don't throw - let the server start anyway, tools will handle errors gracefully
    // This prevents Antigravity from seeing the server as crashed
    logger.warn('Continuing server startup despite database initialization error');
  }

  // Seed predefined tags
  try {
    logger.debug('Seeding predefined tags...');
    tagRepo.seedPredefined();
    logger.debug('Tags seeded successfully');
  } catch (error) {
    logger.warn({ error }, 'Failed to seed tags');
    // Continue anyway - tags aren't critical
  }

  // Cleanup stale file locks
  try {
    const expired = cleanupExpiredLocks();
    const stale = cleanupStaleLocks();
    if (expired.cleaned > 0 || stale.cleaned > 0) {
      logger.info(
        { expired: expired.cleaned, stale: stale.cleaned },
        'Cleaned up stale file locks'
      );
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to cleanup file locks');
  }

  logger.debug('Setting up request handlers...');

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return { tools: TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Rate limiting check
    // Extract agentId from args if available for per-agent limiting
    const agentId =
      args && typeof args === 'object' && 'agentId' in args ? String(args.agentId) : undefined;

    const rateLimitResult = checkRateLimits(agentId);
    if (!rateLimitResult.allowed) {
      logger.warn({ tool: name, agentId, reason: rateLimitResult.reason }, 'Rate limit exceeded');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: rateLimitResult.reason,
                retryAfterMs: rateLimitResult.retryAfterMs,
                code: 'RATE_LIMIT_EXCEEDED',
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    logger.debug({ tool: name, args }, 'Tool call');

    const handler = bundledHandlers[name];
    if (!handler) {
      logger.error(
        { tool: name, availableTools: Object.keys(bundledHandlers) },
        'Handler not found for tool'
      );
      const errorResponse = formatError(
        createInvalidActionError('MCP', name, Object.keys(bundledHandlers))
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorResponse, null, 2),
          },
        ],
        isError: true,
      };
    }

    try {
      // Ensure database is available before processing tool calls
      try {
        getDb();
      } catch (dbError) {
        logger.error({ error: dbError }, 'Database not available for tool call');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatError(
                  new Error(
                    'Database not available. Please check database initialization or run memory_init.'
                  )
                ),
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const result = await handler(args ?? {});
      logger.debug({ tool: name }, 'Tool call successful');

      // Format result based on output mode (compact or JSON)
      let formattedResult: string;
      try {
        formattedResult = formatOutput(result);
      } catch (fmtError) {
        logger.error({ tool: name, error: fmtError }, 'Output formatting error');
        // Fallback to safe JSON serialization
        formattedResult = JSON.stringify(
          {
            error: 'Failed to format result',
            message: fmtError instanceof Error ? fmtError.message : String(fmtError),
            resultType: typeof result,
          },
          null,
          2
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: formattedResult,
          },
        ],
      };
    } catch (error) {
      logger.error(
        {
          tool: name,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Tool call error'
      );
      const errorResponse = formatError(error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorResponse, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  logger.debug('Request handlers configured');
  logger.debug('Server creation complete');

  return server;
}

export async function runServer(): Promise<void> {
  logger.info('Starting MCP server...');
  logger.info(
    { nodeVersion: process.version, platform: process.platform, cwd: process.cwd() },
    'Runtime environment'
  );

  let server: Server;
  try {
    server = await createServer();
    logger.info('Server created successfully');
  } catch (error) {
    logger.fatal(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to create server'
    );
    // Don't exit - try to continue with a minimal server
    // This prevents Antigravity from seeing immediate crash
    logger.warn('Attempting to create minimal server despite errors');
    server = new Server(
      {
        name: 'agent-memory',
        version: VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    // Set up minimal handlers
    server.setRequestHandler(ListToolsRequestSchema, () => {
      return { tools: [] };
    });
    server.setRequestHandler(CallToolRequestSchema, () => {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              formatError(new Error('Server initialization incomplete. Please check logs.')),
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    });
  }

  // =============================================================================
  // SHUTDOWN HANDLING
  // =============================================================================

  function shutdown(signal: string): void {
    logger.info({ signal }, 'Shutdown signal received');

    try {
      // Close database connection
      closeDb();

      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  }

  try {
    const transport = new StdioServerTransport();
    logger.debug('Transport created');

    // Unix/macOS signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Windows: handle Ctrl+C via readline
    if (process.platform === 'win32') {
      // Note: On Windows, SIGINT is partially supported but we add readline as backup
      const readline = await import('node:readline');
      if (process.stdin.isTTY) {
        readline
          .createInterface({
            input: process.stdin,
            output: process.stdout,
          })
          .on('SIGINT', () => {
            shutdown('SIGINT (Windows)');
          });
      }
    }

    // Log unhandled errors
    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught exception');
      try {
        closeDb();
      } catch (dbError) {
        logger.error({ dbError }, 'Error closing database');
      }
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.fatal({ reason }, 'Unhandled rejection');
      try {
        closeDb();
      } catch (dbError) {
        logger.error({ dbError }, 'Error closing database');
      }
      process.exit(1);
    });

    // Connect to transport
    logger.debug('Connecting to transport...');
    await server.connect(transport);
    logger.info('Connected successfully - server is ready');
    logger.info('Server is now listening for requests');
  } catch (error) {
    logger.fatal({ error }, 'Fatal error during startup');
    try {
      closeDb();
    } catch (dbError) {
      logger.error({ dbError }, 'Error closing database');
    }
    process.exit(1);
  }
}
