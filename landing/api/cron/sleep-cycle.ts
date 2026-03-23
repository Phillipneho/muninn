/**
 * Muninn v5.3 - Sleep Cycle Cron Endpoint
 * 
 * Vercel Cron triggers this endpoint to run consolidation.
 * 
 * Add to vercel.json:
 * 
 * {
 *   "crons": [{
 *     "path": "/api/cron/sleep-cycle",
 *     "schedule": "0 2 * * *"
 *   }]
 * }
 */

import { runSleepCycle } from '../../src/sleep-cycle';
import { audit } from '../../src/audit';

// Vercel Cron secret
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req: any, res: any) {
  // Verify cron secret
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  
  if (CRON_SECRET && token !== CRON_SECRET) {
    console.error('[sleep-cycle] Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  console.log('[sleep-cycle] Cron triggered at:', new Date().toISOString());
  
  try {
    // Run sleep cycle
    const result = await runSleepCycle();
    
    // Log successful run
    await audit({
      event_type: 'consolidation',
      result: JSON.stringify(result),
      success: true
    });
    
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (err: any) {
    console.error('[sleep-cycle] Error:', err);
    
    // Log failed run
    await audit({
      event_type: 'consolidation',
      result: err.message,
      success: false,
      error_message: err.message
    });
    
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}