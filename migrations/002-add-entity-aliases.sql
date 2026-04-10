-- Add aliases column to entities table
-- Enables nickname/alias matching for entity resolution

ALTER TABLE entities ADD COLUMN aliases TEXT;

-- Create index for alias lookups
-- SQLite doesn't support array contains, so we store as JSON array
-- and query with LIKE for now (aliases LIKE '%"mel"%')
CREATE INDEX IF NOT EXISTS idx_entities_aliases ON entities(aliases);