-- Migration: Add compressed embedding columns
-- IsoQuant-Fast 4-bit compression (99.2% cosine similarity, 4x storage reduction)

-- Episodes table
ALTER TABLE episodes ADD COLUMN embedding_compressed BLOB;
ALTER TABLE episodes ADD COLUMN embedding_bits INTEGER DEFAULT 4;

-- Entities table
ALTER TABLE entities ADD COLUMN embedding_compressed BLOB;
ALTER TABLE entities ADD COLUMN embedding_bits INTEGER DEFAULT 4;

-- Memories table
ALTER TABLE memories ADD COLUMN embedding_compressed BLOB;
ALTER TABLE memories ADD COLUMN embedding_bits INTEGER DEFAULT 4;

-- Compression stats table
CREATE TABLE IF NOT EXISTS compression_stats (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  total_embeddings INTEGER DEFAULT 0,
  compressed_embeddings INTEGER DEFAULT 0,
  original_bytes INTEGER DEFAULT 0,
  compressed_bytes INTEGER DEFAULT 0,
  avg_cosine_similarity REAL DEFAULT 0.0,
  compression_bits INTEGER DEFAULT 4,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_compression_stats_org ON compression_stats(organization_id);