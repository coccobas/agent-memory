/**
 * MCP Tool Descriptor: memory_forget
 *
 * Manage memory forgetting and decay mechanisms.
 */

import type { ToolDescriptor } from './types.js';
import { handleForgetting, type ForgettingInput } from '../handlers/forgetting.handler.js';

export const memoryForgetDescriptor: ToolDescriptor = {
  name: 'memory_forget',
  visibility: 'advanced',
  description: `Manage memory forgetting and decay. Actions: analyze, forget, status

Actions:
- analyze: Identify candidates for forgetting without making changes (dry run)
- forget: Execute forgetting on identified candidates
- status: Get current forgetting service status

Strategies:
- recency: Forget entries not accessed in staleDays (time-based decay)
- frequency: Forget entries with low access counts (LRU/LFU style)
- importance: Forget low-priority, low-confidence entries
- combined: Weighted combination of all strategies

Use analyze first to preview candidates, then forget to execute.
Example: {"action":"analyze","scopeType":"project","scopeId":"proj-123","strategy":"recency","staleDays":90}`,
  commonParams: {
    scopeType: {
      type: 'string',
      description: 'Scope type to analyze (analyze, forget)',
      enum: ['global', 'org', 'project', 'session'],
    },
    scopeId: {
      type: 'string',
      description: 'Scope ID (required for non-global scopes)',
    },
    entryTypes: {
      type: 'array',
      description: 'Entry types to analyze (default: all)',
      items: {
        type: 'string',
        enum: ['tool', 'guideline', 'knowledge', 'experience'],
      },
    },
    strategy: {
      type: 'string',
      description: 'Forgetting strategy (default: combined)',
      enum: ['recency', 'frequency', 'importance', 'combined'],
    },
    staleDays: {
      type: 'number',
      description: 'Days since last access for recency strategy (default: 90)',
    },
    minAccessCount: {
      type: 'number',
      description: 'Minimum access count for frequency strategy (default: 2)',
    },
    importanceThreshold: {
      type: 'number',
      description: 'Importance score threshold 0-1 (default: 0.4)',
    },
    limit: {
      type: 'number',
      description: 'Maximum entries to process (default: 100)',
    },
    dryRun: {
      type: 'boolean',
      description: 'Preview only, no changes (default: true)',
    },
    agentId: {
      type: 'string',
      description: 'Agent ID for audit trail (forget)',
    },
  },
  actions: {
    analyze: {
      contextHandler: (context, params) =>
        handleForgetting(context, { action: 'analyze', ...params } as ForgettingInput),
    },
    forget: {
      contextHandler: (context, params) =>
        handleForgetting(context, { action: 'forget', ...params } as ForgettingInput),
    },
    status: {
      contextHandler: (context, params) =>
        handleForgetting(context, { action: 'status', ...params } as ForgettingInput),
    },
  },
};
