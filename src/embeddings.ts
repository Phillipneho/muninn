// P3: Embedding Generation for Facts
// Generates embeddings for fact + evidence pairs (not raw episodes)

import type { Fact } from './types.js';

// Mock embedding function - replace with actual embedding API
// In production, use OpenAI text-embedding-3-small or similar
export async function generateEmbedding(text: string): Promise<number[]> {
  // For now, return a deterministic pseudo-embedding based on text hash
  // This allows testing without API costs
  const hash = hashString(text);
  const embedding: number[] = [];
  
  for (let i = 0; i < 384; i++) {
    // Generate deterministic values between -1 and 1
    embedding.push(Math.sin(hash * (i + 1) * 0.001) * 0.5);
  }
  
  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map(v => v / magnitude);
}

// Generate embedding for fact summary
export async function embedFact(fact: {
  subject: string;
  predicate: string;
  object: string;
  evidence?: string;
}): Promise<number[]> {
  const summary = fact.evidence 
    ? `${fact.subject} ${fact.predicate} ${fact.object} | Context: ${fact.evidence}`
    : `${fact.subject} ${fact.predicate} ${fact.object}`;
  
  return generateEmbedding(summary);
}

// Calculate cosine similarity between two embeddings
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

// Hash function for deterministic pseudo-embeddings
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Serialize embedding for storage
export function serializeEmbedding(embedding: number[]): Buffer {
  const buffer = Buffer.alloc(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(embedding[i], i * 4);
  }
  return buffer;
}

// Deserialize embedding from storage
export function deserializeEmbedding(buffer: Buffer): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < buffer.length / 4; i++) {
    embedding.push(buffer.readFloatLE(i * 4));
  }
  return embedding;
}