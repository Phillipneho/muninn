/**
 * Muninn v5.3 - Audit Wrapper
 * 
 * Wraps store/recall operations with audit logging.
 */

import { auditStore, auditRecall, audit } from './audit';

// =============================================================================
// WRAPPER FUNCTIONS
// =============================================================================

/**
 * Wrap a store operation with audit logging
 */
export async function withAuditStore<T>(
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    
    // Log success
    await auditStore(key, true, undefined, Date.now() - startTime);
    
    return result;
  } catch (error) {
    // Log failure
    await auditStore(key, false, String(error), Date.now() - startTime);
    
    throw error;
  }
}

/**
 * Wrap a recall operation with audit logging
 */
export async function withAuditRecall<T>(
  key: string,
  operation: () => Promise<T | null>
): Promise<T | null> {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    
    // Log success (found or not)
    await auditRecall(key, true, result !== null, undefined, Date.now() - startTime);
    
    return result;
  } catch (error) {
    // Log failure
    await auditRecall(key, false, false, String(error), Date.now() - startTime);
    
    throw error;
  }
}

/**
 * Wrap a search operation with audit logging
 */
export async function withAuditSearch<T>(
  query: string,
  operation: () => Promise<T[]>
): Promise<T[]> {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    
    // Log search
    await audit({
      event_type: 'recall_success',
      query,
      success: true,
      result: `Found ${result.length} results`,
      duration_ms: Date.now() - startTime
    });
    
    return result;
  } catch (error) {
    await audit({
      event_type: 'recall_failure',
      query,
      success: false,
      error_message: String(error),
      duration_ms: Date.now() - startTime
    });
    
    throw error;
  }
}

// =============================================================================
// MANUAL FAILURE LOGGING
// =============================================================================

/**
 * Log a recall miss (no memory found when expected)
 * 
 * Use this when you know a memory should exist but wasn't found.
 */
export async function logRecallMiss(key: string, context?: string): Promise<void> {
  await audit({
    event_type: 'recall_miss',
    memory_key: key,
    success: false,
    context
  });
}

/**
 * Log a lesson learned
 */
export async function logLessonLearned(lesson: string, pattern?: string): Promise<void> {
  await audit({
    event_type: 'lesson_learned',
    result: lesson,
    success: true
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  withAuditStore,
  withAuditRecall,
  withAuditSearch,
  logRecallMiss,
  logLessonLearned
};