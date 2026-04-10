-- ============================================
-- MUNINN D1 SCHEMA v3 - IsoQuant Compression
-- Adds compressed embedding storage
-- ============================================

-- ============================================
-- COMPRESSED EMBEDDINGS
-- IsoQuant-Fast 4-bit compression (99.2% cosine similarity)
-- ============================================

-- Add compression columns to episodes
ALTER TABLE episodes ADD COLUMN embedding_bits INTEGER DEFAULT 4;
ALTER TABLE episodes ADD COLUMN embedding_compressed BLOB;

-- Add compression columns to entities
ALTER TABLE entities ADD COLUMN embedding_bits INTEGER DEFAULT 4;
ALTER TABLE entities ADD COLUMN embedding_compressed BLOB;

-- Add compression columns to memories
ALTER TABLE memories ADD COLUMN embedding_bits INTEGER DEFAULT 4;
ALTER TABLE memories ADD COLUMN embedding_compressed BLOB;

-- ============================================
-- COMPRESSION METADATA TABLE
-- Tracks compression statistics per organization
-- ============================================
CREATE TABLE IF NOT EXISTS compression_stats (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  
  -- Counts
  total_embeddings INTEGER DEFAULT 0,
  compressed_embeddings INTEGER DEFAULT 0,
  
  -- Storage savings
  original_bytes INTEGER DEFAULT 0,  -- FP16 size
  compressed_bytes INTEGER DEFAULT 0,  -- Compressed size
  
  -- Quality metrics
  avg_cosine_similarity REAL DEFAULT 0.0,
  avg_mse REAL DEFAULT 0.0,
  
  -- Configuration
  compression_bits INTEGER DEFAULT 4,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_compression_stats_org ON compression_stats(organization_id);

-- ============================================
-- NOTES
-- ============================================
-- IsoQuant-Fast 4-bit achieves:
-- - 4x storage reduction (1.5KB -> 0.38KB per 768-dim embedding)
-- - 99.2% cosine similarity
-- - 120x fewer parameters than TurboQuant
-- - Data-oblivious (no training required)
--
-- Storage format (BLOB):
-- - uint8 indices: d/2 bytes (4 bits per dimension)
-- - float32 norm: 4 bytes
-- - Total: (d/2 + 4) bytes per embedding
--
-- For d=768:
-- - Original: 768 * 2 = 1536 bytes (FP16)
-- - Compressed: 384 + 4 = 388 bytes
-- - Compression: 3.96x