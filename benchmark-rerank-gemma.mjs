/**
 * LOCOMO Retrieval with Gemma Reranking
 * 
 * 1. Semantic search gets top 20 candidates
 * 2. Gemma reranks them by relevance
 * 3. Measure R@1, R@5, R@10, R@20
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';
const DATA_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

// Use gemma4:31b-cloud (external API) instead of local gemma3:4b which is slow
const GEMMA_MODEL = 'gemma4:31b-cloud';

/**
 * Parse evidence field to get session IDs
 */
function parseEvidence(evidence, sampleId) {
  if (!evidence || !Array.isArray(evidence)) return [];
  
  return evidence.map(e => {
    const match = e.match(/D(\d+):(\d+)/);
    if (match) {
      return `${sampleId}:${match[2]}`;
    }
    return null;
  }).filter(Boolean);
}

/**
 * Rerank candidates using Gemma (cloud endpoint for gemma4:31b-cloud)
 */
async function rerankWithGemma(question, candidates, model = GEMMA_MODEL) {
  if (!candidates || candidates.length === 0) return candidates;
  
  // Build prompt
  const passages = candidates.map((c, i) => 
    `[${i + 1}] ${c.content.substring(0, 500)}`
  ).join('\n\n');

  try {
    // gemma4:31b-cloud uses Ollama cloud endpoint
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: `Which passage most directly answers this question? Reply with just the number (1-${candidates.length}).

Question: ${question}

Passages:
${passages}

Answer with just the number:`
        }],
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 10
        }
      })
    });
    
    const data = await res.json();
    const response = data.message?.content?.trim() || '';
    
    // Parse number from response
    const numMatch = response.match(/(\d+)/);
    if (numMatch) {
      const rank = parseInt(numMatch[1]);
      if (rank >= 1 && rank <= candidates.length) {
        // Move ranked item to front
        const ranked = candidates[rank - 1];
        const rest = candidates.filter((_, i) => i !== rank - 1);
        return [ranked, ...rest];
      }
    }
    
    // If no valid rank, return original order
    return candidates;
  } catch (e) {
    console.error('Gemma rerank error:', e.message);
    return candidates;
  }
}

/**
 * Main benchmark
 */
async function run() {
  console.log('=== LOCOMO Retrieval + Gemma Reranking ===\n');
  console.log('Using gemma4:31b-cloud for reranking\n');
  
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  
  let totalQuestions = 0;
  let validQuestions = 0;
  
  const recallAt = { 1: 0, 5: 0, 10: 0, 20: 0 };
  const byCategory = { 1: {t:0, r1:0, r5:0, r10:0}, 2: {t:0, r5:0, r10:0}, 3: {t:0, r5:0, r10:0}, 4: {t:0, r5:0, r10:0}, 5: {t:0, r5:0, r10:0} };
  
  const startTime = Date.now();
  
  for (let convIdx = 0; convIdx < data.length; convIdx++) {
    const conv = data[convIdx];
    const convId = conv.sample_id || `conv-${convIdx + 1}`;
    
    for (const qa of conv.qa || []) {
      totalQuestions++;
      const category = qa.category || 1;
      byCategory[category].t++;
      
      // Parse ground truth from evidence field
      const groundTruthIds = parseEvidence(qa.evidence, convId);
      
      if (groundTruthIds.length === 0) {
        continue;
      }
      
      validQuestions++;
      
      try {
        // Semantic search for top 20
        const searchRes = await fetch(`${MUNINN_API}/raw-sessions?q=${encodeURIComponent(qa.question)}&top_k=20`, {
          headers: {
            'Authorization': `Bearer ${MUNINN_TOKEN}`,
            'X-Organization-ID': ORG
          }
        });
        
        const searchData = await searchRes.json();
        
        if (!searchData.results?.length) {
          console.log(`[${validQuestions}] ❌ No search results`);
          continue;
        }
        
        // Rerank with Gemma
        const reranked = await rerankWithGemma(qa.question, searchData.results);
        
        // Check if ground truth sessions are in top-k
        const resultIds = reranked.map(r => r.id);
        const found = {
          1: groundTruthIds.some(gt => resultIds.slice(0, 1).includes(gt)),
          5: groundTruthIds.some(gt => resultIds.slice(0, 5).includes(gt)),
          10: groundTruthIds.some(gt => resultIds.slice(0, 10).includes(gt)),
          20: groundTruthIds.some(gt => resultIds.slice(0, 20).includes(gt))
        };
        
        if (found[1]) { recallAt[1]++; byCategory[category].r1++; }
        if (found[5]) { recallAt[5]++; byCategory[category].r5++; }
        if (found[10]) { recallAt[10]++; byCategory[category].r10++; }
        if (found[20]) { recallAt[20]++; }
        
        const marker = found[1] ? '✅' : (found[5] ? '🔶' : (found[10] ? '🔶' : '❌'));
        
        console.log(`[${validQuestions}] ${marker} [${category}] ${qa.question.substring(0, 35)}...`);
        console.log(`    Ground truth: ${groundTruthIds.join(', ')}`);
        console.log(`    Top result: ${reranked[0].id} (score: ${reranked[0].score?.toFixed(3) || 'N/A'})`);
        console.log(`    Found@k: 1=${found[1]?1:0} 5=${found[5]?1:0} 10=${found[10]?1:0} 20=${found[20]?1:0}`);
        
      } catch (e) {
        console.log(`[${validQuestions}] ❌ Error: ${e.message}`);
      }
      
      // Progress every 20 questions
      if (validQuestions % 20 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const r10 = ((recallAt[10] / validQuestions) * 100).toFixed(1);
        console.log(`\n--- Progress: ${validQuestions} valid, R@10: ${r10}%, ${elapsed.toFixed(0)}s ---\n`);
      }
      
      // No delay - Gemma is local
    }
  }
  
  const elapsed = (Date.now() - startTime) / 1000;
  
  console.log('\n=== Final Results ===');
  console.log(`Total questions: ${totalQuestions}`);
  console.log(`Valid questions (with evidence): ${validQuestions}`);
  console.log(`\nRecall@k:`);
  console.log(`  R@1:  ${recallAt[1]}/${validQuestions} (${((recallAt[1]/validQuestions)*100).toFixed(1)}%)`);
  console.log(`  R@5:  ${recallAt[5]}/${validQuestions} (${((recallAt[5]/validQuestions)*100).toFixed(1)}%)`);
  console.log(`  R@10: ${recallAt[10]}/${validQuestions} (${((recallAt[10]/validQuestions)*100).toFixed(1)}%)`);
  console.log(`  R@20: ${recallAt[20]}/${validQuestions} (${((recallAt[20]/validQuestions)*100).toFixed(1)}%)`);
  
  console.log(`\nBy Category:`);
  for (let c = 1; c <= 5; c++) {
    const cat = byCategory[c];
    if (cat.t > 0) {
      console.log(`  ${c} (n=${cat.t}): R@1=${cat.r1>0?((cat.r1/cat.t)*100).toFixed(0):0}% R@5=${((cat.r5/cat.t)*100).toFixed(0)}% R@10=${((cat.r10/cat.t)*100).toFixed(0)}%`);
    }
  }
  
  console.log(`\nTime: ${elapsed.toFixed(1)}s`);
  console.log(`Speed: ${(elapsed/validQuestions).toFixed(2)}s per question`);
  
  console.log(`\n=== Comparison ===`);
  console.log(`Semantic only: 26.7% R@10`);
  console.log(`Gemma rerank:  ${((recallAt[10]/validQuestions)*100).toFixed(1)}% R@10`);
  console.log(`MemPal target: 88.9% R@10`);
}

run().catch(e => console.error('Error:', e));