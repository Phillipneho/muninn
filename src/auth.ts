/**
 * Muninn Auth Module
 * Handles user authentication for dashboard
 */

import { v4 as uuidv4 } from 'uuid'

// Simple password hashing (use Web Crypto API)
async function hashPassword(password: string, salt?: string): Promise<string> {
  const s = salt || uuidv4()
  const encoder = new TextEncoder()
  const data = encoder.encode(password + s)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return `${s}:${hashHex}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':')
  const computed = await hashPassword(password, salt)
  return computed === stored
}

// Generate session token
function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Generate API key
function generateApiKey(): string {
  const prefix = 'muninn'
  const random = generateToken().substring(0, 32)
  return `${prefix}_${random}`
}

export function createAuthRoutes(app: any) {
  // Login
  app.get('/api/auth', async (c: any) => {
    const action = c.req.query('action')
    const authHeader = c.req.header('Authorization')
    
    // Me endpoint - get current user
    if (action === 'me') {
      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
      
      const token = authHeader.replace('Bearer ', '')
      
      const session = await c.env.DB.prepare(`
        SELECT s.user_id, s.expires_at, u.email, u.name, u.tier, u.organization_id
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > datetime('now')
      `).bind(token).first()
      
      if (!session) {
        return c.json({ error: 'Invalid or expired session' }, 401)
      }
      
      // Get API keys for this user
      const keys = await c.env.DB.prepare(`
        SELECT id, key, name, tier, usage_count, usage_limit, created_at, last_used_at
        FROM api_keys
        WHERE user_id = ? AND revoked_at IS NULL
        ORDER BY created_at DESC
      `).bind(session.user_id).all()
      
      // Get provider config
      const providerConfig = await c.env.DB.prepare(`
        SELECT provider FROM provider_keys WHERE user_id = ?
      `).bind(session.user_id).first()
      
      return c.json({
        user: {
          id: session.user_id,
          email: session.email,
          name: session.name,
          tier: session.tier,
          organization_id: session.organization_id
        },
        api_keys: keys.results.map((k: any) => ({
          id: k.id,
          key: k.key,
          key_prefix: k.key.substring(0, 8) + '...',
          name: k.name,
          tier: k.tier,
          usage_count: k.usage_count,
          usage_limit: k.usage_limit,
          created_at: k.created_at,
          last_used_at: k.last_used_at
        })),
        provider_config: providerConfig ? {
          provider: (providerConfig as any).provider
        } : null
      })
    }
    
    return c.json({ error: 'Unknown action' }, 400)
  })
  
  // Login
  app.post('/api/auth', async (c: any) => {
    const action = c.req.query('action')
    const body = await c.req.json()
    
    if (action === 'login') {
      const { email, password } = body
      
      if (!email || !password) {
        return c.json({ error: 'Email and password required' }, 400)
      }
      
      // Find user
      const user = await c.env.DB.prepare(`
        SELECT id, email, password_hash, name, tier, organization_id
        FROM users WHERE email = ?
      `).bind(email.toLowerCase()).first()
      
      if (!user) {
        return c.json({ error: 'Invalid email or password' }, 401)
      }
      
      // Verify password
      const valid = await verifyPassword(password, user.password_hash)
      if (!valid) {
        return c.json({ error: 'Invalid email or password' }, 401)
      }
      
      // Create session
      const sessionId = uuidv4()
      const token = generateToken()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      
      await c.env.DB.prepare(`
        INSERT INTO sessions (id, user_id, token, expires_at, organization_id)
        VALUES (?, ?, ?, ?, ?)
      `).bind(sessionId, user.id, token, expiresAt, user.organization_id).run()
      
      return c.json({
        access_token: token,
        token_type: 'bearer',
        expires_in: 7 * 24 * 60 * 60,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          tier: user.tier,
          organization_id: user.organization_id
        }
      })
    }
    
    if (action === 'signup') {
      const { email, password, name } = body
      
      if (!email || !password) {
        return c.json({ error: 'Email and password required' }, 400)
      }
      
      if (password.length < 8) {
        return c.json({ error: 'Password must be at least 8 characters' }, 400)
      }
      
      // Check if user exists
      const existing = await c.env.DB.prepare(`
        SELECT id FROM users WHERE email = ?
      `).bind(email.toLowerCase()).first()
      
      if (existing) {
        return c.json({ error: 'Email already registered' }, 409)
      }
      
      // Create user
      const userId = uuidv4()
      const orgId = `org_${uuidv4().substring(0, 8)}`
      const passwordHash = await hashPassword(password)
      
      await c.env.DB.prepare(`
        INSERT INTO users (id, email, password_hash, name, tier, organization_id)
        VALUES (?, ?, ?, ?, 'free', ?)
      `).bind(userId, email.toLowerCase(), passwordHash, name || null, orgId).run()
      
      // Create default API key
      const keyId = uuidv4()
      const apiKey = generateApiKey()
      
      await c.env.DB.prepare(`
        INSERT INTO api_keys (id, user_id, key, name, tier, usage_limit, organization_id)
        VALUES (?, ?, ?, 'Default Key', 'free', 1000, ?)
      `).bind(keyId, userId, apiKey, orgId).run()
      
      // Create session
      const sessionId = uuidv4()
      const token = generateToken()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      
      await c.env.DB.prepare(`
        INSERT INTO sessions (id, user_id, token, expires_at, organization_id)
        VALUES (?, ?, ?, ?, ?)
      `).bind(sessionId, userId, token, expiresAt, orgId).run()
      
      return c.json({
        access_token: token,
        token_type: 'bearer',
        expires_in: 7 * 24 * 60 * 60,
        user: {
          id: userId,
          email: email.toLowerCase(),
          name: name || null,
          tier: 'free',
          organization_id: orgId
        },
        api_key: apiKey
      })
    }
    
    if (action === 'reset') {
      const { email } = body
      
      if (!email) {
        return c.json({ error: 'Email required' }, 400)
      }
      
      // Check if user exists
      const user = await c.env.DB.prepare(`
        SELECT id FROM users WHERE email = ?
      `).bind(email.toLowerCase()).first()
      
      // Always return success to prevent email enumeration
      return c.json({
        success: true,
        message: 'If an account exists, a reset email has been sent'
      })
    }
    
    return c.json({ error: 'Unknown action' }, 400)
  })
  
  // Logout
  app.post('/api/auth-logout', async (c: any) => {
    const authHeader = c.req.header('Authorization')
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      await c.env.DB.prepare(`
        DELETE FROM sessions WHERE token = ?
      `).bind(token).run()
    }
    
    return c.json({ success: true })
  })
  
  // Get API keys
  app.get('/api/keys', async (c: any) => {
    const authHeader = c.req.header('Authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    
    const token = authHeader.replace('Bearer ', '')
    
    const session = await c.env.DB.prepare(`
      SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')
    `).bind(token).first()
    
    if (!session) {
      return c.json({ error: 'Invalid or expired session' }, 401)
    }
    
    const keys = await c.env.DB.prepare(`
      SELECT id, key, name, tier, usage_count, usage_limit, created_at, last_used_at
      FROM api_keys
      WHERE user_id = ? AND revoked_at IS NULL
      ORDER BY created_at DESC
    `).bind(session.user_id).all()
    
    return c.json({
      keys: keys.results.map((k: any) => ({
        id: k.id,
        key: k.key,
        name: k.name,
        tier: k.tier,
        usage_count: k.usage_count,
        usage_limit: k.usage_limit,
        created_at: k.created_at,
        last_used_at: k.last_used_at
      }))
    })
  })
  
  // Create new API key
  app.post('/api/keys', async (c: any) => {
    const authHeader = c.req.header('Authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    
    const token = authHeader.replace('Bearer ', '')
    
    const session = await c.env.DB.prepare(`
      SELECT user_id, organization_id FROM sessions WHERE token = ? AND expires_at > datetime('now')
    `).bind(token).first()
    
    if (!session) {
      return c.json({ error: 'Invalid or expired session' }, 401)
    }
    
    const body = await c.req.json()
    const keyId = uuidv4()
    const apiKey = generateApiKey()
    const name = body.name || 'New Key'
    
    await c.env.DB.prepare(`
      INSERT INTO api_keys (id, user_id, key, name, tier, usage_limit, organization_id)
      VALUES (?, ?, ?, ?, 'free', 1000, ?)
    `).bind(keyId, session.user_id, apiKey, name, session.organization_id).run()
    
    return c.json({
      id: keyId,
      key: apiKey,
      name: name
    })
  })
  
  // Provider settings (BYOK)
  app.get('/api/settings/provider', async (c: any) => {
    const authHeader = c.req.header('Authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    
    const token = authHeader.replace('Bearer ', '')
    
    const session = await c.env.DB.prepare(`
      SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')
    `).bind(token).first()
    
    if (!session) {
      return c.json({ error: 'Invalid or expired session' }, 401)
    }
    
    const providers = await c.env.DB.prepare(`
      SELECT provider FROM provider_keys WHERE user_id = ?
    `).bind(session.user_id).all()
    
    return c.json({
      providers: providers.results.map((p: any) => p.provider)
    })
  })
  
  app.post('/api/settings/provider', async (c: any) => {
    const authHeader = c.req.header('Authorization')
    
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    
    const token = authHeader.replace('Bearer ', '')
    const body = await c.req.json()
    const { provider, api_key, model, preferences } = body
    
    if (!provider) {
      return c.json({ error: 'Provider is required' }, 400)
    }
    
    // Valid providers
    const validProviders = ['openai', 'anthropic', 'google', 'cohere', 'mistral', 'cloudflare', 'ollama']
    if (!validProviders.includes(provider)) {
      return c.json({ error: 'Invalid provider' }, 400)
    }
    
    // Get user from session
    const session = await c.env.DB.prepare(`
      SELECT user_id, organization_id FROM sessions WHERE token = ? AND expires_at > datetime('now')
    `).bind(token).first()
    
    if (!session) {
      return c.json({ error: 'Invalid or expired session' }, 401)
    }
    
    // If API key provided, store it
    if (api_key) {
      const keyId = uuidv4()
      await c.env.DB.prepare(`
        INSERT INTO provider_keys (id, user_id, provider, api_key_encrypted, organization_id, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, provider) DO UPDATE SET api_key_encrypted = ?, created_at = datetime('now')
      `).bind(keyId, (session as any).user_id, provider, api_key, (session as any).organization_id, api_key).run()
    }
    
    // Save preferences
    if (model || preferences) {
      const prefs = JSON.stringify({ ...preferences, model, provider })
      await c.env.DB.prepare(`
        UPDATE users SET preferences = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(prefs, (session as any).user_id).run()
    }
    
    return c.json({ 
      success: true, 
      provider,
      message: api_key ? 'Provider and API key saved' : 'Provider preferences saved'
    })
  })
}