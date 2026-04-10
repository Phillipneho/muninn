-- ============================================
-- MUNINN D1 SCHEMA v4 - PDS (Psychological Decimal System)
-- Adds PDS taxonomy codes for deterministic fact classification
-- ============================================

-- Add PDS code column to facts table
ALTER TABLE facts ADD COLUMN pds_code TEXT;

-- Create index for PDS-filtered queries
CREATE INDEX IF NOT EXISTS idx_facts_pds_code ON facts(pds_code);

-- ============================================
-- PDS TAXONOMY REFERENCE
-- ============================================
-- 100: Internal State (Subjective)
--   110: Physical/Vitality (weight, health, meds)
--   120: Identity/Values (ethnicity, philosophy)
--   130: Psychological/Mood (stress, mental clarity)
--   140: Preferences/Tastes (books, hobbies)
--
-- 200: Relational Orbit (Interpersonal)
--   210: Core/Intimate (partner, children, family)
--   220: Professional/Strategic (colleagues, clients)
--   230: Social/Acquaintance (friends, neighbors)
--   240: Adversarial/External (competitors)
--
-- 300: Instrumental (Objective)
--   310: The Forge (SaaS/builds, projects)
--   320: The Lab (infrastructure, servers)
--   330: The Career (jobs, roles)
--   340: Financial/Legal (salary, contracts)
--
-- 400: Chronological (Episodic)
--   410: Fixed Schedule (specific dates)
--   420: Duration/Sequencing (how long)
--   430: Routine/Frequency (habits)
--
-- 500: Conceptual (Speculative)
--   510: Models/Frameworks (mental models)
--   520: Prototypes/Simulations (what-ifs)
--   530: Philosophical/Musings (abstract thoughts)
-- ============================================