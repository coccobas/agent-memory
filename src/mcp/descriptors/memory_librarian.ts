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
  visibility: 'core',
  description: `Manage the Librarian Agent for pattern detection and promotion recommendations.

Actions:
- analyze: Run pattern detection analysis on experiences
- status: Get librarian service and scheduler status
- run_maintenance: Run maintenance tasks in background (returns job ID immediately)
- get_job_status: Poll status of a maintenance job
- list_jobs: List all maintenance jobs
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

Maintenance includes:
- Consolidation: Dedupe similar entries
- Forgetting: Archive stale entries
- Graph backfill: Populate knowledge graph
- Tool tag assignment: LLM-based tagging of entries with tool:* tags for tool-specific context injection

Runs daily at 5am and on session end. Use list_recommendations to review pending patterns.

Example: {"action":"analyze","scopeType":"project","scopeId":"proj-123"}
Example: {"action":"run_maintenance","scopeType":"project","scopeId":"proj-123"}
Example: {"action":"get_job_status","jobId":"job_abc123"}`,
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
        lookbackDays: {
          description: 'Days to look back for experiences (default: 30)',
          type: 'number',
        },
        dryRun: {
          description: 'If true, analyze without creating recommendations',
          type: 'boolean',
        },
      },
      contextHandler: librarianHandlers.analyze,
    },
    status: {
      contextHandler: librarianHandlers.status,
    },
    run_maintenance: {
      params: {
        tasks: {
          description:
            'Which tasks to run (defaults to all): consolidation, forgetting, graphBackfill, toolTagAssignment',
          type: 'array',
          items: { type: 'string' },
        },
        dryRun: {
          description: 'If true, analyze without making changes',
          type: 'boolean',
        },
        initiatedBy: {
          description: 'Who initiated this maintenance run',
          type: 'string',
        },
      },
      contextHandler: librarianHandlers.run_maintenance,
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
        mergeIntoExperienceId: {
          description:
            'Merge into existing strategy instead of creating new. Pass the experience ID of the existing strategy.',
          type: 'string',
        },
        mergeStrategy: {
          description:
            'How to merge: append (add source cases to existing), replace (overwrite pattern text), increment (just bump confidence)',
          type: 'string',
          enum: ['append', 'replace', 'increment'],
        },
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
    get_job_status: {
      params: {
        jobId: { description: 'Job ID to get status for', type: 'string' },
      },
      required: ['jobId'],
      contextHandler: librarianHandlers.get_job_status,
    },
    list_jobs: {
      params: {
        status: {
          description: 'Filter by job status',
          type: 'string',
          enum: ['pending', 'running', 'completed', 'failed'],
        },
      },
      contextHandler: librarianHandlers.list_jobs,
    },
  },
};
