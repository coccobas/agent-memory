-- Migration 0042: Add quality score metrics to episodes

ALTER TABLE episodes ADD COLUMN IF NOT EXISTS quality_score INTEGER;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS quality_factors JSONB;
