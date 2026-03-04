// Muninn v2 Contradiction Handling
// Phase 3: Detection, storage, resolution workflow, user-facing queries

import type { Fact, Contradiction } from './types.js';

/**
 * Types of contradictions
 */
export type ContradictionType = 
  | 'value_conflict'      // Same subject/predicate, different object
  | 'temporal_overlap'    // Conflicting time ranges
  | 'logical'             // Mutually exclusive facts
  | 'source_conflict';    // Same fact from different sources with different values

/**
 * Resolution status
 */
export type ResolutionStatus = 
  | 'unresolved'          // Needs resolution
  | 'resolved_by_user'    // User selected which fact is correct
  | 'resolved_by_time'    // Temporal resolution (newer fact wins)
  | 'resolved_by_source'  // Source authority resolution
  | 'dismissed';          // User marked as not a real contradiction

/**
 * Contradiction detection result
 */
export interface DetectedContradiction {
  type: ContradictionType;
  factA: Fact;
  factB: Fact;
  reason: string;
  severity: 'high' | 'medium' | 'low';
  suggestedResolution?: string;
}

/**
 * Contradiction resolution suggestion
 */
export interface ResolutionSuggestion {
  strategy: 'keep_newer' | 'keep_higher_confidence' | 'keep_explicit' | 'ask_user' | 'keep_both';
  recommendedFact: 'A' | 'B' | 'both';
  reason: string;
}

/**
 * Detect contradictions between a new fact and existing facts
 */
export function detectContradictions(
  newFact: Fact,
  existingFacts: Fact[]
): DetectedContradiction[] {
  const contradictions: DetectedContradiction[] = [];
  
  for (const existing of existingFacts) {
    // Skip if same fact (duplicate)
    if (factsAreEqual(newFact, existing)) {
      continue;
    }
    
    // Value conflict: Same subject/predicate, different object
    if (
      newFact.subjectEntityId === existing.subjectEntityId &&
      newFact.predicate === existing.predicate &&
      !factsAreEqual(newFact, existing)
    ) {
      // Check if temporal ranges overlap
      const temporalConflict = hasTemporalConflict(newFact, existing);
      
      if (temporalConflict) {
        contradictions.push({
          type: 'value_conflict',
          factA: newFact,
          factB: existing,
          reason: `Same subject and predicate, but different values: "${getFactValue(newFact)}" vs "${getFactValue(existing)}"`,
          severity: 'high',
          suggestedResolution: suggestResolution(newFact, existing, 'value_conflict')
        });
      }
    }
    
    // Logical contradictions (domain-specific)
    const logicalConflict = detectLogicalConflict(newFact, existing);
    if (logicalConflict) {
      contradictions.push(logicalConflict);
    }
  }
  
  return contradictions;
}

/**
 * Check if two facts are equal
 */
function factsAreEqual(a: Fact, b: Fact): boolean {
  const aValue = a.objectValue || a.objectEntityId || '';
  const bValue = b.objectValue || b.objectEntityId || '';
  
  return (
    a.subjectEntityId === b.subjectEntityId &&
    a.predicate === b.predicate &&
    aValue === bValue
  );
}

/**
 * Get the value (object) of a fact
 */
function getFactValue(fact: Fact): string {
  return fact.objectValue || fact.objectEntityId || '';
}

/**
 * Check if two facts have temporal conflict
 */
function hasTemporalConflict(a: Fact, b: Fact): boolean {
  // If neither has time bounds, they conflict
  if (!a.validFrom && !b.validFrom) {
    return true;
  }
  
  // If only one has time bounds, check if current
  if (!a.validFrom && b.validFrom) {
    return !b.validUntil || new Date(b.validUntil) > new Date();
  }
  if (a.validFrom && !b.validFrom) {
    return !a.validUntil || new Date(a.validUntil) > new Date();
  }
  
  // Both have time bounds - check for overlap
  const aStart = new Date(a.validFrom!);
  const aEnd = a.validUntil ? new Date(a.validUntil) : new Date('2999-12-31');
  const bStart = new Date(b.validFrom!);
  const bEnd = b.validUntil ? new Date(b.validUntil) : new Date('2999-12-31');
  
  // Overlap exists if ranges intersect
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Detect logical conflicts (domain-specific)
 */
function detectLogicalConflict(newFact: Fact, existing: Fact): DetectedContradiction | null {
  const newValue = getFactValue(newFact).toLowerCase();
  const existingValue = getFactValue(existing).toLowerCase();
  
  // Risk level conflicts (Low < Medium < High < Critical)
  const riskLevels = ['low', 'medium', 'high', 'critical'];
  if (newFact.predicate === 'risk_level' && existing.predicate === 'risk_level') {
    // This is actually a transition, not a contradiction
    // The old value should be invalidated
    return null;
  }
  
  // Boolean conflicts (is_active: true vs is_active: false)
  if (['true', 'false'].includes(newValue) && ['true', 'false'].includes(existingValue)) {
    if (newValue !== existingValue) {
      return {
        type: 'logical',
        factA: newFact,
        factB: existing,
        reason: `Boolean conflict: ${newValue} vs ${existingValue}`,
        severity: 'high',
        suggestedResolution: suggestResolution(newFact, existing, 'logical')
      };
    }
  }
  
  // Mutually exclusive states
  const mutuallyExclusive: Record<string, string[]> = {
    'status': ['active', 'inactive', 'deleted'],
    'state': ['open', 'closed', 'pending'],
    'priority': ['low', 'medium', 'high', 'critical']
  };
  
  const exclusiveValues = mutuallyExclusive[newFact.predicate];
  if (exclusiveValues) {
    if (exclusiveValues.includes(newValue) && exclusiveValues.includes(existingValue)) {
      if (newValue !== existingValue) {
        return {
          type: 'logical',
          factA: newFact,
          factB: existing,
          reason: `Mutually exclusive states: ${newValue} vs ${existingValue}`,
          severity: 'medium',
          suggestedResolution: suggestResolution(newFact, existing, 'logical')
        };
      }
    }
  }
  
  return null;
}

/**
 * Suggest resolution for a contradiction
 */
function suggestResolution(
  newFact: Fact,
  existing: Fact,
  type: ContradictionType
): string {
  // Strategy 1: Keep newer (if temporal)
  if (newFact.validFrom && existing.validFrom) {
    const newDate = new Date(newFact.validFrom);
    const existingDate = new Date(existing.validFrom);
    
    if (newDate > existingDate) {
      return `Keep newer fact (valid from ${newFact.validFrom}) and invalidate older fact (valid from ${existing.validFrom})`;
    } else {
      return `Keep existing fact (valid from ${existing.validFrom}) and reject new fact`;
    }
  }
  
  // Strategy 2: Keep higher confidence
  if (newFact.confidence !== existing.confidence) {
    const higherConfidence = newFact.confidence > existing.confidence ? 'new' : 'existing';
    return `Keep ${higherConfidence} fact (higher confidence: ${Math.max(newFact.confidence, existing.confidence)})`;
  }
  
  // Strategy 3: Keep explicit evidence
  const newEvidence = newFact.evidence?.length || 0;
  const existingEvidence = existing.evidence?.length || 0;
  
  if (newEvidence > existingEvidence) {
    return `Keep new fact (more evidence: ${newEvidence} sources)`;
  } else if (existingEvidence > newEvidence) {
    return `Keep existing fact (more evidence: ${existingEvidence} sources)`;
  }
  
  // Strategy 4: Ask user
  return `Ask user to resolve: "${getFactValue(newFact)}" vs "${getFactValue(existing)}"`;
}

/**
 * Generate a human-readable contradiction report
 */
export function formatContradictionReport(contradictions: DetectedContradiction[]): string {
  if (contradictions.length === 0) {
    return 'No contradictions detected.';
  }
  
  const lines: string[] = [`Detected ${contradictions.length} contradiction(s):`, ''];
  
  for (let i = 0; i < contradictions.length; i++) {
    const c = contradictions[i];
    lines.push(`### Contradiction ${i + 1} (${c.severity} severity)`);
    lines.push(`- **Type:** ${c.type}`);
    lines.push(`- **Fact A:** ${getFactValue(c.factA)} (confidence: ${c.factA.confidence})`);
    lines.push(`- **Fact B:** ${getFactValue(c.factB)} (confidence: ${c.factB.confidence})`);
    lines.push(`- **Reason:** ${c.reason}`);
    if (c.suggestedResolution) {
      lines.push(`- **Suggested Resolution:** ${c.suggestedResolution}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Analyze all contradictions in a set of facts
 */
export function analyzeFactSet(facts: Fact[]): {
  contradictions: DetectedContradiction[];
  bySubject: Map<string, DetectedContradiction[]>;
  byPredicate: Map<string, DetectedContradiction[]>;
  byType: Map<ContradictionType, DetectedContradiction[]>;
} {
  const contradictions: DetectedContradiction[] = [];
  const bySubject = new Map<string, DetectedContradiction[]>();
  const byPredicate = new Map<string, DetectedContradiction[]>();
  const byType = new Map<ContradictionType, DetectedContradiction[]>();
  
  // Compare each pair of facts
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const detected = detectContradictions(facts[j], [facts[i]]);
      
      for (const c of detected) {
        contradictions.push(c);
        
        // Group by subject
        const subjectId = c.factA.subjectEntityId;
        if (!bySubject.has(subjectId)) {
          bySubject.set(subjectId, []);
        }
        bySubject.get(subjectId)!.push(c);
        
        // Group by predicate
        const predicate = c.factA.predicate;
        if (!byPredicate.has(predicate)) {
          byPredicate.set(predicate, []);
        }
        byPredicate.get(predicate)!.push(c);
        
        // Group by type
        if (!byType.has(c.type)) {
          byType.set(c.type, []);
        }
        byType.get(c.type)!.push(c);
      }
    }
  }
  
  return { contradictions, bySubject, byPredicate, byType };
}

/**
 * Auto-resolve contradictions where possible
 */
export function autoResolve(contradictions: DetectedContradiction[]): {
  resolved: Array<{ contradiction: DetectedContradiction; resolution: string }>;
  unresolved: DetectedContradiction[];
} {
  const resolved: Array<{ contradiction: DetectedContradiction; resolution: string }> = [];
  const unresolved: DetectedContradiction[] = [];
  
  for (const c of contradictions) {
    // Auto-resolve temporal contradictions (keep newer)
    if (c.type === 'value_conflict' && c.factA.validFrom && c.factB.validFrom) {
      const aDate = new Date(c.factA.validFrom);
      const bDate = new Date(c.factB.validFrom);
      
      if (aDate > bDate) {
        resolved.push({
          contradiction: c,
          resolution: `Keep Fact A (newer: ${c.factA.validFrom})`
        });
        continue;
      } else if (bDate > aDate) {
        resolved.push({
          contradiction: c,
          resolution: `Keep Fact B (newer: ${c.factB.validFrom})`
        });
        continue;
      }
    }
    
    // Auto-resolve confidence contradictions
    if (c.factA.confidence !== c.factB.confidence) {
      const higher = c.factA.confidence > c.factB.confidence ? 'A' : 'B';
      resolved.push({
        contradiction: c,
        resolution: `Keep Fact ${higher} (higher confidence: ${Math.max(c.factA.confidence, c.factB.confidence)})`
      });
      continue;
    }
    
    // Cannot auto-resolve - needs user input
    unresolved.push(c);
  }
  
  return { resolved, unresolved };
}

/**
 * Create a database contradiction record
 */
export function createContradictionRecord(
  factA: Fact,
  factB: Fact,
  type: ContradictionType
): Omit<Contradiction, 'id' | 'detectedAt'> {
  return {
    factAId: factA.id,
    factBId: factB.id,
    conflictType: type,
    detectedBy: 'llm',
    resolutionStatus: 'unresolved'
  };
}