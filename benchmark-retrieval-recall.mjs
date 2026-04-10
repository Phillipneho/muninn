/**
 * LOCOMO Retrieval Recall - Using Evidence Field
 * 
 * Uses LOCOMO's ground truth evidence field to measure retrieval accuracy.
 * Evidence: ['D1:3'] = Dialogue 1, Session 3
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';
const DATA_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

/**
 * Parse evidence field to get session IDs
 * Evidence: ['D1:3', 'D2:8'] = Dialogue 1 Session 3, Dialogue 2 Session 8
 * 
 * LOCOMO format:
 * - D1 = first dialogue in data array (which has sample_id like 'conv-26')
 * - :3 = session 3 within that dialogue
 * 
 * Our ID format: 'conv-26:3' = sample_id:session_num
 */
function parseEvidence(evidence, sampleId) {
  if (!evidence || !Array.isArray(evidence)) return [];
  
  return evidence.map(e => {
    const match = e.match(/D(\d+):(\d+)/);
    if (match) {
      // D1 means first dialogue (index 0), not literal '1'
      // sampleId is the actual ID like 'conv-26'
      return {
        dialogue: parseInt(match[1]),
        session: parseInt(match[2]),
        id: `${sampleId}:${match[2]}`  // Use sample_id, not D number
      };
    }
    return null;
  }).filter(Boolean);
}

/**
 * Main benchmark
 */
async function run() {
  console.log('=== LOCOMO Retrieval Recall (Evidence-Based) ===\n');
  console.log('Using LOCOMO ground truth evidence field\n');
  
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
      // Pass sample_id to map D1 to actual conv ID
      const groundTruth = parseEvidence(qa.evidence, convId);
      
      if (groundTruth.length === 0) {
        // Skip adversarial/undefined questions
        continue;
      }
      
      validQuestions++;
      
      try {
        // Semantic search
        const searchRes = await fetch(`${MUNINN_API}/raw-sessions?q=${encodeURIComponent(qa.question)}&top_k=20`, {
          headers: {
            'Authorization': `Bearer ${MUNINN_TOKEN}`,
            'X-Organization-ID': ORG
          }
        });
        
        const searchData = await searchRes.json();
        
        if (!searchData.results?.length) {
          console.log(`[${validQuestions}] ❌ [${category}] ${qa.question.substring(0, 40)}...`);
          console.log(`    No search results`);
          console.log(`    Ground truth: ${groundTruth.map(g => g.id).join(', ')}`);
          continue;
        }
        
        // Check if ground truth sessions are in top-k
        const resultIds = searchData.results.map(r => r.id);
        const found = {
          1: groundTruth.some(gt => resultIds.slice(0, 1).includes(gt.id)),
          5: groundTruth.some(gt => resultIds.slice(0, 5).includes(gt.id)),
          10: groundTruth.some(gt => resultIds.slice(0, 10).includes(gt.id)),
          20: groundTruth.some(gt => resultIds.slice(0, 20).includes(gt.id))
        };
        
        if (found[1]) { recallAt[1]++; byCategory[category].r1++; }
        if (found[5]) { recallAt[5]++; byCategory[category].r5++; }
        if (found[10]) { recallAt[10]++; byCategory[category].r10++; }
        if (found[20]) { recallAt[20]++; }
        
        const marker = found[1] ? '✅' : (found[5] ? '🔶' : (found[10] ? '🔶' : '❌'));
        
        console.log(`[${validQuestions}] ${marker} [${category}] ${qa.question.substring(0, 35)}...`);
        console.log(`    Ground truth: ${groundTruth.map(g => g.id).join(', ')}`);
        console.log(`    Top result: ${searchData.results[0].id} (score: ${searchData.results[0].score?.toFixed(3) || 'N/A'})`);
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
      
      await new Promise(r => setTimeout(r, 30));
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
  
  console.log(`\n=== MemPal Comparison ===`);
  console.log(`MemPal R@10: 88.9%`);
  console.log(`Our R@10: ${((recallAt[10]/validQuestions)*100).toFixed(1)}%`);
  console.log(`Gap: ${(88.9 - (recallAt[10]/validQuestions)*100).toFixed(1)} percentage points`);
}

run().catch(e => console.error('Error:', e));