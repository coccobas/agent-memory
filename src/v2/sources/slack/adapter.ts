/**
 * Slack source adapter.
 *
 * Implements SourceAdapter for importing Slack threads/messages.
 * Uses 'slackThreadId' as the metadata dedup field.
 */

import type { SourceAdapter } from '../types.js';
import { cleanSlackMarkdown } from './normalize.js';

export const slackAdapter: SourceAdapter = {
  sourceName: 'slack',
  metadataIdField: 'slackThreadId',
  normalizeContent: cleanSlackMarkdown,
};
