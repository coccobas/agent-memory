-- FTS5 virtual table for transcript message search
CREATE VIRTUAL TABLE IF NOT EXISTS v2_transcript_fts USING fts5(
  message_id UNINDEXED,
  transcript_id UNINDEXED,
  content,
  role UNINDEXED
);

-- Provenance: entry -> transcript message range
CREATE TABLE IF NOT EXISTS v2_entry_provenance (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES v2_entries(id) ON DELETE CASCADE,
  transcript_id TEXT NOT NULL REFERENCES v2_transcripts(id) ON DELETE CASCADE,
  seq_start INTEGER NOT NULL,
  seq_end INTEGER NOT NULL,
  extractor_name TEXT NOT NULL,
  confidence REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entry_id, transcript_id, seq_start, seq_end)
);

CREATE INDEX IF NOT EXISTS idx_v2_entry_provenance_entry
  ON v2_entry_provenance(entry_id);
CREATE INDEX IF NOT EXISTS idx_v2_entry_provenance_transcript
  ON v2_entry_provenance(transcript_id, seq_start);
