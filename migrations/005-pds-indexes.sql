-- ============================================
-- MUNINN D1 SCHEMA v5.1 - PDS Decimal Indexing
-- Creates optimized covering indexes for deterministic retrieval
-- ============================================

-- Composite index for entity + PDS decimal (most common query pattern)
-- Enables: SELECT * FROM facts WHERE subject_entity_id = ? AND pds_decimal LIKE '21%'
CREATE INDEX IF NOT EXISTS idx_facts_entity_pds_decimal ON facts(subject_entity_id, pds_decimal);

-- Covering index for domain-scoped queries (includes predicate + object_value for retrieval)
-- Enables: SELECT subject_entity_id, predicate, object_value, pds_decimal FROM facts WHERE pds_domain = ?
CREATE INDEX IF NOT EXISTS idx_facts_pds_domain_covering ON facts(pds_domain, subject_entity_id, predicate, object_value);

-- Composite index for temporal queries (entity + chronological domain)
-- Enables: SELECT * FROM facts WHERE subject_entity_id = ? AND pds_domain = '4000'
CREATE INDEX IF NOT EXISTS idx_facts_entity_temporal ON facts(subject_entity_id, pds_domain) WHERE pds_domain = '4000';

-- Index for cross-entity traversal (relationship queries)
-- Enables: SELECT * FROM facts WHERE object_entity_id IS NOT NULL AND pds_domain = '2000'
CREATE INDEX IF NOT EXISTS idx_facts_relational ON facts(object_entity_id, pds_domain) WHERE pds_domain = '2000';

-- Index for valid_from temporal ordering
-- Enables: SELECT * FROM facts WHERE subject_entity_id = ? AND pds_decimal LIKE '41%' ORDER BY valid_from DESC
CREATE INDEX IF NOT EXISTS idx_facts_temporal_ordered ON facts(subject_entity_id, pds_decimal, valid_from DESC);

-- Drop legacy indexes (pds_code is superseded by pds_decimal)
DROP INDEX IF EXISTS idx_facts_pds_code;
DROP INDEX IF EXISTS idx_facts_pds_domain;
DROP INDEX IF EXISTS idx_facts_related_pds;

-- ============================================
-- QUERY PATTERNS (DOCUMENTATION)
-- ============================================
-- 
-- 1. Get all relationship facts for an entity:
--    SELECT subject_entity_id, predicate, object_value, pds_decimal, valid_from
--    FROM facts 
--    WHERE subject_entity_id = ? AND pds_decimal LIKE '21%'
--    ORDER BY valid_from DESC;
--
-- 2. Get all temporal facts for an entity (events, history):
--    SELECT subject_entity_id, predicate, object_value, valid_from, pds_decimal
--    FROM facts 
--    WHERE subject_entity_id = ? AND pds_domain = '4000'
--    ORDER BY valid_from DESC;
--
-- 3. Get cross-entity traversal (multi-hop):
--    SELECT f1.subject_entity_id, f1.predicate, f1.object_value, e2.name as related_entity
--    FROM facts f1
--    JOIN entities e2 ON f1.object_entity_id = e2.id
--    WHERE f1.subject_entity_id = ? AND f1.pds_domain = '2000';
--
-- 4. Get identity + values for persona construction:
--    SELECT subject_entity_id, predicate, object_value, pds_decimal
--    FROM facts 
--    WHERE subject_entity_id = ? AND pds_decimal GLOB '1[1234]00'
--    ORDER BY pds_decimal;
--
-- 5. Deterministic PDS range scan:
--    SELECT subject_entity_id, predicate, object_value, pds_decimal
--    FROM facts 
--    WHERE pds_decimal BETWEEN '2100' AND '2199'
--    ORDER BY subject_entity_id;
-- ============================================