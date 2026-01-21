-- Migration 0031: Add query_embedding column to memory_retrievals
-- This aligns the actual table with the Drizzle schema definition.
-- The query_embedding column stores base64-encoded embedding vectors for
-- similarity-based context matching in smart prioritization.

-- Add query_embedding column if not exists
ALTER TABLE memory_retrievals ADD COLUMN query_embedding TEXT;
