/**
 * Muninn v5.3 - Sleep Cycle
 * 
 * Runs consolidation periodically to:
 * 1. Process audit events into lessons
 * 2. Consolidate similar facts into prototypes
 * 3. Archive old memories
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!  // Service key for background jobs
);

// =============================================================================
// TYPES
// =============================================================================

export interface SleepCycleResult {
  cycle_id: string;
  facts_processed: number;
  facts_consolidated: number;
  prototypes_created: number;
  lessons_extracted: number;
  audit_events_processed: number;
  duration_ms: number;
}

// =============================================================================
// SLEEP CYCLE FUNCTION
// =============================================================================

/**
 * Run a sleep cycle for an organization
 * 
 * This processes:
 * - Recent facts (consolidation)
 * - Audit events (lessons)
 * - Old memories (archival)
 */
export async function runSleepCycle(organizationId?: string): Promise<SleepCycleResult> {
  const startTime = Date.now();
  
  console.log(`[sleep] Starting sleep cycle for org: ${organizationId || 'all'}`);
  
  try {
    // Call the database function
    const { data, error } = await supabase
      .rpc('run_sleep_cycle', { org_id: organizationId || null });
    
    if (error) {
      console.error('[sleep] Sleep cycle failed:', error);
      throw error;
    }
    
    const result = data as SleepCycleResult;
    
    console.log(`[sleep] Sleep cycle completed:`, {
      facts: result.facts_processed,
      lessons: result.lessons_extracted,
      duration: `${result.duration_ms}ms`
    });
    
    return result;
  } catch (err) {
    console.error('[sleep] Exception:', err);
    throw err;
  }
}

// =============================================================================
// CRON SCHEDULE
// =============================================================================

/**
 * Schedule options for sleep cycle
 */
export const SLEEP_CYCLE_SCHEDULES = {
  // Run every 6 hours (default)
  every_6_hours: '0 0,6,12,18 * * *',
  
  // Run daily at 3 AM
  daily_3am: '0 3 * * *',
  
  // Run every hour
  every_hour: '0 * * * *',
  
  // Run every 30 minutes
  every_30min: '0,30 * * * *'
};

/**
 * Get next run time based on schedule
 */
export function getNextRunTime(cronExpression: string): Date {
  // Parse cron and calculate next run
  // For now, return 6 hours from now
  const next = new Date();
  next.setHours(next.getHours() + 6);
  return next;
}

// =============================================================================
// MANUAL TRIGGER
// =============================================================================

/**
 * Manually trigger a sleep cycle
 * 
 * Use this for testing or on-demand consolidation.
 */
export async function triggerSleepCycle(organizationId?: string): Promise<SleepCycleResult> {
  console.log(`[sleep] Manual trigger for org: ${organizationId || 'all'}`);
  return runSleepCycle(organizationId);
}

// =============================================================================
// VERCEL CRON JOB
// =============================================================================

/**
 * Vercel Cron configuration
 * 
 * Add to vercel.json:
 * 
 * {
 *   "crons": [{
 *     "path": "/api/sleep-cycle",
 *     "schedule": "0 2 * * *"
 *   }]
 * }
 */

/**
 * API handler for Vercel Cron
 * 
 * Create: /api/sleep-cycle.ts
 * 
 * import { runSleepCycle } from '../src/sleep-cycle';
 * 
 * export default async function handler(req, res) {
 *   // Verify cron secret
 *   if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
 *     return res.status(401).json({ error: 'Unauthorized' });
 *   }
 *   
 *   try {
 *     const result = await runSleepCycle();
 *     return res.status(200).json(result);
 *   } catch (err) {
 *     return res.status(500).json({ error: err.message });
 *   }
 * }
 */

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  runSleepCycle,
  triggerSleepCycle,
  getNextRunTime,
  SLEEP_CYCLE_SCHEDULES
};