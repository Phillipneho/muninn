/**
 * Gemma Reranker for Raw Sessions
 * 
 * Uses Ollama Gemma 3 4B to re-score semantic search results.
 * Based on MemPal architecture which achieves 88.9-100% accuracy.
 */

const OLLAMA_API = 'http://localhost:11434/api';
const RERANK_MODEL = 'gemma3:4b';

/**
 * Rerank sessions using Gemma
 * 
 * @param question - User's question
 * @param sessions - Top-k sessions from semantic search
 * @param topN - Number of sessions to return after reranking
 * @returns Reranked sessions with Gemma scores
 */
export async function rerankSessions(
  question: string,
  sessions: Array<{id: string, content: string, score: number}>,
  topN: number = 10
): Promise<Array<{id: string, content: string, score: number, gemma_score: number}>> {
  
  if (sessions.length === 0) {
    return [];
  }
  
  // Rerank each session individually for simplicity
  // Could batch in future for efficiency
  const reranked = [];
  
  for (const session of sessions.slice(0, 20)) { // Only rerank top-20
    const gemmaScore = await getGemmaRelevanceScore(question, session.content);
    reranked.push({
      ...session,
      gemma_score: gemmaScore
    });
  }
  
  // Sort by Gemma score (descending)
  reranked.sort((a, b) => b.gemma_score - a.gemma_score);
  
  // Return top N
  return reranked.slice(0, topN);
}

/**
 * Get relevance score from Gemma (0-10)
 */
async function getGemmaRelevanceScore(question: string, context: string): Promise<number> {
  const prompt = `Rate how relevant this context is to answering the question.

Question: ${question}

Context (first 500 chars): ${context.substring(0, 500)}

Instructions:
- Rate relevance on a scale of 0 to 10
- 10 = Context directly contains the answer
- 5 = Context is somewhat related
- 0 = Context is not related at all
- Reply with ONLY a single number (0-10), no other text

Rating:`;

  try {
    const res = await fetch(`${OLLAMA_API}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: RERANK_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0,
          num_predict: 5
        }
      })
    });
    
    if (!res.ok) {
      console.error('Gemma error:', res.status);
      return 5; // Default score
    }
    
    const data = await res.json();
    const response = data.response?.trim() || '5';
    
    // Extract number from response
    const scoreMatch = response.match(/\d+/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[0]);
      return Math.max(0, Math.min(10, score)); // Clamp 0-10
    }
    
    return 5; // Default if parsing fails
  } catch (e) {
    console.error('Gemma rerank error:', e);
    return 5; // Default score on error
  }
}

/**
 * Answer synthesis using Gemma
 */
export async function synthesizeAnswer(
  question: string,
  sessions: Array<{content: string, session_date: string}>
): Promise<string> {
  
  // Build context from top sessions
  const context = sessions
    .slice(0, 3)
    .map((s, i) => `[Session ${i+1} - ${s.session_date}]\n${s.content.substring(0, 1000)}`)
    .join('\n\n---\n\n');
  
  const prompt = `Answer the question based on the session context.

Question: ${question}

Context:
${context}

Instructions:
- Answer based ONLY on the provided context
- If the context doesn't contain the answer, say "Information not found"
- For temporal questions, use the session dates
- Be concise and specific (2-3 sentences max)

Answer:`;

  try {
    const res = await fetch(`${OLLAMA_API}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: RERANK_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0,
          num_predict: 200
        }
      })
    });
    
    if (!res.ok) {
      throw new Error(`Gemma error: ${res.status}`);
    }
    
    const data = await res.json();
    return data.response?.trim() || 'Unable to generate answer';
  } catch (e) {
    console.error('Answer synthesis error:', e);
    return 'Error generating answer';
  }
}