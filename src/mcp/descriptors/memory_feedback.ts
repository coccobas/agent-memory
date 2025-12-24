/**
 * memory_feedback tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { feedbackHandlers } from '../handlers/feedback.handler.js';

export const memoryFeedbackDescriptor: ToolDescriptor = {
  name: 'memory_feedback',
  description: `Query and export RL feedback data for training.

Actions: list_retrievals, list_outcomes, list_decisions, export, stats

Query feedback data collected from memory operations to analyze performance and export training datasets.
Example: {"action":"export","policyType":"extraction","onlyWithOutcomes":true}`,
  commonParams: {
    sessionId: { type: 'string', description: 'Session ID for filtering' },
    startDate: { type: 'string', description: 'Filter by start date (ISO timestamp)' },
    endDate: { type: 'string', description: 'Filter by end date (ISO timestamp)' },
    limit: { type: 'number', description: 'Max results to return' },
    offset: { type: 'number', description: 'Skip N results' },
    policyType: {
      type: 'string',
      enum: ['extraction', 'retrieval', 'consolidation'],
      description: 'Policy type for export',
    },
    onlyWithOutcomes: {
      type: 'boolean',
      description: 'Include only samples with outcomes',
    },
    entryTypes: {
      type: 'array',
      items: { type: 'string', enum: ['tool', 'guideline', 'knowledge'] },
      description: 'Filter by entry types',
    },
    outcomeTypes: {
      type: 'array',
      items: { type: 'string', enum: ['success', 'failure', 'partial', 'error'] },
      description: 'Filter by outcome types',
    },
  },
  actions: {
    list_retrievals: { contextHandler: feedbackHandlers.listRetrievals },
    list_outcomes: { contextHandler: feedbackHandlers.listOutcomes },
    list_decisions: { contextHandler: feedbackHandlers.listDecisions },
    export: { contextHandler: feedbackHandlers.export },
    stats: { contextHandler: feedbackHandlers.stats },
  },
};
