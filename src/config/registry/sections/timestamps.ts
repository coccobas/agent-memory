/**
 * Timestamps Configuration Section
 *
 * Timestamp display settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const timestampsSection: ConfigSectionMeta = {
  name: 'timestamps',
  description: 'Timestamp display configuration.',
  options: {
    displayTimezone: {
      envKey: 'AGENT_MEMORY_TIMEZONE',
      defaultValue: 'local',
      description: 'Timezone for display: local, utc, or IANA timezone (e.g., Europe/Rome).',
      schema: z.string(),
    },
  },
};
