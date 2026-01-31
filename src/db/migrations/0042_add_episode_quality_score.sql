-- Migration 0042: Add quality score metrics to episodes
-- Tracks episode completeness and data quality for better experience extraction

ALTER TABLE episodes ADD COLUMN quality_score INTEGER;
ALTER TABLE episodes ADD COLUMN quality_factors TEXT;
