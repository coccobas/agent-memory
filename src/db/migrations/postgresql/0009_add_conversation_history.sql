-- Migration 0009: Add Conversation History Tables
-- Tracks conversation threads between agents and users

CREATE TABLE conversations (
    id text PRIMARY KEY,
    session_id text REFERENCES sessions(id) ON DELETE SET NULL,
    project_id text REFERENCES projects(id) ON DELETE SET NULL,
    agent_id text,
    title text,
    status text DEFAULT 'active' NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    metadata jsonb,
    CONSTRAINT conversations_status_check CHECK (status IN ('active', 'completed', 'archived'))
);

CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_conversations_project ON conversations(project_id);
CREATE INDEX idx_conversations_agent ON conversations(agent_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_started ON conversations(started_at);

CREATE TABLE conversation_messages (
    id text PRIMARY KEY,
    conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role text NOT NULL,
    content text NOT NULL,
    message_index integer NOT NULL,
    context_entries jsonb,
    tools_used jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    CONSTRAINT conversation_messages_role_check CHECK (role IN ('user', 'agent', 'system'))
);

CREATE INDEX idx_messages_conversation ON conversation_messages(conversation_id);
CREATE INDEX idx_messages_index ON conversation_messages(conversation_id, message_index);
CREATE INDEX idx_messages_role ON conversation_messages(conversation_id, role);

CREATE TABLE conversation_context (
    id text PRIMARY KEY,
    conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id text REFERENCES conversation_messages(id) ON DELETE CASCADE,
    entry_type text NOT NULL,
    entry_id text NOT NULL,
    relevance_score real,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversation_context_entry_type_check CHECK (entry_type IN ('tool', 'guideline', 'knowledge'))
);

CREATE INDEX idx_context_conversation ON conversation_context(conversation_id);
CREATE INDEX idx_context_message ON conversation_context(message_id);
CREATE INDEX idx_context_entry ON conversation_context(entry_type, entry_id);
CREATE UNIQUE INDEX idx_context_unique ON conversation_context(conversation_id, message_id, entry_type, entry_id);
