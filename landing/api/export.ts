/**
 * Muninn Capsule Export API
 * 
 * Exports all memories and entities for an organization.
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

// Hash API key for lookup
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Authenticate with either JWT or API key
async function authenticate(authHeader: string): Promise<{ organizationId: string; userId?: string; email?: string }> {
  const token = authHeader.replace('Bearer ', '');
  
  // Try JWT first (if it looks like a JWT)
  if (token.startsWith('eyJ')) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      throw new Error('Invalid JWT token');
    }
    
    const { data: role } = await supabaseAdmin
      .from('user_roles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();
    
    if (!role) {
      throw new Error('Organization not found');
    }
    
    return { organizationId: role.organization_id, userId: user.id, email: user.email };
  }
  
  // Try API key
  if (token.startsWith('muninn_')) {
    const keyHash = hashApiKey(token);
    
    const { data: key, error } = await supabaseAdmin
      .from('api_keys')
      .select('id, organization_id, tier, active')
      .eq('key_hash', keyHash)
      .eq('active', true)
      .single();
    
    if (error || !key) {
      throw new Error('Invalid or revoked API key');
    }
    
    return { organizationId: key.organization_id };
  }
  
  throw new Error('Invalid authentication token');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  try {
    const { organizationId, userId, email } = await authenticate(authHeader);

    // Fetch all memories
    const { data: memories, error: memoriesError } = await supabaseAdmin
      .from('memories')
      .select('id, content, metadata, salience, created_at, updated_at, access_count')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });

    if (memoriesError) {
      console.error('Error fetching memories:', memoriesError);
      return res.status(500).json({ error: 'Failed to fetch memories' });
    }

    // Fetch all entities
    const { data: entities, error: entitiesError } = await supabaseAdmin
      .from('entities')
      .select('id, name, type, aliases, attributes, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });

    if (entitiesError) {
      console.error('Error fetching entities:', entitiesError);
      return res.status(500).json({ error: 'Failed to fetch entities' });
    }

    // Get organization details
    const { data: organization } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .single();

    // Get provider config
    const { data: providerConfig } = await supabaseAdmin
      .from('provider_configs')
      .select('provider, model')
      .eq('organization_id', organizationId)
      .single();

    // Build capsule
    const capsule: {
      version: string;
      format: string;
      exported_at: string;
      exported_by: { user_id?: string; email?: string };
      organization: { id: string; name: string };
      metadata: {
        total_memories: number;
        total_entities: number;
        date_range: { from: string | null; to: string | null };
        provider: string;
        embedding_model: string;
        embedding_dimensions: number;
      };
      memories: typeof memories;
      entities: typeof entities;
      checksum?: string;
    } = {
      version: '1.0',
      format: 'muninn-capsule',
      exported_at: new Date().toISOString(),
      exported_by: {
        user_id: userId,
        email: email
      },
      organization: {
        id: organizationId,
        name: organization?.name || 'Unknown'
      },
      metadata: {
        total_memories: memories?.length || 0,
        total_entities: entities?.length || 0,
        date_range: {
          from: memories?.[0]?.created_at || null,
          to: memories?.[memories!.length - 1]?.created_at || null
        },
        provider: providerConfig?.provider || 'gemini',
        embedding_model: providerConfig?.model || 'gemini-embedding-exp-03-07',
        embedding_dimensions: 768
      },
      memories: memories || [],
      entities: entities || []
    };

    // Generate checksum
    const contentToHash = JSON.stringify({
      version: capsule.version,
      metadata: capsule.metadata,
      memories: capsule.memories,
      entities: capsule.entities
    });
    const checksum = crypto.createHash('sha256').update(contentToHash).digest('hex');
    capsule.checksum = `sha256:${checksum}`;

    // Set download headers
    const filename = `muninn-export-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return res.status(200).json(capsule);
  } catch (error: any) {
    console.error('Export error:', error);
    return res.status(401).json({ error: error.message || 'Authentication failed' });
  }
}