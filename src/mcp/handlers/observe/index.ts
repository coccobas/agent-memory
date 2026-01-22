/**
 * Observe handlers for auto-capture memory extraction
 *
 * This module assembles the observe handlers from their individual files.
 */

import { extract } from './extract.handler.js';
import { status } from './status.handler.js';
import { draft } from './draft.handler.js';
import { commit } from './commit.handler.js';

// Re-export types from services layer
export type {
  ProcessedEntry,
  StoredEntry,
  ObserveCommitEntry,
} from '../../../services/observe/types.js';

// Re-export helpers from services layer
export {
  storeEntry,
  storeEntity,
  buildNameToIdMap,
  createExtractedRelations,
} from '../../../services/observe/helpers.js';

/**
 * Observe handlers object - maintains same interface as original
 */
export const observeHandlers = {
  extract,
  status,
  draft,
  commit,
};
