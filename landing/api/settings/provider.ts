/**
 * Muninn v5.3 - Provider Settings API
 * 
 * Allows organizations to configure their own LLM provider keys (BYOK).
 * Supports: OpenAI, Gemini, Anthropic, Ollama, OpenRouter
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!; // 32-byte hex string

// Service client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Encryption helpers
function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encrypted: string): string {
  const [ivHex, data] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Provider configurations
const PROVIDER_DEFAULTS: Record<string, { model: string; baseUrl?: string }> = {
  openai: { model: 'text-embedding-3-small' },
  gemini: { model: 'gemini-embedding-exp-03-07' },
  anthropic: { model: 'claude-3-sonnet-20240229' },
  ollama: { model: 'nomic-embed-text', baseUrl: 'http://localhost:11434' },
  openrouter: { model: 'openai/text-embedding-3-small', baseUrl: 'https://openrouter.ai/api/v1' }
};

interface ProviderConfig {
  provider: 'openai' | 'gemini' | 'anthropic' | 'ollama' | 'openrouter';
  api_key?: string;
  base_url?: string;
  model?: string;
}

// Auth middleware (reused from index.ts)
async function authenticate(req: VercelRequest): Promise<string> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing authorization header');
  }
  
  const token = authHeader.slice(7);
  
  if (token.startsWith('muninn_')) {
    const keyHash = crypto.createHash('sha256').update(token).digest('hex');
    const { data: key, error } = await supabase
      .from('api_keys')
      .select('organization_id')
      .eq('key_hash', keyHash)
      .eq('active', true)
      .single();
    
    if (error || !key) {
      throw new Error('Invalid or revoked API key');
    }
    
    return key.organization_id;
  }
  
  // JWT auth
  const supabaseClient = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error || !user) {
    throw new Error('Invalid or expired token');
  }
  
  const { data: role } = await supabase
    .from('user_roles')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();
  
  if (!role) {
    throw new Error('User not associated with any organization');
  }
  
  return role.organization_id;
}

// GET /settings/provider - Get current config
async function getProviderConfig(orgId: string, res: VercelResponse) {
  const { data, error } = await supabase
    .from('provider_configs')
    .select('provider, base_url, model, created_at, updated_at')
    .eq('organization_id', orgId);
  
  if (error) {
    return res.status(500).json({ error: 'Failed to fetch provider configs' });
  }
  
  // Don't return api_key - only metadata
  return res.status(200).json({ 
    configs: data,
    default_provider: 'gemini', // System default
    available_providers: Object.keys(PROVIDER_DEFAULTS).map(p => ({
      name: p,
      default_model: PROVIDER_DEFAULTS[p]?.model,
      requires_key: p !== 'ollama'
    }))
  });
}

// POST /settings/provider - Set config
async function setProviderConfig(orgId: string, body: ProviderConfig, res: VercelResponse) {
  const { provider, api_key, base_url, model } = body;
  
  // Validate provider
  if (!PROVIDER_DEFAULTS[provider]) {
    return res.status(400).json({ error: `Invalid provider. Must be one of: ${Object.keys(PROVIDER_DEFAULTS).join(', ')}` });
  }
  
  // Ollama doesn't require an API key
  if (provider !== 'ollama' && !api_key) {
    return res.status(400).json({ error: `API key required for ${provider}` });
  }
  
  // Encrypt API key
  const encryptedKey = api_key ? encrypt(api_key) : null;
  
  // Upsert config
  const { error } = await supabase
    .from('provider_configs')
    .upsert({
      organization_id: orgId,
      provider,
      api_key_encrypted: encryptedKey,
      base_url: base_url || PROVIDER_DEFAULTS[provider]?.baseUrl,
      model: model || PROVIDER_DEFAULTS[provider]?.model,
      updated_at: new Date().toISOString()
    }, { onConflict: 'organization_id,provider' });
  
  if (error) {
    return res.status(500).json({ error: 'Failed to save provider config' });
  }
  
  return res.status(200).json({ 
    success: true,
    provider,
    model: model || PROVIDER_DEFAULTS[provider]?.model,
    message: `Provider ${provider} configured successfully`
  });
}

// DELETE /settings/provider - Remove config
async function deleteProviderConfig(orgId: string, provider: string, res: VercelResponse) {
  const { error } = await supabase
    .from('provider_configs')
    .delete()
    .eq('organization_id', orgId)
    .eq('provider', provider);
  
  if (error) {
    return res.status(500).json({ error: 'Failed to delete provider config' });
  }
  
  return res.status(200).json({ success: true, message: `Provider ${provider} removed` });
}

// Main handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const orgId = await authenticate(req);
    
    if (req.method === 'GET') {
      return await getProviderConfig(orgId, res);
    }
    
    if (req.method === 'POST') {
      return await setProviderConfig(orgId, req.body, res);
    }
    
    if (req.method === 'DELETE') {
      const { provider } = req.query;
      if (!provider || typeof provider !== 'string') {
        return res.status(400).json({ error: 'Provider parameter required' });
      }
      return await deleteProviderConfig(orgId, provider, res);
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Provider settings error:', error);
    return res.status(401).json({ error: error.message });
  }
}