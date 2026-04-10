-- Migration: Add preprocessing tables and columns for Option C
-- Created: 2026-04-06
-- Purpose: Enable ingestion-time multi-hop preparation

-- Session summaries table for global context headers
CREATE TABLE IF NOT EXISTS session_summaries (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  global_header TEXT NOT NULL,
  segment_count INTEGER NOT NULL,
  total_tokens INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  organization_id TEXT NOT NULL,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_summaries_episode ON session_summaries(episode_id);
CREATE INDEX IF NOT EXISTS idx_session_summaries_org ON session_summaries(organization_id);

-- Add preprocessing columns to memories table
ALTER TABLE memories ADD COLUMN relationship_tags TEXT;
ALTER TABLE memories ADD COLUMN preprocessing_status TEXT DEFAULT 'none';

-- Add index for preprocessing status filtering
CREATE INDEX IF NOT EXISTS idx_memories_preprocessing ON memories(preprocessing_status);