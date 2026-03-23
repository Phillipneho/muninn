/**
 * Muninn v5.3 - Embedding Service
 * 
 * Generates embeddings using the organization's configured provider.
 * Falls back to system default (Gemini) if no config exists.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// System default (used when org has no config)
const SYSTEM_DEFAULT = {
  provider: 'gemini',
  model: 'gemini-embedding-exp-03-07',
  apiKey: process.env.GEMINI_API_KEY!
};

// Decrypt helper
function decrypt(encrypted: string): string {
  const [ivHex, data] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Get org's provider config
async function getOrgProvider(orgId: string): Promise<{ provider: string; model: string; apiKey: string; baseUrl?: string } | null> {
  const { data, error } = await supabase
    .from('provider_configs')
    .select('provider, api_key_encrypted, base_url, model')
    .eq('organization_id', orgId)
    .maybeSingle();
  
  if (error || !data) {
    return null;
  }
  
  // Ollama has no API key
  const apiKey = data.provider === 'ollama' ? '' : decrypt(data.api_key_encrypted!);
  
  return {
    provider: data.provider,
    model: data.model,
    apiKey,
    baseUrl: data.base_url
  };
}

// OpenAI embeddings
async function openaiEmbed(text: string, model: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ input: text, model })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI error: ${error.error?.message}`);
  }
  
  const data = await response.json();
  return data.data[0].embedding;
}

// Gemini embeddings
async function geminiEmbed(text: string, model: string, apiKey: string): Promise<number[]> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT'
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Gemini error: ${error.error?.message}`);
  }
  
  const data = await response.json();
  return data.embedding.values;
}

// Anthropic embeddings (via OpenRouter or direct)
async function anthropicEmbed(text: string, model: string, apiKey: string, baseUrl?: string): Promise<number[]> {
  // Anthropic doesn't have a direct embeddings API, use via OpenRouter
  const url = baseUrl || 'https://api.anthropic.com/v1/embeddings';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ input: text, model })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Anthropic error: ${error.error?.message}`);
  }
  
  const data = await response.json();
  return data.data[0].embedding;
}

// Ollama embeddings (local)
async function ollamaEmbed(text: string, model: string, baseUrl: string): Promise<number[]> {
  const response = await fetch(`${baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Ollama error: ${error.error}`);
  }
  
  const data = await response.json();
  return data.embedding;
}

// OpenRouter embeddings
async function openrouterEmbed(text: string, model: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ input: text, model })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenRouter error: ${error.error?.message}`);
  }
  
  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Generate embeddings for text using org's configured provider.
 * Falls back to system default (Gemini) if no config exists.
 */
export async function generateEmbedding(text: string, orgId?: string): Promise<{ embedding: number[]; provider: string; model: string }> {
  // Try to get org's config
  let config = orgId ? await getOrgProvider(orgId) : null;
  
  // Fall back to system default
  if (!config) {
    config = SYSTEM_DEFAULT;
  }
  
  let embedding: number[];
  
  switch (config.provider) {
    case 'openai':
      embedding = await openaiEmbed(text, config.model, config.apiKey);
      break;
    case 'gemini':
      embedding = await geminiEmbed(text, config.model, config.apiKey);
      break;
    case 'anthropic':
      embedding = await anthropicEmbed(text, config.model, config.apiKey, config.baseUrl);
      break;
    case 'ollama':
      embedding = await ollamaEmbed(text, config.model, config.baseUrl || 'http://localhost:11434');
      break;
    case 'openrouter':
      embedding = await openrouterEmbed(text, config.model, config.apiKey);
      break;
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
  
  return {
    embedding,
    provider: config.provider,
    model: config.model
  };
}

/**
 * Batch embed multiple texts.
 */
export async function batchEmbed(texts: string[], orgId?: string): Promise<{ embeddings: number[][]; provider: string; model: string }> {
  // Most providers support batch embedding
  // For now, embed one at a time (can optimize later)
  const results = await Promise.all(texts.map(t => generateEmbedding(t, orgId)));
  
  return {
    embeddings: results.map(r => r.embedding),
    provider: results[0].provider,
    model: results[0].model
  };
}