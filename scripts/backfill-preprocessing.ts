/**
 * Backfill Preprocessing for Muninn
 * 
 * Run this script to process existing LOCOMO conversations with:
 * 1. Global context headers (500-word narrative summaries)
 * 2. Relationship tags for multi-hop traversal
 * 3. Segment extraction for long conversations
 * 
 * Usage: npx tsx scripts/backfill-preprocessing.ts
 * 
 * Expected impact: Cat 4 (Multi-hop) 66.7% → 90%+
 */

import { preprocessConversation, generateRelationshipTags } from '../src/preprocess';

interface Env {
  DB: D1Database;
  AI: Ai;
  OLLAMA_API_KEY: string;
}

interface Memory {
  id: string;
  content: string;
  metadata: string;
  preprocessing_status: string;
  organization_id: string;
}

interface BackfillResult {
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  errors: string[];
}

async function backfillPreprocessing(env: Env, orgId: string): Promise<BackfillResult> {
  const result: BackfillResult = {
    total: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };

  // Get all memories that haven't been preprocessed
  const memories = await env.DB.prepare(`
    SELECT id, content, metadata, preprocessing_status
    FROM memories
    WHERE organization_id = ? AND preprocessing_status = 'none'
    ORDER BY created_at ASC
  `).bind(orgId).all<Memory>();

  result.total = memories.results.length;
  console.log(`[BACKFILL] Found ${result.total} memories to process`);

  const PREPROCESS_THRESHOLD_CHARS = 5000;

  for (const memory of memories.results) {
    const metadata = JSON.parse(memory.metadata || '{}');
    const sessionDate = metadata.session_date || '2023-05-01';
    
    // Skip short content
    if (memory.content.length <= PREPROCESS_THRESHOLD_CHARS) {
      await env.DB.prepare(`
        UPDATE memories SET preprocessing_status = 'skipped' WHERE id = ?
      `).bind(memory.id).run();
      result.skipped++;
      console.log(`[BACKFILL] Skipped ${memory.id}: ${memory.content.length} chars (below threshold)`);
      continue;
    }

    try {
      console.log(`[BACKFILL] Processing ${memory.id}: ${memory.content.length} chars`);
      
      // Run preprocessing pipeline
      const processed = await preprocessConversation(memory.content, env.AI, sessionDate);
      const relationshipTags = generateRelationshipTags(processed.segments);
      
      // Update memory with relationship tags
      await env.DB.prepare(`
        UPDATE memories 
        SET relationship_tags = ?, preprocessing_status = 'processed'
        WHERE id = ?
      `).bind(
        JSON.stringify(Array.from(relationshipTags.entries())),
        memory.id
      ).run();

      // Store global header in session_summaries
      await env.DB.prepare(`
        INSERT INTO session_summaries (id, episode_id, global_header, segment_count, total_tokens, organization_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        `summary-${memory.id}`,
        memory.id,
        processed.globalContextHeader,
        processed.segments.length,
        processed.segments.reduce((sum, s) => sum + (s.content?.split(' ').length || 0), 0),
        orgId
      ).run();

      result.processed++;
      console.log(`[BACKFILL] ✅ Processed ${memory.id}: ${processed.segments.length} segments, ${relationshipTags.size} relationship tags`);
      
    } catch (error: any) {
      result.failed++;
      result.errors.push(`${memory.id}: ${error.message}`);
      console.error(`[BACKFILL] ❌ Failed ${memory.id}:`, error);
      
      // Mark as failed but continue
      await env.DB.prepare(`
        UPDATE memories SET preprocessing_status = 'failed' WHERE id = ?
      `).bind(memory.id).run();
    }
  }

  console.log(`
[BACKFILL] Complete:
  Total: ${result.total}
  Processed: ${result.processed}
  Skipped: ${result.skipped}
  Failed: ${result.failed}
`);

  if (result.errors.length > 0) {
    console.error('[BACKFILL] Errors:', result.errors);
  }

  return result;
}

// Verify preprocessing was successful
async function verifyBackfill(env: Env, orgId: string): Promise<void> {
  const stats = await env.DB.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN preprocessing_status = 'processed' THEN 1 ELSE 0 END) as processed,
      SUM(CASE WHEN preprocessing_status = 'skipped' THEN 1 ELSE 0 END) as skipped,
      SUM(CASE WHEN preprocessing_status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM memories
    WHERE organization_id = ?
  `).bind(orgId).first();

  console.log('[VERIFY] Preprocessing stats:', stats);

  const summaries = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM session_summaries WHERE organization_id = ?
  `).bind(orgId).first();

  console.log('[VERIFY] Session summaries:', summaries);

  // Sample a processed memory
  const sample = await env.DB.prepare(`
    SELECT id, relationship_tags, preprocessing_status
    FROM memories
    WHERE organization_id = ? AND preprocessing_status = 'processed'
    LIMIT 1
  `).bind(orgId).first();

  if (sample) {
    console.log('[VERIFY] Sample processed memory:', {
      id: sample.id,
      relationshipTagsCount: sample.relationship_tags ? Object.keys(JSON.parse(sample.relationship_tags as string)).length : 0
    });
  }
}

// Export for use in worker
export { backfillPreprocessing, verifyBackfill };

// CLI execution
if (typeof process !== 'undefined' && process.argv[1]?.includes('backfill-preprocessing')) {
  console.log('[BACKFILL] This script should be run via: wrangler dev --test-scheduled');
  console.log('[BACKFILL] Or via admin endpoint: POST /api/admin/backfill-preprocessing');
}