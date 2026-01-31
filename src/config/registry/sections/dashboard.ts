/**
 * Dashboard Configuration Section
 *
 * Settings for the Agent Memory Dashboard integration.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const dashboardSection: ConfigSectionMeta = {
  name: 'dashboard',
  description: 'Dashboard integration settings.',
  options: {
    url: {
      envKey: 'AGENT_MEMORY_DASHBOARD_URL',
      defaultValue: 'http://localhost:5173',
      description:
        'URL of the Agent Memory Dashboard. Used in responses to direct users to the dashboard for monitoring.',
      schema: z.string().url(),
    },
  },
};
