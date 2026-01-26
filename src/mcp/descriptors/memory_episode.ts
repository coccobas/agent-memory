/**
 * memory_episode tool descriptor
 *
 * Manages episodes - bounded temporal activity groupings.
 * Enables "what happened during X?" and causal chain queries.
 */

import type { ToolDescriptor } from './types.js';
import { episodeHandlers } from '../handlers/episodes.handler.js';

export const memoryEpisodeDescriptor: ToolDescriptor = {
  name: 'memory_episode',
  visibility: 'standard',
  description: `Manage episodes - bounded temporal activity groupings for tracking "what happened during X?" and causal chains.

**Quick Start (recommended - no IDs needed!):**
\`\`\`
{"action":"begin","sessionId":"sess-123","name":"Fix auth bug"}  // Create + start
{"action":"log","sessionId":"sess-123","message":"Found root cause"}  // Auto-targets active episode
{"action":"complete","sessionId":"sess-123","outcome":"Fixed it","outcomeType":"success"}  // Auto-targets active episode
\`\`\`

**Episode Resolution:** Most actions auto-resolve the episode using this fallback chain:
1. Explicit \`id\` → use directly
2. \`name\` + \`sessionId\` → lookup by name
3. \`sessionId\` only → use active episode

Actions:
- **begin**: Create AND start an episode in one call (recommended)
- **log**: Quick event logging with just a message (recommended)
- add: Create a new episode (use 'begin' for most cases)
- get: Get episode by ID
- list: List episodes with filters
- update: Update episode metadata
- deactivate: Deactivate an episode
- delete: Delete an episode
- start: Start a planned episode (planned → active)
- complete: Complete an active episode with outcome
- fail: Mark an active episode as failed
- cancel: Cancel an episode
- add_event: Add an event with full control over all fields
- get_events: Get all events for an episode
- link_entity: Link an entry (guideline/knowledge/tool) to an episode
- get_linked: Get all linked entities for an episode
- get_messages: Get all conversation messages linked to an episode
- get_timeline: Get timeline of all episodes and events for a session
- what_happened: Get comprehensive "what happened during X?" summary
- trace_causal_chain: Trace causal relationships between episodes

Episode Status Flow:
planned → active → completed/failed/cancelled

Event Types:
- started: Episode/phase began
- checkpoint: Progress milestone or notable point
- decision: Important choice or decision made
- error: Something went wrong (recoverable)
- completed: Episode/phase finished

Outcome Types:
- success: Episode completed successfully
- partial: Episode partially completed
- failure: Episode failed
- abandoned: Episode was cancelled/abandoned

Example workflows:
1. Quick tracking (no IDs needed):
   {"action":"begin","sessionId":"sess-123","name":"Fix auth bug"}
   {"action":"log","sessionId":"sess-123","message":"Found root cause"}
   {"action":"log","sessionId":"sess-123","message":"Applied fix","eventType":"decision"}
   {"action":"complete","sessionId":"sess-123","outcome":"Fixed token expiry","outcomeType":"success"}

2. Query what happened (by name):
   {"action":"what_happened","sessionId":"sess-123","name":"Fix auth bug"}
   {"action":"get_timeline","sessionId":"sess-123"}

3. Trace causes:
   {"action":"trace_causal_chain","sessionId":"sess-123","direction":"backward"}`,
  commonParams: {
    // Identity
    id: { type: 'string', description: 'Episode ID' },
    projectId: { type: 'string', description: 'Project ID for project-level queries' },
    sessionId: { type: 'string', description: 'Session ID' },
    conversationId: { type: 'string', description: 'Conversation ID to link episode to' },
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope type (default: project)',
    },
    scopeId: { type: 'string', description: 'Scope ID (required for non-global scopes)' },

    // Episode fields
    name: { type: 'string', description: 'Episode name' },
    description: { type: 'string', description: 'Episode description' },
    parentEpisodeId: { type: 'string', description: 'Parent episode ID for hierarchical episodes' },
    triggerType: {
      type: 'string',
      description: "What triggered this episode ('user_request', 'system_event', 'scheduled')",
    },
    triggerRef: {
      type: 'string',
      description: 'Reference to the trigger (e.g., task ID, event ID)',
    },
    tags: { type: 'array', items: { type: 'string' }, description: 'Episode tags' },
    metadata: { type: 'object', description: 'Additional metadata' },

    // Lifecycle
    outcome: { type: 'string', description: 'Episode outcome description' },
    outcomeType: {
      type: 'string',
      enum: ['success', 'partial', 'failure', 'abandoned'],
      description: 'Episode outcome type',
    },
    reason: { type: 'string', description: 'Reason for cancellation' },

    // Event fields
    episodeId: {
      type: 'string',
      description: 'Episode ID (alias for id, for backward compatibility)',
    },
    message: { type: 'string', description: 'Event message (for log action)' },
    eventType: {
      type: 'string',
      description:
        "Event type: 'started', 'checkpoint', 'decision', 'error', 'completed' (default: checkpoint)",
    },
    entryType: {
      type: 'string',
      description: "Entry type for linked entity ('guideline', 'knowledge', 'tool', 'experience')",
    },
    entryId: { type: 'string', description: 'Entry ID for linked entity' },
    role: {
      type: 'string',
      description: "Role of linked entity ('created', 'modified', 'referenced')",
    },
    data: { type: 'object', description: 'Event data (JSON)' },

    // Query options
    direction: {
      type: 'string',
      enum: ['forward', 'backward'],
      description: 'Direction for causal chain traversal',
    },
    maxDepth: {
      type: 'number',
      description: 'Maximum depth for causal chain traversal (default: 10)',
    },
    start: { type: 'string', description: 'Start timestamp for timeline range (ISO 8601)' },
    end: { type: 'string', description: 'End timestamp for timeline range (ISO 8601)' },

    // List filters
    status: {
      type: 'string',
      enum: ['planned', 'active', 'completed', 'failed', 'cancelled'],
      description: 'Filter by status',
    },
    includeInactive: { type: 'boolean', description: 'Include deactivated episodes' },

    // Standard params
    createdBy: { type: 'string', description: 'Creator identifier' },
    agentId: { type: 'string', description: 'Agent identifier (required for writes)' },
    limit: { type: 'number', description: 'Max results to return' },
    offset: { type: 'number', description: 'Skip N results' },
  },
  actions: {
    // Quick start (recommended)
    begin: { contextHandler: episodeHandlers.begin }, // Create + start in one call
    log: { contextHandler: episodeHandlers.log }, // Quick event logging

    // Standard CRUD
    add: { contextHandler: episodeHandlers.add },
    get: { contextHandler: episodeHandlers.get },
    list: { contextHandler: episodeHandlers.list },
    update: { contextHandler: episodeHandlers.update },
    deactivate: { contextHandler: episodeHandlers.deactivate },
    delete: { contextHandler: episodeHandlers.delete },

    // Lifecycle
    start: { contextHandler: episodeHandlers.start },
    complete: { contextHandler: episodeHandlers.complete },
    fail: { contextHandler: episodeHandlers.fail },
    cancel: { contextHandler: episodeHandlers.cancel },

    // Events
    add_event: { contextHandler: episodeHandlers.add_event },
    get_events: { contextHandler: episodeHandlers.get_events },

    // Entity linking
    link_entity: { contextHandler: episodeHandlers.link_entity },
    get_linked: { contextHandler: episodeHandlers.get_linked },

    // Messages
    get_messages: { contextHandler: episodeHandlers.get_messages },

    // Timeline and queries
    get_timeline: { contextHandler: episodeHandlers.get_timeline },
    what_happened: { contextHandler: episodeHandlers.what_happened },
    trace_causal_chain: { contextHandler: episodeHandlers.trace_causal_chain },
  },
};
