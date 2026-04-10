/**
 * LOCOMO Benchmark - MemPal-style with Gemma 4 31B Cloud
 * 
 * Uses MemPal's approach:
 * 1. Semantic search to get top-20 sessions
 * 2. LLM rerank to pick the best session
 * 3. F1 score for evaluation
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';
const OLLAMA_API = 'http://localhost:11434/api';
const RERANK_MODEL = 'gemma4:31b-cloud';
const DATA_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

/**
 * Load questions from LOCOMO data
 */
function loadQuestions(data) {
  const questions = [];
  for (const conv of data) {
    for (const qa of conv.qa || []) {
      questions.push({
        question: qa.question,
        answer: qa.answer,
        category: qa.category || 1
      });
    }
  }
  return questions;
}

/**
 * MemPal-style F1 score
 */
function f1Score(prediction, groundTruth) {
  const normalize = s => s
    .replace(/,/g, '')
    .replace(/\b(a|an|the|and)\b/gi, ' ')
    .replace(/[^\w\s]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/);
  
  const predTokens = normalize(prediction);
  const truthTokens = normalize(groundTruth);
  
  if (!predTokens.length || !truthTokens.length) {
    return predTokens.length === truthTokens.length ? 1.0 : 0.0;
  }
  
  const predCounts = {};
  const truthCounts = {};
  
  for (const t of predTokens) predCounts[t] = (predCounts[t] || 0) + 1;
  for (const t of truthTokens) truthCounts[t] = (truthCounts[t] || 0) + 1;
  
  let common = 0;
  for (const t in predCounts) {
    if (truthCounts[t]) {
      common += Math.min(predCounts[t], truthCounts[t]);
    }
  }
  
  if (common === 0) return 0.0;
  
  const precision = common / predTokens.length;
  const recall = common / truthTokens.length;
  return (2 * precision * recall) / (precision + recall);
}

/**
 * MemPal-style LLM rerank
 * Ask LLM to pick the single best session
 */
async function llmRerank(question, sessions, topK = 10) {
  if (sessions.length <= 1) return sessions;
  
  // Build numbered list (MemPal-style)
  const candidates = sessions.slice(0, 20);
  const lines = candidates.map((s, i) => 
    `${i + 1}. [${s.id}] ${s.content.substring(0, 300).replace(/\n/g, ' ')}`
  ).join('\n');
  
  const prompt = `Question: ${question}

Which of the following passages most directly answers this question?
Reply with just the number (1-${candidates.length}).

${lines}`;

  try {
    const res = await fetch(`${OLLAMA_API}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: RERANK_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0, num_predict: 3 }
      })
    });
    
    const data = await res.json();
    const match = (data.response || '1').match(/\b(\d+)\b/);
    const pick = match ? parseInt(match[0]) : 1;
    
    console.log(`    Rerank: picked #${pick} (Gemma 4 31B)`);
    
    // Reorder: picked session first
    if (pick >= 1 && pick <= candidates.length) {
      const chosen = candidates[pick - 1];
      const rest = candidates.filter((s, i) => i !== pick - 1);
      return [chosen, ...rest].slice(0, topK);
    }
    
    return candidates.slice(0, topK);
  } catch (e) {
    console.error('    Rerank error:', e.message);
    return sessions.slice(0, topK);
  }
}

/**
 * Synthesize answer from top sessions
 */
async function synthesizeAnswer(question, sessions) {
  const context = sessions
    .slice(0, 3)
    .map(s => `[Session]\n${s.content.substring(0, 1500)}`)
    .join('\n\n---\n\n');
  
  const prompt = `Answer the question based on the session context.

Question: ${question}

Context:
${context.substring(0, 3000)}

Instructions:
- Answer based ONLY on the provided context
- For temporal questions (when, dates), quote the exact date from context
- If multiple dates mentioned, prefer the most specific one
- If context doesn't contain the answer, say "Information not found"
- Be concise (1-2 sentences)

Answer:`;

  try {
    const res = await fetch(`${OLLAMA_API}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: RERANK_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0, num_predict: 150 }
      })
    });
    
    const data = await res.json();
    return data.response?.trim() || 'Unable to generate answer';
  } catch (e) {
    console.error('Answer synthesis error:', e.message);
    return 'Error generating answer';
  }
}

/**
 * Main benchmark
 */
async function run() {
  console.log('=== LOCOMO Benchmark - MemPal-style with Gemma 4 31B ===\n');
  console.log('Model:', RERANK_MODEL);
  console.log('Evaluation: F1 score (MemPal-style)');
  console.log('');
  
  // Load data
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const questions = loadQuestions(data);
  
  console.log('Questions:', questions.length);
  console.log('Testing first 30 questions...\n');
  
  let correct = 0;
  let total = 0;
  let f1Sum = 0;
  const byCategory = { 1: {c:0,t:0}, 2: {c:0,t:0}, 3: {c:0,t:0}, 4: {c:0,t:0}, 5: {c:0,t:0} };
  
  const startTime = Date.now();
  
  for (let i = 0; i < Math.min(30, questions.length); i++) {
    const qa = questions[i];
    total++;
    byCategory[qa.category].t++;
    
    try {
      // Step 1: Semantic search
      const searchRes = await fetch(`${MUNINN_API}/raw-sessions?q=${encodeURIComponent(qa.question)}&top_k=20`, {
        headers: {
          'Authorization': `Bearer ${MUNINN_TOKEN}`,
          'X-Organization-ID': ORG
        }
      });
      
      const searchData = await searchRes.json();
      
      if (!searchData.results?.length) {
        console.log(`[${i+1}] ❌ [${qa.category}] No results`);
        continue;
      }
      
      console.log(`[${i+1}] [${qa.category}] ${qa.question.substring(0, 40)}...`);
      console.log(`    Search: ${searchData.results.length} sessions`);
      
      // Step 2: LLM rerank (MemPal-style)
      const reranked = await llmRerank(qa.question, searchData.results, 10);
      
      // Step 3: Synthesize answer
      const answer = await synthesizeAnswer(qa.question, reranked);
      
      // Step 4: Evaluate with F1
      const f1 = f1Score(answer, qa.answer);
      f1Sum += f1;
      
      const isCorrect = f1 >= 0.5; // F1 >= 0.5 counts as correct
      if (isCorrect) {
        correct++;
        byCategory[qa.category].c++;
      }
      
      console.log(`    Expected: ${String(qa.answer).substring(0, 40)}`);
      console.log(`    Got: ${answer.substring(0, 50)}`);
      console.log(`    F1: ${f1.toFixed(2)} ${isCorrect ? '✅' : '❌'}`);
      console.log('');
      
      await new Promise(r => setTimeout(r, 100));
      
    } catch (e) {
      console.log(`[${i+1}] ❌ Error: ${e.message}`);
    }
    
    // Progress every 10 questions
    if (i > 0 && i % 10 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`--- Progress: ${i}/${total} (${((correct/total)*100).toFixed(0)}%) - ${elapsed.toFixed(0)}s ---\n`);
    }
  }
  
  const elapsed = (Date.now() - startTime) / 1000;
  
  console.log('\n=== Final Results ===');
  console.log(`Correct: ${correct}/${total}`);
  console.log(`Accuracy: ${((correct/total)*100).toFixed(1)}%`);
  console.log(`Avg F1: ${(f1Sum/total).toFixed(3)}`);
  console.log(`Time: ${elapsed.toFixed(1)}s`);
  console.log(`Speed: ${(elapsed/total).toFixed(1)}s per question`);
  console.log('\nBy Category:');
  for (let c = 1; c <= 5; c++) {
    const cat = byCategory[c];
    if (cat.t > 0) {
      console.log(`  ${c}: ${cat.c}/${cat.t} (${((cat.c/cat.t)*100).toFixed(0)}%)`);
    }
  }
}

run().catch(e => console.error('Error:', e));