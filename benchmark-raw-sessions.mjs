#!/usr/bin/env node
/**
 * LOCOMO Benchmark - Raw Sessions Architecture (MemPal-style)
 * 
 * Based on MemPal findings:
 * - Store verbatim sessions (no extraction)
 * - Semantic search on embeddings
 * - Preserve session_date (CRITICAL for temporal queries)
 * 
 * Expected accuracy: 85-90% baseline
 * With reranker: 95-100%
 */

import fs from 'fs';

const CF_ACCOUNT = 'f41284de76d5ead189b5b3500a08173f';
const CF_TOKEN = 'cfat_vlGGORiFHhoq5nB5hy7pQohd2HDLBcjUb5E0lzo37784962b';
const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';
const DATA_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const RESULTS_PATH = '/home/homelab/.openclaw/workspace/memory/raw-sessions-benchmark.json';

/**
 * Load LOCOMO questions
 */
function loadQuestions(data) {
  const questions = [];
  
  for (const conv of data) {
    for (const qa of conv.qa || []) {
      questions.push({
        question: qa.question,
        answer: qa.answer,
        sampleId: conv.sample_id,
        category: qa.category || 1
      });
    }
  }
  
  return questions;
}

/**
 * Query raw sessions
 */
async function queryRawSessions(question) {
  const res = await fetch(`${MUNINN_API}/raw-sessions?q=${encodeURIComponent(question)}&top_k=10`, {
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': ORG
    }
  });
  
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  
  return await res.json();
}

/**
 * Generate answer using Claude (or Gemma)
 */
async function generateAnswer(question, sessions) {
  // Build context from top sessions
  const context = sessions.results
    .slice(0, 5)  // Use top 5
    .map((s, i) => `[Session ${i+1} - ${s.session_date}]\n${s.content}`)
    .join('\n\n---\n\n');
  
  const prompt = `Answer the question based on the session context.

Question: ${question}

Context:
${context}

Instructions:
- Answer based ONLY on the provided context
- If the context doesn't contain the answer, say "Information not found"
- For temporal questions, use the session dates
- Be concise and specific

Answer:`;
  
  // Use Cloudflare AI for answer synthesis
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/meta/llama-3.1-8b-instruct`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0
    })
  });
  
  if (!res.ok) {
    throw new Error(`AI error: ${res.status}`);
  }
  
  const data = await res.json();
  return data.result?.response || '';
}

/**
 * Evaluate answer
 */
function evaluateAnswer(expected, actual) {
  // Normalize both
  const normalize = (s) => s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .sort()
    .join(' ');
  
  const exp = normalize(expected);
  const act = normalize(actual);
  
  // Exact match
  if (exp === act) return true;
  
  // Contains expected keywords
  const expWords = new Set(exp.split(' '));
  const actWords = new Set(act.split(' '));
  
  // At least 80% of expected words present
  let matches = 0;
  for (const w of expWords) {
    if (actWords.has(w)) matches++;
  }
  
  return matches / expWords.size >= 0.8;
}

/**
 * Run benchmark
 */
async function run() {
  console.log('=== LOCOMO Benchmark - Raw Sessions Architecture ===\n');
  
  // Load data
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const questions = loadQuestions(data);
  
  console.log(`Questions: ${questions.length}`);
  console.log(`Categories: ${new Set(questions.map(q => q.category)).size}`);
  console.log('');
  
  // Run benchmark
  const results = {
    total: questions.length,
    correct: 0,
    by_category: {},
    errors: [],
    started: new Date().toISOString()
  };
  
  for (let i = 0; i < questions.length; i++) {
    const qa = questions[i];
    const cat = qa.category || 1;
    
    if (!results.by_category[cat]) {
      results.by_category[cat] = { total: 0, correct: 0 };
    }
    results.by_category[cat].total++;
    
    try {
      // Step 1: Semantic search on raw sessions
      const searchResults = await queryRawSessions(qa.question);
      
      if (!searchResults.results || searchResults.results.length === 0) {
        results.errors.push({
          question: qa.question,
          error: 'No sessions found'
        });
        console.log(`❌ [${cat}] ${qa.question.substring(0, 50)}...`);
        continue;
      }
      
      // Step 2: Generate answer from context
      const answer = await generateAnswer(qa.question, searchResults);
      
      // Step 3: Evaluate
      const correct = evaluateAnswer(qa.answer, answer);
      
      if (correct) {
        results.correct++;
        results.by_category[cat].correct++;
        console.log(`✅ [${cat}] ${qa.question.substring(0, 50)}...`);
      } else {
        console.log(`❌ [${cat}] ${qa.question.substring(0, 50)}...`);
        results.errors.push({
          question: qa.question,
          expected: qa.answer,
          got: answer.substring(0, 100),
          category: cat
        });
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 200));
      
    } catch (err) {
      results.errors.push({
        question: qa.question,
        error: err.message
      });
      console.log(`❌ [${cat}] ${qa.question.substring(0, 50)}... ERROR: ${err.message}`);
    }
  }
  
  results.accuracy = ((results.correct / results.total) * 100).toFixed(2);
  results.completed = new Date().toISOString();
  
  // Summary
  console.log('\n=== RESULTS ===');
  console.log(`Total: ${results.total}`);
  console.log(`Correct: ${results.correct}`);
  console.log(`Accuracy: ${results.accuracy}%`);
  console.log('\nBy Category:');
  for (const [cat, stats] of Object.entries(results.by_category)) {
    console.log(`  Cat ${cat}: ${stats.correct}/${stats.total} (${((stats.correct/stats.total)*100).toFixed(1)}%)`);
  }
  
  // Save results
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${RESULTS_PATH}`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});