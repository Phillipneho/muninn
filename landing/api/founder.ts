/**
 * Muninn Founder Setup API
 * 
 * Creates founder accounts with lifetime Pro access.
 * This endpoint is disabled after initial setup.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const FOUNDER_SECRET = process.env.FOUNDER_SECRET!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const TIERS = {
  free: { limit: 1000 },
  pro: { limit: 50000 },
  enterprise: { limit: 1000000 },
  founder: { limit: 999999999 } // Unlimited
};

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(hashBuffer).toString('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify founder secret (prevents abuse)
  const providedSecret = req.headers['x-founder-secret'] || req.body?.secret;
  if (providedSecret !== FOUNDER_SECRET) {
    return res.status(401).json({ error: 'Invalid founder secret' });
  }

  const { email, name, tier = 'enterprise' } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Check if user exists
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('[founder] Error listing users:', listError);
      return res.status(500).json({ error: 'Failed to check users' });
    }

    const existingUser = users?.find(u => u.email === email);
    let userId: string;
    let orgId: string;

    if (existingUser) {
      // User exists, get their org
      userId = existingUser.id;
      console.log(`[founder] Found existing user: ${userId}`);

      const { data: role, error: roleError } = await supabaseAdmin
        .from('user_roles')
        .select('organization_id')
        .eq('user_id', userId)
        .single();

      if (roleError && roleError.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine
        console.error('[founder] Error fetching role:', roleError);
      }

      if (role?.organization_id) {
        orgId = role.organization_id;
        console.log(`[founder] Found existing org: ${orgId}`);
      } else {
        // Create org for existing user
        console.log(`[founder] Creating org for existing user...`);
        const { data: org, error: orgError } = await supabaseAdmin
          .from('organizations')
          .insert({
            name: name || `${email.split('@')[0]}'s Organization`,
            tier
          })
          .select()
          .single();

        if (orgError) {
          console.error('[founder] Error creating org:', JSON.stringify(orgError));
          return res.status(500).json({ error: 'Failed to create organization', details: orgError.message });
        }

        orgId = org.id;
        console.log(`[founder] Created org: ${orgId}`);

        const { error: insertError } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: userId,
            organization_id: orgId,
            role: 'owner'
          });

        if (insertError) {
          console.error('[founder] Error inserting role:', insertError);
        }
      }
    } else {
      // Create new user
      const tempPassword = crypto.randomUUID();
      const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: name || email.split('@')[0],
          from_founder: true
        }
      });

      if (userError || !user) {
        console.error('[founder] Error creating user:', userError);
        return res.status(500).json({ error: 'Failed to create user' });
      }

      userId = user.id;
      console.log(`[founder] Created user: ${userId}`);

      // Create organization
      const { data: org, error: orgError } = await supabaseAdmin
        .from('organizations')
        .insert({
          name: name || `${email.split('@')[0]}'s Organization`,
          tier
        })
        .select()
        .single();

      if (orgError) {
        console.error('[founder] Error creating org:', orgError);
        return res.status(500).json({ error: 'Failed to create organization' });
      }

      orgId = org.id;

      // Add user to organization
      await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: userId,
          organization_id: orgId,
          role: 'owner'
        });
    }

    // Generate API key
    const apiKey = 'muninn_' + crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    const keyHash = await hashKey(apiKey);
    const keyPrefix = apiKey.slice(0, 12);

    // Delete existing API keys
    await supabaseAdmin
      .from('api_keys')
      .delete()
      .eq('organization_id', orgId);

    // Create new API key with founder privileges (enterprise tier, unlimited usage)
    const { error: keyError } = await supabaseAdmin
      .from('api_keys')
      .insert({
        organization_id: orgId,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        name: 'Founder Key',
        tier: 'enterprise',
        usage_limit: TIERS.founder.limit,
        active: true
      });

    if (keyError) {
      console.error('[founder] Error creating API key:', keyError);
      return res.status(500).json({ error: 'Failed to create API key' });
    }

    // Create or update customer record (with founder privileges)
    const { error: customerError } = await supabaseAdmin
      .from('customers')
      .upsert({
        organization_id: orgId,
        stripe_customer_id: `founder_${userId.slice(0, 8)}`,
        tier: 'enterprise', // Use enterprise tier for founder access
        status: 'active',
        usage_limit: TIERS.founder.limit, // But with unlimited usage
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString() // 100 years
      }, { onConflict: 'organization_id' });

    if (customerError) {
      console.error('[founder] Error creating customer:', customerError);
      // Don't fail - customer record is optional
    }

    // Update organization tier
    await supabaseAdmin
      .from('organizations')
      .update({ tier })
      .eq('id', orgId);

    console.log(`[founder] Setup complete for ${email}: user=${userId}, org=${orgId}, tier=${tier}`);

    return res.status(200).json({
      success: true,
      user_id: userId,
      organization_id: orgId,
      api_key: apiKey,
      tier: 'enterprise',
      usage_limit: 'unlimited',
      message: 'Founder account created successfully. You have Enterprise tier with unlimited usage.'
    });
  } catch (error: any) {
    console.error('[founder] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}