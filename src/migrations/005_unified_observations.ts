// Migration 005: Unified Observations Schema
// Replaces binary Event/Fact model with tagged observations

import { Database as Database } from 'better-sqlite3';

export function migrate(db: Database) {
  console.log('Creating observations table...');
  
  db.exec(`
    -- Drop old tables if they exist (in migration order)
    DROP TABLE IF EXISTS contradictions;
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS facts;
    
    -- Unified Observations Store
    -- A single table for all assertions about entities
    -- Tags replace the binary Event/Fact distinction
    
    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      
      -- Multidimensional tags: ['IDENTITY', 'TRAIT', 'ACTIVITY', 'STATE']
      -- Stored as JSON array for SQLite compatibility
      tags TEXT NOT NULL DEFAULT '[]',
      
      -- The observation content
      predicate TEXT NOT NULL,           -- 'is', 'painted', 'attended', 'identifies_as'
      object_value TEXT,                  -- The value or content
      object_entity_id TEXT REFERENCES entities(id),
      
      -- Temporal context
      valid_from TEXT,                    -- When this became true (ISO date)
      valid_until TEXT,                   -- When it stopped being true (NULL = permanent)
      observed_at TEXT NOT NULL,          -- When we learned this
      
      -- Scoring and provenance
      confidence REAL DEFAULT 0.8,
      source_episode_id TEXT REFERENCES episodes(id),
      evidence TEXT,                       -- The exact quote
      
      -- For STATE changes (optional backwards compatibility)
      previous_value TEXT,                -- What it was before (for state changes)
      
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Indexes for retrieval
    CREATE INDEX IF NOT EXISTS idx_obs_entity ON observations(entity_id);
    CREATE INDEX IF NOT EXISTS idx_obs_predicate ON observations(predicate);
    CREATE INDEX IF NOT EXISTS idx_obs_temporal ON observations(valid_from, valid_until);
    
    -- FTS for full-text search on predicate + object
    CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
      predicate, object_value, content='observations', content_rowid='rowid'
    );
  `);
  
  console.log('Migration 005 complete: Unified observations table created');
}

// Tag definitions for extraction
export const OBSERVATION_TAGS = {
  IDENTITY: {
    description: 'Core definitions of who someone is',
    examples: ['gender', 'nationality', 'kinship', 'permanent characteristics'],
    persistence: 'permanent',
    weight: 10.0
  },
  TRAIT: {
    description: 'Persistent habits, skills, personality quirks, preferences',
    examples: ['paints sunrises', 'plays violin', 'enjoys hiking'],
    persistence: 'stable',
    weight: 3.0
  },
  ACTIVITY: {
    description: 'One-off events with clear timestamps',
    examples: ['attended support group May 7', 'ran charity race May 21'],
    persistence: 'ephemeral',
    weight: 1.0
  },
  STATE: {
    description: 'Current values that can change over time',
    examples: ['works at TechCorp', 'lives in Brisbane', 'relationship status: single'],
    persistence: 'updateable',
    weight: 5.0
  }
} as const;

export type ObservationTag = keyof typeof OBSERVATION_TAGS;
