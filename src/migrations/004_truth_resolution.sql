-- v3.3: Truth Resolution
-- Ensures "Current Truth" is prioritized over "Historical Fact"
-- Adds state machine semantics to the facts table

-- 1. Add is_current flag for instantaneous current truth lookups
ALTER TABLE facts ADD COLUMN is_current BOOLEAN DEFAULT FALSE;

-- 2. Partial index ensures only ONE fact per Subject+Predicate can be "Current"
-- This is the secret sauce for speed - no need to scan all historical facts
CREATE UNIQUE INDEX idx_current_truth ON facts (subject_entity_id, predicate) WHERE is_current = TRUE;

-- 3. Track WHY a fact was superseded (for audit trail)
ALTER TABLE facts ADD COLUMN superseded_by TEXT REFERENCES facts(id);

-- 4. Add contradiction tracking for manual/LLM review
CREATE TABLE IF NOT EXISTS contradictions (
  id TEXT PRIMARY KEY,
  
  -- The two conflicting facts
  fact_a_id TEXT NOT NULL REFERENCES facts(id),
  fact_b_id TEXT NOT NULL REFERENCES facts(id),
  
  -- What they conflict on
  conflict_type TEXT NOT NULL, -- 'value_conflict', 'temporal_overlap', 'logical'
  
  -- Resolution status
  status TEXT DEFAULT 'unresolved', -- 'unresolved', 'resolved_by_time', 'resolved_by_user', 'dismissed'
  resolution TEXT, -- How it was resolved
  
  -- Metadata
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,
  resolved_by TEXT -- 'user', 'llm', 'time'
);

-- 5. Index for contradiction queries
CREATE INDEX idx_contradictions_status ON contradictions(status);
CREATE INDEX idx_contradictions_type ON contradictions(conflict_type);

-- 6. Helper function to get current truth
-- This is used by the retrieval layer for instantaneous lookups
CREATE VIEW current_truth AS
SELECT 
  f.id,
  f.subject_entity_id,
  e.name as subject_name,
  f.predicate,
  f.object_value,
  f.confidence,
  f.valid_from,
  f.evidence
FROM facts f
JOIN entities e ON f.subject_entity_id = e.id
WHERE f.is_current = TRUE
  AND (f.valid_until IS NULL OR f.valid_until > CURRENT_TIMESTAMP)
  AND f.invalidated_at IS NULL;