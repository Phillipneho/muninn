/**
 * Raw Sessions API Endpoint
 * 
 * POST /api/raw-sessions
 * - Stores verbatim session content
 * - Generates embedding automatically
 * - CRITICAL: Preserves session_date from original data
 * 
 * GET /api/raw-sessions
 * - Pure semantic search on raw sessions (BGE-M3)
 * - Returns top-k matching sessions
 */

import { generateEmbedding, embeddingToBuffer } from './embedding';
import { compressToBlob, decompressFromBlob, ISOQUANT_DIMENSION } from './isoquant.js';

/**
 * Create raw sessions table (run once)
 */
export async function initRawSessionsTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS raw_sessions (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      embedding_compressed BLOB,
      session_date TEXT NOT NULL,
      source TEXT NOT NULL,
      speakers TEXT,
      extracted_at TEXT,
      extraction_confidence REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_raw_sessions_date ON raw_sessions(session_date);
    CREATE INDEX IF NOT EXISTS idx_raw_sessions_source ON raw_sessions(source);
  `);
}

/**
 * POST /api/raw-sessions
 * Store a raw session with embedding
 */
export async function storeRawSession(c, content, sessionDate, source, speakers) {
  const id = crypto.randomUUID();
  
  // Generate embedding
  const embedding = await generateEmbedding(c.env.AI, content);
  const embeddingBuffer = embeddingToBuffer(embedding);
  
  // Compress embedding with IsoQuant
  let compressedBuffer;
  try {
    compressedBuffer = compressToBlob(new Float32Array(embedding));
  } catch (e) {
    console.warn('IsoQuant compression failed, storing uncompressed:', e);
    compressedBuffer = null;
  }
  
  // Store session
  await c.env.DB.prepare(`
    INSERT INTO raw_sessions (id, content, embedding_compressed, session_date, source, speakers)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    content,
    compressedBuffer || embeddingBuffer,
    sessionDate,  // CRITICAL: original date preserved
    source,
    JSON.stringify(speakers || [])
  ).run();
  
  return {
    id,
    session_date: sessionDate,
    embedding_generated: true,
    compressed: !!compressedBuffer
  };
}

/**
 * GET /api/raw-sessions
 * Search raw sessions with pure semantic search (BGE-M3)
 */
export async function searchRawSessions(c, query, options = {}) {
  const { topK = 10, sessionDate, source } = options;
  
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(c.env.AI, query);
  
  // Get all sessions (or filtered)
  let sql = 'SELECT id, content, session_date, source, speakers, embedding_compressed FROM raw_sessions';
  const conditions = [];
  const params = [];
  
  if (sessionDate) {
    conditions.push('session_date = ?');
    params.push(sessionDate);
  }
  if (source) {
    conditions.push('source = ?');
    params.push(source);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  const sessions = await c.env.DB.prepare(sql).bind(...params).all();
  
  if (!sessions.results || sessions.results.length === 0) {
    return [];
  }
  
  // Calculate similarities
  const scored = sessions.results.map(session => {
    // Decompress embedding
    let embedding;
    if (session.embedding_compressed) {
      embedding = decompressFromBlob(session.embedding_compressed, ISOQUANT_DIMENSION);
    }
    
    // Cosine similarity
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    
    return {
      id: session.id,
      content: session.content,
      session_date: session.session_date,
      source: session.source,
      speakers: JSON.parse(session.speakers || '[]'),
      similarity
    };
  });
  
  // Sort by similarity and return top-k
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK).map(s => ({
    id: s.id,
    content: s.content,
    session_date: s.session_date,
    source: s.source,
    speakers: s.speakers,
    score: s.similarity
  }));
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Decompress embedding from IsoQuant or raw buffer
 */
function decompressEmbedding(buffer) {
  // Check if compressed (4-bit) or raw (32-bit float)
  if (buffer.byteLength < 1000) {
    // Likely compressed - decompress with IsoQuant
    // For now, assume it's stored raw
    return new Float32Array(buffer);
  }
  
  // Raw float32
  return new Float32Array(buffer);
}