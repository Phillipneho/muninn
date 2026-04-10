// Muninn Cloudflare - Consensus Extraction
// Multi-pass extraction with intersection filter for deterministic output

import { extractWithAI, ExtractionResult, ExtractionConfig } from './extraction';

interface FactSignature {
  subject: string;
  predicate: string;
  object: string;
  signature: string;
}

interface ConsensusResult {
  entities: ExtractionResult['entities'];
  facts: ExtractionResult['facts'];
  events: ExtractionResult['events'];
  consensus: {
    totalRuns: number;
    totalFactsExtracted: number;
    consensusFacts: number;
    agreement: number;
  };
  temporalContext: string;
}

/**
 * Run extraction N times and return intersection of facts
 * that appear in at least 2 runs (majority consensus)
 */
export async function extractWithConsensus(
  ai: any,
  content: string,
  sessionDate: string,
  config?: ExtractionConfig & { runs?: number; minAgreement?: number }
): Promise<ConsensusResult> {
  const runs = config?.runs || 3;
  const minAgreement = config?.minAgreement || 2; // Must appear in at least 2 of 3 runs
  const allResults: ExtractionResult[] = [];
  
  console.log(`[CONSENSUS] Starting ${runs}-pass extraction for consensus...`);
  
  // Run extraction N times concurrently
  const extractionPromises = Array(runs).fill(null).map(async (_, i) => {
    console.log(`[CONSENSUS] Run ${i + 1}/${runs} starting...`);
    const startTime = Date.now();
    
    try {
      const result = await extractWithAI(ai, content, sessionDate, config);
      console.log(`[CONSENSUS] Run ${i + 1}/${runs} complete: ${result.facts.length} facts, ${result.entities.length} entities (${Date.now() - startTime}ms)`);
      return result;
    } catch (error) {
      console.error(`[CONSENSUS] Run ${i + 1}/${runs} failed:`, error);
      return { entities: [], facts: [], events: [], temporalContext: sessionDate };
    }
  });
  
  // Wait for all runs to complete
  allResults.push(...await Promise.all(extractionPromises));
  
  // Build fact signatures for comparison
  const factOccurrences = new Map<string, { fact: any; count: number; runs: number[] }>();
  const allFactsFlat: any[] = [];
  
  allResults.forEach((result, runIndex) => {
    result.facts.forEach(fact => {
      // Create signature: subject|predicate|object (normalized)
      const signature = `${fact.subject.toLowerCase()}|${fact.predicate.toLowerCase()}|${fact.object.toLowerCase()}`;
      
      if (!factOccurrences.has(signature)) {
        factOccurrences.set(signature, { fact, count: 0, runs: [] });
      }
      
      const entry = factOccurrences.get(signature)!;
      entry.count++;
      entry.runs.push(runIndex + 1);
    });
    
    allFactsFlat.push(...result.facts);
  });
  
  // Filter to consensus facts (appearing in ≥ minAgreement runs)
  const consensusFacts = Array.from(factOccurrences.values())
    .filter(entry => entry.count >= minAgreement)
    .map(entry => entry.fact);
  
  // Merge entities (unique by name)
  const entityMap = new Map<string, any>();
  allResults.forEach(result => {
    result.entities.forEach(entity => {
      if (!entityMap.has(entity.name.toLowerCase())) {
        entityMap.set(entity.name.toLowerCase(), entity);
      }
    });
  });
  const mergedEntities = Array.from(entityMap.values());
  
  // Merge events (unique by description)
  const eventMap = new Map<string, any>();
  allResults.forEach(result => {
    result.events?.forEach(event => {
      const key = event.description?.toLowerCase() || event.name?.toLowerCase();
      if (key && !eventMap.has(key)) {
        eventMap.set(key, event);
      }
    });
  });
  const mergedEvents = Array.from(eventMap.values());
  
  // Calculate agreement percentage
  const agreement = consensusFacts.length / (allFactsFlat.length / runs);
  
  const consensusStats = {
    totalRuns: runs,
    totalFactsExtracted: allFactsFlat.length,
    consensusFacts: consensusFacts.length,
    agreement: Math.round(agreement * 100)
  };
  
  console.log(`[CONSENSUS] Complete: ${consensusFacts.length}/${Math.round(allFactsFlat.length / runs)} facts achieved consensus (${consensusStats.agreement}% agreement)`);
  console.log(`[CONSENSUS] Facts by run: ${allResults.map(r => r.facts.length).join(', ')}`);
  console.log(`[CONSENSUS] Consensus facts: ${consensusFacts.slice(0, 3).map(f => f.predicate).join(', ')}...`);
  
  return {
    entities: mergedEntities,
    facts: consensusFacts,
    events: mergedEvents,
    consensus: consensusStats,
    temporalContext: sessionDate
  };
}

/**
 * Resolve pronouns in consensus facts using entity context
 */
export function resolvePronounsInConsensus(
  result: ConsensusResult,
  speaker?: string
): ConsensusResult {
  const resolvedFacts = result.facts.map(fact => {
    let subject = fact.subject;
    
    // Common pronoun resolution
    if (subject === 'I' || subject === 'i') {
      subject = speaker || 'Unknown';
    } else if (subject === 'we' || subject === 'We') {
      subject = speaker ? `${speaker} and others` : 'Group';
    }
    
    // Resolve object pronouns
    let object = fact.object;
    if (object === 'me' || object === 'Me') {
      object = speaker || 'Unknown';
    }
    
    return {
      ...fact,
      subject,
      object
    };
  });
  
  return {
    ...result,
    facts: resolvedFacts
  };
}

/**
 * Deduplicate similar facts (e.g., "parent" vs "father")
 */
export function deduplicateConsensus(result: ConsensusResult): ConsensusResult {
  const PREDICATE_SYNONYMS: Record<string, string[]> = {
    'has_role': ['has_role', 'is', 'role'],
    'has_identity': ['has_identity', 'identifies_as', 'identity'],
    'has_relationship_status': ['has_relationship_status', 'relationship_status', 'status'],
    'research': ['research', 'researching', 'studied', 'studying']
  };
  
  const seen = new Map<string, any>();
  const dedupedFacts: any[] = [];
  
  for (const fact of result.facts) {
    // Normalize predicate
    let normalizedPredicate = fact.predicate;
    for (const [canonical, synonyms] of Object.entries(PREDICATE_SYNONYMS)) {
      if (synonyms.includes(fact.predicate.toLowerCase())) {
        normalizedPredicate = canonical;
        break;
      }
    }
    
    // Create dedup key
    const key = `${fact.subject.toLowerCase()}|${normalizedPredicate.toLowerCase()}|${fact.object.toLowerCase()}`;
    
    if (!seen.has(key)) {
      seen.set(key, fact);
      dedupedFacts.push({
        ...fact,
        predicate: normalizedPredicate
      });
    }
  }
  
  return {
    ...result,
    facts: dedupedFacts
  };
}