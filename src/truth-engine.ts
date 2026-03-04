// v3.3: Truth Engine
// Resolves conflicting facts using temporal decay and confidence weighting

import type { MuninnDatabase } from './database-sqlite.js';

export interface ConflictResolution {
  type: 'update' | 'correction' | 'coexisting' | 'unresolved';
  winningFactId: string | null;
  reason: string;
  supersededFactId?: string;
}

export interface ContradictionLog {
  factAId: string;
  factBId: string;
  conflictType: 'value_conflict' | 'temporal_overlap' | 'logical';
  detectedAt: Date;
}

/**
 * Resolves the current state for a given entity and predicate
 * Returns the most recent high-confidence fact
 * 
 * Example:
 * - Fact 1: Caroline works at TechCorp (2023, confidence 0.9)
 * - Fact 2: Caroline works at DataFlow (2024, confidence 0.9)
 * Result: Fact 2 (more recent)
 */
export function resolveCurrentState(
  db: MuninnDatabase,
  entityId: string,
  predicate: string
): any | null {
  // Try with is_current column first
  try {
    const current = db['db'].prepare(`
      SELECT * FROM facts
      WHERE subject_entity_id = ?
        AND predicate = ?
        AND is_current = TRUE
        AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)
        AND invalidated_at IS NULL
      ORDER BY confidence DESC, valid_from DESC
      LIMIT 1
    `).get(entityId, predicate) as any;
    
    if (current) {
      return current;
    }
  } catch (e) {
    // Migration not run yet - fall through to basic query
  }
  
  // Fallback: Get all facts and resolve by recency + confidence
  const facts = db['db'].prepare(`
    SELECT * FROM facts
    WHERE subject_entity_id = ?
      AND predicate = ?
      AND invalidated_at IS NULL
    ORDER BY valid_from DESC, confidence DESC
  `).all(entityId, predicate) as any[];
  
  if (facts.length === 0) {
    return null;
  }
  
  // The Truth Engine: most recent high-confidence fact wins
  const highConfidence = facts.find(f => f.confidence >= 0.8);
  return highConfidence || facts[0];
}

/**
 * "Dethrones" the old truth and "Coronates" the new one
 * 
 * Workflow:
 * 1. New Fact Arrives: Caroline | lives_in | Brisbane | 2026-03-05
 * 2. Check for Rival: SELECT id WHERE is_current = TRUE
 * 3. Dethroning: Set is_current = FALSE, valid_until = new_date, superseded_by = new_id
 * 4. Coronation: Set is_current = TRUE on new fact
 */
export function upsertTruth(
  db: MuninnDatabase,
  entityId: string,
  predicate: string,
  newValue: string,
  confidence: number,
  validFrom: Date,
  evidence?: string
): { newFactId: string; supersededFactId?: string } {
  const now = new Date();
  
  // Step 1: Find current truth (if any)
  const currentTruth = db['db'].prepare(`
    SELECT id FROM facts
    WHERE subject_entity_id = ?
      AND predicate = ?
      AND is_current = TRUE
      AND invalidated_at IS NULL
  `).get(entityId, predicate) as any;
  
  // Step 2: Check for semantic similarity (is this an update or new fact?)
  const isUpdate = currentTruth !== undefined;
  
  // Step 3: If update, dethrone the old truth
  let supersededFactId: string | undefined;
  if (currentTruth) {
    supersededFactId = currentTruth.id;
    
    // Dethrone: Set is_current = FALSE, valid_until, superseded_by
    db['db'].prepare(`
      UPDATE facts SET
        is_current = FALSE,
        valid_until = ?,
        superseded_by = (SELECT id FROM facts WHERE subject_entity_id = ? AND predicate = ? ORDER BY created_at DESC LIMIT 1)
      WHERE id = ?
    `).run(validFrom.toISOString(), entityId, predicate, currentTruth.id);
  }
  
  // Step 4: Insert new fact (will be coronated via trigger or separate update)
  // Note: The actual insertion happens in the main remember() flow
  // This function returns what needs to happen
  
  return {
    newFactId: '', // Will be filled by caller
    supersededFactId
  };
}

/**
 * Detects contradictions between facts
 * Returns conflict type if detected
 */
export function detectContradiction(
  db: MuninnDatabase,
  factA: any,
  factB: any
): ConflictResolution | null {
  // Same subject and predicate, different values
  if (factA.subject_entity_id === factB.subject_entity_id &&
      factA.predicate === factB.predicate &&
      factA.object_value !== factB.object_value) {
    
    // Temporal: Is one clearly newer?
    const dateA = factA.valid_from ? new Date(factA.valid_from) : new Date(0);
    const dateB = factB.valid_from ? new Date(factB.valid_from) : new Date(0);
    
    if (dateB > dateA) {
      return {
        type: 'update',
        winningFactId: factB.id,
        reason: `Fact B (${factB.valid_from}) is newer than Fact A (${factA.valid_from})`,
        supersededFactId: factA.id
      };
    } else if (dateA > dateB) {
      return {
        type: 'update',
        winningFactId: factA.id,
        reason: `Fact A (${factA.valid_from}) is newer than Fact B (${factB.valid_from})`,
        supersededFactId: factB.id
      };
    }
    
    // Same recency: Check confidence
    if (factB.confidence > factA.confidence) {
      return {
        type: 'correction',
        winningFactId: factB.id,
        reason: `Fact B has higher confidence (${factB.confidence}) than Fact A (${factA.confidence})`,
        supersededFactId: factA.id
      };
    } else if (factA.confidence > factB.confidence) {
      return {
        type: 'correction',
        winningFactId: factA.id,
        reason: `Fact A has higher confidence (${factA.confidence}) than Fact B (${factB.confidence})`,
        supersededFactId: factB.id
      };
    }
    
    // Equal recency and confidence: Log as unresolved
    return {
      type: 'unresolved',
      winningFactId: null,
      reason: 'Facts have equal recency and confidence - requires manual resolution'
    };
  }
  
  return null;
}

/**
 * Logs a contradiction for manual/LLM review
 */
export function logContradiction(
  db: MuninnDatabase,
  factAId: string,
  factBId: string,
  conflictType: 'value_conflict' | 'temporal_overlap' | 'logical'
): void {
  try {
    db['db'].prepare(`
      INSERT INTO contradictions (id, fact_a_id, fact_b_id, conflict_type, detected_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      `contradiction_${Date.now()}`,
      factAId,
      factBId,
      conflictType
    );
  } catch (e) {
    // Table may not exist yet in test environments
    console.warn('Could not log contradiction:', e);
  }
}

/**
 * Gets the current truth for an entity (simplified retrieval)
 * This is used by hybrid-search for "Current Status" queries
 */
export function getCurrentTruth(
  db: MuninnDatabase,
  entityId: string
): any[] {
  try {
    return db['db'].prepare(`
      SELECT 
        f.id,
        f.subject_entity_id,
        e.name as subject_name,
        f.predicate,
        f.object_value,
        f.confidence,
        f.valid_from,
        f.evidence
      FROM facts f
      JOIN entities e ON f.subject_entity_id = e.id
      WHERE f.subject_entity_id = ?
        AND f.is_current = TRUE
        AND (f.valid_until IS NULL OR f.valid_until > CURRENT_TIMESTAMP)
        AND f.invalidated_at IS NULL
      ORDER BY f.predicate
    `).all(entityId) as any[];
  } catch (e) {
    // Migration not run yet - fall back to basic query
    return db['db'].prepare(`
      SELECT 
        f.id,
        f.subject_entity_id,
        e.name as subject_name,
        f.predicate,
        f.object_value,
        f.confidence,
        f.valid_from,
        f.evidence
      FROM facts f
      JOIN entities e ON f.subject_entity_id = e.id
      WHERE f.subject_entity_id = ?
        AND f.invalidated_at IS NULL
      ORDER BY f.valid_from DESC
    `).all(entityId) as any[];
  }
}

/**
 * Gets the historical timeline for an entity
 * Used for "What happened to X over time?" queries
 */
export function getHistoricalTimeline(
  db: MuninnDatabase,
  entityId: string,
  predicate?: string
): any[] {
  const sql = predicate
    ? `SELECT * FROM facts WHERE subject_entity_id = ? AND predicate = ? ORDER BY valid_from DESC`
    : `SELECT * FROM facts WHERE subject_entity_id = ? ORDER BY valid_from DESC`;
  
  const params = predicate ? [entityId, predicate] : [entityId];
  
  return db['db'].prepare(sql).all(...params) as any[];
}

/**
 * Formats truth resolution for user display
 * Transforms raw facts into natural language
 */
export function formatTruthForDisplay(facts: any[]): string {
  if (facts.length === 0) {
    return "No current information available.";
  }
  
  const lines = facts.map(f => {
    const evidence = f.evidence ? ` (${f.evidence})` : '';
    return `${f.predicate}: ${f.object_value}${evidence}`;
  });
  
  return lines.join('\n');
}