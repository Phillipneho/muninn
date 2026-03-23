/**
 * Muninn v5.3 - Stripe Webhook Handler
 * 
 * Processes Stripe webhook events for subscription management.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const TIERS = {
  free: { limit: 1000 },
  pro: { limit: 50000 },
  enterprise: { limit: 1000000 }
};

// Verify Stripe webhook signature
async function verifySignature(payload: string, signature: string): Promise<any> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  
  const parts = signature.split(',');
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
  const v1 = parts.find(p => p.startsWith('v1='))?.slice(3);
  
  if (!timestamp || !v1) {
    throw new Error('Invalid signature format');
  }
  
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = Buffer.from(v1, 'hex');
  
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    expectedSignature,
    encoder.encode(signedPayload)
  );
  
  if (!valid) {
    throw new Error('Invalid signature');
  }
  
  return JSON.parse(payload);
}

// Handle checkout.session.completed
async function handleCheckoutCompleted(session: any): Promise<void> {
  const customerId = session.customer;
  const subscriptionId = session.subscription;
  const tier = session.metadata?.tier || 'pro';
  const email = session.customer_details?.email;
  const customerName = session.customer_details?.name || email?.split('@')[0];
  
  if (!email) {
    console.error('[webhook] No email in checkout session');
    return;
  }
  
  // Try to find existing user
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(u => u.email === email);
  
  let userId: string;
  let orgId: string;
  let apiKey: string;
  
  if (existingUser) {
    // User exists, get their org
    userId = existingUser.id;
    const { data: role } = await supabase
      .from('user_roles')
      .select('organization_id')
      .eq('user_id', userId)
      .single();
    
    if (role?.organization_id) {
      orgId = role.organization_id;
    } else {
      // Create org for existing user
      const { data: org } = await supabase
        .from('organizations')
        .insert({
          name: `${customerName}'s Organization`,
          tier,
          created_by: userId
        })
        .select()
        .single();
      
      orgId = org.id;
      
      await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          organization_id: orgId,
          role: 'owner'
        });
    }
  } else {
    // Create new user with temporary password (they'll set it on first login)
    const tempPassword = crypto.randomUUID();
    const { data: { user }, error: userError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: customerName,
        from_checkout: true
      }
    });
    
    if (userError || !user) {
      console.error('[webhook] Failed to create user:', userError);
      return;
    }
    
    userId = user.id;
    
    // Create organization
    const { data: org } = await supabase
      .from('organizations')
      .insert({
        name: `${customerName}'s Organization`,
        tier,
        created_by: userId
      })
      .select()
      .single();
    
    orgId = org.id;
    
    // Add user to organization
    await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        organization_id: orgId,
        role: 'owner'
      });
  }
  
  // Generate API key
  apiKey = 'muninn_' + crypto.randomUUID().replace(/-/g, '').slice(0, 32);
  const keyHash = await hashKey(apiKey);
  const keyPrefix = apiKey.slice(0, 12);
  
  // Store API key
  await supabase
    .from('api_keys')
    .insert({
      organization_id: orgId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name: 'Default key',
      tier,
      usage_limit: TIERS[tier as keyof typeof TIERS].limit,
      active: true
    });
  
  // Create customer record
  await supabase
    .from('customers')
    .upsert({
      organization_id: orgId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      tier,
      status: 'active',
      usage_limit: TIERS[tier as keyof typeof TIERS].limit,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }, { onConflict: 'organization_id' });
  
  // Store the API key in a temporary table for the success page to retrieve
  // Using session metadata is more reliable than a separate table
  await fetch(`https://api.stripe.com/v1/checkout/sessions/${session.id}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      'metadata[api_key]': apiKey,
      'metadata[user_id]': userId,
      'metadata[org_id]': orgId
    })
  }).catch(e => console.error('[webhook] Failed to update session metadata:', e));
  
  console.log(`[webhook] Created customer: ${customerId}, user: ${userId}, org: ${orgId}, tier: ${tier}`);
}

// Handle customer.subscription.updated
async function handleSubscriptionUpdated(subscription: any): Promise<void> {
  const customerId = subscription.customer;
  const status = subscription.status;
  const tier = subscription.metadata?.tier || 'pro';
  
  const { data: customer } = await supabase
    .from('customers')
    .select('id, organization_id')
    .eq('stripe_customer_id', customerId)
    .single();
  
  if (!customer) {
    console.error(`[webhook] Customer not found: ${customerId}`);
    return;
  }
  
  await supabase
    .from('customers')
    .update({
      tier,
      status: status === 'active' ? 'active' : status,
      usage_limit: TIERS[tier as keyof typeof TIERS].limit,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
    })
    .eq('id', customer.id);
  
  // Update API key tier
  await supabase
    .from('api_keys')
    .update({ tier })
    .eq('organization_id', customer.organization_id);
  
  // Log subscription change
  await supabase
    .from('subscription_history')
    .insert({
      customer_id: customer.id,
      event_type: 'subscription_updated',
      to_tier: tier,
      stripe_event_id: subscription.id
    });
  
  console.log(`[webhook] Updated subscription: ${customerId}, status: ${status}, tier: ${tier}`);
}

// Handle customer.subscription.deleted
async function handleSubscriptionDeleted(subscription: any): Promise<void> {
  const customerId = subscription.customer;
  
  const { data: customer } = await supabase
    .from('customers')
    .select('id, organization_id')
    .eq('stripe_customer_id', customerId)
    .single();
  
  if (!customer) {
    console.error(`[webhook] Customer not found: ${customerId}`);
    return;
  }
  
  // Downgrade to free tier
  await supabase
    .from('customers')
    .update({
      tier: 'free',
      status: 'canceled',
      usage_limit: TIERS.free.limit
    })
    .eq('id', customer.id);
  
  // Update API key
  await supabase
    .from('api_keys')
    .update({ tier: 'free', usage_limit: TIERS.free.limit })
    .eq('organization_id', customer.organization_id);
  
  // Log subscription change
  await supabase
    .from('subscription_history')
    .insert({
      customer_id: customer.id,
      event_type: 'subscription_canceled',
      from_tier: 'pro',
      to_tier: 'free',
      stripe_event_id: subscription.id
    });
  
  console.log(`[webhook] Canceled subscription: ${customerId}`);
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(hashBuffer).toString('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const signature = req.headers['stripe-signature'] as string;
  const payload = JSON.stringify(req.body);
  
  try {
    // Verify webhook signature
    const event = await verifySignature(payload, signature);
    
    console.log(`[webhook] Received event: ${event.type}`);
    
    // Handle event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      
      default:
        console.log(`[webhook] Unhandled event type: ${event.type}`);
    }
    
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('[webhook] Error:', error);
    res.status(400).json({ error: error.message });
  }
}