/**
 * Validation Configuration Section
 *
 * Input validation limits.
 */

import { z } from 'zod';
import type { ConfigSectionMeta } from '../types.js';

export const validationSection: ConfigSectionMeta = {
  name: 'validation',
  description: 'Input validation limits.',
  options: {
    nameMaxLength: {
      envKey: 'AGENT_MEMORY_NAME_MAX_LENGTH',
      defaultValue: 500,
      description: 'Maximum length for name fields.',
      schema: z.number().int().min(1),
    },
    titleMaxLength: {
      envKey: 'AGENT_MEMORY_TITLE_MAX_LENGTH',
      defaultValue: 1000,
      description: 'Maximum length for title fields.',
      schema: z.number().int().min(1),
    },
    descriptionMaxLength: {
      envKey: 'AGENT_MEMORY_DESCRIPTION_MAX_LENGTH',
      defaultValue: 10000,
      description: 'Maximum length for description fields.',
      schema: z.number().int().min(1),
    },
    contentMaxLength: {
      envKey: 'AGENT_MEMORY_CONTENT_MAX_LENGTH',
      defaultValue: 100000,
      description: 'Maximum length for content fields.',
      schema: z.number().int().min(1),
    },
    rationaleMaxLength: {
      envKey: 'AGENT_MEMORY_RATIONALE_MAX_LENGTH',
      defaultValue: 5000,
      description: 'Maximum length for rationale fields.',
      schema: z.number().int().min(1),
    },
    metadataMaxBytes: {
      envKey: 'AGENT_MEMORY_METADATA_MAX_BYTES',
      defaultValue: 50000,
      description: 'Maximum size for metadata in bytes.',
      schema: z.number().int().min(1),
    },
    parametersMaxBytes: {
      envKey: 'AGENT_MEMORY_PARAMETERS_MAX_BYTES',
      defaultValue: 50000,
      description: 'Maximum size for parameters in bytes.',
      schema: z.number().int().min(1),
    },
    examplesMaxBytes: {
      envKey: 'AGENT_MEMORY_EXAMPLES_MAX_BYTES',
      defaultValue: 100000,
      description: 'Maximum size for examples in bytes.',
      schema: z.number().int().min(1),
    },
    tagsMaxCount: {
      envKey: 'AGENT_MEMORY_TAGS_MAX_COUNT',
      defaultValue: 50,
      description: 'Maximum number of tags per entry.',
      schema: z.number().int().min(1),
    },
    examplesMaxCount: {
      envKey: 'AGENT_MEMORY_EXAMPLES_MAX_COUNT',
      defaultValue: 20,
      description: 'Maximum number of examples per entry.',
      schema: z.number().int().min(1),
    },
    bulkOperationMax: {
      envKey: 'AGENT_MEMORY_BULK_OPERATION_MAX',
      defaultValue: 100,
      description: 'Maximum entries in bulk operations.',
      schema: z.number().int().min(1),
    },
    regexPatternMaxLength: {
      envKey: 'AGENT_MEMORY_REGEX_PATTERN_MAX_LENGTH',
      defaultValue: 500,
      description: 'Maximum length for regex patterns.',
      schema: z.number().int().min(1),
    },
    validationRulesQueryLimit: {
      envKey: 'AGENT_MEMORY_VALIDATION_RULES_LIMIT',
      defaultValue: 1000,
      description: 'Maximum validation rules to query.',
      schema: z.number().int().min(1),
    },
  },
};
