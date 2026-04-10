-- ============================================
-- MIGRATION 003: Cross-Code Linker
-- Enables multi-hop reasoning across PDS domains
-- ============================================

-- Add related_pds: Links facts across PDS domains (e.g., 330 career fact linked to 120 identity)
-- Example: A career decision (330.1) links to identity values (120.1)
ALTER TABLE facts ADD COLUMN related_pds TEXT;

-- Add is_current: Distinguishes active facts from historical ones
-- Prevents temporal hallucination (answering with outdated facts)
ALTER TABLE facts ADD COLUMN is_current INTEGER DEFAULT 1;

-- Add supersedes_id: Tracks fact versioning (new facts supersede old ones)
-- Example: Weight 80kg supersedes Weight 100kg
ALTER TABLE facts ADD COLUMN supersedes_id TEXT REFERENCES facts(id);

-- Add narrative_summary: Domain-level summaries for context
-- Example: "Career focused on counseling after trans support experience"
ALTER TABLE facts ADD COLUMN narrative_summary TEXT;

-- Create indexes for cross-code queries
CREATE INDEX IF NOT EXISTS idx_facts_related_pds ON facts(related_pds);
CREATE INDEX IF NOT EXISTS idx_facts_is_current ON facts(is_current);
CREATE INDEX IF NOT EXISTS idx_facts_supersedes ON facts(supersedes_id);

-- Create index for PDS domain queries (e.g., all 100.x facts for a subject)
CREATE INDEX IF NOT EXISTS idx_facts_pds_domain ON facts(pds_code);