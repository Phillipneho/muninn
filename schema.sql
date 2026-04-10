-- ============================================
-- MUNINN D1 SCHEMA (SQLite-compatible)
-- Memory as evolving reality, not stored text
-- ============================================

-- SQLite doesn't have vector extension, so we use separate embedding table
-- and JSON for metadata instead of JSONB

-- ============================================
-- 1. EPISODES (Raw event storage)
-- Non-lossy source data
-- ============================================
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,             -- UUID as TEXT
  content TEXT NOT NULL,
  source TEXT NOT NULL,           -- 'conversation', 'document', 'api'
  actor TEXT,                      -- Who said/wrote it
  occurred_at TEXT NOT NULL,       -- ISO timestamp
  ingested_at TEXT DEFAULT (datetime('now')),
  embedding BLOB,                  -- Binary embedding (768 floats)
  metadata TEXT,                   -- JSON string
  organization_id TEXT NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_episodes_occurred ON episodes(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_source ON episodes(source);
CREATE INDEX IF NOT EXISTS idx_episodes_org ON episodes(organization_id);

-- ============================================
-- 2. ENTITIES (Named nodes in knowledge graph)
-- ============================================
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,              -- 'person', 'org', 'project', 'concept', 'location'
  aliases TEXT,                    -- JSON array of nicknames/abbreviations: ["Mel", "Melly"]
  summary TEXT,
  embedding BLOB,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  organization_id TEXT NOT NULL DEFAULT 'default',
  UNIQUE(name, type, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_org ON entities(organization_id);

-- ============================================
-- 3. FACTS (Typed assertions about entities)
-- Bi-temporal: real-world time + system time
-- PDS Decimal Index: Deterministic retrieval by Psychological Decimal System
-- ============================================
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  subject_entity_id TEXT REFERENCES entities(id),
  predicate TEXT NOT NULL,         -- 'attended', 'works_at', 'prefers', 'knows'
  object_entity_id TEXT REFERENCES entities(id),
  object_value TEXT,               -- For literal values (not entity references)
  value_type TEXT DEFAULT 'entity', -- 'entity', 'string', 'number', 'boolean', 'date'
  
  -- PDS Decimal Taxonomy (MANDATORY)
  pds_decimal TEXT NOT NULL,       -- 4-digit PDS code: '1201' (Identity), '2101' (Immediate Kin), '4100' (Chronological)
  pds_domain TEXT NOT NULL,        -- Primary domain: '100' (Internal), '200' (Relational), '300' (Instrumental), '400' (Chronological), '500' (Conceptual)
  
  confidence REAL DEFAULT 0.8,
  source_episode_id TEXT REFERENCES episodes(id),
  
  -- Bi-temporal timestamps
  valid_from TEXT,                 -- When this became true in the world (ISO-8601)
  valid_until TEXT,                -- When this stopped being true (NULL = still true)
  created_at TEXT DEFAULT (datetime('now')),
  invalidated_at TEXT,             -- When system learned it was wrong
  
  -- Evidence
  evidence TEXT,                   -- JSON array of source quotes/references
  
  organization_id TEXT NOT NULL DEFAULT 'default'
);

-- PDS Decimal Index: Deterministic retrieval
-- Query '210%' for all Immediate Kin facts
-- Query '410%' for all Chronological facts
CREATE INDEX IF NOT EXISTS idx_facts_pds ON facts(pds_decimal);
CREATE INDEX IF NOT EXISTS idx_facts_pds_domain ON facts(pds_domain);
CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject_entity_id);
CREATE INDEX IF NOT EXISTS idx_facts_object ON facts(object_entity_id);
CREATE INDEX IF NOT EXISTS idx_facts_predicate ON facts(predicate);
CREATE INDEX IF NOT EXISTS idx_facts_org ON facts(organization_id);

-- Composite index for PDS + Entity (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_facts_entity_pds ON facts(subject_entity_id, pds_decimal);

-- ============================================
-- 4. EVENTS (State transitions)
-- Models change over time
-- ============================================
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  fact_id TEXT REFERENCES facts(id),
  entity_id TEXT REFERENCES entities(id),
  attribute TEXT NOT NULL,         -- What changed
  old_value TEXT,
  new_value TEXT,
  cause TEXT,                      -- Why it changed
  occurred_at TEXT NOT NULL,
  observed_at TEXT DEFAULT (datetime('now')),
  source_episode_id TEXT REFERENCES episodes(id),
  organization_id TEXT NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_fact ON events(fact_id);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(organization_id);

-- ============================================
-- 5. RELATIONSHIPS (Directed edges)
-- Traversable links between entities
-- ============================================
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  source_entity_id TEXT REFERENCES entities(id) NOT NULL,
  target_entity_id TEXT REFERENCES entities(id) NOT NULL,
  relationship_type TEXT NOT NULL, -- 'attends', 'works_for', 'knows', 'prefers'
  
  -- Temporal validity
  valid_from TEXT,
  valid_until TEXT,
  invalidated_at TEXT,

  -- Evidence trail
  evidence TEXT,
  source_episode_id TEXT REFERENCES episodes(id),
  
  created_at TEXT DEFAULT (datetime('now')),
  organization_id TEXT NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_rel_org ON relationships(organization_id);

-- ============================================
-- 6. CONTRADICTIONS (Conflict preservation)
-- Both sides preserved, not overwritten
-- ============================================
CREATE TABLE IF NOT EXISTS contradictions (
  id TEXT PRIMARY KEY,
  fact_a_id TEXT REFERENCES facts(id) NOT NULL,
  fact_b_id TEXT REFERENCES facts(id) NOT NULL,
  conflict_type TEXT NOT NULL,     -- 'value_conflict', 'temporal_overlap', 'logical'
  detected_at TEXT DEFAULT (datetime('now')),
  detected_by TEXT,                -- 'llm', 'rule', 'user'
  resolution_status TEXT DEFAULT 'unresolved',
  resolved_at TEXT,
  resolution_note TEXT,
  organization_id TEXT NOT NULL DEFAULT 'default',
  UNIQUE(fact_a_id, fact_b_id)
);

CREATE INDEX IF NOT EXISTS idx_contradictions_org ON contradictions(organization_id);

-- ============================================
-- 7. MEMORIES (Simple key-value storage for API compatibility)
-- ============================================
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'semantic',
  metadata TEXT,                   -- JSON string
  entities TEXT,                   -- JSON array
  salience REAL DEFAULT 0.5,
  visibility TEXT DEFAULT 'organization',
  created_at TEXT DEFAULT (datetime('now')),
  embedding BLOB,
  embedding_provider TEXT DEFAULT 'gemini',
  organization_id TEXT NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_memories_org ON memories(organization_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);

-- ============================================
-- 8. ORGANIZATIONS (Multi-tenant isolation)
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  embedding_provider TEXT DEFAULT 'gemini',
  embedding_api_key TEXT            -- Encrypted or BYOK
);

-- Default organization
INSERT OR IGNORE INTO organizations (id, name, api_key_hash)
VALUES ('leo-default', 'Leo Default Organization', 'placeholder');