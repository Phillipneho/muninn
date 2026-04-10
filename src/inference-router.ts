/**
 * Inference Router - Chain-of-Memory for Multi-Hop Reasoning
 * 
 * Enables multi-hop questions like "Why did John stop painting?" by:
 * 1. Identifying primary PDS code for the topic
 * 2. Querying linked PDS codes (associations in DB)
 * 3. Returning fact chains for synthesis
 */

const MUNINN_API = process.env.MUNINN_API || 'https://api.muninn.au'
const MUNINN_KEY = process.env.MUNINN_KEY || 'muninn_729186836cbd4aada2352cb4c06c4ef0'
const ORG_ID = process.env.ORG_ID || 'leo-default'

// PDS DECIMAL TAXONOMY (4-digit)
// PDS Code Reference (matching extraction.ts decimal taxonomy)
export interface PDSCodeInfo {
  code: string // e.g., "1201", "2101"
  name: string
  linked: string[] // Linked PDS codes for inference
  keywords: string[] // Keywords to identify this domain
}

// PDS Domain Map - Maps topics to PDS codes and their linked codes
// Uses 4-digit decimal taxonomy (1201, 2101, etc.)
const PDS_DOMAIN_MAP: Record<string, PDSCodeInfo> = {
  // 1000: Internal State (Identity, Mood, Preferences)
  '1000': {
    code: '1000',
    name: 'Internal State',
    linked: ['2000', '3000', '4000'],
    keywords: ['identity', 'gender', 'who', 'what am i', 'how do i feel', 'mood', 'stress', 'anxiety', 'emotion']
  },
  '1100': {
    code: '1100',
    name: 'Physical/Vitality',
    linked: ['1000', '4000'],
    keywords: ['weight', 'height', 'sleep', 'energy', 'health', 'medication', 'meds']
  },
  '1200': {
    code: '1200',
    name: 'Identity/Values',
    linked: ['1000', '2000', '3000'],
    keywords: ['identity', 'values', 'belief', 'ethnicity', 'heritage', 'transgender', 'woman', 'man', 'identify as']
  },
  '1300': {
    code: '1300',
    name: 'Psychological/Mood',
    linked: ['1000', '4000'],
    keywords: ['stress', 'mood', 'anxiety', 'depression', 'feeling', 'emotion', 'mental', 'clear']
  },
  '1400': {
    code: '1400',
    name: 'Preferences/Tastes',
    linked: ['1000', '2000'],
    keywords: ['likes', 'prefers', 'loves', 'dislikes', 'hates', 'interested', 'favorite']
  },

  // 2000: Relational Orbit (Relationships, Family, Friends)
  '2000': {
    code: '2000',
    name: 'Relational',
    linked: ['1000', '3000'],
    keywords: ['relationship', 'partner', 'spouse', 'wife', 'husband', 'married', 'single', 'family', 'friend']
  },
  '2100': {
    code: '2100',
    name: 'Core/Intimate',
    linked: ['1000', '2000', '3000'],
    keywords: ['partner', 'wife', 'husband', 'spouse', 'children', 'kids', 'child', 'family', 'married']
  },
  '2200': {
    code: '2200',
    name: 'Professional/Strategic',
    linked: ['2000', '3000'],
    keywords: ['colleague', 'client', 'stakeholder', 'meeting', 'boss', 'manager', 'coworker']
  },
  '2300': {
    code: '2300',
    name: 'Social/Acquaintance',
    linked: ['2000', '3000'],
    keywords: ['friend', 'neighbor', 'acquaintance', 'known']
  },

  // 3000: Instrumental (Activities, Possessions, Career)
  '3000': {
    code: '3000',
    name: 'Instrumental',
    linked: ['1000', '4000'],
    keywords: ['activity', 'hobby', 'possession', 'owns', 'bought', 'item', 'instrument']
  },
  '3100': {
    code: '3100',
    name: 'Forge/SaaS',
    linked: ['3000', '3300'],
    keywords: ['project', 'code', 'saas', 'brandforge', 'app', 'building', 'creating']
  },
  '3300': {
    code: '3300',
    name: 'Career/Managed Services',
    linked: ['3000', '3100'],
    keywords: ['job', 'work', 'career', 'role', 'position', 'applying', 'interview']
  },
  '3400': {
    code: '3400',
    name: 'Financial/Legal',
    linked: ['3000'],
    keywords: ['salary', 'budget', 'money', 'financial', 'contract', 'paying']
  },

  // 4000: Chronological (Events, Time, Routines)
  '4000': {
    code: '4000',
    name: 'Chronological',
    linked: ['1000', '3000'],
    keywords: ['when', 'date', 'time', 'event', 'happened', 'occurred', 'schedule']
  },
  '4100': {
    code: '4100',
    name: 'Fixed Schedule',
    linked: ['4000'],
    keywords: ['event', 'meeting', 'conference', 'happened', 'occurred', 'date']
  },
  '4200': {
    code: '4200',
    name: 'Duration/Sequencing',
    linked: ['4000'],
    keywords: ['how long', 'duration', 'since', 'for', 'years', 'months', 'weeks']
  },
  '4300': {
    code: '4300',
    name: 'Routine/Frequency',
    linked: ['4000'],
    keywords: ['routine', 'habit', 'daily', 'weekly', 'often', 'every']
  },
  '4400': {
    code: '4400',
    name: 'Historical/Origin',
    linked: ['4000'],
    keywords: ['moved from', 'originated', 'started', 'began', 'came from']
  },

  // 5000: Conceptual (Speculative, Abstract)
  '5000': {
    code: '5000',
    name: 'Conceptual',
    linked: ['1000', '2000'],
    keywords: ['think', 'believe', 'hypothesize', 'what if', 'model', 'framework', 'future']
  },
  '5100': {
    code: '5100',
    name: 'Models/Frameworks',
    linked: ['5000'],
    keywords: ['model', 'framework', 'principle', 'method', 'system']
  },
  '5200': {
    code: '5200',
    name: 'Prototypes/What-Ifs',
    linked: ['5000'],
    keywords: ['prototype', 'what if', 'scenario', 'simulation', 'considering']
  },
  '5300': {
    code: '5300',
    name: 'Philosophical',
    linked: ['5000'],
    keywords: ['philosophy', 'ethics', 'belief', 'musing', 'why']
  }
}

// Topic keywords to PDS code mapping (4-digit)
const TOPIC_TO_PDS: Record<string, string> = {
  'education': '3100',  // Career interest relates to instrumental
  'career': '3300',
  'job': '3300',
  'work': '3300',
  'painting': '3100',  // Hobby/activity
  'hobby': '3100',
  'stress': '1300',    // Mood
  'mood': '1300',
  'feeling': '1300',
  'meeting': '4100',  // Event
  'event': '4100',
  'identity': '1200',
  'relationship': '2100',
  'family': '2100',
  'friend': '2300',
  'money': '3400',
  'salary': '3400',
  'project': '3100',
  'code': '3100',
  'activity': '3100',
  'when': '4000',
  'date': '4100',
  'how long': '4200',
  'routine': '4300',
  'moved from': '4400',
  'origin': '4400'
}

/**
 * Identify the primary PDS code for a question/topic
 * Returns 4-digit decimal taxonomy code
 */
export function identifyPDSCode(question: string, entity?: string): string {
  const q = question.toLowerCase()
  
  // Check explicit topic keywords first
  for (const [topic, code] of Object.entries(TOPIC_TO_PDS)) {
    if (q.includes(topic)) {
      return code
    }
  }
  
  // Fall back to keyword matching
  for (const [code, info] of Object.entries(PDS_DOMAIN_MAP)) {
    for (const keyword of info.keywords) {
      if (q.includes(keyword)) {
        return code
      }
    }
  }
  
  return '3000' // Default to Instrumental (activities)
}

/**
 * Detect if a question requires multi-hop reasoning
 * Multi-hop indicators:
 * - "why" questions (cause-effect)
 * - "how" questions (process/chain)
 * - Questions about changes over time
 * - Questions connecting different aspects
 */
export function isMultiHopQuestion(question: string): boolean {
  const q = question.toLowerCase()
  
  // Explicit multi-hop patterns
  const multiHopPatterns = [
    /^why\s+/,                    // Cause-effect
    /^how\s+(did|did|did)/,       // Process
    /why\s+(did|do|does)/,        // Reason
    /what\s+(made|caused|led)/,   // Cause
    /how\s+(is|are)\s+.*connected/,
    /what.*and.*what/i,           // Multiple aspects
    /reason\s+for/,
    /because/
  ]
  
  for (const pattern of multiHopPatterns) {
    if (pattern.test(q)) {
      return true
    }
  }
  
  // Check for multi-hop question types in LOCOMO
  const hopIndicators = [
    'what fields',
    'what career',
    'what aspect',
    'why did',
    'why did',
    'how did',
    'what made',
    'led to',
    'result in',
    'connected to'
  ]
  
  for (const indicator of hopIndicators) {
    if (q.includes(indicator)) {
      return true
    }
  }
  
  return false
}

/**
 * Extract entity from question
 */
export function extractEntity(question: string): string | null {
  // Match patterns like "What does X..." or "Who is X..."
  const patterns = [
    // Standard: What is/Who is/Where did/When did + [Entity]
    /^(?:What|Who|Where|When|Which|How)\s+(?:is|are|was|were|did|does|do|has|have)\s+([A-Z][a-z]+)/,
    // Possessive: What X's + [Entity]
    /^(?:What|Who|Where|When|Which|How).*?([A-Z][a-z]+)['']s/,
    // About/of: about [Entity] or of [Entity]
    /(?:about|of)\s+([A-Z][a-z]+)\s+(?:and|or|\?)/i,
    // Why/How patterns: "Why did X...", "How did X..."
    /^(?:Why|How)\s+(?:did|do|does)\s+([A-Z][a-z]+)/i,
    // What fields/career patterns: "What fields would Caroline pursue"
    /^what\s+\w+\s+(?:would|could|might|should)\s+([A-Z][a-z]+)/i,
    // What made X: "What made Caroline..."
    /^what\s+(?:made|caused|led)\s+([A-Z][a-z]+)/i
  ]
  
  for (const pattern of patterns) {
    const match = question.match(pattern)
    if (match && match[1] && match[1].length > 1) {  // Avoid single-letter matches
      return match[1]
    }
  }
  
  return null
}

/**
 * Get linked PDS codes for inference chain
 * Returns 4-digit decimal taxonomy codes
 */
export function getLinkedCodes(primaryCode: string): string[] {
  const info = PDS_DOMAIN_MAP[primaryCode]
  if (info) {
    return [primaryCode, ...info.linked]
  }
  
  // Fall back to primary domain (e.g., '1201' → '1000')
  const domain = primaryCode.substring(0, 1) + '000'
  const domainInfo = PDS_DOMAIN_MAP[domain]
  return domainInfo ? [primaryCode, ...domainInfo.linked] : [primaryCode]
}

/**
 * Cross-code fact chain entry
 */
export interface CrossCodeFact {
  subject: string
  predicate: string
  object: string
  pds_decimal: string
  domain_name: string
  linked_from?: string // Which linked domain this came from
  evidence?: string
  valid_from?: string
}

/**
 * Get cross-code facts for an entity WITH ENTITY TRAVERSAL
 * 
 * Entity traversal enables multi-hop reasoning:
 * Melanie → has_relationship_with: kids (object_entity_id) → [kids entity] → likes: dinosaurs
 * 
 * This allows questions like "What do Melanie's kids like?" to find answers
 * by traversing the relationship graph, not just PDS code linkage.
 */
export async function getCrossCodeFacts(
  entity: string,
  topic?: string,
  traverseDepth: number = 1
): Promise<CrossCodeFact[]> {
  const pdsCode = topic ? identifyPDSCode(topic, entity) : identifyPDSCode('', entity)
  const linkedCodes = getLinkedCodes(pdsCode)
  
  try {
    // Get primary entity facts
    const response = await fetch(
      `${MUNINN_API}/api/entities/${encodeURIComponent(entity)}/facts?include_related=true`,
      {
        headers: {
          'Authorization': `Bearer ${MUNINN_KEY}`,
          'X-Organization-ID': ORG_ID
        }
      }
    )
    
    if (!response.ok) {
      console.error(`[InferenceRouter] API error: ${response.status}`)
      return []
    }
    
    const data = await response.json()
    const facts = data.results || data.facts || []
    
    // Filter and categorize facts by PDS code
    const crossCodeFacts: CrossCodeFact[] = []
    const linkedEntities: Set<string> = new Set()
    
    // Relationship predicates that link to other entities
    const relationshipPredicates = [
      'has_child', 'has_children', 'children',
      'has_relationship_with', 'partner', 'spouse', 'married_to',
      'friend_of', 'knows', 'family', 'has_family',
      'identifies_as' // Sometimes links to identity entities
    ]
    
    for (const fact of facts) {
      const factCode = (fact.pds_decimal || '300').substring(0, 3)
      
      // Include facts from linked PDS codes
      if (linkedCodes.includes(factCode)) {
        const domainInfo = PDS_DOMAIN_MAP[factCode]
        
        crossCodeFacts.push({
          subject: fact.subject,
          predicate: fact.predicate,
          object: fact.object,
          pds_decimal: fact.pds_decimal,
          domain_name: domainInfo?.name || 'Unknown',
          linked_from: factCode !== pdsCode ? factCode : undefined,
          evidence: fact.evidence,
          valid_from: fact.valid_from
        })
        
        // Track linked entities for traversal
        if (fact.object_entity_id && traverseDepth > 0) {
          // Only traverse relationship predicates (not all entity references)
          const predLower = fact.predicate.toLowerCase()
          if (relationshipPredicates.some(rp => predLower.includes(rp))) {
            linkedEntities.add(fact.object)
          }
        }
      }
    }
    
    // ENTITY TRAVERSAL: Get facts from linked entities
    if (linkedEntities.size > 0 && traverseDepth > 0) {
      console.log(`[InferenceRouter] Traversing to linked entities: ${[...linkedEntities].join(', ')}`)
      
      for (const linkedEntity of linkedEntities) {
        try {
          const linkedFacts = await getCrossCodeFacts(linkedEntity, topic, traverseDepth - 1)
          
          // Add linked entity facts with traversal marker
          for (const linkedFact of linkedFacts.slice(0, 10)) {
            crossCodeFacts.push({
              ...linkedFact,
              subject: `${entity}'s ${linkedFact.subject}`,
              linked_from: linkedFact.pds_decimal
            })
          }
        } catch (traverseError) {
          console.error(`[InferenceRouter] Traversal error for ${linkedEntity}:`, traverseError)
        }
      }
    }
    
    // Sort by relevance: primary code first, then linked codes
    crossCodeFacts.sort((a, b) => {
      if (a.pds_decimal.startsWith(pdsCode.substring(0, 1)) && !b.pds_decimal.startsWith(pdsCode.substring(0, 1))) return -1
      if (!a.pds_decimal.startsWith(pdsCode.substring(0, 1)) && b.pds_decimal.startsWith(pdsCode.substring(0, 1))) return 1
      return 0
    })
    
    console.log(`[InferenceRouter] Found ${crossCodeFacts.length} facts for ${entity} (+ ${linkedEntities.size} linked entities, depth: ${traverseDepth})`)
    
    return crossCodeFacts
    
  } catch (error) {
    console.error(`[InferenceRouter] Failed: ${error}`)
    return []
  }
}

/**
 * Build a reasoning chain from cross-code facts
 * Creates a narrative chain for multi-hop synthesis
 */
export function buildReasoningChain(
  question: string,
  entity: string,
  crossCodeFacts: CrossCodeFact[]
): string {
  if (crossCodeFacts.length === 0) {
    return `No facts found for ${entity}`
  }
  
  // Group facts by domain for chain construction
  const primaryFacts: CrossCodeFact[] = []
  const linkedFacts: CrossCodeFact[] = []
  
  const primaryCode = identifyPDSCode(question, entity)
  
  for (const fact of crossCodeFacts) {
    if (fact.pds_decimal.startsWith(primaryCode.substring(0, 1))) {
      primaryFacts.push(fact)
    } else {
      linkedFacts.push(fact)
    }
  }
  
  // Build chain: primary facts → linked facts that provide context
  let chain = `${entity} facts:\n\n`
  
  // Primary domain facts
  if (primaryFacts.length > 0) {
    chain += `Core (${PDS_DOMAIN_MAP[primaryCode]?.name || 'Primary'}):\n`
    for (const fact of primaryFacts.slice(0, 5)) {
      chain += `  • ${fact.subject} ${fact.predicate} ${fact.object}\n`
    }
  }
  
  // Linked domain facts (explains "why" or "how")
  if (linkedFacts.length > 0) {
    chain += `\nRelated Context:\n`
    for (const fact of linkedFacts.slice(0, 5)) {
      chain += `  • ${fact.subject} ${fact.predicate} ${fact.object} (${fact.domain_name})\n`
    }
  }
  
  return chain
}

/**
 * Multi-hop prompt template for LLM synthesis
 */
export function createMultiHopPrompt(
  question: string,
  entity: string,
  chain: string
): string {
  return `You are a multi-hop reasoning engine.

Question: ${question}
Entity: ${entity}

Reasoning Chain:
${chain}

Instructions:
- The reasoning chain contains facts from multiple PDS domains linked to ${entity}
- Use the chain to answer the multi-hop question
- If the chain doesn't contain enough info to answer, say "insufficient information"
- Connect the dots: explain HOW you derived the answer from the chain

Answer:`
}

/**
 * Main inference router function
 * Detects multi-hop, gets cross-code facts, returns chain for synthesis
 */
export interface InferenceResult {
  isMultiHop: boolean
  entity: string | null
  primaryPDS: string
  linkedCodes: string[]
  facts: CrossCodeFact[]
  chain: string
  prompt: string
}

export async function routeInference(question: string): Promise<InferenceResult> {
  const entity = extractEntity(question)
  
  if (!entity) {
    return {
      isMultiHop: false,
      entity: null,
      primaryPDS: '300',
      linkedCodes: [],
      facts: [],
      chain: '',
      prompt: ''
    }
  }
  
  const isMultiHop = isMultiHopQuestion(question)
  const primaryPDS = identifyPDSCode(question, entity)
  const linkedCodes = getLinkedCodes(primaryPDS)
  
  // Get cross-code facts
  const facts = isMultiHop ? await getCrossCodeFacts(entity, question) : []
  const chain = buildReasoningChain(question, entity, facts)
  const prompt = isMultiHop ? createMultiHopPrompt(question, entity, chain) : ''
  
  return {
    isMultiHop,
    entity,
    primaryPDS,
    linkedCodes,
    facts,
    chain,
    prompt
  }
}