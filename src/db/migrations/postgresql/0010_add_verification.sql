-- Migration 0010: Add Verification Tables
-- Guideline compliance tracking

CREATE TABLE session_guideline_acknowledgments (
    id text PRIMARY KEY,
    session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    guideline_id text NOT NULL REFERENCES guidelines(id) ON DELETE CASCADE,
    acknowledged_at timestamp with time zone DEFAULT now() NOT NULL,
    acknowledged_by text
);

CREATE INDEX idx_session_acknowledgments_session ON session_guideline_acknowledgments(session_id);
CREATE UNIQUE INDEX idx_session_acknowledgments_unique ON session_guideline_acknowledgments(session_id, guideline_id);

CREATE TABLE verification_log (
    id text PRIMARY KEY,
    session_id text REFERENCES sessions(id) ON DELETE SET NULL,
    action_type text NOT NULL,
    proposed_action jsonb,
    result jsonb NOT NULL,
    guideline_ids jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    CONSTRAINT verification_log_action_type_check CHECK (action_type IN ('pre_check', 'post_check', 'acknowledge'))
);

CREATE INDEX idx_verification_log_session ON verification_log(session_id);
CREATE INDEX idx_verification_log_action_type ON verification_log(action_type);
CREATE INDEX idx_verification_log_created_at ON verification_log(created_at);
