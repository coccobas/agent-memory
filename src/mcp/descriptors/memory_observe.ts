/**
 * memory_observe tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { observeHandlers } from '../handlers/observe.handler.js';

export const memoryObserveDescriptor: ToolDescriptor = {
  name: 'memory_observe',
  visibility: 'advanced',
  description: `Extract memory entries from conversation/code context using LLM analysis.

Actions:
- extract: Analyze context and extract guidelines, knowledge, and tool patterns
- draft: Return strict schema + prompt template for client-assisted extraction
- commit: Store client-extracted entries (supports auto-promote)
- status: Check extraction service availability

When to use: After meaningful conversations or code reviews to capture decisions, facts, and patterns.
Example: {"action":"extract","context":"User said we should always use TypeScript strict mode...","scopeType":"project","scopeId":"proj-123","autoStore":true}

Returns extracted entries with confidence scores and duplicate detection.`,
  commonParams: {
    context: {
      type: 'string',
      description: 'Raw conversation or code context to analyze',
    },
    contextType: {
      type: 'string',
      enum: ['conversation', 'code', 'mixed'],
      description: 'Type of context (default: mixed)',
    },
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope for extracted entries (default: project)',
    },
    scopeId: {
      type: 'string',
      description: 'Scope ID (required for non-global scopes)',
    },
    autoStore: {
      type: 'boolean',
      description: 'Automatically store entries above confidence threshold (default: false)',
    },
    confidenceThreshold: {
      type: 'number',
      description: 'Minimum confidence to auto-store (0-1, default: 0.7)',
    },
    focusAreas: {
      type: 'array',
      items: { type: 'string', enum: ['decisions', 'facts', 'rules', 'tools'] },
      description: 'Focus extraction on specific types',
    },
    agentId: {
      type: 'string',
      description: 'Agent identifier for audit',
    },
    sessionId: {
      type: 'string',
      description: 'Session ID (required for draft/commit)',
    },
    projectId: {
      type: 'string',
      description: 'Project ID (optional, enables project auto-promote)',
    },
    entries: {
      type: 'array',
      description: 'Client-extracted entries (required for commit)',
      items: {
        type: 'object',
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
    autoPromote: {
      type: 'boolean',
      description:
        'If true, entries above threshold can be stored at project scope when projectId is provided (default: on)',
    },
    autoPromoteThreshold: {
      type: 'number',
      description: 'Confidence threshold for auto-promotion (0-1, default: 0.85)',
    },
  },
  actions: {
    extract: { contextHandler: observeHandlers.extract },
    draft: { handler: observeHandlers.draft },
    commit: { contextHandler: observeHandlers.commit },
    status: { contextHandler: observeHandlers.status },
  },
};
