/**
 * Open WebUI source adapter.
 *
 * Implements SourceAdapter for importing content fetched via Open WebUI pipelines.
 * Uses 'openwebuiDocId' as the metadata dedup field.
 */

import type { SourceAdapter } from '../types.js';
import { cleanOpenWebUIContent } from './normalize.js';

export const openwebuiAdapter: SourceAdapter = {
  sourceName: 'openwebui',
  metadataIdField: 'openwebuiDocId',
  normalizeContent: cleanOpenWebUIContent,
};
