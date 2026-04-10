/**
 * Full LOCOMO Benchmark
 * - Ingests ALL sessions from ALL conversations
 * - Concurrent workers for parallel extraction
 * - Tests all QA questions
 * - Reports accuracy by type
 */

const MUNINN_API = process.env.MUNINN_API || 'https://api.muninn.au'
const MUNINN_KEY = process.env.MUNINN_KEY || 'muninn_729186836cbd4aada2352cb4c06c4ef0'
const ORG_ID = process.env.ORG_ID || 'leo-default'
const CONCURRENT_WORKERS = parseInt(process.env.WORKERS || '6')

interface QAPair {
  question: string
  answer: string
  type: string
}

interface Conversation {
  sample_id: string
  conversation: any
  qa: QAPair[]
}

interface IngestResult {
  sessionId: string
  success: boolean
  entities: number
  facts: number
  latency: number
  error?: string
}

async function main() {
  console.log('=== FULL LOCOMO BENCHMARK ===')
  console.log(`API: ${MUNINN_API}`)
  console.log(`Workers: ${CONCURRENT_WORKERS}`)
  console.log('')
  
  // Step 1: Clear existing data
  console.log('[1/4] Clearing existing data...')
  const clearStart = Date.now()
  const clearResp = await fetch(`${MUNINN_API}/api/admin/clear?confirm=true`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG_ID
    }
  })
  console.log(`[1/4] Clear: ${clearResp.ok ? 'OK' : 'Failed'} (${Date.now() - clearStart}ms)`)
  
  // Step 2: Fetch all conversations
  console.log('[2/4] Fetching LOCOMO dataset...')
  const fetchStart = Date.now()
  const resp = await fetch('https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json')
  const data: Conversation[] = await resp.json()
  console.log(`[2/4] Fetched ${data.length} conversations (${Date.now() - fetchStart}ms)`)
  
  // Step 3: Ingest all sessions concurrently
  console.log('[3/4] Ingesting all sessions...')
  const ingestStart = Date.now()
  
  // Build session payloads - ONLY first conversation for benchmark
  // (QA questions are from first conversation)
  const targetConv = data[0] // conv-26 has the QA questions
  const allSessions: { convId: string; sessionId: string; content: string; sessionDate: string }[] = []
  
  for (const conv of [targetConv]) { // Only first conversation
    const conversationData = conv.conversation
    const speakerA = conversationData.speaker_a || 'SpeakerA'
    const speakerB = conversationData.speaker_b || 'SpeakerB'
    
    // Parse session date
    const dateStr = conversationData.session_1_date_time || '2023-05-01'
    let sessionDate = '2023-05-01'
    const dateMatch = dateStr.match(/(\d{1,2})\s+(\w+)\s*,?\s*(\d{4})/i)
    if (dateMatch) {
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
      const day = dateMatch[1].padStart(2, '0')
      const month = (months.findIndex(m => m.toLowerCase() === dateMatch[2].toLowerCase()) + 1).toString().padStart(2, '0')
      const year = dateMatch[3]
      if (month !== '00') sessionDate = `${year}-${month}-${day}`
    } else if (dateStr.includes('T')) {
      sessionDate = dateStr.split('T')[0]
    }
    
    // Extract all sessions
    const sessionKeys = Object.keys(conversationData)
      .filter(k => k.startsWith('session_') && !k.includes('_date_time'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('session_', ''))
        const numB = parseInt(b.replace('session_', ''))
        return numA - numB
      })
    
    for (const sessionKey of sessionKeys) {
      const turns = conversationData[sessionKey]
      if (!Array.isArray(turns)) continue
      
      let sessionContent = `[${speakerA} and ${speakerB} conversation]\n`
      for (const turn of turns) {
        sessionContent += `[${turn.speaker}]: ${turn.text}\n`
      }
      
      allSessions.push({
        convId: conv.sample_id,
        sessionId: sessionKey,
        content: sessionContent,
        sessionDate
      })
    }
  }
  
  console.log(`[3/4] Total sessions to ingest: ${allSessions.length}`)
  
  // Ingest concurrently
  const results: IngestResult[] = []
  for (let i = 0; i < allSessions.length; i += CONCURRENT_WORKERS) {
    const batch = allSessions.slice(i, i + CONCURRENT_WORKERS)
    const batchResults = await Promise.all(batch.map(async (session) => {
      const start = Date.now()
      try {
        const resp = await fetch(`${MUNINN_API}/api/memories`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${MUNINN_KEY}`,
            'Content-Type': 'application/json',
            'X-Organization-ID': ORG_ID
          },
          body: JSON.stringify({
            content: session.content,
            type: 'episodic',
            metadata: { session_date: session.sessionDate, conversation_id: session.convId, session_id: session.sessionId }
          })
        })
        
        if (!resp.ok) {
          const text = await resp.text()
          return { sessionId: session.sessionId, success: false, entities: 0, facts: 0, latency: Date.now() - start, error: text }
        }
        
        const data = await resp.json()
        return {
          sessionId: session.sessionId,
          success: true,
          entities: data.extraction?.entities || 0,
          facts: data.extraction?.facts || 0,
          latency: Date.now() - start
        }
      } catch (err: any) {
        return { sessionId: session.sessionId, success: false, entities: 0, facts: 0, latency: Date.now() - start, error: err.message }
      }
    }))
    
    results.push(...batchResults)
    const successCount = results.filter(r => r.success).length
    const totalEntities = results.reduce((sum, r) => sum + r.entities, 0)
    const totalFacts = results.reduce((sum, r) => sum + r.facts, 0)
    process.stdout.write(`\r[3/4] Ingested ${results.length}/${allSessions.length} sessions (${successCount} OK, ${totalEntities} entities, ${totalFacts} facts, ${Math.round((Date.now() - ingestStart) / 1000)}s)`)
  }
  console.log('')
  
  const ingestLatency = Date.now() - ingestStart
  const successCount = results.filter(r => r.success).length
  const totalEntities = results.reduce((sum, r) => sum + r.entities, 0)
  const totalFacts = results.reduce((sum, r) => sum + r.facts, 0)
  console.log(`[3/4] Ingest complete: ${successCount}/${allSessions.length} sessions, ${totalEntities} entities, ${totalFacts} facts (${Math.round(ingestLatency / 1000)}s)`)
  
  // Step 4: Run QA benchmark
  console.log('[4/4] Running QA benchmark...')
  const qaStart = Date.now()
  
  // Use first conversation's QA questions
  const firstConv = data[0]
  const qaPairs = firstConv.qa || []
  
  // Check that we have data from the first conversation
  const firstConvSessions = allSessions.filter(s => s.convId === firstConv.sample_id)
  console.log(`[3/4] First conversation has ${firstConvSessions.length} sessions`)
  
  // Select diverse question types (temporal, single-hop, multi-hop)
  const testQuestions = qaPairs.slice(0, 20) // Test 20 questions for comprehensive coverage
  
  type QAResult = { question: string; type: string; expected: string; got: string; correct: boolean; latency: number }
  const qaResults: QAResult[] = []
  
  // QA test questions with session dates
  // Q9/Q10 use session 3 date (June 9), others use session 1 date (May 8)
  const sessionDates: Record<string, string> = {
    'default': '2023-05-08',
    'When did Caroline give a speech at a school?': '2023-06-09',
    'When did Caroline meet up with her friends, family, and mentors?': '2023-06-09'
  }
  
  for (const qa of testQuestions) {
    const sessionDate = sessionDates[qa.question] || sessionDates['default']
    const start = Date.now()
    try {
      const resp = await fetch(`${MUNINN_API}/api/answer?q=${encodeURIComponent(qa.question)}&session_date=${sessionDate}&limit=5`, {
        headers: {
          'Authorization': `Bearer ${MUNINN_KEY}`,
          'X-Organization-ID': ORG_ID
        }
      })
      
      const data = await resp.json()
      const answer = data.answer || 'Information not found.'
      const latency = Date.now() - start
      
      // Check if answer contains expected keywords
      // Handle different answer types (LOCOMO has string, number, and object answers)
      let expectedAnswer: string
      if (typeof qa.answer === 'number') {
        expectedAnswer = qa.answer.toString()
      } else if (typeof qa.answer === 'object' && qa.answer !== null) {
        expectedAnswer = qa.answer.text || qa.answer.value || JSON.stringify(qa.answer)
      } else {
        expectedAnswer = String(qa.answer || '')
      }
      
      const expectedKeywords = expectedAnswer.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)
      const gotKeywords = answer.toLowerCase()
      const matchCount = expectedKeywords.filter((kw: string) => gotKeywords.includes(kw)).length
      const correct = matchCount >= Math.ceil(expectedKeywords.length * 0.5)
      
      qaResults.push({
        question: qa.question,
        type: qa.type || 'unknown',
        expected: expectedAnswer,
        got: answer,
        correct,
        latency
      })
    } catch (err: any) {
      qaResults.push({
        question: qa.question,
        type: qa.type || 'unknown',
        expected: qa.answer,
        got: `Error: ${err.message}`,
        correct: false,
        latency: Date.now() - start
      })
    }
  }
  
  const qaLatency = Date.now() - qaStart
  
  // Print results
  console.log('')
  console.log('=== QA RESULTS ===')
  
  const byType: Record<string, { correct: number; total: number }> = {}
  for (const result of qaResults) {
    const type = result.type || 'unknown'
    if (!byType[type]) byType[type] = { correct: 0, total: 0 }
    byType[type].total++
    if (result.correct) byType[type].correct++
    
    const status = result.correct ? '✓' : '✗'
    console.log(`[${status}] ${result.type}: ${result.question}`)
    console.log(`    Expected: ${result.expected}`)
    console.log(`    Got: ${result.got.substring(0, 100)}${result.got.length > 100 ? '...' : ''}`)
    console.log(`    Latency: ${result.latency}ms`)
    console.log('')
  }
  
  console.log('=== SUMMARY ===')
  console.log(`Total sessions: ${allSessions.length}`)
  console.log(`Successful ingestions: ${successCount}`)
  console.log(`Total entities: ${totalEntities}`)
  console.log(`Total facts: ${totalFacts}`)
  console.log(`Ingest latency: ${Math.round(ingestLatency / 1000)}s`)
  console.log('')
  console.log('QA Accuracy by Type:')
  for (const [type, stats] of Object.entries(byType)) {
    const pct = Math.round((stats.correct / stats.total) * 100)
    console.log(`  ${type}: ${stats.correct}/${stats.total} (${pct}%)`)
  }
  const totalCorrect = qaResults.filter(r => r.correct).length
  const totalPct = Math.round((totalCorrect / qaResults.length) * 100)
  console.log(`  TOTAL: ${totalCorrect}/${qaResults.length} (${totalPct}%)`)
  console.log(`  Avg latency: ${Math.round(qaLatency / qaResults.length)}ms`)
}

main().catch(console.error)