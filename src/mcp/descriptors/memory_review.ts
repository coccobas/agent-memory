/**
 * memory_review tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { reviewHandlers } from '../handlers/review.handler.js';

export const memoryReviewDescriptor: ToolDescriptor = {
  name: 'memory_review',
  description: `Review candidate memory entries from a session.

Actions:
- list: List all candidates pending review in a session
- show: Show full details of a specific candidate
- approve: Promote candidate to project scope
- reject: Deactivate/reject candidate
- skip: Remove from review queue without action

Use this tool to review entries extracted during a session before promoting them to project scope.
Example: {"action":"list","sessionId":"sess-123"}`,
  required: ['sessionId'],
  commonParams: {
    sessionId: {
      type: 'string',
      description: 'Session ID to review candidates from',
    },
    entryId: {
      type: 'string',
      description: 'Entry ID or short ID (for show, approve, reject, skip)',
    },
    projectId: {
      type: 'string',
      description:
        'Target project ID for approved entries (optional, derived from session if not provided)',
    },
  },
  actions: {
    list: {
      handler: (p) => reviewHandlers.list(p as { sessionId: string }),
    },
    show: {
      handler: (p) => reviewHandlers.show(p as { sessionId: string; entryId: string }),
    },
    approve: {
      handler: (p) =>
        reviewHandlers.approve(p as { sessionId: string; entryId: string; projectId?: string }),
    },
    reject: {
      handler: (p) => reviewHandlers.reject(p as { sessionId: string; entryId: string }),
    },
    skip: {
      handler: (p) => reviewHandlers.skip(p as { sessionId: string; entryId: string }),
    },
  },
};
