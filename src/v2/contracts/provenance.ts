/**
 * V2 Provenance contracts.
 *
 * Links extracted entries back to the transcript message range
 * that produced them, enabling "where did this come from?" queries.
 */

export interface ProvenanceRecord {
  readonly id: string;
  readonly entryId: string;
  readonly transcriptId: string;
  readonly seqStart: number;
  readonly seqEnd: number;
  readonly extractorName: string;
  readonly confidence: number | null;
  readonly createdAt: string;
}

export interface ProvenanceLookupRequest {
  readonly entryId: string;
}

export interface ProvenanceLookupResponse {
  readonly provenance: readonly ProvenanceRecord[];
}
