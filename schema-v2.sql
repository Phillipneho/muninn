-- ============================================
-- MUNINN D1 SCHEMA v2 - Sleep Cycle + Forgetting
-- Adds observation types, prototypes, decision traces
-- ============================================

-- ============================================
-- 1. OBSERVATIONS (Hippocampal layer)
-- Tracks consolidation status
-- ============================================
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  entity_id TEXT REFERENCES entities(id),
  predicate TEXT NOT NULL,
  object_value TEXT,
  object_type TEXT DEFAULT 'literal',
  confidence REAL DEFAULT 0.8,
  
  -- Observation type
  observation_type TEXT DEFAULT 'HIPPOCAMPAL',  -- 'HIPPOCAMPAL' or 'CORTEX'
  is_consolidated INTEGER DEFAULT 0,
  source_prototype_id TEXT REFERENCES prototypes(id),
  
  -- Temporal
  valid_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  
  -- Memory type (for forgetting)
  memory_type TEXT DEFAULT 'fact',  -- 'fact', 'preference', 'episode'
  strength REAL DEFAULT 0.5,
  expires_at TEXT,
  repetition_count INTEGER DEFAULT 0,
  
  -- Evidence
  evidence TEXT,
  source_episode_id TEXT REFERENCES episodes(id),
  
  organization_id TEXT NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id);
CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(observation_type);
CREATE INDEX IF NOT EXISTS idx_observations_consolidated ON observations(is_consolidated);
CREATE INDEX IF NOT EXISTS idx_observations_expires ON observations(expires_at);
CREATE INDEX IF NOT EXISTS idx_observations_org ON observations(organization_id);

-- ============================================
-- 2. PROTOTYPES (Cortex layer)
-- Consolidated narrative summaries
-- ============================================
CREATE TABLE IF NOT EXISTS prototypes (
  id TEXT PRIMARY KEY,
  entity_id TEXT REFERENCES entities(id),
  prototype_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  
  -- Evidence trail
  supporting_evidence TEXT,  -- JSON array of observation IDs
  
  -- Cluster info
  cluster TEXT,  -- 'CAREER_TRANSITION', 'WELLNESS', etc.
  
  -- Importance scoring
  importance REAL DEFAULT 0.5,
  reward_boost REAL DEFAULT 0.0,
  
  -- Temporal
  valid_at TEXT,
  invalid_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  
  organization_id TEXT NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_prototypes_entity ON prototypes(entity_id);
CREATE INDEX IF NOT EXISTS idx_prototypes_cluster ON prototypes(cluster);
CREATE INDEX IF NOT EXISTS idx_prototypes_org ON prototypes(organization_id);

-- ============================================
-- 3. DECISION TRACES (Retrieval tracking)
-- Tracks which facts led to successful answers
-- ============================================
CREATE TABLE IF NOT EXISTS decision_traces (
  id TEXT PRIMARY KEY,
  query_text TEXT NOT NULL,
  
  -- Retrieval path
  activated_nodes TEXT,  -- JSON array of fact/observation IDs
  retrieval_path TEXT,   -- JSON array of steps
  
  -- Outcome
  outcome_reward REAL DEFAULT 0.0,  -- 0-1, how useful was this retrieval
  feedback TEXT,
  
  -- Timing
  created_at TEXT DEFAULT (datetime('now')),
  
  organization_id TEXT NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_traces_reward ON decision_traces(outcome_reward DESC);
CREATE INDEX IF NOT EXISTS idx_traces_org ON decision_traces(organization_id);

-- ============================================
-- 4. SLEEP CYCLES (Consolidation history)
-- ============================================
CREATE TABLE IF NOT EXISTS sleep_cycles (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  
  -- Metrics
  observations_processed INTEGER DEFAULT 0,
  clusters_found INTEGER DEFAULT 0,
  prototypes_created INTEGER DEFAULT 0,
  entities_discovered INTEGER DEFAULT 0,
  contradictions_detected INTEGER DEFAULT 0,
  connections_formed INTEGER DEFAULT 0,
  
  -- Forgetting
  expired INTEGER DEFAULT 0,
  decayed INTEGER DEFAULT 0,
  total_forgotten INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'running',  -- 'running', 'completed', 'failed'
  error_message TEXT,
  
  organization_id TEXT NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_sleep_cycles_status ON sleep_cycles(status);
CREATE INDEX IF NOT EXISTS idx_sleep_cycles_started ON sleep_cycles(started_at DESC);

-- ============================================
-- 5. UPDATE EXISTING FACTS TABLE
-- Add memory_type and expires_at if not exists
-- ============================================

-- Note: SQLite doesn't support IF NOT EXISTS for columns
-- Run these as separate migrations if needed:

-- ALTER TABLE facts ADD COLUMN memory_type TEXT DEFAULT 'fact';
-- ALTER TABLE facts ADD COLUMN strength REAL DEFAULT 0.5;
-- ALTER TABLE facts ADD COLUMN expires_at TEXT;
-- ALTER TABLE facts ADD COLUMN repetition_count INTEGER DEFAULT 0;