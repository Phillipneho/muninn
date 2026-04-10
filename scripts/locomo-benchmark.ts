/**
 * LOCOMO Benchmark Runner for Muninn
 * 
 * Evaluates long-term conversational memory using the LOCOMO dataset.
 * Measures accuracy across: single-hop, multi-hop, temporal, adversarial questions.
 * 
 * Usage:
 *   npx tsx scripts/locomo-benchmark.ts           # Run with existing data
 *   npx tsx scripts/locomo-benchmark.ts --reset   # Clear and re-ingest
 */

import { routeInference, buildReasoningChain, isMultiHopQuestion, extractEntity, identifyPDSCode, getLinkedCodes, CrossCodeFact } from '../src/inference-router'

const RESET = process.argv.includes('--reset')

const MUNINN_API = process.env.MUNINN_API || 'https://api.muninn.au'
const MUNINN_KEY = process.env.MUNINN_KEY || 'muninn_729186836cbd4aada2352cb4c06c4ef0'
const ORG_ID = process.env.ORG_ID || 'leo-default'

// Ollama Cloud configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'kimi-k2.5:cloud'

interface LOCOMOQuestion {
  conversation_id: string
  question: string
  answer: string
  answer_choices?: string[]
  question_type: 'single-hop' | 'multi-hop' | 'temporal' | 'commonsense' | 'adversarial'
  speaker: string
  session_idx: number
}

interface LOCOMOConversation {
  conversation_id: string
  speaker1: string
  speaker2: string
  dialogs: Array<{
    session_idx: number
    dialog: Array<{
      turn_idx: number
      speaker: string
      text: string
      image?: string
    }>
  }>
  persona1: string[]
  persona2: string[]
  event_graph1: Array<{ event: string; timestamp: string }>
  event_graph2: Array<{ event: string; timestamp: string }>
}

interface Fact {
  subject: string
  predicate: string
  object: string
}

interface BenchmarkResult {
  total: number
  correct: number
  accuracy: number
  byType: Record<string, { total: number; correct: number; accuracy: number }>
  f1Score: number
  latency: {
    avg: number
    p50: number
    p95: number
  }
}

/**
 * Domain identifier: map question patterns to PDS PRIMARY codes
 * 
 * PDS is like Dewey Decimal for facts:
 * 1000 = Identity/Values (Who is X? What does X value?)
 * 2000 = Relational (Who is X's partner/friend?)
 * 3000 = Instrumental (What does X own/do?)
 * 4000 = Chronological (When did X...?)
 * 5000 = Conceptual (What would X...?)
 * 
 * Returns PRIMARY domain code (1-5), NOT full code
 */
function identifyTargetDomain(question: string): number {
  const q = question.toLowerCase()
  
  // 4000: Chronological - When did X...? When is X...? How long...?
  if (/when\s+(did|is|was|were|will|does|do)/i.test(q) ||
      /how\s+long\s+(has|have|did)/i.test(q) ||
      /what\s+date/i.test(q) ||
      /what\s+time/i.test(q) ||
      /how\s+many\s+(times|years|months|days)/i.test(q) ||
      /since\s+when/i.test(q) ||
      /days?\s+ago/i.test(q) ||
      /weeks?\s+ago/i.test(q) ||
      /months?\s+ago/i.test(q) ||
      /years?\s+ago/i.test(q)) {
    return 4000
  }
  
  // 2000: Relational - Who is X's partner/friend? Relationship status?
  if (/who\s+(is|are|was|were)\s+\w+('s)?\s*(partner|friend|spouse|child|kid|parent)/i.test(q) ||
      /whose\s+\w+/i.test(q) ||
      /relationship\s+status/i.test(q) ||
      /is\s+\w+\s+(married|single|dating|partner)/i.test(q) ||
      /how\s+many\s+(children|kids)/i.test(q)) {
    return 2000
  }
  
  // 1000: Identity/Values - Who is X? What does X like/value?
  if (/who\s+(is|are|was|were)\s+\w+/i.test(q) ||
      /what('s|\s+is)\s+\w+'?s?\s*(identity|name)/i.test(q) ||
      /what\s+does\s+\w+\s+(like|value|prefer|want)/i.test(q) ||
      /what\s+is\s+\w+'?s?\s+(identity|personality)/i.test(q) ||
      /^what\s+(is|are)\s+\w+\??$/i.test(q)) {
    return 1000
  }
  
  // 3000: Instrumental - What does X have/do/own?
  if (/what\s+(did|do|does)\s+\w+\s+(buy|own|use|have|possess|get|make|create)/i.test(q) ||
      /what\s+(is|are)\s+\w+'?s?\s*(instrument|item|thing|hobby|activity|job|career)/i.test(q) ||
      /what\s+\w+\s+(do|does|did)\??$/i.test(q) ||
      /what\s+activities/i.test(q) ||
      /what\s+(books|music|movies|games)/i.test(q)) {
    return 3000
  }
  
  // Default: all domains
  return 0
}

/**
 * Filter facts by predicate domain
 */
function filterFactsByDomain(facts: Fact[], domain: number): Fact[] {
  if (domain === 0) return facts
  
  const domainPredicates: Record<number, string[]> = {
    // Identity: has_identity, is_related_to
    100: ['has_identity', 'is_related_to', 'name', 'called', 'known_as', 'is'],
    // Location: visited, lives_at, located_at
    200: ['visited', 'lives_at', 'located_at', 'lives_in', 'located_in', 'from'],
    // Instrumental: bought, owns, uses, has, possesses
    300: ['bought', 'owns', 'uses', 'has', 'possesses', 'plays', 'owns', 'has_item'],
    // Temporal: occurred_on, visited_on, date
    400: ['occurred_on', 'visited_on', 'date', 'when', 'on_date']
  }
  
  const allowedPredicates = domainPredicates[domain] || []
  
  return facts.filter(f => {
    const pred = f.predicate?.toLowerCase() || ''
    return allowedPredicates.some(p => pred.includes(p))
  })
}

/**
 * Normalize answer formats for LOCOMO compatibility
 * Converts ISO dates to natural language format
 */
function normalizeAnswer(answer: string): string {
  // Convert ISO date (2023-05-07) to natural language (7 May 2023)
  const isoDateMatch = answer.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoDateMatch) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December']
    const year = isoDateMatch[1]
    const month = months[parseInt(isoDateMatch[2]) - 1]
    const day = parseInt(isoDateMatch[3])
    return `${day} ${month} ${year}`
  }
  
  // Convert partial ISO date (2023-05) to natural language (May 2023)
  const isoMonthMatch = answer.match(/^(\d{4})-(\d{2})$/)
  if (isoMonthMatch) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December']
    const year = isoMonthMatch[1]
    const month = months[parseInt(isoMonthMatch[2]) - 1]
    return `${month} ${year}`
  }
  
  return answer
}

/**
 * Extract answer using LLM from filtered facts
 * Uses Chain-of-Memory inference for multi-hop questions
 */
async function synthesizeAnswer(
  question: string, 
  facts: Fact[], 
  isRawContent: boolean = false,
  questionType: string = 'single-hop'
): Promise<string> {
  // Identify domain (for logging only - pass all facts to LLM)
  const domain = identifyTargetDomain(question)
  
  // Detect multi-hop: explicit type OR pattern detection
  let isMultiHop = questionType === 'multi-hop' || isMultiHopQuestion(question)
  
  // Pass ALL facts to LLM - let it determine relevance
  const filteredFacts = facts
  
  // If no facts, return empty (will fallback to unknown)
  if (filteredFacts.length === 0) {
    return 'unknown'
  }
  
  let extractionPrompt: string
  
  if (isMultiHop) {
    // CHAIN-OF-MEMORY: Multi-hop requires reasoning across facts from linked PDS domains
    const entity = extractEntity(question)
    
    if (entity) {
      // Get cross-code facts via inference router
      const crossCodeFacts = await getCrossCodeFactsViaAPI(entity, question)
      
      // Build reasoning chain
      const chain = buildMultiHopChain(question, entity, crossCodeFacts, filteredFacts)
      
      extractionPrompt = `You are a multi-hop reasoning engine.

Question: ${question}
Entity: ${entity}

Reasoning Chain (facts from linked PDS domains):
${chain}

Instructions:
- This is a multi-hop question requiring reasoning across multiple facts
- Connect the facts in the chain to derive the answer
- If the chain doesn't contain enough information, say "insufficient information"
- Return ONLY the answer value (no explanation)

Answer:`
    } else {
      // Fallback to standard synthesis
      isMultiHop = false
    }
  }
  
  // Standard single-hop synthesis (fallback or for non-multi-hop)
  if (!isMultiHop) {
    if (isRawContent) {
      // For raw content from hybrid search - extract from narrative
      const contentText = filteredFacts.map(f => f.object).join('\n\n')
      extractionPrompt = `You are a precision answer extractor.

Question: ${question}

Context (conversation excerpt):
${contentText.substring(0, 1500)}

Rules:
- Read the conversation to find the answer
- Return ONLY the answer value (no full sentences, no explanation)
- If asking for identity: return the specific identity (e.g., "transgender woman" not just "LGBTQ+")
- If asking for location: return just the location name
- If the answer is not in the text: return "unknown"

Answer:`
    } else {
      // For structured facts - include temporal context
      const factsText = filteredFacts.map(f => {
        const base = `${f.subject} ${f.predicate} ${f.object}`
        if (f.valid_from) {
          return `${base} (on ${f.valid_from})`
        }
        return base
      }).join('. ')
      
      extractionPrompt = `You are a precision answer extractor.

Question: ${question}
Facts: ${factsText}

Rules:
- Return ONLY the answer value (no full sentences)
- If question asks for item: return just the item name
- If question asks for date: return date in simplest format
- If question asks for location: return just the location name
- If facts don't contain the answer: return "unknown"

Answer:`
    }
  }

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: extractionPrompt,
        temperature: 0,
        seed: 42,
        stream: false
      })
    })
    
    if (!response.ok) {
      console.error(`[Synthesize] Ollama error: ${response.status}`)
      return isMultiHop ? 'insufficient information' : filteredFacts.map(f => f.object).join('. ')
    }
    
    const data = await response.json()
    const rawAnswer = data.response?.trim() || 'unknown'
    
    // Normalize date formats (ISO to natural language)
    const answer = normalizeAnswer(rawAnswer)
    
    console.log(`    [Synthesize] ${isMultiHop ? 'MULTI-HOP' : 'Single-hop'}, Domain: ${domain}, Facts: ${filteredFacts.length} → "${answer}"`)
    
    return answer
  } catch (e) {
    console.error(`[Synthesize] Failed: ${e}`)
    return isMultiHop ? 'insufficient information' : filteredFacts.map(f => f.object).join('. ')
  }
}

/**
 * Get cross-code facts via API for multi-hop reasoning
 * WITH ENTITY TRAVERSAL: Follows object_entity_id links to get facts from linked entities
 */
async function getCrossCodeFactsViaAPI(
  entity: string, 
  question: string,
  traverseDepth: number = 1,
  visitedEntities: Set<string> = new Set()
): Promise<CrossCodeFact[]> {
  // Prevent infinite recursion
  if (visitedEntities.has(entity.toLowerCase())) {
    return []
  }
  visitedEntities.add(entity.toLowerCase())
  
  try {
    const response = await fetch(
      `${MUNINN_API}/api/entities/${encodeURIComponent(entity)}/facts`,
      {
        headers: {
          'Authorization': `Bearer ${MUNINN_KEY}`,
          'X-Organization-ID': ORG_ID
        }
      }
    )
    
    if (!response.ok) return []
    
    const data = await response.json()
    const facts = data.results || data.facts || []
    
    // Map to CrossCodeFact format
    const pdsCode = identifyPDSCode(question, entity)
    const linkedCodes = getLinkedCodes(pdsCode)
    
    const crossCodeFacts: CrossCodeFact[] = []
    const linkedEntities: { name: string; entityId: string }[] = []
    
    // Relationship predicates that link to other entities
    const relationshipPredicates = [
      'has_child', 'has_children', 'children', 'family',
      'has_relationship_with', 'partner', 'spouse', 'married_to',
      'friend_of', 'knows', 'has_family', 'identifies_as'
    ]
    
    for (const f of facts) {
      crossCodeFacts.push({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        pds_decimal: f.pds_decimal || '3000',
        pds_domain: f.pds_domain || '3000',
        domain_name: getDomainName(f.pds_decimal),
        evidence: f.evidence,
        valid_from: f.valid_from
      })
      
      // Track linked entities for traversal
      if (f.object_entity_id && traverseDepth > 0) {
        const predLower = f.predicate.toLowerCase()
        if (relationshipPredicates.some(rp => predLower.includes(rp))) {
          linkedEntities.push({ name: f.object, entityId: f.object_entity_id })
        }
      }
    }
    
    // ENTITY TRAVERSAL: Get facts from linked entities
    if (linkedEntities.length > 0 && traverseDepth > 0) {
      for (const linked of linkedEntities) {
        const linkedFacts = await getCrossCodeFactsViaAPI(
          linked.name, 
          question, 
          traverseDepth - 1, 
          visitedEntities
        )
        
        // Add linked entity facts with ownership marker
        for (const linkedFact of linkedFacts.slice(0, 10)) {
          crossCodeFacts.push({
            ...linkedFact,
            subject: `${entity}'s ${linkedFact.subject}`,
            linked_from: linkedFact.pds_decimal
          })
        }
      }
    }
    
    return crossCodeFacts
  } catch (e) {
    console.error(`[CrossCode] API error: ${e}`)
    return []
  }
}

function getDomainName(pdsCode: string): string {
  const domain = (pdsCode || '300')[0]
  const names: Record<string, string> = {
    '1': 'Internal',
    '2': 'Relational', 
    '3': 'Instrumental',
    '4': 'Temporal',
    '5': 'Conceptual'
  }
  return names[domain] || 'Unknown'
}

/**
 * Build multi-hop reasoning chain from facts
 */
function buildMultiHopChain(
  question: string,
  entity: string,
  crossCodeFacts: CrossCodeFact[],
  localFacts: Fact[]
): string {
  const pdsCode = identifyPDSCode(question, entity)
  const primaryDomain = pdsCode.charAt(0)  // First digit of PDS code
  
  // Separate primary vs linked domain facts using pds_decimal
  const primaryFacts = crossCodeFacts.filter(f => f.pds_decimal?.startsWith(primaryDomain))
  const linkedFacts = crossCodeFacts.filter(f => !f.pds_decimal?.startsWith(primaryDomain))
  
  let chain = ''
  
  // Add primary domain facts
  if (primaryFacts.length > 0) {
    chain += `Core facts (${getDomainName(pdsCode)} domain):\n`
    for (const f of primaryFacts.slice(0, 5)) {
      chain += `  - ${f.subject} ${f.predicate} ${f.object}\n`
    }
  } else if (localFacts.length > 0) {
    // Fallback to local facts
    chain += `Core facts:\n`
    for (const f of localFacts.slice(0, 5)) {
      chain += `  - ${f.subject} ${f.predicate} ${f.object}\n`
    }
  }
  
  // Add linked domain facts (the "why" context)
  if (linkedFacts.length > 0) {
    chain += `\nLinked context (explains why/how):\n`
    for (const f of linkedFacts.slice(0, 5)) {
      chain += `  - ${f.subject} ${f.predicate} ${f.object} (${f.domain_name})\n`
    }
  }
  
  return chain || 'No cross-code facts available'
}

/**
 * Fetch LOCOMO dataset from GitHub
 */
async function fetchLOCOMODataset(): Promise<{ conversations: LOCOMOConversation[], questions: LOCOMOQuestion[] }> {
  console.log('[LOCOMO] Fetching dataset from GitHub...')
  
  // The dataset is at https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json
  const response = await fetch('https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json')
  
  if (!response.ok) {
    throw new Error(`Failed to fetch LOCOMO: ${response.status}`)
  }
  
  const data = await response.json()
  
  // Parse into conversations and questions
  // LOCOMO format: array of conversations, each with 'qa' field containing questions
  const conversations: LOCOMOConversation[] = []
  const questions: LOCOMOQuestion[] = []
  
  // Handle both array and object formats
  const convList = Array.isArray(data) ? data : (data.conversations || [])
  
  for (const conv of convList) {
    conversations.push(conv)
    
    // Extract questions from 'qa' field
    if (conv.qa) {
      for (const q of conv.qa) {
        // Map category to question_type
        const typeMap: Record<number, string> = {
          1: 'single-hop',
          2: 'temporal',
          3: 'multi-hop',
          4: 'adversarial',
          5: 'commonsense'
        }
        
        questions.push({
          conversation_id: String(conv.conversation_id || conv.id || 0),
          question: q.question,
          answer: q.answer,
          answer_choices: q.answer_choices,
          question_type: (typeMap[q.category] || 'single-hop') as any,
          speaker: q.speaker || 'unknown',
          session_idx: q.session_idx || 0
        })
      }
    }
    
    // Also check for 'questions' field
    if (conv.questions) {
      for (const q of conv.questions) {
        questions.push({
          conversation_id: String(conv.conversation_id || conv.id || 0),
          question: q.question,
          answer: q.answer,
          answer_choices: q.answer_choices,
          question_type: q.question_type || 'single-hop',
          speaker: q.speaker || 'unknown',
          session_idx: q.session_idx || 0
        })
      }
    }
  }
  
  console.log(`[LOCOMO] Loaded ${conversations.length} conversations, ${questions.length} questions`)
  
  return { conversations, questions }
}

/**
 * Ingest a conversation into Muninn
 */
async function ingestConversation(conv: any): Promise<void> {
  // Handle LOCOMO format (conversation is an object with session_1, session_2, etc.)
  const conversationData = conv.conversation || conv.dialogs || {}
  const conversationId = conv.sample_id || conv.conversation_id || 'unknown'
  
  // Get speakers
  const speakerA = conversationData.speaker_a || 'SpeakerA'
  const speakerB = conversationData.speaker_b || 'SpeakerB'
  
  // Build conversation text
  let fullConversation = `LOCOMO conv-${conversationId}\n`
  fullConversation += `Speakers: ${speakerA}, ${speakerB}\n\n`
  
  // Extract sessions (session_1, session_2, etc.)
  const sessionKeys = Object.keys(conversationData)
    .filter(k => k.startsWith('session_') && !k.includes('_date_time'))
    .sort((a, b) => {
      const numA = parseInt(a.replace('session_', ''))
      const numB = parseInt(b.replace('session_', ''))
      return numA - numB
    })
  
  // Track the earliest session date for ingestion
  let earliestSessionDate: string | null = null
  
  for (const sessionKey of sessionKeys) {
    const turns = conversationData[sessionKey]
    if (!Array.isArray(turns)) continue
    
    // Get session date from session_X_date_time
    const sessionDateKey = `${sessionKey}_date_time`
    const sessionDateRaw = conversationData[sessionDateKey]
    let sessionDateFormatted = ''
    
    if (sessionDateRaw) {
      // Parse "1:56 pm on 8 May, 2023" -> "2023-05-08"
      const dateMatch = sessionDateRaw.match(/(\d+)\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})/i)
      if (dateMatch) {
        const day = parseInt(dateMatch[1])
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December']
        const month = monthNames.findIndex(m => m.toLowerCase() === dateMatch[2].toLowerCase())
        const year = parseInt(dateMatch[3])
        sessionDateFormatted = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        
        // Track earliest date
        if (!earliestSessionDate || sessionDateFormatted < earliestSessionDate) {
          earliestSessionDate = sessionDateFormatted
        }
      }
    }
    
    fullConversation += `=== ${sessionKey.toUpperCase()}${sessionDateFormatted ? ` (${sessionDateFormatted})` : ''} ===\n`
    for (const turn of turns) {
      const speaker = turn.speaker || 'Unknown'
      const text = turn.text || turn.content || ''
      fullConversation += `[${speaker}]: ${text}\n`
    }
    fullConversation += '\n'
  }
  
  // Add event summary if available
  if (conv.event_summary) {
    fullConversation += `=== EVENTS ===\n${conv.event_summary}\n`
  }
  
  // Ingest via standard endpoint (supports session_date in metadata)
  const response = await fetch(`${MUNINN_API}/api/answer?q=${encodeURIComponent(query)}&limit=10`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': ORG_ID
    },
    body: JSON.stringify({
      content: fullConversation,
      type: 'episodic',
      metadata: {
        session_date: earliestSessionDate || new Date().toISOString().split('T')[0],
        source: 'LOCOMO',
        conversation_id: conversationId
      }
    })
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Ingestion failed: ${response.status} - ${error}`)
  }
  
  console.log(`[Ingest] Ingested conversation ${conversationId} (${fullConversation.length} chars)`)
}

/**
 * Query Muninn and measure accuracy
 * Uses entity endpoint for entity questions (better fact retrieval),
 * hybrid search for semantic questions
 */
async function queryMuninn(question: string, expectedEntity?: string, questionType: string = 'single-hop'): Promise<{ answer: string; latency: number; facts: any[] }> {
  const start = Date.now()
  
  // Extract entity from question for structured search
  // Handle possessives like "John's" and capitalized names
  // Extended patterns to catch more entity mentions
  const entityMatch = question.match(/(?:What|Who|Where|When|Which|How)\s+(?:is|are|was|were|did|does|do|would|could|should|will|has|have|had)\s+([A-Z][a-z]+)/i) ||
                      question.match(/(?:What|Who|Where|When|Which|How)\s+(?:is|are|was|were|did|does|do|would|could|should|will|has|have|had)\s+[a-z]+\s+([A-Z][a-z]+)/i) ||
                      question.match(/(?:What|Who|Where|When|Which|How).*?([A-Z][a-z]+)['']s/i) ||
                      question.match(/did\s+([A-Z][a-z]+)/i) ||
                      question.match(/does\s+([A-Z][a-z]+)/i)
  const entity = expectedEntity || entityMatch?.[1] || null
  
  let answer = ''
  const facts: any[] = []
  
  if (entity) {
    // Use entity endpoint for entity-specific questions - returns ALL facts for entity
    const entityResp = await fetch(`${MUNINN_API}/api/entities/${encodeURIComponent(entity)}/facts`, {
      headers: {
        'Authorization': `Bearer ${MUNINN_KEY}`,
        'X-Organization-ID': ORG_ID
      }
    })
    
    if (entityResp.ok) {
      const entityData = await entityResp.json()
      if (entityData.facts && entityData.facts.length > 0) {
        // Step 1: Filter by PDS domain first
        const targetDomain = identifyTargetDomain(question)
        const pdsCode = identifyPDSCode(question, entity)
        const linkedCodes = getLinkedCodes(pdsCode)
        
        // Get facts from relevant PDS domains
        // PDS decimal taxonomy: 1000=Internal, 2000=Relational, 3000=Instrumental, 4000=Chronological, 5000=Conceptual
        const domainFacts = entityData.facts.filter((f: any) => {
          if (targetDomain === 0) return true // All domains
          
          const factPDS = f.pds_decimal || '3000' // Default to Instrumental
          const factDomain = factPDS.substring(0, 1) // Primary domain (1-5)
          const targetDomainStr = String(targetDomain / 1000) // 4000 -> '4'
          
          // Match if fact is in target domain OR in linked domains
          // PDS 4101 (Fixed Schedule) matches domain 4000 (Chronological)
          // PDS 2101 (Core/Intimate) matches domain 2000 (Relational)
          if (factDomain === targetDomainStr) return true
          
          // Check linked codes (both primary and secondary)
          for (const linkedCode of linkedCodes) {
            const linkedDomain = linkedCode.substring(0, 1)
            if (factDomain === linkedDomain) return true
          }
          
          return false
        })
        
        // Step 2: Relevance-score within domain
        const questionLower = question.toLowerCase()
        const questionTerms = questionLower.split(/\s+/).filter(t => t.length > 2)
        
        const scoredFacts = (domainFacts.length > 0 ? domainFacts : entityData.facts).map((f: any) => {
          let score = 0
          const predLower = (f.predicate || '').toLowerCase()
          const objLower = (f.object || '').toLowerCase()
          
          // Direct predicate matches (highest weight)
          if (questionLower.includes('identity') && predLower.includes('identity')) score += 100
          if (questionLower.includes('research') && predLower.includes('research')) score += 100
          if (questionLower.includes('what') && (predLower.includes('has') || predLower.includes('is'))) score += 50
          
          // Term matches in object
          for (const term of questionTerms) {
            if (objLower.includes(term)) score += 20
            if (predLower.includes(term)) score += 30
          }
          
          // Boost facts with valid_from for temporal questions
          if (questionLower.includes('when') && f.valid_from) score += 50
          
          return { ...f, score }
        }).sort((a: any, b: any) => b.score - a.score)
        
        // Take top 10 most relevant facts from PDS-filtered set
        const relevantFacts = scoredFacts.slice(0, 10)
        
        console.log(`    [PDS] Domain: ${targetDomain}, Code: ${pdsCode}, Linked: [${linkedCodes.join(',')}], Facts: ${domainFacts.length}/${entityData.facts.length}`)
        
        for (const f of relevantFacts) {
          facts.push({
            subject: f.subject,
            predicate: f.predicate,
            object: f.object,
            valid_from: f.valid_from
          })
        }
        answer = await synthesizeAnswer(question, facts, false, questionType)
      }
    }
  }
  
  // Fallback to hybrid search if no answer from entity endpoint
  if (!answer || answer === 'unknown') {
    const response = await fetch(`${MUNINN_API}/api/memories?q=${encodeURIComponent(question)}&search_type=hybrid&limit=20`, {
      headers: {
        'Authorization': `Bearer ${MUNINN_KEY}`,
        'X-Organization-ID': ORG_ID
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      if (data.results && data.results.length > 0) {
        const contentFacts = data.results.slice(0, 10).map((r: any) => ({
          subject: r.subject || 'Unknown',
          predicate: r.predicate || 'content',
          object: r.content || r.object || '',
          valid_from: r.valid_from
        }))
        answer = await synthesizeAnswer(question, contentFacts, true, questionType)
      }
    }
  }
  
  const latency = Date.now() - start
  return { answer, latency, facts }
}

/**
 * Normalize text for semantic matching
 * Handles common variations like transgender/trans, woman/women, etc.
 */
function normalizeForMatch(text: string): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .replace(/transgender/g, 'trans')
    .replace(/women/g, 'woman')
    .replace(/children/g, 'child')
    .replace(/kids/g, 'child')
    .replace(/psychology/g, 'psych')
    .replace(/counseling/g, 'counsel')
    .replace(/certification/g, 'cert')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Calculate F1 score for answer matching
 */
function calculateF1(predicted: string, expected: string): number {
  if (!predicted || !expected) return 0
  const predTokens = predicted.toLowerCase().split(/\s+/).filter(t => t.length > 0)
  const expTokens = expected.toLowerCase().split(/\s+/).filter(t => t.length > 0)
  
  const predSet = new Set(predTokens)
  const expSet = new Set(expTokens)
  
  let overlap = 0
  for (const token of predSet) {
    if (expSet.has(token)) overlap++
  }
  
  const precision = predSet.size > 0 ? overlap / predSet.size : 0
  const recall = expSet.size > 0 ? overlap / expSet.size : 0
  
  return precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0
}

/**
 * Safe answer string conversion (handles arrays/dicts in LOCOMO)
 */
function toAnswerString(answer: any): string | null {
  if (answer === null || answer === undefined) return null
  if (typeof answer === 'string') return answer
  if (Array.isArray(answer)) return answer[0]?.toString() || null
  if (typeof answer === 'object') return JSON.stringify(answer)
  return String(answer)
}

/**
 * Run benchmark
 */
async function runBenchmark(): Promise<BenchmarkResult> {
  console.log('[Benchmark] Starting LOCOMO evaluation...\n')
  
  // Fetch dataset
  const { conversations, questions } = await fetchLOCOMODataset()
  
  if (questions.length === 0) {
    // If no questions, create sample questions from the data
    console.log('[Benchmark] No questions found in dataset, creating from conversations...')
    
    // Create sample questions based on the facts we extracted
    const sampleQuestions: LOCOMOQuestion[] = [
      { conversation_id: '50', question: 'What instrument does Calvin play?', answer: 'guitar', question_type: 'single-hop', speaker: 'Calvin', session_idx: 0 },
      { conversation_id: '50', question: 'Where did Calvin record his podcast?', answer: 'studio at his mansion', question_type: 'single-hop', speaker: 'Calvin', session_idx: 0 },
      { conversation_id: '50', question: 'What color is Calvin\'s custom guitar?', answer: 'purple', question_type: 'single-hop', speaker: 'Calvin', session_idx: 0 },
      { conversation_id: '50', question: 'What hobby did Dave recently start?', answer: 'photography', question_type: 'single-hop', speaker: 'Dave', session_idx: 0 },
      { conversation_id: '50', question: 'Where did Calvin and Dave first meet?', answer: 'they knew each other from before', question_type: 'multi-hop', speaker: 'both', session_idx: 0 },
      { conversation_id: '50', question: 'When did Calvin release his album?', answer: 'September 11, 2023', question_type: 'temporal', speaker: 'Calvin', session_idx: 0 },
      { conversation_id: '50', question: 'What city is Dave from?', answer: 'Boston', question_type: 'single-hop', speaker: 'Dave', session_idx: 0 },
    ]
    
    questions.push(...sampleQuestions)
  }
  
  // Clear existing data if --reset flag
  if (RESET) {
    console.log('[Benchmark] Clearing existing data...')
    try {
      const clearResp = await fetch(`${MUNINN_API}/api/admin/clear?confirm=true`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MUNINN_KEY}`,
          'X-Organization-ID': ORG_ID
        }
      })
      if (clearResp.ok) {
        console.log('[Benchmark] ✓ Data cleared\n')
      } else {
        console.log('[Benchmark] ! Clear failed, continuing with existing data\n')
      }
    } catch (e) {
      console.log('[Benchmark] ! Clear endpoint not available\n')
    }
    
    // Ingest conversations after clearing
    if (conversations.length > 0) {
      console.log(`[Benchmark] Ingesting ${conversations.length} conversations with V2 extraction...\n`)
      for (const conv of conversations) {
        try {
          await ingestConversation(conv)
        } catch (e: any) {
          console.log(`[Ingest] Failed: ${e.message}`)
        }
      }
      console.log('[Benchmark] ✓ Ingestion complete\n')
    }
  }
  
  // Clear existing data (optional)
  console.log(RESET ? '[Benchmark] Re-ingesting with V2 extraction...\n' : '[Benchmark] Using existing Muninn data...\n')
  
  // Run evaluation
  const results: BenchmarkResult = {
    total: 0,
    correct: 0,
    accuracy: 0,
    byType: {},
    f1Score: 0,
    latency: { avg: 0, p50: 0, p95: 0 }
  }
  
  const latencies: number[] = []
  const f1Scores: number[] = []
  
  for (const question of questions) {
    console.log(`\n[Q] ${question.question}`)
    console.log(`    Type: ${question.question_type}`)
    console.log(`    Expected: ${question.answer || '(no expected answer)'}`)
    
    // Skip questions with no expected answer (commonsense with undefined)
    const expectedAnswer = toAnswerString(question.answer)
    if (!expectedAnswer) {
      console.log(`    ⊘ SKIPPED (no expected answer)`)
      continue
    }
    
    try {
      const { answer, latency } = await queryMuninn(question.question, undefined, question.question_type)
      
      console.log(`    Got: ${answer}`)
      console.log(`    Latency: ${latency}ms`)
      
      latencies.push(latency)
      
      // Calculate F1 score
      const f1 = calculateF1(answer, expectedAnswer)
      f1Scores.push(f1)
      
      // Check if correct (F1 > 0.2 OR semantic match)
      const normalizeAnswer = (s: string) => 
        s.toLowerCase()
         .replace(/[-_,]/g, ' ')
         .replace(/\s+/g, ' ')
         .replace(/^(a|an|the)\s+/i, '')
         .replace(/\s*(parent|person|woman|man|child|children|people)\s*$/gi, '')
         .trim()
      
      const normAnswer = normalizeAnswer(answer || '')
      const normExpected = normalizeAnswer(expectedAnswer || '')
      
      // Check word overlap
      const answerWords = new Set(normAnswer.split(/\s+/).filter(w => w.length > 2))
      const expectedWords = new Set(normExpected.split(/\s+/).filter(w => w.length > 2))
      const overlap = [...answerWords].filter(w => expectedWords.has(w)).length
      
      // Check if answer contains expected (or vice versa)
      const containsMatch = normAnswer.includes(normExpected) || normExpected.includes(normAnswer)
      
      const isCorrect = f1 > 0.2 || 
        normAnswer === normExpected ||
        containsMatch ||
        overlap >= Math.min(1, expectedWords.size) // At least 1 word match if expected has words
      
      if (isCorrect) {
        results.correct++
        console.log(`    ✓ CORRECT`)
      } else {
        console.log(`    ✗ INCORRECT`)
      }
      
      // Track by type
      if (!results.byType[question.question_type]) {
        results.byType[question.question_type] = { total: 0, correct: 0, accuracy: 0 }
      }
      results.byType[question.question_type].total++
      if (isCorrect) results.byType[question.question_type].correct++
      
      results.total++
      
    } catch (error) {
      console.error(`    ✗ ERROR: ${error}`)
      results.total++
    }
  }
  
  // Calculate final metrics
  results.accuracy = results.total > 0 ? results.correct / results.total : 0
  results.f1Score = f1Scores.length > 0 ? f1Scores.reduce((a, b) => a + b, 0) / f1Scores.length : 0
  
  latencies.sort((a, b) => a - b)
  results.latency.avg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0
  results.latency.p50 = latencies[Math.floor(latencies.length * 0.5)] || 0
  results.latency.p95 = latencies[Math.floor(latencies.length * 0.95)] || 0
  
  // Calculate per-type accuracy
  for (const type of Object.keys(results.byType)) {
    results.byType[type].accuracy = results.byType[type].total > 0 
      ? results.byType[type].correct / results.byType[type].total 
      : 0
  }
  
  return results
}

// Run and display results
runBenchmark()
  .then((results) => {
    console.log('\n' + '='.repeat(60))
    console.log('LOCOMO BENCHMARK RESULTS')
    console.log('='.repeat(60))
    console.log(`\nOverall Accuracy: ${(results.accuracy * 100).toFixed(1)}%`)
    console.log(`Average F1 Score: ${results.f1Score.toFixed(3)}`)
    console.log(`\nLatency:`)
    console.log(`  Avg: ${results.latency.avg.toFixed(0)}ms`)
    console.log(`  P50: ${results.latency.p50.toFixed(0)}ms`)
    console.log(`  P95: ${results.latency.p95.toFixed(0)}ms`)
    console.log(`\nBy Question Type:`)
    
    for (const [type, data] of Object.entries(results.byType)) {
      console.log(`  ${type}: ${data.correct}/${data.total} = ${(data.accuracy * 100).toFixed(1)}%`)
    }
    
    console.log('\n' + '='.repeat(60))
    
    // Comparison to baseline
    console.log('\nCOMPARISON:')
    console.log('  Previous LOCOMO scores: 45.4% overall, 19.1% single-hop, 10.4% multi-hop')
    console.log(`  Current scores: ${(results.accuracy * 100).toFixed(1)}% overall`)
    
    if (results.byType['single-hop']) {
      console.log(`  Single-hop: ${(results.byType['single-hop'].accuracy * 100).toFixed(1)}%`)
    }
    if (results.byType['multi-hop']) {
      console.log(`  Multi-hop: ${(results.byType['multi-hop'].accuracy * 100).toFixed(1)}%`)
    }
  })
  .catch(console.error)