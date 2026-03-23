/**
 * Muninn v5.3 - Audit Trail
 * 
 * Tracks memory operations for failure detection and improvement.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// =============================================================================
// TYPES
// =============================================================================

export type AuditEventType =
  | 'store_success'
  | 'store_failure'
  | 'recall_success'
  | 'recall_failure'
  | 'recall_miss'
  | 'consolidation'
  | 'lesson_learned';

export interface AuditEvent {
  id?: string;
  event_type: AuditEventType;
  memory_key?: string;
  query?: string;
  result?: string;
  success: boolean;
  error_message?: string;
  agent_id?: string;
  session_id?: string;
  context?: string;
  duration_ms?: number;
  created_at?: string;
}

export interface Lesson {
  id?: string;
  lesson: string;
  pattern?: string;
  impact: 'high' | 'medium' | 'low';
  occurrences: number;
  last_occurrence?: string;
  first_occurrence?: string;
  consolidated: boolean;
  consolidated_at?: string;
  source_event_types?: string[];
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

// =============================================================================
// AUDIT FUNCTIONS
// =============================================================================

/**
 * Log an audit event
 */
export async function audit(event: AuditEvent): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('audit_events')
      .insert(event)
      .select('id')
      .single();

    if (error) {
      console.error('[audit] Failed to log event:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (err) {
    console.error('[audit] Exception:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Audit a store operation
 */
export async function auditStore(
  key: string,
  success: boolean,
  error?: string,
  durationMs?: number
): Promise<void> {
  await audit({
    event_type: success ? 'store_success' : 'store_failure',
    memory_key: key,
    success,
    error_message: error,
    duration_ms: durationMs
  });
}

/**
 * Audit a recall operation
 */
export async function auditRecall(
  key: string,
  success: boolean,
  found: boolean,
  error?: string,
  durationMs?: number
): Promise<void> {
  await audit({
    event_type: found ? 'recall_success' : (success ? 'recall_miss' : 'recall_failure'),
    memory_key: key,
    success: success && found,
    error_message: error,
    duration_ms: durationMs
  });
}

/**
 * Get recent failures
 */
export async function getRecentFailures(days: number = 7): Promise<{ event_type: string; memory_key: string; failure_count: number; last_failure: string }[]> {
  const { data, error } = await supabase
    .from('recent_failures')
    .select('*');

  if (error) {
    console.error('[audit] Failed to get recent failures:', error);
    return [];
  }

  return data || [];
}

// =============================================================================
// LESSONS FUNCTIONS
// =============================================================================

/**
 * Add a new lesson
 */
export async function addLesson(
  lesson: string,
  pattern?: string,
  impact: 'high' | 'medium' | 'low' = 'medium',
  tags?: string[]
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('lessons')
      .insert({
        lesson,
        pattern,
        impact,
        tags,
        occurrences: 1,
        consolidated: false
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Get unconsolidated lessons
 */
export async function getLessons(impact?: 'high' | 'medium' | 'low'): Promise<Lesson[]> {
  let query = supabase
    .from('lessons')
    .select('*')
    .order('occurrences', { ascending: false });

  if (impact) {
    query = query.eq('impact', impact);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[lessons] Failed to get lessons:', error);
    return [];
  }

  return data || [];
}

/**
 * Get lessons requiring attention
 */
export async function getLessonsAttention(): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from('lessons_attention')
    .select('*');

  if (error) {
    console.error('[lessons] Failed to get attention lessons:', error);
    return [];
  }

  return data || [];
}

/**
 * Mark a lesson as consolidated
 */
export async function consolidateLesson(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('lessons')
    .update({
      consolidated: true,
      consolidated_at: new Date().toISOString()
    })
    .eq('id', id);

  return !error;
}

// =============================================================================
// CONSOLIDATION
// =============================================================================

/**
 * Run consolidation: audit events → lessons
 */
export async function runConsolidation(): Promise<{ lessonsCreated: number; error?: string }> {
  try {
    const { data, error } = await supabase
      .rpc('consolidate_audit_to_lessons');

    if (error) {
      return { lessonsCreated: 0, error: error.message };
    }

    // Log consolidation
    await audit({
      event_type: 'consolidation',
      success: true,
      result: `Created ${data} lessons`
    });

    return { lessonsCreated: data };
  } catch (err) {
    return { lessonsCreated: 0, error: String(err) };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  audit,
  auditStore,
  auditRecall,
  getRecentFailures,
  addLesson,
  getLessons,
  getLessonsAttention,
  consolidateLesson,
  runConsolidation
};