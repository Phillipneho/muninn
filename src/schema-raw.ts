/**
 * Raw Session Storage Schema
 * 
 * Key insight: Store verbatim sessions, search on embeddings, skip extraction.
 * Based on MemPal architecture (88.9-100% accuracy on LOCOMO).
 * 
 * CRITICAL: session_date MUST be preserved from original data.
 */

export const RAW_SESSIONS_SCHEMA = `
-- Raw conversation sessions (verbatim storage)
-- Primary source for semantic retrieval
CREATE TABLE IF NOT EXISTS raw_sessions (
  id TEXT PRIMARY KEY,
  
  -- Session content (verbatim)
  content TEXT NOT NULL,              -- Raw conversation text
  
  -- Embedding for semantic search (IsoQuant compressed)
  embedding BLOB,                     -- 768-dim bge-base-en-v1.5, 4-bit quantized
  
  -- Session metadata (CRITICAL: preserve original dates)
  session_date TEXT NOT NULL,         -- ISO date: "2023-05-07" (NOT today!)
  source TEXT NOT NULL,                -- 'locomo', 'chatgpt', 'claude', etc.
  
  -- Speaker info for hybrid search
  speakers TEXT,                       -- JSON array: ["Caroline", "Melanie"]
  
  -- Extraction status (for background refinement)
  extracted_at TEXT,                   -- When facts were extracted (NULL = not yet)
  extraction_confidence REAL,          -- 0.0-1.0
  
  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for temporal queries
CREATE INDEX IF NOT EXISTS idx_raw_sessions_date ON raw_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_raw_sessions_source ON raw_sessions(source);

-- Link facts to their source session (new column)
-- This allows: "Show me the session where this fact came from"
ALTER TABLE facts ADD COLUMN source_session TEXT REFERENCES raw_sessions(id);
`;

export const PDS_FACTS_SCHEMA_UPDATE = `
-- Add confidence scoring to existing facts table
-- Allows tracking extraction quality for background refinement

ALTER TABLE facts ADD COLUMN confidence REAL DEFAULT 0.8;
ALTER TABLE facts ADD COLUMN source_session TEXT;
ALTER TABLE facts ADD COLUMN extracted_at TEXT;

-- Index for confidence-based queries
CREATE INDEX IF NOT EXISTS idx_facts_confidence ON facts(confidence);
CREATE INDEX IF NOT EXISTS idx_facts_source_session ON facts(source_session);
`;

/**
 * Session structure for LOCOMO data
 */
export interface RawSession {
  id: string;                    // "conv-26-7" for LOCOMO
  content: string;               // Verbatim conversation text
  session_date: string;          // "2023-05-07" (from original data)
  source: string;                // "locomo"
  speakers: string[];            // ["Caroline", "Melanie"]
  embedding?: Float32Array;      // Generated during ingestion
}

/**
 * Query result for hybrid retrieval
 */
export interface SessionSearchResult {
  session: RawSession;
  score: number;                 // Cosine similarity
  rank: number;                  // Position in results
}