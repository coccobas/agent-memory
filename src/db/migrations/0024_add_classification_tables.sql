-- Migration: Add classification tables for hybrid classification learning
-- These tables track classification outcomes and learned pattern confidence adjustments

-- Classification feedback - track classification outcomes for learning
CREATE TABLE IF NOT EXISTS classification_feedback (
    id TEXT PRIMARY KEY,
    text_hash TEXT NOT NULL,
    text_preview TEXT,
    session_id TEXT,
    predicted_type TEXT NOT NULL CHECK (predicted_type IN ('guideline', 'knowledge', 'tool')),
    actual_type TEXT NOT NULL CHECK (actual_type IN ('guideline', 'knowledge', 'tool')),
    method TEXT NOT NULL CHECK (method IN ('regex', 'llm', 'hybrid', 'forced')),
    confidence REAL NOT NULL,
    matched_patterns TEXT,
    was_correct INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_classification_feedback_text_hash ON classification_feedback(text_hash);
CREATE INDEX IF NOT EXISTS idx_classification_feedback_predicted ON classification_feedback(predicted_type, was_correct);
CREATE INDEX IF NOT EXISTS idx_classification_feedback_created ON classification_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_classification_feedback_session ON classification_feedback(session_id);

-- Pattern confidence - learned adjustments for classification patterns
CREATE TABLE IF NOT EXISTS pattern_confidence (
    id TEXT PRIMARY KEY,
    pattern_id TEXT NOT NULL UNIQUE,
    pattern_type TEXT NOT NULL CHECK (pattern_type IN ('guideline', 'knowledge', 'tool')),
    base_weight REAL NOT NULL DEFAULT 0.7,
    feedback_multiplier REAL NOT NULL DEFAULT 1.0,
    total_matches INTEGER NOT NULL DEFAULT 0,
    correct_matches INTEGER NOT NULL DEFAULT 0,
    incorrect_matches INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pattern_confidence_type ON pattern_confidence(pattern_type);
CREATE INDEX IF NOT EXISTS idx_pattern_confidence_multiplier ON pattern_confidence(feedback_multiplier);
