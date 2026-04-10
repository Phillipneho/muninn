/**
 * PDS-Aware Retrieval
 * Uses the Psychological Decimal System for surgical fact filtering
 */

// Question intent → PDS domain mapping
export const INTENT_TO_PDS: Record<string, string[]> = {
  // 1000: Internal State
  'identity': ['1200'],           // Who is X? → Identity/Values
  'health': ['1100'],             // Health issues → Physical/Vitality
  'mood': ['1300'],               // How does X feel? → Psychological/Mood
  'preference': ['1400'],         // What does X like? → Preferences/Tastes
  
  // 2000: Relational Orbit
  'relationship': ['2100', '2300'], // Partner, friends → Core + Social
  'family': ['2100'],             // Family members → Core/Intimate
  'social': ['2300'],             // Friends, acquaintances → Social
  'professional': ['2200'],       // Colleagues, clients → Professional
  
  // 3000: Instrumental
  'career': ['3300'],             // Job, work → Career/Roles
  'project': ['3100'],            // Projects, SaaS → Projects
  'infrastructure': ['3200'],     // Tools, hardware → Infrastructure
  'finance': ['3400'],            // Money, budget → Financial
  
  // 4000: Chronological
  'temporal': ['4100', '4200'],   // When did X? → Fixed Schedule + Duration
  'when': ['4100'],               // Specific dates → Fixed Schedule
  'duration': ['4200'],           // How long? → Duration/Sequencing
  'routine': ['4300'],            // Habits, recurring → Routine/Frequency
  'origin': ['4400'],             // Where from? → Historical/Origin
  
  // 5000: Conceptual
  'belief': ['5300'],             // What does X believe? → Philosophical
  'framework': ['5100'],          // Mental models → Models/Frameworks
}

// Detect question intent from query
export function detectPdsIntent(query: string): string[] {
  const q = query.toLowerCase()
  
  // Temporal patterns (highest priority for "when" questions)
  if (/^when\s|^what\s+date|what\s+time|on\s+what\s+day/i.test(q)) {
    return INTENT_TO_PDS['when'] || ['4100']
  }
  
  // Duration patterns
  if (/how\s+long|how\s+many\s+years|for\s+how\s+long|duration/i.test(q)) {
    return INTENT_TO_PDS['duration'] || ['4200']
  }
  
  // Identity patterns
  if (/who\s+is|what\s+is\s+\w+'?s?\s+(identity|gender|ethnicity)|identify\s+as/i.test(q)) {
    return INTENT_TO_PDS['identity'] || ['1200']
  }
  
  // Relationship patterns
  if (/relationship|partner|spouse|married|dating|friend/i.test(q)) {
    return INTENT_TO_PDS['relationship'] || ['2100', '2300']
  }
  
  // Career patterns
  if (/career|job|work|profession|employer|company|does\s+for\s+a\s+living/i.test(q)) {
    return INTENT_TO_PDS['career'] || ['3300']
  }
  
  // Origin patterns
  if (/where\s+did\s+\w+\s+(move|come)\s+from|where\s+is\s+\w+\s+from|origin/i.test(q)) {
    return INTENT_TO_PDS['origin'] || ['4400']
  }
  
  // Activity patterns
  if (/what\s+did\s+\w+\s+do|what\s+activities|what\s+happened/i.test(q)) {
    return ['4000'] // All chronological
  }
  
  // Research patterns
  if (/what\s+did\s+\w+\s+research|what\s+did\s+\w+\s+study|investigate/i.test(q)) {
    return ['3300', '3100'] // Career + Projects
  }
  
  // Default: return empty (no filtering)
  return []
}

/**
 * Build SQL query with PDS filtering
 */
export function buildPdsFilteredQuery(
  entityId: string,
  orgId: string,
  pdsDomains: string[]
): { sql: string; params: any[] } {
  const baseQuery = `
    SELECT f.*, 
      s.name as subject_name, s.type as subject_type,
      COALESCE(o.name, f.object_value) as object_name,
      f.pds_decimal, f.pds_domain
    FROM facts f
    JOIN entities s ON f.subject_entity_id = s.id
    LEFT JOIN entities o ON f.object_entity_id = o.id
    WHERE f.subject_entity_id = ? 
      AND f.organization_id = ? 
      AND f.invalidated_at IS NULL
  `
  
  const params: any[] = [entityId, orgId]
  
  if (pdsDomains.length === 0) {
    return {
      sql: baseQuery + ' ORDER BY f.created_at DESC LIMIT 100',
      params
    }
  }
  
  // Add PDS filtering
  const pdsConditions = pdsDomains.map(() => 'f.pds_decimal LIKE ?').join(' OR ')
  const pdsParams = pdsDomains.map(d => `${d}%`)
  
  return {
    sql: `${baseQuery} AND (${pdsConditions}) ORDER BY f.created_at DESC LIMIT 50`,
    params: [...params, ...pdsParams]
  }
}
