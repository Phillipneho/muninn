import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Auth middleware
async function authenticate(req: VercelRequest): Promise<{ organizationId: string }> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing authorization header');
  }
  
  const token = authHeader.slice(7);
  
  // API key auth
  if (token.startsWith('muninn_')) {
    const { data: key, error } = await supabase
      .from('api_keys')
      .select('organization_id')
      .eq('key_hash', hashKey(token))
      .eq('is_active', true)
      .single();
    
    if (error || !key) {
      throw new Error('Invalid API key');
    }
    
    return { organizationId: key.organization_id };
  }
  
  // JWT auth (simplified)
  throw new Error('Use API key for audit endpoints');
}

function hashKey(key: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(key).digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { organizationId } = await authenticate(req);
    
    const action = req.query.action as string;
    
    switch (action) {
      case 'health':
        return await getHealth(organizationId, res);
      case 'contradictions':
        return await getContradictions(organizationId, req, res);
      case 'access':
        return await getAccessPatterns(organizationId, req, res);
      case 'staleness':
        return await getStaleness(organizationId, req, res);
      case 'integrity':
        return await getIntegrity(organizationId, req, res);
      case 'resolve':
        return await resolveContradiction(organizationId, req, res);
      default:
        return res.status(400).json({ success: false, error: 'Invalid action' });
    }
  } catch (error: any) {
    console.error('Audit API error:', error);
    return res.status(401).json({ success: false, error: error.message || 'Authentication failed' });
  }
}

async function getHealth(organizationId: string, res: VercelResponse) {
  // Get memory counts
  const { count: totalMemories } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId);
  
  // Get integrity stats
  const { data: integrityStats } = await supabase
    .from('memory_integrity')
    .select('status')
    .eq('organization_id', organizationId);
  
  const verified = integrityStats?.filter(i => i.status === 'verified').length || 0;
  const unverified = integrityStats?.filter(i => i.status === 'unverified').length || 0;
  const flagged = integrityStats?.filter(i => i.status === 'flagged').length || 0;
  
  // Get staleness stats
  const { data: staleStats } = await supabase
    .from('staleness_tracker')
    .select('status')
    .eq('organization_id', organizationId);
  
  const stale = staleStats?.filter(s => s.status === 'stale').length || 0;
  
  // Calculate health score
  const healthScore = totalMemories && totalMemories > 0 
    ? Math.round((verified / totalMemories) * 100) 
    : 100;
  
  return res.json({
    success: true,
    healthScore,
    total: totalMemories || 0,
    verified,
    unverified,
    flagged,
    stale,
    fresh: (totalMemories || 0) - stale
  });
}

async function getContradictions(organizationId: string, req: VercelRequest, res: VercelResponse) {
  const status = req.query.status as string || 'unresolved';
  const limit = parseInt(req.query.limit as string) || 50;
  
  let query = supabase
    .from('contradiction_flags')
    .select('*')
    .eq('organization_id', organizationId)
    .order('confidence', { ascending: false })
    .limit(limit);
  
  if (status !== 'all') {
    query = query.eq('status', status);
  }
  
  const { data: contradictions, error } = await query;
  
  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  
  return res.json({
    success: true,
    contradictions: contradictions || [],
    count: contradictions?.length || 0
  });
}

async function getAccessPatterns(organizationId: string, req: VercelRequest, res: VercelResponse) {
  const timeRangeHours = parseInt(req.query.timeRangeHours as string) || 24;
  
  // Get recent audit events
  const { data: events } = await supabase
    .from('audit_events')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('created_at', new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });
  
  // Calculate top memories
  const memoryCounts: Record<string, number> = {};
  const agentCounts: Record<string, number> = {};
  const retrievalTypes: Record<string, number> = { semantic: 0, keyword: 0, temporal: 0 };
  
  (events || []).forEach(event => {
    if (event.memory_id) {
      memoryCounts[event.memory_id] = (memoryCounts[event.memory_id] || 0) + 1;
    }
    if (event.actor_id) {
      agentCounts[event.actor_id] = (agentCounts[event.actor_id] || 0) + 1;
    }
    if (event.retrieval_type) {
      retrievalTypes[event.retrieval_type] = (retrievalTypes[event.retrieval_type] || 0) + 1;
    }
  });
  
  const topMemories = Object.entries(memoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({ id, count }));
  
  const topAgents = Object.entries(agentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, count }));
  
  const totalQueries = (events || []).filter(e => e.operation === 'recall').length;
  const avgLatency = 0; // Would need to track this
  const successRate = totalQueries > 0 
    ? (events || []).filter(e => e.success).length / totalQueries 
    : 1;
  
  return res.json({
    success: true,
    topMemories,
    topAgents,
    retrievalDistribution: retrievalTypes,
    metrics: {
      totalQueries,
      avgLatencyMs: avgLatency,
      successRate
    }
  });
}

async function getStaleness(organizationId: string, req: VercelRequest, res: VercelResponse) {
  // Get staleness data
  const { data: staleData } = await supabase
    .from('staleness_tracker')
    .select('*')
    .eq('organization_id', organizationId)
    .order('last_updated', { ascending: false });
  
  // Group by entity
  const entityStaleness: Record<string, { total: number; stale: number }> = {};
  (staleData || []).forEach(s => {
    if (!entityStaleness[s.entity]) {
      entityStaleness[s.entity] = { total: 0, stale: 0 };
    }
    entityStaleness[s.entity].total++;
    if (s.status === 'stale') {
      entityStaleness[s.entity].stale++;
    }
  });
  
  // Build timeline (last 30 days)
  const timeline = [];
  for (let i = 30; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    // Simplified - would need actual historical data
    timeline.push({
      date: dateStr,
      freshness: Math.max(70, 100 - i * 0.5)
    });
  }
  
  return res.json({
    success: true,
    freshnessTimeline: timeline,
    entityStaleness: Object.entries(entityStaleness).map(([entity, data]) => ({
      entity,
      total: data.total,
      stale: data.stale,
      freshPercent: Math.round(((data.total - data.stale) / data.total) * 100)
    })),
    stats: {
      total: staleData?.length || 0,
      fresh: (staleData || []).filter(s => s.status === 'fresh').length,
      stale: (staleData || []).filter(s => s.status === 'stale').length,
      veryStale: (staleData || []).filter(s => s.status === 'very_stale').length
    }
  });
}

async function getIntegrity(organizationId: string, req: VercelRequest, res: VercelResponse) {
  const { data: integrity } = await supabase
    .from('memory_integrity')
    .select('*')
    .eq('organization_id', organizationId);
  
  return res.json({
    success: true,
    records: integrity || [],
    stats: {
      total: integrity?.length || 0,
      verified: (integrity || []).filter(i => i.status === 'verified').length,
      unverified: (integrity || []).filter(i => i.status === 'unverified').length,
      flagged: (integrity || []).filter(i => i.status === 'flagged').length
    }
  });
}

async function resolveContradiction(organizationId: string, req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  
  const { contradictionId, resolution, note } = req.body || {};
  
  if (!contradictionId || !resolution) {
    return res.status(400).json({ success: false, error: 'Missing contradictionId or resolution' });
  }
  
  // Update contradiction status
  const { error } = await supabase
    .from('contradiction_flags')
    .update({
      status: resolution === 'ignore' ? 'ignored' : 'resolved',
      resolution,
      resolution_note: note,
      resolved_at: new Date().toISOString()
    })
    .eq('id', contradictionId)
    .eq('organization_id', organizationId);
  
  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  
  // Create audit log entry
  await supabase
    .from('audit_events')
    .insert({
      organization_id: organizationId,
      operation: 'resolve_contradiction',
      actor_id: 'dashboard',
      target_id: contradictionId,
      metadata: { resolution, note },
      success: true,
      created_at: new Date().toISOString()
    });
  
  return res.json({ success: true, message: 'Contradiction resolved' });
}