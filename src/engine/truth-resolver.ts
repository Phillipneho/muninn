/**
 * Truth Resolver — Post-Extraction Hook
 * Runs immediately after Knowledge Extractor identifies a new STATE or TRAIT
 * 
 * Purpose: Detect conflicts and dethrone old truths
 * 
 * When Tim stops learning piano and starts violin:
 * 1. Old "piano" observation gets valid_until set (dethroned)
 * 2. New "violin" observation becomes the current truth (crowned)
 */

import { ObservationDatabase, Observation } from '../observation-database.js';

// Predicates that represent mutually exclusive states
// Only ONE can be current at a time
const EXCLUSIVE_PREDICATES = [
  'learning_instrument',    // Can't learn two instruments simultaneously
  'lives_in',              // One residence at a time
  'current_employer',      // One primary job
  'marital_status',        // One status at a time
  'relationship_status',   // One status at a time
  'current_city',          // One city at a time
  'current_role',          // One role at a time
  'works_at',              // One workplace at a time
  'works_for',             // One employer at a time
  'employed_at',           // One employer at a time
];

// Check if a predicate matches an exclusive pattern (including wildcards)
function isExclusivePredicate(predicate: string): boolean {
  const normalized = predicate.toLowerCase().trim();
  
  // Direct match
  if (EXCLUSIVE_PREDICATES.includes(normalized)) {
    return true;
  }
  
  // Wildcard patterns like 'favorite_X'
  if (normalized.startsWith('favorite_')) {
    return true;
  }
  
  return false;
}

/**
 * Main conflict resolution function
 * Called after each observation is inserted
 */
export async function resolveConflicts(
  newObs: Observation,
  db: ObservationDatabase
): Promise<{
  conflict: boolean;
  dethronedId?: string;
  dethronedContent?: string;
}> {
  // Only process exclusive predicates
  if (!isExclusivePredicate(newObs.predicate)) {
    return { conflict: false };
  }

  // Find the current "King" (existing truth that was considered permanent)
  const oldKing = findCurrentKing(newObs.entity_id, newObs.predicate, newObs.id, db);

  if (!oldKing) {
    // No conflict — this is a new fact
    console.log(`👑 New truth established: ${newObs.predicate} = ${newObs.object_value}`);
    return { conflict: false };
  }

  // Conflict detected
  if (oldKing.object_value !== newObs.object_value) {
    console.log(`⚔️ Conflict detected: ${newObs.predicate}`);
    console.log(`   Old: ${oldKing.object_value} (since ${oldKing.valid_from || 'unknown'})`);
    console.log(`   New: ${newObs.object_value} (since ${newObs.valid_from || 'now'})`);
    
    // Dethrone the old king
    dethroneObservation(oldKing.id, newObs.valid_from || new Date().toISOString().split('T')[0], db);
    
    // Crown the new king (ensure it has CURRENT tag)
    crownObservation(newObs.id, db);
    
    console.log(`👑 Dethroned: ${oldKing.object_value} -> ${newObs.object_value}`);
    
    return {
      conflict: true,
      dethronedId: oldKing.id,
      dethronedContent: oldKing.object_value || undefined
    };
  } else {
    // Same content — just reinforce
    console.log(`✓ Reinforced: ${newObs.predicate} = ${newObs.object_value}`);
    return { conflict: false };
  }
}

/**
 * Find the current "king" observation for a predicate
 * Returns the observation with valid_until: null (was "permanently true")
 */
function findCurrentKing(
  entityId: string,
  predicate: string,
  excludeId: string,
  db: ObservationDatabase
): Observation | null {
  // Get all observations for this entity + predicate
  const observations = db.getObservationsByEntity(entityId, { predicate });
  
  // Find the one with valid_until: null (or undefined) - this is the "current" truth
  const currentKing = observations.find(obs => {
    return obs.id !== excludeId && !obs.valid_until;
  });
  
  return currentKing || null;
}

/**
 * Mark an observation as historical (no longer current)
 */
function dethroneObservation(
  obsId: string,
  endTime: string,
  db: ObservationDatabase
): void {
  // Update valid_until and add HISTORICAL tag
  db.updateObservation(obsId, {
    valid_until: endTime,
    addTags: ['HISTORICAL']
  });
  
  console.log(`   📜 Marked as historical: ${obsId} (valid until ${endTime})`);
}

/**
 * Mark an observation as the current truth
 */
function crownObservation(
  obsId: string,
  db: ObservationDatabase
): void {
  // Add STATE and CURRENT tags
  db.updateObservation(obsId, {
    addTags: ['STATE', 'CURRENT']
  });
  
  console.log(`   👑 Crowned: ${obsId} (now current)`);
}

/**
 * Query-time helper: Get the current truth for a predicate
 */
export function getCurrentTruth(
  entityId: string,
  predicate: string,
  db: ObservationDatabase
): Observation | null {
  const observations = db.getObservationsByEntity(entityId, { predicate });
  
  // Find the observation with valid_until: null (current)
  const current = observations.find(obs => !obs.valid_until);
  
  return current || null;
}

/**
 * Query-time helper: Get historical truths for a predicate
 */
export function getHistoricalTruths(
  entityId: string,
  predicate: string,
  db: ObservationDatabase
): Observation[] {
  const observations = db.getObservationsByEntity(entityId, { predicate });
  
  // Filter to only historical observations
  return observations.filter(obs => 
    obs.tags.includes('HISTORICAL') || obs.valid_until
  );
}

/**
 * Get all observations with their temporal status
 */
export function getPredicateHistory(
  entityId: string,
  predicate: string,
  db: ObservationDatabase
): Array<{
  observation: Observation;
  status: 'current' | 'historical';
}> {
  const observations = db.getObservationsByEntity(entityId, { predicate });
  
  return observations
    .sort((a, b) => {
      // Sort by valid_from, nulls last
      const aDate = a.valid_from ? new Date(a.valid_from).getTime() : 0;
      const bDate = b.valid_from ? new Date(b.valid_from).getTime() : 0;
      return bDate - aDate; // Most recent first
    })
    .map(obs => ({
      observation: obs,
      status: obs.valid_until ? 'historical' : 'current'
    }));
}

/**
 * Export the exclusive predicates list for testing
 */
export { EXCLUSIVE_PREDICATES, isExclusivePredicate };