/**
 * Single Conversation Benchmark
 * Test V2 extraction on one LOCOMO conversation
 */

const MUNINN_API = process.env.MUNINN_API || 'https://api.muninn.au'
const MUNINN_KEY = process.env.MUNINN_KEY || 'muninn_729186836cbd4aada2352cb4c06c4ef0'
const ORG_ID = process.env.ORG_ID || 'leo-default'

async function main() {
  console.log('[SingleConv] Fetching first LOCOMO conversation...')
  
  // Fetch conversation
  const resp = await fetch('https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json')
  const data = await resp.json()
  const conv = data[0]
  
  console.log(`[SingleConv] Sample ID: ${conv.sample_id}`)
  console.log(`[SingleConv] QA questions: ${conv.qa?.length || 0}`)
  
  // Clear existing data
  console.log('[SingleConv] Clearing existing data...')
  const clearResp = await fetch(`${MUNINN_API}/api/admin/clear?confirm=true`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG_ID
    }
  })
  console.log(`[SingleConv] Clear: ${clearResp.ok ? 'OK' : 'Failed'}`)
  
  // Build conversation text
  const conversationData = conv.conversation
  const speakerA = conversationData.speaker_a || 'SpeakerA'
  const speakerB = conversationData.speaker_b || 'SpeakerB'
  
  let fullConversation = `LOCOMO conv-${conv.sample_id}\n`
  fullConversation += `Speakers: ${speakerA}, ${speakerB}\n\n`
  
  // Extract sessions
  const sessionKeys = Object.keys(conversationData)
    .filter(k => k.startsWith('session_') && !k.includes('_date_time'))
    .sort((a, b) => {
      const numA = parseInt(a.replace('session_', ''))
      const numB = parseInt(b.replace('session_', ''))
      return numA - numB
    })
  
  console.log(`[SingleConv] Found ${sessionKeys.length} sessions`)
  
  for (const sessionKey of sessionKeys.slice(0, 5)) { // First 5 sessions for balance
    const turns = conversationData[sessionKey]
    if (!Array.isArray(turns)) continue
    
    fullConversation += `=== ${sessionKey.toUpperCase()} ===\n`
    for (const turn of turns) {
      fullConversation += `[${turn.speaker}]: ${turn.text}\n`
    }
    fullConversation += '\n'
  }
  
  console.log(`[SingleConv] Conversation length: ${fullConversation.length} chars`)
  
  // Parse LOCOMO date format like "1:56 pm on 8 May, 2023"
  const dateStr = conversationData.session_1_date_time || '2023-05-01'
  let sessionDate = '2023-05-01'
  
  // Try to parse human-readable date
  const dateMatch = dateStr.match(/(\d{1,2})\s+(\w+)\s*,?\s*(\d{4})/i)
  if (dateMatch) {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const day = dateMatch[1].padStart(2, '0')
    const month = (months.findIndex(m => m.toLowerCase() === dateMatch[2].toLowerCase()) + 1).toString().padStart(2, '0')
    const year = dateMatch[3]
    if (month !== '00') {
      sessionDate = `${year}-${month}-${day}`
    }
  } else if (dateStr.includes('T')) {
    // ISO format
    sessionDate = dateStr.split('T')[0]
  }
  
  console.log(`[SingleConv] Session date: ${sessionDate} (parsed from: ${dateStr})`)
  
  console.log('[SingleConv] Ingesting...')
  const ingestStart = Date.now()
  
  const ingestResp = await fetch(`${MUNINN_API}/api/memories`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': ORG_ID
    },
    body: JSON.stringify({
      content: fullConversation,
      type: 'episodic',
      metadata: {
        session_date: sessionDate
      }
    })
  })
  
  const ingestResult = await ingestResp.json()
  const ingestLatency = Date.now() - ingestStart
  
  console.log(`[SingleConv] Ingest complete in ${ingestLatency}ms`)
  console.log(`[SingleConv] Full response:`, JSON.stringify(ingestResult).substring(0, 500))
  console.log(`[SingleConv] Entities: ${ingestResult.extraction?.entities || 0}`)
  console.log(`[SingleConv] Facts: ${ingestResult.extraction?.facts || 0}`)
  
  // Debug: show full extraction result
  if (ingestResult.extraction?.debug) {
    console.log(`[SingleConv] Debug entities: ${ingestResult.extraction.debug.entities?.length || 0}`)
    console.log(`[SingleConv] Debug facts: ${ingestResult.extraction.debug.facts?.length || 0}`)
    console.log(`[SingleConv] Entity map: ${JSON.stringify(ingestResult.extraction.debug.entityMap)}`)
  }
  
  // Show first 5 facts from debug
  if (ingestResult.extraction?.debug?.facts?.length > 0) {
    console.log('\n[SingleConv] Sample facts:')
    for (const fact of ingestResult.extraction.debug.facts.slice(0, 5)) {
      console.log(`  - ${fact.subject} ${fact.predicate} ${fact.object} [${fact.validFrom || 'no date'}]`)
    }
  }
  
  // Run benchmark questions
  console.log('\n[SingleConv] Running benchmark questions...')
  const questions = conv.qa?.slice(0, 10) || []
  
  let correct = 0
  let total = 0
  
  for (const q of questions) {
    const start = Date.now()
    
    // Use /api/answer for synthesized natural language answers
    const queryResp = await fetch(`${MUNINN_API}/api/answer?q=${encodeURIComponent(q.question)}&session_date=${sessionDate}&limit=5`, {
      headers: {
        'Authorization': `Bearer ${MUNINN_KEY}`,
        'X-Organization-ID': ORG_ID
      }
    })
    const result = await queryResp.json()
    const latency = Date.now() - start
    
    const answer = result.answer || '(no answer)'
    const facts = (result.facts || []).slice(0, 3).map((f: any) => `${f.subject} ${f.predicate} ${f.object}`).join('. ')
    
    // Check if answer matches expected
    const expected = String(q.answer).toLowerCase()
    const got = answer.toLowerCase()
    const isCorrect = expected.split(' ').some((w: string) => w.length > 3 && got.includes(w))
    
    if (isCorrect) correct++
    total++
    
    console.log(`\n[Q${total}] ${q.question}`)
    console.log(`    Type: ${['single-hop', 'temporal', 'multi-hop'][q.category - 1] || 'unknown'}`)
    console.log(`    Expected: ${q.answer}`)
    console.log(`    Got: ${answer}`)
    console.log(`    Latency: ${latency}ms`)
    console.log(`    ${isCorrect ? '✓ CORRECT' : '✗ INCORRECT'}`)
  }
  
  console.log('\n' + '=='.repeat(20))
  console.log(`SINGLE CONVERSATION BENCHMARK RESULTS`)
  console.log(`Accuracy: ${correct}/${total} = ${(correct/total*100).toFixed(1)}%`)
  console.log(`Entities extracted: ${ingestResult.extraction?.entities?.length || 0}`)
  console.log(`Facts extracted: ${ingestResult.extraction?.facts?.length || 0}`)
  console.log('=='.repeat(20))
}

main().catch(console.error)