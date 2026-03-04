-- ============================================
-- MUNINN v2 SCHEMA (Neon PostgreSQL)
-- Memory as evolving reality, not stored text
-- ============================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 1. EPISODES (Raw event storage)
-- ============================================
CREATE TABLE IF NOT EXISTS episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  actor TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ DEFAULT now(),
  embedding vector(1024),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_episodes_occurred ON episodes(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_source ON episodes(source);

-- ============================================
-- 2. ENTITIES (Named nodes in knowledge graph)
-- ============================================
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT,
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, type)
);

CREATE INDEX IF NOT EXISTS idx_entities_name ON entities USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);

-- ============================================
-- 3. FACTS (Typed assertions about entities)
-- ============================================
CREATE TABLE IF NOT EXISTS facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_entity_id UUID REFERENCES entities(id),
  predicate TEXT NOT NULL,
  object_entity_id UUID REFERENCES entities(id),
  object_value TEXT,
  value_type TEXT DEFAULT 'entity',
  confidence REAL DEFAULT 0.8,
  source_episode_id UUID REFERENCES episodes(id),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  invalidated_at TIMESTAMPTZ,
  evidence TEXT[],
  CONSTRAINT valid_time_range CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject_entity_id);
CREATE INDEX IF NOT EXISTS idx_facts_object ON facts(object_entity_id);
CREATE INDEX IF NOT EXISTS idx_facts_predicate ON facts(predicate);
CREATE INDEX IF NOT EXISTS idx_facts_valid ON facts(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_facts_current ON facts(subject_entity_id, predicate);

-- ============================================
-- 4. EVENTS (State transitions)
-- ============================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id UUID REFERENCES facts(id),
  entity_id UUID REFERENCES entities(id),
  attribute TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  cause TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  observed_at TIMESTAMPTZ DEFAULT now(),
  source_episode_id UUID REFERENCES episodes(id)
);

CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_fact ON events(fact_id);
CREATE INDEX IF NOT EXISTS idx_events_occurred ON events(occurred_at DESC);

-- ============================================
-- 5. RELATIONSHIPS (Directed edges)
-- ============================================
CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id UUID REFERENCES entities(id) NOT NULL,
  target_entity_id UUID REFERENCES entities(id) NOT NULL,
  relationship_type TEXT NOT NULL,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  evidence TEXT[],
  source_episode_id UUID REFERENCES episodes(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_rel_time CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(relationship_type);

-- ============================================
-- 6. CONTRADICTIONS (Conflict preservation)
-- ============================================
CREATE TABLE IF NOT EXISTS contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_a_id UUID REFERENCES facts(id) NOT NULL,
  fact_b_id UUID REFERENCES facts(id) NOT NULL,
  conflict_type TEXT NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT now(),
  detected_by TEXT,
  resolution_status TEXT DEFAULT 'unresolved',
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  UNIQUE(fact_a_id, fact_b_id)
);

CREATE INDEX IF NOT EXISTS idx_contradictions_facts ON contradictions(fact_a_id, fact_b_id);

-- ============================================
-- 7. ENTITY_MENTIONS (Episode → Entity linking)
-- ============================================
CREATE TABLE IF NOT EXISTS entity_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID REFERENCES episodes(id) NOT NULL,
  entity_id UUID REFERENCES entities(id) NOT NULL,
  mention_context TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(episode_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_mentions_episode ON entity_mentions(episode_id);
CREATE INDEX IF NOT EXISTS idx_mentions_entity ON entity_mentions(entity_id);

-- ============================================
-- INITIAL DATA
-- ============================================
INSERT INTO entities (name, type, summary) VALUES
  ('System', 'concept', 'The Muninn memory system itself')
ON CONFLICT (name, type) DO NOTHING;