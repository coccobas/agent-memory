/**
 * Notion source adapter.
 *
 * Implements SourceAdapter for importing Notion pages.
 * Uses 'notionPageId' as the metadata dedup field.
 */

import type { SourceAdapter } from '../types.js';
import { cleanNotionMarkdown } from './normalize.js';

export const notionAdapter: SourceAdapter = {
  sourceName: 'notion',
  metadataIdField: 'notionPageId',
  normalizeContent: cleanNotionMarkdown,
};
