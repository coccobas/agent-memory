/**
 * Read-plane internal contracts for V2 retrieval.
 */

import type { EntryType, RetrievalChannel } from '../contracts/index.js';

export interface CandidateRecord {
  key: string;
  entryType: EntryType;
  entryId: string;
  channels: Set<RetrievalChannel>;
  channelScores: Partial<Record<RetrievalChannel, number>>;
}
