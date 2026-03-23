/**
 * Muninn v5.3 - Auth API
 * 
 * Handles all authentication endpoints: signup, login, logout, me, reset.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function generateApiKey(): string {
  return 'muninn_' + crypto.randomBytes(32).toString('hex');
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

const TIERS: Record<string, { limit: number }> = {
  free: { limit: 1000 },
  pro: { limit: 50000 },
  enterprise: { limit: 1000000 }
};

// Email template - inlined to avoid import issues
function getWelcomeEmail(email: string, apiKey: string, orgName: string) {
  return {
    subject: 'Welcome to Muninn — Your API Key Inside',
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Welcome to Muninn</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
<h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Muninn</h1>
<p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Memory-as-a-Service for AI Agents</p>
</div>
<div style="background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px;">
<p>Hi there,</p>
<p>Your account is ready! Here's your API key:</p>
<div style="background: #1f2937; color: #10b981; padding: 20px; border-radius: 8px; font-family: monospace; font-size: 14px; word-break: break-all; margin: 20px 0;">${apiKey}</div>
<p style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 4px;"><strong>⚠️ Save this key securely</strong> — it won't be shown again.</p>
<h2 style="margin-top: 30px;">Quick Start</h2>
<p><strong>1. Test your key:</strong></p>
<pre style="background: #1f2937; color: #e5e7eb; padding: 15px; border-radius: 6px; overflow-x: auto; font-size: 13px;">curl -X POST https://www.muninn.au/api/memories \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Hello, Muninn!"}'</pre>
<p><strong>2. View docs:</strong> <a href="https://www.muninn.au/docs" style="color: #667eea;">muninn.au/docs</a></p>
<p><strong>3. Manage keys:</strong> <a href="https://www.muninn.au/dashboard" style="color: #667eea;">muninn.au/dashboard</a></p>
<h2 style="margin-top: 30px;">Your Account</h2>
<ul style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb;">
<li><strong>Email:</strong> ${email}</li>
<li><strong>Organization:</strong> ${orgName}</li>
<li><strong>Plan:</strong> Pro ($10/month)</li>
<li><strong>API Calls:</strong> 50,000/month</li>
</ul>
<p style="color: #6b7280; font-size: 14px; margin-top: 30px;">Questions? Reply to this email or visit <a href="https://www.muninn.au/docs" style="color: #667eea;">muninn.au/docs</a></p>
<p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">— The Muninn Team<br><a href="https://www.muninn.au" style="color: #9ca3af;">muninn.au</a></p>
</div></body></html>`,
    text: `Welcome to Muninn!\n\nYour account is ready. Here's your API key:\n\n${apiKey}\n\n⚠️ Save this key securely — it won't be shown again.\n\nQUICK START\n===========\n\n1. Test your key:\ncurl -X POST https://www.muninn.au/api/memories \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"content": "Hello, Muninn!"}'\n\n2. View docs: muninn.au/docs\n3. Manage keys: muninn.au/dashboard\n\nYOUR ACCOUNT\n============\nEmail: ${email}\nOrganization: ${orgName}\nPlan: Pro ($10/month)\nAPI Calls: 50,000/month\n\nQuestions? Reply to this email.\n\n— The Muninn Team\nmuninn.au`
  };
}

// Send welcome email via Resend
async function sendWelcomeEmail(email: string, apiKey: string, orgName: string) {
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY not set, skipping email');
    return;
  }
  
  const template = getWelcomeEmail(email, apiKey, orgName);
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Muninn <hello@muninn.au>',
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Resend error:', error);
    } else {
      console.log('Welcome email sent to:', email);
    }
  } catch (err) {
    console.error('Failed to send welcome email:', err);
  }
}

// CORS helper
function corsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// POST /auth/signup
async function signup(req: VercelRequest, res: VercelResponse) {
  const { email, password, organization_name } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  
  const { data: { user }, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: organization_name || email.split('@')[0] }
  });
  
  if (authError) return res.status(400).json({ error: authError.message });
  if (!user) return res.status(500).json({ error: 'Failed to create user' });
  
  const orgName = organization_name || `${email.split('@')[0]}'s Organization`;
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .insert({ name: orgName, tier: 'pro' })
    .select()
    .single();
  
  if (orgError) {
    await supabaseAdmin.auth.admin.deleteUser(user.id);
    return res.status(500).json({ error: 'Failed to create organization' });
  }
  
  await supabaseAdmin
    .from('user_roles')
    .insert({ user_id: user.id, organization_id: org.id, role: 'owner' });
  
  const apiKey = generateApiKey();
  await supabaseAdmin
    .from('api_keys')
    .insert({
      organization_id: org.id,
      key_hash: hashApiKey(apiKey),
      key_prefix: apiKey.slice(0, 12),
      name: 'Default key',
      tier: 'pro',
      usage_limit: TIERS.pro.limit,
      usage_count: 0,
      active: true
    });
  
  // Send welcome email (async, don't block response)
  sendWelcomeEmail(user.email!, apiKey, orgName);
  
  return res.status(201).json({
    message: 'Account created. Please check your email to verify.',
    user: { id: user.id, email: user.email },
    organization: { id: org.id, name: orgName },
    api_key: apiKey
  });
}

// POST /auth/login
async function login(req: VercelRequest, res: VercelResponse) {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  const { data: { session, user }, error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (error) return res.status(401).json({ error: error.message });
  if (!user || !session) return res.status(401).json({ error: 'Invalid credentials' });
  
  const { data: role } = await supabaseAdmin
    .from('user_roles')
    .select('organization_id, organizations(name, tier)')
    .eq('user_id', user.id)
    .single();
  
  return res.status(200).json({
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at
    },
    user: { id: user.id, email: user.email },
    organization: role ? {
      id: role.organization_id,
      name: (role.organizations as any).name,
      tier: (role.organizations as any).tier
    } : null
  });
}

// POST /auth/logout
async function logout(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      await supabaseAdmin.auth.admin.signOut(authHeader.slice(7));
    } catch {}
  }
  return res.status(200).json({ message: 'Logged out' });
}

// GET /auth/me
async function me(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });
  
  const { data: role } = await supabaseAdmin
    .from('user_roles')
    .select('organization_id, role, organizations(id, name, tier)')
    .eq('user_id', user.id)
    .single();
  
  const { data: apiKeys } = await supabaseAdmin
    .from('api_keys')
    .select('id, name, key_prefix, created_at, usage_count, usage_limit, active')
    .eq('organization_id', role?.organization_id);
  
  const { data: providerConfig } = await supabaseAdmin
    .from('provider_configs')
    .select('provider, base_url, model, created_at')
    .eq('organization_id', role?.organization_id)
    .maybeSingle();
  
  return res.status(200).json({
    user: { id: user.id, email: user.email },
    organization: role ? {
      id: role.organization_id,
      name: (role.organizations as any).name,
      tier: (role.organizations as any).tier,
      role: role.role
    } : null,
    api_keys: apiKeys || [],
    provider_config: providerConfig || null
  });
}

// POST /auth/reset
async function reset(req: VercelRequest, res: VercelResponse) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://www.muninn.au/dashboard?reset=true'
  });
  
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ message: 'Password reset email sent. Check your inbox.' });
}

// Main handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const action = req.query.action as string || '';
  
  try {
    if (req.method === 'POST' && action === 'signup') return await signup(req, res);
    if (req.method === 'POST' && action === 'login') return await login(req, res);
    if (req.method === 'POST' && action === 'logout') return await logout(req, res);
    if (req.method === 'GET' && action === 'me') return await me(req, res);
    if (req.method === 'POST' && action === 'reset') return await reset(req, res);
    return res.status(404).json({ error: 'Not found. Use ?action=signup|login|logout|me|reset' });
  } catch (error: any) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}