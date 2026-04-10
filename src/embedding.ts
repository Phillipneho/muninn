/**
 * Embedding utilities for Cloudflare AI
 */

/**
 * Generate embedding using Cloudflare AI
 */
export async function generateEmbedding(ai: any, text: string): Promise<number[]> {
  try {
    // BGE-M3: 1024 dimensions, 60K context, multilingual
    const response = await ai.run('@cf/baai/bge-m3', {
      text: [text]
    });
    
    if (response && response.data && response.data[0]) {
      // BGE-M3 returns 1024-dimensional embeddings
      return response.data[0] as number[];
    }
    
    throw new Error('Invalid embedding response');
  } catch (error) {
    console.error('Embedding generation failed:', error);
    throw error;
  }
}

/**
 * Convert embedding array to ArrayBuffer for storage
 */
export function embeddingToBuffer(embedding: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(embedding.length * 4);
  const view = new DataView(buffer);
  embedding.forEach((val, i) => view.setFloat32(i * 4, val, true));
  return buffer;
}

/**
 * Convert ArrayBuffer back to embedding array
 */
export function bufferToEmbedding(buffer: ArrayBuffer): number[] {
  const view = new DataView(buffer);
  const embedding: number[] = [];
  for (let i = 0; i < buffer.byteLength / 4; i++) {
    embedding.push(view.getFloat32(i * 4, true));
  }
  return embedding;
}