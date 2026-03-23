/**
 * Muninn Mode Detection
 * 
 * Determines whether to use local (SQLite) or cloud (Supabase) mode.
 * Cloud mode is activated when MUNINN_API_KEY is set.
 */

export type MuninnMode = 'local' | 'cloud';

export function getMode(): MuninnMode {
  // Cloud mode: API key provided
  if (process.env.MUNINN_API_KEY) {
    return 'cloud';
  }
  
  // Local mode: No API key
  return 'local';
}

export function isCloud(): boolean {
  return getMode() === 'cloud';
}

export function isLocal(): boolean {
  return getMode() === 'local';
}

/**
 * Get configuration for current mode
 */
export function getConfig() {
  const mode = getMode();
  
  if (mode === 'cloud') {
    return {
      mode: 'cloud' as const,
      apiUrl: process.env.MUNINN_API_URL || 'https://api.muninn.au',
      apiKey: process.env.MUNINN_API_KEY!,
    };
  }
  
  return {
    mode: 'local' as const,
    dbPath: process.env.DATABASE_PATH || process.env.HOME + '/.openclaw/muninn-memories.db',
    embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
  };
}