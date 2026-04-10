/**
 * Ollama Cloud Answer Synthesis with Workers AI Fallback
 * Uses gemma4:26b for high-quality answer generation
 */

export async function synthesizeAnswerWithOllama(
  query: string,
  facts: Array<{ subject: string; predicate: string; object: string; valid_from?: string }>,
  sessionDate: string,
  apiKey: string,
  ai?: any // Cloudflare AI for fallback
): Promise<{ answer: string; provider: string; model: string }> {
  if (facts.length === 0) {
    return { answer: "Information not found.", provider: "none", model: "none" }
  }
  
  // Build fact context
  const factContext = facts
    .slice(0, 15)
    .map(f => {
      const date = f.valid_from ? ` (${f.valid_from})` : ''
      return `- ${f.subject} ${f.predicate} ${f.object}${date}`
    })
    .join('\n')
  
  // Determine query type for specialized prompt
  const isTemporal = /when|date|time|how long ago|how many years/i.test(query)
  const isCompound = /and|list|all|what activities|what do|what are/i.test(query)
  const isInference = /would.*still|would.*if|if.*would|likely.*because|what would/i.test(query)
  
  let prompt: string
  
  if (isTemporal) {
    prompt = `You are a temporal reasoning engine. Answer questions about WHEN events occurred.

CONTEXT (Facts with dates):
${factContext}

Current date reference: ${sessionDate}

IMPORTANT: 
- Use dates from the facts, NOT the current date
- If a fact shows "2023" in its date, answer with 2023
- NEVER substitute current date for historical facts

Question: ${query}

Answer in ONE concise sentence with the specific date/time from the facts:`
  } else if (isInference) {
    prompt = `You are a counterfactual reasoning engine. Analyze CAUSALITY.

CONTEXT (Facts):
${factContext}

Question: ${query}

Look for causal patterns. Answer in ONE sentence:`
  } else if (isCompound) {
    prompt = `You are a comprehensive information extractor. List ALL relevant items.

CONTEXT (Facts):
${factContext}

Question: ${query}

List ALL items found. Use commas to separate. Answer:`
  } else {
    prompt = `You are a precise fact-based answer engine.

CONTEXT (Facts):
${factContext}

Question: ${query}

Answer in ONE concise sentence using ONLY facts above:`
  }
  
  // Try Ollama Cloud first
  try {
    const response = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gemma4:26b',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { num_ctx: 4096, num_predict: 256, temperature: 0 }
      }),
      signal: AbortSignal.timeout(60000)
    })
    
    if (response.ok) {
      const data = await response.json()
      const answer = data.message?.content?.trim()
      if (answer && answer.length >= 5) {
        return { answer, provider: 'ollama-cloud', model: 'gemma4:26b' }
      }
    }
    
    console.log('[OLLAMA] API error, falling back to Workers AI')
  } catch (error) {
    console.log('[OLLAMA] Error, falling back to Workers AI:', error)
  }
  
  // Fallback to Workers AI
  if (ai) {
    try {
      const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 256
      })
      
      const answer = response.response?.trim()
      if (answer && answer.length >= 5) {
        return { answer, provider: 'workers-ai', model: 'llama-3.1-8b' }
      }
    } catch (error) {
      console.error('[WORKERS-AI] Error:', error)
    }
  }
  
  // Final fallback: simple fact extraction
  const topFact = facts[0]
  if (topFact) {
    return { 
      answer: `${topFact.subject} ${topFact.predicate} ${topFact.object}`, 
      provider: 'fallback', 
      model: 'none' 
    }
  }
  
  return { answer: "Information not found.", provider: 'none', model: 'none' }
}