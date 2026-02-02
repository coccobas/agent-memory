/**
 * memory_topic tool descriptor
 *
 * Manages topics - persistent work contexts that organize episodes.
 * Topics remain active across sessions, unlike episodes which are temporal.
 */

import type { ToolDescriptor } from './types.js';
import { topicHandlers } from '../handlers/topics.handler.js';

export const memoryTopicDescriptor: ToolDescriptor = {
  name: 'memory_topic',
  visibility: 'standard',
  description: `Manage topics - persistent work contexts that organize episodes.

Topics are long-lived work contexts (e.g., "Authentication System", "Database Migration") that persist across sessions.
Unlike episodes (temporal activity groupings), topics don't complete - they remain active as ongoing work contexts.

Actions:
- list: List topics with optional filters
- get: Get topic by ID
- create: Create new topic
- update: Update topic (name, description, status)
- deactivate: Soft delete (set isActive=false)
- find_similar: Semantic search for similar topics (threshold parameter)

Topics organize episodes by work context, independent of temporal sessions.
Use topics to group related work across multiple sessions and episodes.`,
  commonParams: {
    // Identity
    id: { type: 'string', description: 'Topic ID' },
    projectId: { type: 'string', description: 'Project ID for project-scoped topics' },
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope type (default: project)',
    },
    scopeId: { type: 'string', description: 'Scope ID (required for non-global scopes)' },

    // Topic fields
    name: { type: 'string', description: 'Topic name' },
    description: { type: 'string', description: 'Topic description' },
    status: {
      type: 'string',
      enum: ['active', 'inactive'],
      description: 'Topic status',
    },
    metadata: { type: 'object', description: 'Additional metadata' },

    // Query options
    query: { type: 'string', description: 'Search query for find_similar' },
    threshold: { type: 'number', description: 'Similarity threshold 0-1 (default: 0.8)' },

    // List filters
    includeInactive: { type: 'boolean', description: 'Include inactive topics' },

    // Standard params
    createdBy: { type: 'string', description: 'Creator identifier' },
    agentId: { type: 'string', description: 'Agent identifier (required for writes)' },
    limit: { type: 'number', description: 'Max results to return' },
    offset: { type: 'number', description: 'Skip N results' },
  },
  actions: {
    list: { contextHandler: topicHandlers.list },
    get: { contextHandler: topicHandlers.get },
    create: { contextHandler: topicHandlers.create },
    update: { contextHandler: topicHandlers.update },
    deactivate: { contextHandler: topicHandlers.deactivate },
    find_similar: { contextHandler: topicHandlers.find_similar },
  },
};
