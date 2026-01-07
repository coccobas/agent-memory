/**
 * memory_librarian MCP Descriptor
 *
 * Describes the librarian tool for pattern detection and promotion recommendations.
 */

import type { ToolDescriptor } from './types.js';
import { librarianHandlers } from '../handlers/librarian.handler.js';

// =============================================================================
// DESCRIPTOR
// =============================================================================

export const memory_librarian: ToolDescriptor = {
  name: 'memory_librarian',
  visibility: 'advanced',
  description: `Manage the Librarian Agent for pattern detection and promotion recommendations.

Actions:
- analyze: Run pattern detection analysis on experiences
- status: Get librarian service and scheduler status
- list_recommendations: List pending promotion recommendations
- show_recommendation: Show details of a specific recommendation
- approve: Approve a recommendation and create the promotion
- reject: Reject a recommendation
- skip: Skip a recommendation for now

The Librarian Agent automatically:
1. Collects case experiences from a scope
2. Detects patterns using embedding + trajectory similarity
3. Evaluates pattern quality
4. Generates promotion recommendations
5. Queues recommendations for human review

Example: {"action":"analyze","scopeType":"project","scopeId":"proj-123"}`,
  commonParams: {
    scopeType: {
      description: 'Scope type',
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
    },
    scopeId: {
      description: 'Scope ID',
      type: 'string',
    },
    limit: {
      description: 'Maximum results to return',
      type: 'number',
    },
    offset: {
      description: 'Results to skip',
      type: 'number',
    },
  },
  actions: {
    analyze: {
      params: {
        lookbackDays: { description: 'Days to look back for experiences (default: 30)', type: 'number' },
        dryRun: { description: 'If true, analyze without creating recommendations', type: 'boolean' },
      },
      contextHandler: librarianHandlers.analyze,
    },
    status: {
      contextHandler: librarianHandlers.status,
    },
    list_recommendations: {
      params: {
        status: {
          description: 'Filter by status',
          type: 'string',
          enum: ['pending', 'approved', 'rejected', 'skipped', 'expired'],
        },
        minConfidence: { description: 'Filter by minimum confidence', type: 'number' },
      },
      contextHandler: librarianHandlers.list_recommendations,
    },
    show_recommendation: {
      params: {
        recommendationId: { description: 'Recommendation ID', type: 'string' },
      },
      required: ['recommendationId'],
      contextHandler: librarianHandlers.show_recommendation,
    },
    approve: {
      params: {
        recommendationId: { description: 'Recommendation ID', type: 'string' },
        reviewedBy: { description: 'Reviewer identifier', type: 'string' },
        notes: { description: 'Review notes', type: 'string' },
      },
      required: ['recommendationId'],
      contextHandler: librarianHandlers.approve,
    },
    reject: {
      params: {
        recommendationId: { description: 'Recommendation ID', type: 'string' },
        reviewedBy: { description: 'Reviewer identifier', type: 'string' },
        notes: { description: 'Review notes', type: 'string' },
      },
      required: ['recommendationId'],
      contextHandler: librarianHandlers.reject,
    },
    skip: {
      params: {
        recommendationId: { description: 'Recommendation ID', type: 'string' },
        reviewedBy: { description: 'Reviewer identifier', type: 'string' },
        notes: { description: 'Review notes', type: 'string' },
      },
      required: ['recommendationId'],
      contextHandler: librarianHandlers.skip,
    },
  },
};
