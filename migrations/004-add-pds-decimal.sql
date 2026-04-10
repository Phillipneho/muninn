-- ============================================
-- MUNINN D1 SCHEMA v5 - PDS Decimal Taxonomy
-- Migrates from 3-digit PDS codes to 4-digit decimal taxonomy
-- Enables deterministic retrieval by PDS domain
-- ============================================

-- Add new columns for 4-digit decimal taxonomy
-- Note: SQLite doesn't support NOT NULL on ALTER TABLE ADD COLUMN for existing rows
-- We'll add as nullable first, then update, then it will be enforced for new rows

-- Add pds_decimal column (4-digit code: '1201', '2101', '4100')
ALTER TABLE facts ADD COLUMN pds_decimal TEXT;

-- Add pds_domain column (primary domain: '1000', '2000', '3000', '4000', '5000')
ALTER TABLE facts ADD COLUMN pds_domain TEXT;

-- Create indexes for deterministic retrieval
CREATE INDEX IF NOT EXISTS idx_facts_pds_decimal ON facts(pds_decimal);
CREATE INDEX IF NOT EXISTS idx_facts_pds_domain ON facts(pds_domain);

-- Composite index for PDS + Entity (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_facts_entity_pds ON facts(subject_entity_id, pds_decimal);

-- ============================================
-- MIGRATION: Convert old 3-digit codes to 4-digit decimal
-- Example: '120.1' -> '1201', '300.0' -> '3000'
-- ============================================

-- Update pds_decimal from legacy pds_code (remove decimal point)
UPDATE facts 
SET pds_decimal = REPLACE(pds_code, '.', '') 
WHERE pds_code IS NOT NULL AND pds_decimal IS NULL;

-- Derive pds_domain from pds_decimal (first digit + '000')
UPDATE facts 
SET pds_domain = SUBSTR(pds_decimal, 1, 1) || '000'
WHERE pds_decimal IS NOT NULL AND pds_domain IS NULL;

-- Set defaults for facts without PDS codes
-- Instrumental (3000) is the most common fallback
UPDATE facts 
SET pds_decimal = '3000', pds_domain = '3000'
WHERE pds_decimal IS NULL;

-- ============================================
-- PDS DECIMAL TAXONOMY REFERENCE
-- ============================================
-- 1000: Internal State (Subjective)
--   1100: Physical/Vitality (weight, health, meds, sleep, energy)
--   1200: Identity/Values (ethnicity, heritage, self-concept)
--   1300: Psychological/Mood (stress, mental clarity, emotions)
--   1400: Preferences/Tastes (books, hobbies, interests)
--
-- 2000: Relational Orbit (Interpersonal)
--   2100: Core/Intimate (partner, children, immediate family)
--   2200: Professional/Strategic (colleagues, clients, stakeholders)
--   2300: Social/Acquaintance (friends, neighbors)
--   2400: Adversarial/External (competitors, friction points)
--
-- 3000: Instrumental (Objective)
--   3100: Projects/SaaS (BrandForge, Elev8Advisory, code projects)
--   3200: Infrastructure (homelab, servers, tools)
--   3300: Career/Roles (job titles, employment)
--   3400: Financial/Legal (salary, contracts)
--
-- 4000: Chronological (The Timeline)
--   4100: Fixed Schedule (specific dates/times, events)
--   4200: Duration/Sequencing (how long, timing)
--   4300: Routine/Frequency (habits, recurring events)
--   4400: Historical/Origin (where from, when started)
--
-- 5000: Conceptual (The Speculative)
--   5100: Models/Frameworks (mental models, systems)
--   5200: Prototypes/What-Ifs (business pivots, scenarios)
--   5300: Philosophical (beliefs, ethics, abstract thoughts)
-- ============================================

-- ============================================
-- DETERMINISTIC QUERY PATTERNS
-- ============================================
-- Get all relationship facts for an entity:
--   SELECT * FROM facts WHERE subject_entity_id = ? AND pds_decimal LIKE '21%'
--
-- Get all temporal facts for an entity:
--   SELECT * FROM facts WHERE subject_entity_id = ? AND pds_domain = '4000'
--
-- Get all identity facts for an entity:
--   SELECT * FROM facts WHERE subject_entity_id = ? AND pds_decimal LIKE '12%'
--
-- Get facts across linked domains (e.g., Identity + Values):
--   SELECT * FROM facts WHERE subject_entity_id = ? AND pds_domain IN ('1000', '2000')
-- ============================================