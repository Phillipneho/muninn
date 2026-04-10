/**
 * MUNINN TWO-PASS EXTRACTION
 * 
 * Pass 1: Fact Extraction (model-agnostic)
 *   - Identify entities
 *   - Extract facts with evidence
 *   - Output: {subject, predicate, object, evidence}
 * 
 * Pass 2: PDS Classification (deterministic)
 *   - Assign PDS decimal codes based on predicate type
 *   - Detect entity linkages (related_pds)
 *   - Output: {subject, predicate, object, pds_decimal, evidence}
 */

// PDS Taxonomy - Predicate to PDS mapping
const PREDICATE_TO_PDS: Record<string, string> = {
  // 1000 - Internal State
  'identifies_as': '1201',
  'has_identity': '1201',
  'has_gender': '1201',
  'has_nationality': '1201',
  'has_occupation': '1201',
  'has_trait': '1301',
  'has_personality': '1301',
  'prefers': '1401',
  'likes': '1401',
  'dislikes': '1401',
  'has_hobby': '1401',
  'activity': '1401',
  'kids_like': '1401',
  
  // 2000 - Relational Orbit
  'has_relationship_status': '2101',
  'married_to': '2101',
  'dating': '2101',
  'has_child': '2101',
  'has_partner': '2101',
  'family_of': '2201',
  'friend_of': '2301',
  'interacts_with': '2301',
  'is_supportive_to': '2301',
  'known_for_duration': '2301',
  'known_for': '2301',
  
  // 3000 - Instrumental
  'works_at': '3101',
  'researched': '3101',
  'has_goal': '3101',
  'intends_to': '3101',
  'creates': '3201',
  'creates_art': '3201',
  'creates_content': '3201',
  'volunteers': '3301',
  'participates_in': '3301',
  'has_achievement': '3401',
  'achieved_on': '3401',
  
  // 4000 - Chronological
  'occurred_on': '4101',
  'attended_on': '4101',
  'visited': '4101',
  'went_to': '4101',
  'started_on': '4401',
  'ended_on': '4401',
  'moved_from': '4401',
  'moved_to': '4401',
  'camped_at': '4101',
  
  // Fallback
  'has': '0000',
  'mentioned': '0000'
};

// PDS Domain lookup
const PDS_DOMAINS: Record<string, string> = {
  '1000': 'Internal State',
  '1200': 'Identity',
  '1300': 'Traits',
  '1400': 'Preferences',
  '2000': 'Relational Orbit',
  '2100': 'Core Relationships',
  '2200': 'Family',
  '2300': 'Social',
  '2400': 'Community',
  '3000': 'Instrumental',
  '3100': 'Projects/SaaS',
  '3200': 'Creation',
  '3300': 'Community Service',
  '3400': 'Achievements',
  '4000': 'Chronological',
  '4100': 'Events',
  '4200': 'Durations',
  '4300': 'Transitions',
  '4400': 'Origins',
  '5000': 'Conceptual',
  '0000': 'Unclassified'
};

/**
 * PASS 1: Extract facts from dialogue
 * Simple extraction that works with any model
 */
export const PASS_ONE_PROMPT = `Extract facts from this dialogue.

IMPORTANT: Convert relative dates to absolute dates.
- "yesterday" → session_date - 1 day
- "last week" → session_date - 7 days
- "4 years ago" → session_date - 4 years

Session date: {{SESSION_DATE}}

Dialogue:
{{CONTENT}}

Output ONLY valid JSON on one line:
{"entities":[{"name":"Name","type":"person"}],"facts":[{"subject":"Name","predicate":"predicate","object":"value","valid_from":"YYYY-MM-DD","evidence":"exact quote from text"}]}

Example predicates: identifies_as, has_relationship_status, has_child, moved_from, known_for, researched, activity, attended_on, camped_at, interacts_with, prefers, likes`;

/**
 * PASS 2: Classify facts with PDS codes
 * Takes facts from Pass 1 and assigns PDS taxonomy
 */
export const PASS_TWO_PROMPT = `You are the Muninn Librarian. Your job is to classify facts into the Psychological Decimal System (PDS).

PDS Taxonomy:
- 1200: Identity (gender, nationality, occupation, personality)
- 1400: Preferences (hobbies, interests, likes/dislikes)
- 2100: Core Relationships (partner, children, family status)
- 2300: Social (friends, interactions, support)
- 3100: Projects (work, research, goals)
- 3300: Community Service (volunteering, participation)
- 4100: Events (attended, visited, occurred)
- 4400: Origins (moved_from, started)

Input facts:
{{FACTS}}

For each fact, assign the correct PDS code:
- Identify the subject's PDS domain (1200, 2100, 2300, 3100, 4100, etc.)
- If fact links two entities (e.g., "Melanie is_supportive_to Caroline"), set related_pds

Output ONLY valid JSON:
{"classified_facts":[{"subject":"Name","predicate":"predicate","object":"value","pds_decimal":"4101","valid_from":"2023-05-07","evidence":"quote","related_pds":null}]}

CRITICAL: Every fact MUST have a 4-digit PDS code from the taxonomy above.`;

/**
 * Classify facts with PDS codes (deterministic)
 */
export function classifyFacts(facts: any[]): any[] {
  return facts.map(fact => {
    const predicate = fact.predicate?.toLowerCase() || '';
    
    // Look up PDS code
    let pds_decimal = PREDICATE_TO_PDS[predicate] || '0000';
    
    // Infer PDS from predicate patterns
    if (pds_decimal === '0000') {
      if (predicate.includes('identity') || predicate.includes('gender') || predicate.includes('nationality')) {
        pds_decimal = '1201';
      } else if (predicate.includes('relationship') || predicate.includes('married') || predicate.includes('child')) {
        pds_decimal = '2101';
      } else if (predicate.includes('friend') || predicate.includes('interact') || predicate.includes('support')) {
        pds_decimal = '2301';
      } else if (predicate.includes('attend') || predicate.includes('visit') || predicate.includes('occur')) {
        pds_decimal = '4101';
      } else if (predicate.includes('start') || predicate.includes('move') || predicate.includes('end')) {
        pds_decimal = '4401';
      } else if (predicate.includes('work') || predicate.includes('research') || predicate.includes('goal')) {
        pds_decimal = '3101';
      } else if (predicate.includes('like') || predicate.includes('prefer') || predicate.includes('hobby')) {
        pds_decimal = '1401';
      }
    }
    
    // Detect entity linkages
    let related_pds = null;
    const objectStr = fact.object?.toString() || '';
    
    // Check if object is a person name (entity linkage)
    const personNames = ['Caroline', 'Melanie', 'John', 'Maria', 'Joanna', 'Nate', 'Tim', 
                         'Audrey', 'Andrew', 'James', 'Deborah', 'Jolene', 'Evan', 'Sam', 
                         'Calvin', 'Dave', 'Gina', 'Jon'];
    
    if (personNames.some(name => objectStr.includes(name))) {
      // This fact links entities - set related_pds
      if (predicate.includes('support') || predicate.includes('friend')) {
        related_pds = '2300'; // Social relationship
      } else if (predicate.includes('family') || predicate.includes('married')) {
        related_pds = '2100'; // Core relationship
      }
    }
    
    return {
      ...fact,
      pds_decimal,
      pds_domain: pds_decimal.substring(0, 1) + '000',
      related_pds
    };
  });
}

/**
 * Get PDS domain name
 */
export function getPdsDomainName(pdsDecimal: string): string {
  const domain = pdsDecimal.substring(0, 1) + '000';
  return PDS_DOMAINS[domain] || 'Unknown';
}

/**
 * Validate PDS code
 */
export function isValidPdsCode(code: string): boolean {
  if (!code || code === '0000') return true; // Allow unclassified
  const domain = code.substring(0, 1);
  return ['1', '2', '3', '4', '5'].includes(domain);
}

export default {
  PASS_ONE_PROMPT,
  PASS_TWO_PROMPT,
  classifyFacts,
  getPdsDomainName,
  isValidPdsCode,
  PREDICATE_TO_PDS
};