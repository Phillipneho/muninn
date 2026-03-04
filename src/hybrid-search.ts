// P3: Hybrid Search with Reciprocal Rank Fusion
// Combines SQL and Vector results for world-beater retrieval

import type { Fact } from './types.js';
import { cosineSimilarity, deserializeEmbedding } from './embeddings.js';
import type { MuninnDatabase } from './database-sqlite.js';

export interface RankedFact {
  fact: Fact;
  score: number;
  source: 'sql' | 'vector' | 'both';
}

export interface SearchOptions {
  sqlWeight?: number;
  vectorWeight?: number;
  bothBoost?: number;
  limit?: number;
}

// Reciprocal Rank Fusion (RRF) algorithm
export function reciprocalRankFusion(
  sqlResults: Fact[],
  vectorResults: Fact[],
  options: SearchOptions = {}
): RankedFact[] {
  const {
    sqlWeight = 0.5,
    vectorWeight = 0.5,
    bothBoost = 2.0,
    limit = 20
  } = options;
  
  const scores = new Map<string, { fact: Fact; score: number; sources: Set<string> }>();
  
  // RRF constant (typically 60)
  const k = 60;
  
  // Score SQL results
  sqlResults.forEach((fact, i) => {
    const score = sqlWeight / (k + i + 1);
    const existing = scores.get(fact.id);
    if (existing) {
      existing.score += score;
      existing.sources.add('sql');
    } else {
      scores.set(fact.id, { fact, score, sources: new Set(['sql']) });
    }
  });
  
  // Score Vector results
  vectorResults.forEach((fact, i) => {
    const score = vectorWeight / (k + i + 1);
    const existing = scores.get(fact.id);
    if (existing) {
      existing.score += score;
      existing.sources.add('vector');
    } else {
      scores.set(fact.id, { fact, score, sources: new Set(['vector']) });
    }
  });
  
  // Boost facts appearing in both
  scores.forEach(entry => {
    if (entry.sources.has('sql') && entry.sources.has('vector')) {
      entry.score *= bothBoost;
    }
  });
  
  // Sort and limit
  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(entry => ({
      fact: entry.fact,
      score: entry.score,
      source: entry.sources.has('sql') && entry.sources.has('vector')
        ? 'both'
        : entry.sources.has('sql') ? 'sql' : 'vector'
    }));
}

// Vector similarity search
export async function vectorSearch(
  db: MuninnDatabase,
  queryEmbedding: number[],
  options: { limit?: number; threshold?: number } = {}
): Promise<Fact[]> {
  const { limit = 10, threshold = 0.5 } = options;
  
  // Get all facts with embeddings
  const facts = db['db'].prepare(`
    SELECT f.*, e.name as subject_name, e.type as subject_type
    FROM facts f
    JOIN entities e ON f.subject_entity_id = e.id
    WHERE f.summary_embedding IS NOT NULL
      AND f.invalidated_at IS NULL
  `).all() as any[];
  
  // Calculate similarities
  const results: Array<{ fact: any; similarity: number }> = [];
  
  for (const fact of facts) {
    try {
      const factEmbedding = deserializeEmbedding(fact.summary_embedding);
      const similarity = cosineSimilarity(queryEmbedding, factEmbedding);
      
      if (similarity >= threshold) {
        results.push({ fact, similarity });
      }
    } catch (e) {
      // Skip facts with invalid embeddings
      continue;
    }
  }
  
  // Sort by similarity
  results.sort((a, b) => b.similarity - a.similarity);
  
  // Map to Fact type
  return results.slice(0, limit).map(r => ({
    id: r.fact.id,
    subjectEntityId: r.fact.subject_entity_id,
    predicate: r.fact.predicate,
    objectEntityId: r.fact.object_entity_id,
    objectValue: r.fact.object_value,
    valueType: r.fact.value_type,
    confidence: r.fact.confidence,
    sourceEpisodeId: r.fact.source_episode_id,
    validFrom: r.fact.valid_from ? new Date(r.fact.valid_from) : undefined,
    validUntil: r.fact.valid_until ? new Date(r.fact.valid_until) : undefined,
    createdAt: r.fact.created_at ? new Date(r.fact.created_at) : new Date(),
    invalidatedAt: r.fact.invalidated_at ? new Date(r.fact.invalidated_at) : undefined,
    evidence: r.fact.evidence ? JSON.parse(r.fact.evidence) : undefined
  }));
}

// Hybrid search combining SQL + Vector
export async function hybridSearch(
  db: MuninnDatabase,
  query: string,
  queryEmbedding: number[],
  sqlResults: Fact[],
  options: SearchOptions = {}
): Promise<RankedFact[]> {
  // Get vector results
  const vectorResults = await vectorSearch(db, queryEmbedding, {
    limit: options.limit || 20,
    threshold: 0.3
  });
  
  // Merge with RRF
  return reciprocalRankFusion(sqlResults, vectorResults, options);
}