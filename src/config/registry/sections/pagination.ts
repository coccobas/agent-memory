/**
 * Pagination Configuration Section
 *
 * Query result pagination settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const paginationSection: ConfigSectionMeta = {
  name: 'pagination',
  description: 'Query pagination configuration.',
  options: {
    defaultLimit: {
      envKey: 'AGENT_MEMORY_DEFAULT_QUERY_LIMIT',
      defaultValue: 20,
      description: 'Default number of results per page.',
      schema: z.number().int().min(1),
    },
    maxLimit: {
      envKey: 'AGENT_MEMORY_MAX_QUERY_LIMIT',
      defaultValue: 100,
      description: 'Maximum number of results per page.',
      schema: z.number().int().min(1),
    },
  },
};
