/**
 * Graph Configuration Section
 *
 * Settings for knowledge graph synchronization and traversal.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const graphSection: ConfigSectionMeta = {
  name: 'graph',
  description: 'Knowledge graph configuration for relationship tracking.',
  options: {
    autoSync: {
      envKey: 'AGENT_MEMORY_GRAPH_AUTO_SYNC',
      defaultValue: true,
      description:
        'Automatically create graph nodes when entries are created. Set to false to disable graph synchronization.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    traversalEnabled: {
      envKey: 'AGENT_MEMORY_GRAPH_TRAVERSAL',
      defaultValue: false,
      description:
        'Use edges table for graph traversal queries instead of entry_relations. Enable after backfilling graph.',
      schema: z.boolean(),
      parse: 'boolean',
    },
    captureEnabled: {
      envKey: 'AGENT_MEMORY_GRAPH_CAPTURE',
      defaultValue: true,
      description:
        'Automatically create graph edges during knowledge extraction. Set to false to disable auto-linking.',
      schema: z.boolean(),
      parse: 'boolean',
    },
  },
};
