/**
 * Paths Configuration Section
 *
 * Directory path settings.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';
import { getDataDir } from '../parsers.js';

export const pathsSection: ConfigSectionMeta = {
  name: 'paths',
  description: 'Directory path configuration.',
  options: {
    dataDir: {
      envKey: 'AGENT_MEMORY_DATA_DIR',
      defaultValue: 'data',
      description: 'Base data directory. Supports ~ expansion.',
      schema: z.string(),
      // Custom parser that handles node_modules detection
      parse: () => getDataDir(),
    },
    backup: {
      envKey: 'AGENT_MEMORY_BACKUP_PATH',
      defaultValue: 'backups',
      description: 'Backup directory path.',
      schema: z.string(),
      parse: 'path',
    },
    export: {
      envKey: 'AGENT_MEMORY_EXPORT_PATH',
      defaultValue: 'exports',
      description: 'Export directory path.',
      schema: z.string(),
      parse: 'path',
    },
    log: {
      envKey: 'AGENT_MEMORY_LOG_PATH',
      defaultValue: 'logs',
      description: 'Log directory path.',
      schema: z.string(),
      parse: 'path',
    },
  },
};
