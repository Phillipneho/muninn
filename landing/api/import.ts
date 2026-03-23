/**
 * Muninn Capsule Import API
 * 
 * Imports memories and entities from a previously exported capsule.
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
async function authenticate(authHeader: string): Promise<{ organizationId: string; userId?: string }> {
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
    
    return { organizationId: role.organization_id, userId: user.id };
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  try {
    const { organizationId } = await authenticate(authHeader);
    const capsule = req.body;

    if (!capsule || capsule.format !== 'muninn-capsule') {
      return res.status(400).json({ error: 'Invalid capsule format. Expected muninn-capsule.' });
    }

    // Verify checksum
    const contentToHash = JSON.stringify({
      version: capsule.version,
      metadata: capsule.metadata,
      memories: capsule.memories,
      entities: capsule.entities
    });
    const expectedChecksum = crypto.createHash('sha256').update(contentToHash).digest('hex');
    const providedChecksum = capsule.checksum?.replace('sha256:', '');

    if (providedChecksum && providedChecksum !== expectedChecksum) {
      return res.status(400).json({ error: 'Checksum mismatch. File may be corrupted.' });
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Import memories
    if (capsule.memories && Array.isArray(capsule.memories)) {
      for (const memory of capsule.memories) {
        try {
          // Check if memory already exists (by content hash)
          const contentHash = crypto.createHash('sha256').update(memory.content).digest('hex');
          
          const { data: existing } = await supabaseAdmin
            .from('memories')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('content_hash', contentHash)
            .single();

          if (existing) {
            skipped++;
            continue;
          }

          // Insert memory (without content_hash since it may not exist in cloud schema)
          const { error: insertError } = await supabaseAdmin
            .from('memories')
            .insert({
              organization_id: organizationId,
              content: memory.content,
              metadata: memory.metadata || {},
              salience: memory.salience || 0.5,
              created_at: memory.created_at || new Date().toISOString(),
              updated_at: memory.updated_at || new Date().toISOString()
            });

          if (insertError) {
            errors.push(`Memory ${memory.id}: ${insertError.message}`);
          } else {
            imported++;
          }
        } catch (e) {
          errors.push(`Memory ${memory.id}: ${(e as Error).message}`);
        }
      }
    }

    // Import entities
    if (capsule.entities && Array.isArray(capsule.entities)) {
      for (const entity of capsule.entities) {
        try {
          // Check if entity already exists (by name)
          const { data: existing } = await supabaseAdmin
            .from('entities')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('name', entity.name)
            .single();

          if (existing) {
            continue; // Skip entities silently
          }

          // Insert entity
          const { error: insertError } = await supabaseAdmin
            .from('entities')
            .insert({
              organization_id: organizationId,
              name: entity.name,
              type: entity.type || 'unknown',
              aliases: entity.aliases || [],
              attributes: entity.attributes || {},
              created_at: entity.created_at || new Date().toISOString()
            });

          if (insertError) {
            errors.push(`Entity ${entity.name}: ${insertError.message}`);
          }
        } catch (e) {
          errors.push(`Entity ${entity.name}: ${(e as Error).message}`);
        }
      }
    }

    console.log(`Import complete: ${imported} memories imported, ${skipped} skipped, ${errors.length} errors`);

    return res.status(200).json({
      success: true,
      imported,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error('Import error:', error);
    return res.status(401).json({ error: error.message || 'Authentication failed' });
  }
}