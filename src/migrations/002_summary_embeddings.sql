-- ============================================
-- MIGRATION: Summary Embeddings (P3)
-- Adds vector embeddings to facts for hybrid search
-- ============================================

-- Add embedding column to facts
ALTER TABLE facts ADD COLUMN summary_embedding BLOB;

-- Index for embedding-based retrieval (SQLite doesn't support vector indexes natively)
-- In PostgreSQL + pgvector, use: CREATE INDEX idx_facts_embedding ON facts USING ivfflat (summary_embedding vector_cosine_ops);
-- For SQLite, we scan all facts and filter by threshold