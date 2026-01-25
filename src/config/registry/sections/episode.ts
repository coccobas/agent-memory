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
      defaultValue: true, // Enabled by default - auto-log tool executions as episode events
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
    autoCreateEnabled: {
      envKey: 'AGENT_MEMORY_EPISODE_AUTO_CREATE',
      defaultValue: true,
      description: 'Enable automatic episode creation from session names.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    autoCreateEpisodeOnFirstTool: {
      envKey: 'AGENT_MEMORY_EPISODE_AUTO_CREATE_ON_FIRST_TOOL',
      defaultValue: true,
      description:
        'Auto-create episode on first significant tool usage if none exists (zero-friction mode).',
      schema: z.boolean(),
      parse: 'boolean',
    },
    // Boundary detection settings (Phase 2: auto-create mode)
    boundaryDetectionEnabled: {
      envKey: 'AGENT_MEMORY_EPISODE_BOUNDARY_DETECTION',
      defaultValue: true,
      description: 'Enable automatic episode boundary detection from tool execution patterns.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    boundaryShadowMode: {
      envKey: 'AGENT_MEMORY_EPISODE_BOUNDARY_SHADOW_MODE',
      defaultValue: false,
      description:
        'Shadow mode: log detected boundaries without creating episodes. Set to false for auto-creation.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    boundaryWindowSize: {
      envKey: 'AGENT_MEMORY_EPISODE_BOUNDARY_WINDOW_SIZE',
      defaultValue: 5,
      description: 'Number of events in each comparison window for boundary detection.',
      schema: z.number().int().min(2).max(20),
      parse: 'int',
    },
    boundarySimilarityThreshold: {
      envKey: 'AGENT_MEMORY_EPISODE_BOUNDARY_SIMILARITY_THRESHOLD',
      defaultValue: 0.65,
      description: 'Similarity threshold below which a boundary is detected (0-1).',
      schema: z.number().min(0).max(1),
      parse: 'number',
    },
    boundaryTimeGapMs: {
      envKey: 'AGENT_MEMORY_EPISODE_BOUNDARY_TIME_GAP_MS',
      defaultValue: 600000, // 10 minutes
      description: 'Time gap (ms) that triggers a boundary detection.',
      schema: z.number().int().min(0),
      parse: 'int',
    },
  },
};

/**
 * Default list of tools that are significant enough to log and can trigger episode creation.
 * Includes both memory tools (change memory state) and external tools (file modifications).
 */
export const DEFAULT_SIGNIFICANT_TOOLS = [
  'memory_remember',
  'memory_guideline',
  'memory_knowledge',
  'memory_tool',
  'memory_experience',
  'memory_task',
  'memory_observe',
  'Edit',
  'Write',
  'Bash',
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
