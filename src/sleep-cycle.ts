/**
 * Muninn Cloudflare - Sleep Cycle Consolidation
 * Runs daily to compress Hippocampal observations into Cortex Prototypes
 * Port of sleep-cycle.ts for Cloudflare Workers + D1
 */

import { Hono } from 'hono';

type Bindings = {
  DB: D1Database
  AI: Ai
  VECTORIZE: VectorizeIndex
  ENVIRONMENT: string
}

// Sleep cycle prompt for consolidation
const SLEEP_CYCLE_PROMPT = `You are the Cortex Consolidation Engine for Muninn.

You are reviewing 24 hours of newly ingested "Hippocampal" observations.
Current Date: {{current_date}}

## Input Data

### Raw Observations (Hippocampal Layer)
{{observations}}

### Decision Trace Rewards (Today's Successful Retrievals)
{{decision_traces}}

## Your Task

1. **Identify Atomic Clusters**: Group observations into themes (CAREER, WELLNESS, RELATIONSHIP, LOCATION, IDENTITY, COMMUNITY)

2. **Consolidate**: Merge repetitive facts into single "Cortex Prototypes"
   - Example: 10 observations about "Dancing on Tuesdays" → 1 Prototype: "Regularly uses dance as coping mechanism (Tue/Thu)"

3. **Mitosis**: If concept evolved, split old prototype with invalid_at, create new prototype with valid_at

4. **Reward Weighting**: Prioritize facts from successful Decision Traces (outcome_reward > 0.5)

## Output Format (JSON only, no markdown)

{
  "prototypes": [
    {
      "prototype_name": "Career Evolution",
      "summary": "Successfully transitioned from banking to entrepreneurship.",
      "supporting_evidence": ["obs_id_1", "obs_id_2"],
      "valid_at": "2023-10-01",
      "importance": 0.9,
      "cluster": "CAREER_TRANSITION"
    }
  ]
}`;

interface Observation {
  id: string;
  entity_id: string;
  entity_name: string;
  predicate: string;
  object_value: string;
  valid_at: string | null;
  created_at: string;
  confidence: number;
  memory_type: string;
}

interface DecisionTrace {
  id: string;
  query_text: string;
  activated_nodes: string[];
  outcome_reward: number;
}

interface Prototype {
  prototype_name: string;
  summary: string;
  supporting_evidence: string[];
  valid_at: string;
  importance: number;
  cluster: string;
}

interface SleepCycleResult {
  success: boolean;
  started_at: string;
  completed_at?: string;
  observations_processed: number;
  clusters_found: number;
  prototypes_created: number;
  entities_discovered: number;
  contradictions_detected: number;
  connections_formed: number;
  expired: number;
  decayed: number;
  total_forgotten: number;
  error?: string;
}

/**
 * Run sleep cycle consolidation
 */
export async function runSleepCycle(
  db: D1Database,
  ai: Ai,
  orgId: string = 'leo-default'
): Promise<SleepCycleResult> {
  const started_at = new Date().toISOString();
  
  console.log('[sleep-cycle] Starting consolidation at', started_at);
  
  try {
    // Create sleep cycle record
    const cycleId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO sleep_cycles (id, started_at, status, organization_id)
      VALUES (?, ?, 'running', ?)
    `).bind(cycleId, started_at, orgId).run();
    
    // Step 1: Get unconsolidated observations (HIPPOCAMPAL layer)
    const observationsResult = await db.prepare(`
      SELECT o.id, o.entity_id, e.name as entity_name, o.predicate, o.object_value,
             o.valid_at, o.created_at, o.confidence, o.memory_type
      FROM observations o
      JOIN entities e ON o.entity_id = e.id
      WHERE o.is_consolidated = 0 
        AND o.observation_type = 'HIPPOCAMPAL'
        AND o.organization_id = ?
        AND o.created_at > datetime('now', '-24 hours')
      ORDER BY o.entity_id, o.predicate
    `).bind(orgId).all();
    
    const observations = observationsResult.results as Observation[];
    
    if (observations.length === 0) {
      console.log('[sleep-cycle] No unconsolidated observations found');
      await completeSleepCycle(db, cycleId, {
        observations_processed: 0,
        clusters_found: 0,
        prototypes_created: 0,
        entities_discovered: 0,
        contradictions_detected: 0,
        connections_formed: 0,
        expired: 0,
        decayed: 0,
        total_forgotten: 0
      }, orgId);
      
      return {
        success: true,
        started_at,
        observations_processed: 0,
        clusters_found: 0,
        prototypes_created: 0,
        entities_discovered: 0,
        contradictions_detected: 0,
        connections_formed: 0,
        expired: 0,
        decayed: 0,
        total_forgotten: 0
      };
    }
    
    console.log(`[sleep-cycle] Found ${observations.length} unconsolidated observations`);
    
    // Step 2: Get decision traces for reward weighting
    const tracesResult = await db.prepare(`
      SELECT id, query_text, activated_nodes, outcome_reward
      FROM decision_traces
      WHERE outcome_reward > 0.5
        AND organization_id = ?
      ORDER BY outcome_reward DESC
      LIMIT 100
    `).bind(orgId).all();
    
    const traces = tracesResult.results as DecisionTrace[];
    
    // Step 3: Group observations by entity
    const byEntity = groupBy(observations, 'entity_id');
    
    let totalPrototypes = 0;
    let totalClusters = 0;
    let totalConsolidated = 0;
    const entitiesProcessed = Object.keys(byEntity).length;
    
    // Step 4: Process each entity
    for (const [entityId, entityObs] of Object.entries(byEntity)) {
      const entityName = entityObs[0].entity_name;
      console.log(`[sleep-cycle] Processing entity: ${entityName}`);
      
      // Group by predicate (cluster)
      const byCluster = groupBy(entityObs, 'predicate');
      
      // Only consolidate clusters with 3+ observations (lowered threshold for Cloudflare)
      const consolidatableClusters = Object.entries(byCluster)
        .filter(([_, obs]) => obs.length >= 3);
      
      if (consolidatableClusters.length === 0) {
        continue;
      }
      
      totalClusters += consolidatableClusters.length;
      
      // Step 5: Consolidate each cluster with LLM
      for (const [cluster, clusterObs] of consolidatableClusters) {
        const prototypes = await consolidateWithAI(
          ai,
          entityName,
          clusterObs,
          traces,
          started_at.split('T')[0]
        );
        
        // Step 6: Store Cortex prototypes
        for (const proto of prototypes) {
          await storePrototype(db, entityId, proto, cycleId, orgId);
          totalPrototypes++;
        }
        
        // Mark observations as consolidated
        await markConsolidated(db, clusterObs.map(o => o.id), prototypes[0]?.id, orgId);
        totalConsolidated += clusterObs.length;
      }
    }
    
    // Step 7: Run forgetting cycle
    const forgettingResult = await runForgettingCycle(db, orgId);
    
    // Complete sleep cycle
    await completeSleepCycle(db, cycleId, {
      observations_processed: observations.length,
      clusters_found: totalClusters,
      prototypes_created: totalPrototypes,
      entities_discovered: entitiesProcessed,
      contradictions_detected: 0,
      connections_formed: 0,
      expired: forgettingResult.expired,
      decayed: forgettingResult.decayed,
      total_forgotten: forgettingResult.totalForgotten
    }, orgId);
    
    console.log(`[sleep-cycle] Complete: ${totalPrototypes} prototypes from ${totalConsolidated} observations`);
    
    return {
      success: true,
      started_at,
      observations_processed: observations.length,
      clusters_found: totalClusters,
      prototypes_created: totalPrototypes,
      entities_discovered: entitiesProcessed,
      contradictions_detected: 0,
      connections_formed: 0,
      expired: forgettingResult.expired,
      decayed: forgettingResult.decayed,
      total_forgotten: forgettingResult.totalForgotten
    };
    
  } catch (error: any) {
    console.error('[sleep-cycle] Error:', error);
    
    return {
      success: false,
      started_at,
      observations_processed: 0,
      clusters_found: 0,
      prototypes_created: 0,
      entities_discovered: 0,
      contradictions_detected: 0,
      connections_formed: 0,
      expired: 0,
      decayed: 0,
      total_forgotten: 0,
      error: error.message
    };
  }
}

/**
 * Consolidate observations using Cloudflare AI
 */
async function consolidateWithAI(
  ai: Ai,
  entityName: string,
  observations: Observation[],
  traces: DecisionTrace[],
  currentDate: string
): Promise<Prototype[]> {
  const obsText = observations.map((o, i) => 
    `[${o.id}] ${o.predicate}: "${o.object_value}" (${o.valid_at || 'no date'})`
  ).join('\n');
  
  const tracesText = traces.length > 0
    ? traces.slice(0, 10).map((t, i) => 
        `[${i + 1}] Query: "${t.query_text}" | Reward: ${t.outcome_reward}`
      ).join('\n')
    : 'No successful Decision Traces today';
  
  const prompt = SLEEP_CYCLE_PROMPT
    .replace('{{current_date}}', currentDate)
    .replace('{{observations}}', obsText)
    .replace('{{decision_traces}}', tracesText);
  
  try {
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.3
    }) as { response: string };
    
    const text = response.response || '';
    
    // Find JSON in response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[sleep-cycle] No JSON found in AI response');
      return [];
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    return (parsed.prototypes || []).map((p: any) => ({
      prototype_name: p.prototype_name || 'Unnamed',
      summary: p.summary || '',
      supporting_evidence: p.supporting_evidence || [],
      valid_at: p.valid_at || currentDate,
      importance: typeof p.importance === 'number' ? p.importance : 0.5,
      cluster: p.cluster || 'UNKNOWN'
    }));
    
  } catch (error) {
    console.error('[sleep-cycle] AI consolidation error:', error);
    return [];
  }
}

/**
 * Store prototype in database
 */
async function storePrototype(
  db: D1Database,
  entityId: string,
  prototype: Prototype,
  cycleId: string,
  orgId: string
): Promise<string> {
  const id = crypto.randomUUID();
  
  await db.prepare(`
    INSERT INTO prototypes (
      id, entity_id, prototype_name, summary, supporting_evidence,
      cluster, importance, valid_at, organization_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    entityId,
    prototype.prototype_name,
    prototype.summary,
    JSON.stringify(prototype.supporting_evidence),
    prototype.cluster,
    prototype.importance,
    prototype.valid_at,
    orgId
  ).run();
  
  return id;
}

/**
 * Mark observations as consolidated
 */
async function markConsolidated(
  db: D1Database,
  observationIds: string[],
  prototypeId: string | undefined,
  orgId: string
): Promise<void> {
  if (observationIds.length === 0) return;
  
  const placeholders = observationIds.map(() => '?').join(',');
  await db.prepare(`
    UPDATE observations
    SET is_consolidated = 1,
        observation_type = 'CORTEX',
        source_prototype_id = ?
    WHERE id IN (${placeholders}) AND organization_id = ?
  `).bind(prototypeId || null, ...observationIds, orgId).run();
}

/**
 * Run forgetting cycle
 */
async function runForgettingCycle(
  db: D1Database,
  orgId: string
): Promise<{ expired: number; decayed: number; totalForgotten: number }> {
  const now = new Date().toISOString();
  
  // Delete expired episodes
  const expiredResult = await db.prepare(`
    DELETE FROM observations
    WHERE expires_at IS NOT NULL
      AND expires_at < ?
      AND memory_type = 'episode'
      AND organization_id = ?
    RETURNING id
  `).bind(now, orgId).all();
  
  const expired = expiredResult.results.length;
  
  // Decay old observations (reduce strength)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  await db.prepare(`
    UPDATE observations
    SET strength = strength * 0.9
    WHERE memory_type = 'episode'
      AND created_at < ?
      AND strength > 0.1
      AND organization_id = ?
  `).bind(thirtyDaysAgo, orgId).run();
  
  // Delete if strength drops below threshold
  const decayedResult = await db.prepare(`
    DELETE FROM observations
    WHERE memory_type = 'episode'
      AND strength < 0.1
      AND organization_id = ?
    RETURNING id
  `).bind(orgId).all();
  
  const decayed = decayedResult.results.length;
  
  return {
    expired,
    decayed,
    totalForgotten: expired + decayed
  };
}

/**
 * Complete sleep cycle record
 */
async function completeSleepCycle(
  db: D1Database,
  cycleId: string,
  metrics: {
    observations_processed: number;
    clusters_found: number;
    prototypes_created: number;
    entities_discovered: number;
    contradictions_detected: number;
    connections_formed: number;
    expired: number;
    decayed: number;
    total_forgotten: number;
  },
  orgId: string
): Promise<void> {
  const completed_at = new Date().toISOString();
  
  await db.prepare(`
    UPDATE sleep_cycles
    SET completed_at = ?,
        status = 'completed',
        observations_processed = ?,
        clusters_found = ?,
        prototypes_created = ?,
        entities_discovered = ?,
        contradictions_detected = ?,
        connections_formed = ?,
        expired = ?,
        decayed = ?,
        total_forgotten = ?
    WHERE id = ? AND organization_id = ?
  `).bind(
    completed_at,
    metrics.observations_processed,
    metrics.clusters_found,
    metrics.prototypes_created,
    metrics.entities_discovered,
    metrics.contradictions_detected,
    metrics.connections_formed,
    metrics.expired,
    metrics.decayed,
    metrics.total_forgotten,
    cycleId,
    orgId
  ).run();
}

/**
 * Group array by key
 */
function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

/**
 * Sleep cycle endpoint for Cloudflare Cron Triggers
 */
export function createSleepCycleEndpoint(app: Hono<any, { Bindings: Bindings }>) {
  // Manual trigger
  app.post('/api/cron/sleep-cycle', async (c) => {
    const orgId = c.get('orgId') || 'leo-default';
    
    // Verify cron secret if set
    const cronSecret = c.env.ENVIRONMENT === 'production' 
      ? process.env.CRON_SECRET 
      : null;
    
    if (cronSecret) {
      const authHeader = c.req.header('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      if (token !== cronSecret) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
    }
    
    const result = await runSleepCycle(c.env.DB, c.env.AI, orgId);
    
    return c.json({
      success: result.success,
      ...result
    });
  });
  
  // Get last sleep cycle status
  app.get('/api/sleep-cycle/status', async (c) => {
    const orgId = c.get('orgId') || 'leo-default';
    
    const result = await c.env.DB.prepare(`
      SELECT * FROM sleep_cycles
      WHERE organization_id = ?
      ORDER BY started_at DESC
      LIMIT 1
    `).bind(orgId).first();
    
    if (!result) {
      return c.json({
        last_cycle: null,
        message: 'No sleep cycles have been run'
      });
    }
    
    return c.json({
      last_cycle: result,
      observations_processed: result.observations_processed,
      prototypes_created: result.prototypes_created,
      total_forgotten: result.total_forgotten
    });
  });
  
  return app;
}

export default {
  runSleepCycle,
  createSleepCycleEndpoint
};