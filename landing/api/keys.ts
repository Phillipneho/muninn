/**
 * Muninn v5.3 - API Keys Management
 * 
 * Create, list, and revoke API keys for organizations.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Generate and hash API keys
function generateApiKey(): string {
  return 'muninn_' + crypto.randomBytes(32).toString('hex');
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Auth helper
async function getUserId(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.slice(7);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } }
  });
  
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.id || null;
}

async function getOrgId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('user_roles')
    .select('organization_id')
    .eq('user_id', userId)
    .single();
  
  return data?.organization_id || null;
}

// Tier limits
const TIERS: Record<string, { limit: number }> = {
  free: { limit: 1000 },
  pro: { limit: 50000 },
  enterprise: { limit: 1000000 }
};

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
    const userId = await getUserId(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const orgId = await getOrgId(userId);
    
    if (!orgId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    // GET - List all keys
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('api_keys')
        .select('id, name, key_prefix, created_at, last_used_at, usage_count, usage_limit, active')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      
      if (error) {
        return res.status(500).json({ error: 'Failed to fetch API keys' });
      }
      
      return res.status(200).json({ keys: data });
    }
    
    // POST - Create new key
    if (req.method === 'POST') {
      const { name } = req.body || {};
      const apiKey = generateApiKey();
      const keyHash = hashApiKey(apiKey);
      const keyPrefix = apiKey.slice(0, 12);
      const keyName = name || 'API Key';
      
      // Get org tier for usage limits
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('tier')
        .eq('id', orgId)
        .single();
      
      const tier = org?.tier || 'pro';
      const limit = TIERS[tier]?.limit || 50000;
      
      const { error } = await supabaseAdmin
        .from('api_keys')
        .insert({
          organization_id: orgId,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          name: keyName,
          tier,
          usage_limit: limit,
          usage_count: 0,
          active: true
        });
      
      if (error) {
        return res.status(500).json({ error: 'Failed to create API key' });
      }
      
      // Return the plain text key ONCE (can't be retrieved later)
      return res.status(201).json({
        message: 'API key created. Store it securely - it cannot be retrieved again.',
        key: apiKey,
        name: keyName
      });
    }
    
    // DELETE - Revoke key
    if (req.method === 'DELETE') {
      const { id } = req.query;
      
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Key ID required' });
      }
      
      const { error } = await supabaseAdmin
        .from('api_keys')
        .update({ active: false })
        .eq('id', id)
        .eq('organization_id', orgId);
      
      if (error) {
        return res.status(500).json({ error: 'Failed to revoke API key' });
      }
      
      return res.status(200).json({ message: 'API key revoked' });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('API keys error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
