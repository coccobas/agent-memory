/**
 * Observe handlers for auto-capture memory extraction
 *
 * This file re-exports from the modular observe/ directory for backward compatibility.
 * New code should import from './observe/index.js'.
 */

export { observeHandlers } from './observe/index.js';
export type { ProcessedEntry, StoredEntry, ObserveCommitEntry } from './observe/index.js';
