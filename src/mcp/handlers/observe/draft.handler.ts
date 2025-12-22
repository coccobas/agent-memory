/**
 * Draft handler - Generate schema for client-assisted extraction
 */

import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isBoolean,
  isNumber,
  isArray,
} from '../../../utils/type-guards.js';
import { parseEnvBool, parseEnvNumber } from './helpers.js';

/**
 * Client-assisted extraction: return a strict schema and prompt template.
 *
 * Intended for environments where the *same* LLM driving the conversation
 * performs the extraction and then calls `memory_observe` with `commit`.
 */
export function draft(params: Record<string, unknown>) {
  const sessionId = getRequiredParam(params, 'sessionId', isString);
  const projectId = getOptionalParam(params, 'projectId', isString);

  const autoPromoteDefault = parseEnvBool('AGENT_MEMORY_OBSERVE_AUTO_PROMOTE_DEFAULT', true);
  const autoPromote = getOptionalParam(params, 'autoPromote', isBoolean) ?? autoPromoteDefault;
  const autoPromoteThresholdDefault = parseEnvNumber(
    'AGENT_MEMORY_OBSERVE_AUTO_PROMOTE_THRESHOLD',
    0.85
  );
  const autoPromoteThreshold =
    getOptionalParam(params, 'autoPromoteThreshold', isNumber) ?? autoPromoteThresholdDefault;

  const focusAreas = getOptionalParam(params, 'focusAreas', isArray) as
    | ('decisions' | 'facts' | 'rules' | 'tools')[]
    | undefined;

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      sessionId: { type: 'string' },
      projectId: { type: ['string', 'null'] },
      autoPromote: { type: 'boolean' },
      autoPromoteThreshold: { type: 'number' },
      entries: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['guideline', 'knowledge', 'tool'] },
            name: { type: 'string' },
            title: { type: 'string' },
            content: { type: 'string' },
            category: { type: 'string' },
            priority: { type: 'number' },
            confidence: { type: 'number' },
            rationale: { type: 'string' },
            suggestedTags: { type: 'array', items: { type: 'string' } },
          },
          required: ['type', 'content', 'confidence'],
        },
      },
      entities: {
        type: 'array',
        description: 'Named entities extracted from context (technologies, components, etc.)',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            entityType: {
              type: 'string',
              enum: ['person', 'technology', 'component', 'concept', 'organization'],
            },
            description: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['name', 'entityType', 'confidence'],
        },
      },
      relationships: {
        type: 'array',
        description: 'Relationships between extracted entries/entities',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sourceRef: { type: 'string', description: 'Name of source entry/entity' },
            sourceType: {
              type: 'string',
              enum: ['guideline', 'knowledge', 'tool', 'entity'],
            },
            targetRef: { type: 'string', description: 'Name of target entry/entity' },
            targetType: {
              type: 'string',
              enum: ['guideline', 'knowledge', 'tool', 'entity'],
            },
            relationType: {
              type: 'string',
              enum: ['depends_on', 'related_to', 'applies_to', 'conflicts_with'],
            },
            confidence: { type: 'number' },
          },
          required: [
            'sourceRef',
            'sourceType',
            'targetRef',
            'targetType',
            'relationType',
            'confidence',
          ],
        },
      },
    },
    required: ['sessionId', 'entries'],
  } as const;

  const instructions = [
    'Extract durable memory from the session transcript: concrete decisions, stable facts, reusable rules, important tools, named entities, and relationships.',
    'Prefer fewer, higher-quality entries. Avoid ephemeral state (temporary TODOs, one-off stack traces, momentary preferences).',
    'Set `confidence` in [0,1]. Use higher confidence only when the transcript clearly supports it.',
    'For `knowledge`, use `title` (short) and `content` (detail). For `guideline`/`tool`, use `name` + `content`.',
    'For `entities`, extract named technologies, components, people, organizations, and concepts. Use `entityType` to categorize.',
    'For `relationships`, link extracted items using: depends_on, related_to, applies_to, conflicts_with. Relations with confidence >= 0.8 are auto-created.',
    projectId
      ? `Auto-promote is ${autoPromote ? 'ON' : 'OFF'} (threshold ${autoPromoteThreshold}). High-confidence items may be stored at project scope.`
      : 'No `projectId` provided, so entries will be stored at session scope only.',
    focusAreas?.length ? `Focus areas: ${focusAreas.join(', ')}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    success: true,
    draft: {
      schema,
      instructions,
      defaults: {
        sessionId,
        projectId: projectId ?? null,
        autoPromote,
        autoPromoteThreshold,
      },
      commitToolCallExample: {
        name: 'memory_observe',
        arguments: {
          action: 'commit',
          sessionId,
          projectId,
          autoPromote,
          autoPromoteThreshold,
          entries: [
            {
              type: 'guideline',
              name: 'example-guideline-name',
              content: 'A durable rule extracted from the transcript.',
              category: 'process',
              priority: 70,
              confidence: 0.9,
              rationale: 'Why this should be remembered',
              suggestedTags: ['example'],
            },
          ],
          entities: [
            {
              name: 'PostgreSQL',
              entityType: 'technology',
              description: 'Primary database used by the project',
              confidence: 0.9,
            },
          ],
          relationships: [
            {
              sourceRef: 'UserService',
              sourceType: 'entity',
              targetRef: 'PostgreSQL',
              targetType: 'entity',
              relationType: 'depends_on',
              confidence: 0.85,
            },
          ],
        },
      },
    },
  };
}
