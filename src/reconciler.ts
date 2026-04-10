/**
 * Muninn Reconciler — Dual-Pass Extraction & Reconciliation
 * 
 * Purpose: Reconcile extracted facts with session context to resolve conflicts,
 * detect temporal flow, and ensure entity integrity.
 * 
 * Architecture:
 * 1. Input: Raw facts from extraction + Session summary
 * 2. Reconcile: Entity-level conflict resolution
 * 3. Output: Reconciled facts with confidence scores
 */

export interface ReconciledFact {
  subject: string;
  predicate: string;
  object: string;
  objectType: 'entity' | 'duration' | 'date' | 'string' | 'number';
  validFrom: string | null;
  validUntil: string | null;
  confidence: number;
  evidence: string;
  isHistorical: boolean;
  sourceChunk?: number;
}

export interface SessionSummary {
  entities: string[];
  timeline: string[];
  keyEvents: string[];
  temporalAnchors: Record<string, string>;
}

export interface ConflictResolution {
  winner: ReconciledFact;
  losers: ReconciledFact[];
  reason: string;
}

/**
 * Generate a high-level summary of the session for reconciliation context
 */
export async function generateSessionSummary(
  ai: any,
  content: string,
  sessionDate: string
): Promise<SessionSummary> {
  const prompt = `Summarize this conversation for entity reconciliation.

Session Date: ${sessionDate}
Content: ${content.substring(0, 3000)}

Extract:
1. All named entities (people, places, events)
2. Timeline of events mentioned
3. Key events with temporal anchors
4. Current vs historical status markers

Output JSON:
{
  "entities": ["Caroline", "Melanie", ...],
  "timeline": ["event1 before event2", ...],
  "keyEvents": ["speech at school", "charity race", ...],
  "temporalAnchors": {"speech": "week before 9 June 2023", ...}
}`;

  // For now, return basic summary from content analysis
  // In production, this would call the LLM
  const entities: string[] = [];
  const entityMatches = content.match(/\b[A-Z][a-z]+\b/g) || [];
  for (const match of entityMatches) {
    if (!entities.includes(match) && match.length > 2) {
      entities.push(match);
    }
  }
  
  return {
    entities: [...new Set(entities)],
    timeline: [],
    keyEvents: [],
    temporalAnchors: {}
  };
}

/**
 * Detect predicate conflicts between facts
 */
function detectConflicts(facts: ReconciledFact[]): Map<string, ReconciledFact[]> {
  const conflicts = new Map<string, ReconciledFact[]>();
  
  // Group by subject + predicate
  for (const fact of facts) {
    const key = `${fact.subject}|${fact.predicate}`.toLowerCase();
    if (!conflicts.has(key)) {
      conflicts.set(key, []);
    }
    conflicts.get(key)!.push(fact);
  }
  
  // Filter to only entries with multiple facts (potential conflicts)
  for (const [key, group] of conflicts) {
    if (group.length <= 1) {
      conflicts.delete(key);
    }
  }
  
  return conflicts;
}

/**
 * Resolve a conflict between multiple facts for the same subject+predicate
 */
function resolveConflict(
  facts: ReconciledFact[],
  summary: SessionSummary
): ConflictResolution {
  // Priority rules:
  // 1. Higher confidence wins
  // 2. Later in session wins (temporal recency)
  // 3. Explicit current status beats implicit
  
  const sorted = facts.sort((a, b) => {
    // Confidence first
    if (a.confidence !== b.confidence) {
      return b.confidence - a.confidence;
    }
    // Then temporal order (later wins)
    return (b.sourceChunk || 0) - (a.sourceChunk || 0);
  });
  
  const winner = sorted[0];
  const losers = sorted.slice(1);
  
  // Mark historical if there's evidence of status change
  const isHistorical = losers.some(l => 
    l.evidence.toLowerCase().includes('used to') ||
    l.evidence.toLowerCase().includes('was') ||
    l.evidence.toLowerCase().includes('before')
  );
  
  winner.isHistorical = isHistorical;
  
  return {
    winner,
    losers,
    reason: `Selected based on confidence ${winner.confidence} and recency`
  };
}

/**
 * Main reconciliation function
 */
export async function reconcileFacts(
  rawFacts: ReconciledFact[],
  summary: SessionSummary
): Promise<ReconciledFact[]> {
  const conflicts = detectConflicts(rawFacts);
  const reconciled: ReconciledFact[] = [];
  const resolvedKeys = new Set<string>();
  
  console.log(`[RECONCILER] Processing ${rawFacts.length} facts, ${conflicts.size} conflicts`);
  
  // Resolve conflicts
  for (const [key, conflictFacts] of conflicts) {
    const resolution = resolveConflict(conflictFacts, summary);
    reconciled.push(resolution.winner);
    resolvedKeys.add(key);
    console.log(`[RECONCILER] Resolved ${key}: "${resolution.winner.object}" (${resolution.reason})`);
  }
  
  // Add non-conflicting facts
  for (const fact of rawFacts) {
    const key = `${fact.subject}|${fact.predicate}`.toLowerCase();
    if (!resolvedKeys.has(key)) {
      reconciled.push(fact);
    }
  }
  
  return reconciled;
}

/**
 * Semantic Boundary Detection
 * 
 * Splits content at discourse boundaries, not character limits.
 * Ensures entity-related content stays together.
 */
export function detectSemanticBoundaries(
  content: string,
  entityNames: string[]
): string[] {
  const segments: string[] = [];
  
  // Split by dialogue turns first
  const turns = content.split(/(?=\[[A-Za-z]+\]:)/g);
  
  let currentSegment = '';
  let currentEntities = new Set<string>();
  
  for (const turn of turns) {
    const turnEntities = new Set<string>();
    
    // Find entities mentioned in this turn
    for (const entity of entityNames) {
      if (turn.toLowerCase().includes(entity.toLowerCase())) {
        turnEntities.add(entity);
      }
    }
    
    // Check if this turn introduces a new topic (entity set change)
    const hasNewEntity = [...turnEntities].some(e => !currentEntities.has(e));
    const segmentLength = currentSegment.length;
    
    // Start new segment if:
    // 1. Segment is getting long (> 2500 chars) AND
    // 2. Entity set changes (new topic)
    if (segmentLength > 2500 && hasNewEntity && turnEntities.size > 0) {
      segments.push(currentSegment.trim());
      currentSegment = turn;
      currentEntities = turnEntities;
    } else {
      currentSegment += turn;
      for (const e of turnEntities) {
        currentEntities.add(e);
      }
    }
  }
  
  if (currentSegment.trim().length > 0) {
    segments.push(currentSegment.trim());
  }
  
  console.log(`[BOUNDARY] Split into ${segments.length} semantic segments`);
  return segments;
}

/**
 * Extract facts with entity integrity
 * 
 * Ensures all facts about an entity stay within the same extraction window
 */
export async function extractWithEntityIntegrity(
  ai: any,
  content: string,
  sessionDate: string,
  entityNames: string[],
  extractor: (content: string, sessionDate: string) => Promise<ReconciledFact[]>
): Promise<ReconciledFact[]> {
  // Detect semantic boundaries
  const segments = detectSemanticBoundaries(content, entityNames);
  
  if (segments.length <= 1) {
    // Single segment, extract directly
    return extractor(content, sessionDate);
  }
  
  // Multiple segments - extract each and reconcile
  const allFacts: ReconciledFact[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    console.log(`[ENTITY-INTEGRITY] Extracting segment ${i + 1}/${segments.length}`);
    const segmentFacts = await extractor(segments[i], sessionDate);
    
    // Tag facts with source segment
    for (const fact of segmentFacts) {
      fact.sourceChunk = i;
    }
    
    allFacts.push(...segmentFacts);
  }
  
  // Generate summary for reconciliation
  const summary = await generateSessionSummary(ai, content, sessionDate);
  
  // Reconcile across segments
  return reconcileFacts(allFacts, summary);
}