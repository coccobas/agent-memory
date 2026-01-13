-- Bug #7 fix: Add unique constraint on (conversation_id, message_index)
-- This prevents race conditions from creating duplicate message indices
-- The retry logic in conversations.ts handles constraint violations

-- Drop the existing non-unique index first
DROP INDEX IF EXISTS idx_messages_index;

-- Create unique index to enforce atomic message ordering
CREATE UNIQUE INDEX idx_messages_index_unique ON conversation_messages (conversation_id, message_index);
