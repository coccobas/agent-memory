-- Migration 0008: Add Agent Votes Table
-- Multi-agent voting for consensus

CREATE TABLE agent_votes (
    id text PRIMARY KEY,
    task_id text NOT NULL,
    agent_id text NOT NULL,
    vote_value text NOT NULL,
    confidence real DEFAULT 1.0 NOT NULL,
    reasoning text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_votes_confidence_check CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX idx_votes_task ON agent_votes(task_id);
CREATE INDEX idx_votes_agent ON agent_votes(agent_id);
CREATE UNIQUE INDEX idx_votes_unique ON agent_votes(task_id, agent_id);
