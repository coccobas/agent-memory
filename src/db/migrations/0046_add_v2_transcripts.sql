-- V2 transcript storage for autocapture hooks

CREATE TABLE IF NOT EXISTS v2_transcripts (
  id TEXT PRIMARY KEY,
  session_scope_id TEXT,
  project_scope_id TEXT,
  claude_session_id TEXT UNIQUE,
  transcript_path TEXT,
  agent_id TEXT,
  byte_offset INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'extracted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_v2_transcripts_session
  ON v2_transcripts(claude_session_id);
CREATE INDEX IF NOT EXISTS idx_v2_transcripts_status
  ON v2_transcripts(status);
CREATE INDEX IF NOT EXISTS idx_v2_transcripts_project
  ON v2_transcripts(project_scope_id);

CREATE TABLE IF NOT EXISTS v2_transcript_messages (
  id TEXT PRIMARY KEY,
  transcript_id TEXT NOT NULL
    REFERENCES v2_transcripts(id) ON DELETE CASCADE,
  sequence_num INTEGER NOT NULL,
  role TEXT NOT NULL
    CHECK (role IN ('user', 'assistant', 'system', 'tool_use', 'tool_result')),
  content TEXT NOT NULL DEFAULT '',
  tool_name TEXT,
  timestamp TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  UNIQUE(transcript_id, sequence_num)
);

CREATE INDEX IF NOT EXISTS idx_v2_transcript_messages_transcript
  ON v2_transcript_messages(transcript_id, sequence_num);
