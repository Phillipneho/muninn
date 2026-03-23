/**
 * Muninn Embedding Service
 * 
 * Generates embeddings using:
 * - Local mode: Ollama (nomic-embed-text)
 * - Cloud mode: BYOK or hosted via Muninn API
 */

import { getMode, isCloud } from './mode.js';

// Local embedding via Ollama
async function generateLocalEmbedding(text: string): Promise<number[]> {
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const model = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
  
  const response = await fetch(`${ollamaHost}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
  });
  
  if (!response.ok) {
    throw new Error(`Ollama embedding failed: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.embedding;
}

// Cloud embedding via Muninn API
async function generateCloudEmbedding(text: string): Promise<number[]> {
  const apiUrl = process.env.MUNINN_API_URL || 'https://api.muninn.au';
  const apiKey = process.env.MUNINN_API_KEY;
  
  const response = await fetch(`${apiUrl}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: text }),
  });
  
  if (!response.ok) {
    throw new Error(`Muninn API embedding failed: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Generate embedding for text using the configured mode
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (isCloud()) {
    return generateCloudEmbedding(text);
  }
  return generateLocalEmbedding(text);
}

/**
 * Generate embeddings for multiple texts
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map(t => generateEmbedding(t)));
}

/**
 * Get embedding dimensions based on mode
 */
export function getEmbeddingDimensions(): number {
  // nomic-embed-text: 768
  // OpenAI text-embedding-3-small: 1536
  // Cloud mode may use different dimensions
  if (isCloud()) {
    return parseInt(process.env.EMBEDDING_DIMENSIONS || '1536');
  }
  return 768; // nomic-embed-text
}