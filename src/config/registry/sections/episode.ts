/**
 * Episode Configuration Section
 *
 * Settings for automatic episode logging and creation.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const episodeSection: ConfigSectionMeta = {
  name: 'episode',
  description: 'Episode auto-logging and creation settings.',
  options: {
    // Auto-logger settings
    autoLogEnabled: {
      envKey: 'AGENT_MEMORY_EPISODE_AUTO_LOG',
      defaultValue: false, // Opt-in first, enable by default after validation
      description: 'Enable automatic logging of tool executions as episode events.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    debounceMs: {
      envKey: 'AGENT_MEMORY_EPISODE_DEBOUNCE_MS',
      defaultValue: 1000,
      description: 'Minimum time between logged events (debounce).',
      schema: z.number().int().min(0),
      parse: 'int',
    },
    // Auto-create settings
    autoCreateEnabled: {
      envKey: 'AGENT_MEMORY_EPISODE_AUTO_CREATE',
      defaultValue: true,
      description: 'Enable automatic episode creation from session names.',
      schema: z.boolean(),
      parse: 'boolean',
    },
  },
};

/**
 * Default list of tools that are significant enough to log
 * These are write operations that change memory state
 */
export const DEFAULT_SIGNIFICANT_TOOLS = [
  'memory_remember',
  'memory_guideline',
  'memory_knowledge',
  'memory_tool',
  'memory_experience',
  'memory_task',
  'memory_observe',
] as const;

/**
 * Default list of tools to skip (reads, queries, status checks)
 * These are high-frequency operations that would create too much noise
 */
export const DEFAULT_SKIP_TOOLS = [
  'memory_query',
  'memory_quickstart',
  'memory_status',
  'memory_discover',
  'memory_context',
  'memory_session', // Skip session tool to avoid recursive logging
  'memory_episode', // Skip episode tool to avoid recursive logging
  'memory_librarian', // Skip librarian (maintenance tool)
  'memory_analytics', // Skip analytics (read-only)
  'memory_permission', // Skip permission (admin tool)
  'memory_suggest', // Skip suggest (analysis tool)
  'memory_ops', // Skip ops (utility tool)
  'memory_review', // Skip review (analysis tool)
  'memory_latent', // Skip latent (cache management)
  'memory_feedback', // Skip feedback (RL data export)
  'memory_rl', // Skip RL (policy management)
  'memory_lora', // Skip LoRA (export tool)
  'memory_forget', // Skip forget (maintenance)
  'memory_consolidate', // Skip consolidate (maintenance)
  'memory_summarize', // Skip summarize (maintenance)
  'memory_extraction_approve', // Skip extraction approve (triggered by suggestions)
  'memory_graph_status', // Skip graph status (diagnostic)
  'graph_node', // Skip graph node (low-level)
  'graph_edge', // Skip graph edge (low-level)
] as const;

/**
 * Actions that indicate significant operations worth logging
 */
export const SIGNIFICANT_ACTIONS = [
  'add',
  'update',
  'bulk_add',
  'bulk_update',
  'create',
  'delete',
  'deactivate',
  'promote',
  'record_case',
  'record_outcome',
  'learn',
  'extract',
  'commit',
] as const;

/**
 * Actions to skip (reads, queries, list operations)
 */
export const SKIP_ACTIONS = [
  'get',
  'list',
  'search',
  'context',
  'status',
  'history',
  'show',
  'for_entry',
] as const;
