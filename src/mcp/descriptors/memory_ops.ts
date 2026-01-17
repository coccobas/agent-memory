/**
 * memory_ops tool descriptor
 *
 * Operational utilities for memory system health and diagnostics.
 * Consolidates several utility functions into one tool.
 */

import type { ToolDescriptor } from './types.js';
import { opsHandlers } from '../handlers/ops.handler.js';

export const memoryOpsDescriptor: ToolDescriptor = {
  name: 'memory_ops',
  visibility: 'advanced',
  description: `Operational utilities for memory system health and diagnostics.

Actions:
- auto_tag: Infer or apply tags to content/entries automatically
- session_timeout: Query/control session timeout settings
- red_flags: Detect quality issues in content or entries
- embedding_coverage: Get embedding health metrics for a scope
- backfill_status: Get embedding backfill status and stats
- trigger_config: Get/update extraction trigger configuration

Examples:
- Infer tags: {"action":"auto_tag","content":"Always use TypeScript strict mode"}
- Apply tags: {"action":"auto_tag","entryType":"guideline","entryId":"guid-123"}
- Check timeout: {"action":"session_timeout","subAction":"status","sessionId":"sess-123"}
- Detect red flags: {"action":"red_flags","content":"..."}
- Coverage check: {"action":"embedding_coverage","scopeType":"project","scopeId":"proj-123"}
- Backfill stats: {"action":"backfill_status"}
- Trigger config: {"action":"trigger_config","subAction":"get"}`,

  commonParams: {
    // For auto_tag
    content: {
      type: 'string',
      description: 'Content to analyze for tag inference or red flag detection',
    },
    entryType: {
      type: 'string',
      enum: ['guideline', 'knowledge', 'tool'],
      description: 'Type of entry (for apply mode or scoring)',
    },
    entryId: {
      type: 'string',
      description: 'Entry ID (for apply mode or scoring)',
    },
    category: {
      type: 'string',
      description: 'Category hint for auto-tagging',
    },

    // For session_timeout and trigger_config
    subAction: {
      type: 'string',
      description: 'Sub-action: status/check/record_activity (session_timeout) or get/update/reset (trigger_config)',
    },
    sessionId: {
      type: 'string',
      description: 'Session ID for timeout queries',
    },

    // For embedding_coverage
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope type for coverage check',
    },
    scopeId: {
      type: 'string',
      description: 'Scope ID for coverage check',
    },
    types: {
      type: 'array',
      items: { type: 'string', enum: ['tool', 'guideline', 'knowledge', 'experience'] },
      description: 'Entry types to include in coverage check',
    },

    // For trigger_config update
    updates: {
      type: 'object',
      description: 'Partial trigger config updates (for trigger_config update action)',
    },
  },

  actions: {
    auto_tag: {
      contextHandler: (ctx, params) => opsHandlers.auto_tag(ctx, params),
    },
    session_timeout: {
      contextHandler: (ctx, params) => opsHandlers.session_timeout(ctx, params),
    },
    red_flags: {
      contextHandler: (ctx, params) => opsHandlers.red_flags(ctx, params),
    },
    embedding_coverage: {
      contextHandler: (ctx, params) => opsHandlers.embedding_coverage(ctx, params),
    },
    backfill_status: {
      contextHandler: (ctx, params) => opsHandlers.backfill_status(ctx, params),
    },
    trigger_config: {
      contextHandler: (ctx, params) => opsHandlers.trigger_config(ctx, params),
    },
  },
};
