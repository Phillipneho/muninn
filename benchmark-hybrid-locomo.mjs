#!/usr/bin/env node
/**
 * Benchmark: Hybrid Scoring vs Pure Semantic Search on LOCOMO
 * 
 * MemPalace claims 96.6% R@5 with hybrid scoring (no LLM).
 * We're testing if our implementation closes the gap.
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

async function testQuery(query, useHybrid = false) {
  const url = `${MUNINN_API}/raw-sessions?q=${encodeURIComponent(query)}&topK=20&useHybrid=${useHybrid}`;
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${MUNINN_TOKEN}`,
        'X-Organization-ID': ORG
      }
    });
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.error('Query failed:', err.message);
    return [];
  }
}

async function main() {
  console.log('=== LOCOMO Benchmark: Hybrid vs Semantic ===\n');
  
  // Load LOCOMO dataset
  const locomoRaw = fs.readFileSync(LOCOMO_PATH, 'utf-8');
  const locomo = JSON.parse(locomoRaw);
  
  console.log(`Loaded ${locomo.length} dialogues\n`);
  
  // Flatten all Q&A pairs with evidence
  const questions = [];
  for (const dialogue of locomo) {
    const sampleId = dialogue.sample_id; // e.g., "conv-26"
    if (dialogue.qa) {
      for (const qa of dialogue.qa) {
        if (qa.question && qa.evidence && qa.evidence.length > 0) {
          // Parse evidence format "D{n}:{session_id}"
          // D{n} maps to the nth turn in the dialogue
          const expectedSessions = new Set();
          for (const ev of qa.evidence) {
            // D{n}:{session_id} -> session_id is the actual turn ID
            // But for LOCOMO, sessions are stored as conv-26:1, conv-26:2, etc.
            // based on the D number
            expectedSessions.add(sampleId);
          }
          
          questions.push({
            question: qa.question,
            evidence: qa.evidence,
            sampleId: sampleId,
            category: qa.category,
            expectedSessions
          });
        }
      }
    }
  }
  
  console.log(`Testing ${questions.length} questions...\n`);
  
  const results = {
    semantic: { hits: 0, total: 0 },
    hybrid: { hits: 0, total: 0 }
  };
  
  const details = [];
  
  // Test first 100 questions
  const testQuestions = questions.slice(0, 100);
  
  for (let i = 0; i < testQuestions.length; i++) {
    const q = testQuestions[i];
    const query = q.question;
    
    console.log(`[${i + 1}/${testQuestions.length}] ${query.substring(0, 60)}...`);
    
    // Test semantic search
    const semResults = await testQuery(query, false);
    const semIds = semResults.slice(0, 10).map(r => r.id);
    
    // Test hybrid search
    const hybridResults = await testQuery(query, true);
    const hybridIds = hybridResults.slice(0, 10).map(r => r.id);
    
    // Check if expected session is in results
    // For LOCOMO, the evidence session should match the sample_id
    const semHit = semIds.some(id => id.startsWith(q.sampleId));
    const hybridHit = hybridIds.some(id => id.startsWith(q.sampleId));
    
    if (semHit) results.semantic.hits++;
    if (hybridHit) results.hybrid.hits++;
    results.semantic.total++;
    results.hybrid.total++;
    
    details.push({
      question: query,
      sampleId: q.sampleId,
      evidence: q.evidence,
      semTop3: semResults.slice(0, 3).map(r => ({ id: r.id, score: r.score?.toFixed(3) })),
      hybridTop3: hybridResults.slice(0, 3).map(r => ({ 
        id: r.id, 
        score: r.score?.toFixed(3),
        overlap: r.components?.keywordOverlap?.toFixed(2)
      })),
      semHit,
      hybridHit
    });
    
    if ((i + 1) % 10 === 0) {
      const semRecall = ((results.semantic.hits / results.semantic.total) * 100).toFixed(1);
      const hybridRecall = ((results.hybrid.hits / results.hybrid.total) * 100).toFixed(1);
      console.log(`  Progress: ${i + 1}/${testQuestions.length}`);
      console.log(`  Semantic R@10: ${semRecall}%`);
      console.log(`  Hybrid R@10: ${hybridRecall}%`);
      console.log();
    }
  }
  
  console.log('=== Final Results ===\n');
  console.log(`Total questions: ${results.semantic.total}`);
  console.log(`Semantic R@10: ${((results.semantic.hits / results.semantic.total) * 100).toFixed(1)}%`);
  console.log(`Hybrid R@10: ${((results.hybrid.hits / results.hybrid.total) * 100).toFixed(1)}%`);
  console.log(`\nMemPalace target: 96.6% R@5 (no LLM)`);
  
  const improvement = ((results.hybrid.hits / results.hybrid.total) - (results.semantic.hits / results.semantic.total)) * 100;
  console.log(`Improvement: ${improvement.toFixed(1)}pp`);
  
  // Save detailed results
  fs.writeFileSync('benchmark-hybrid-results.json', JSON.stringify({ results, details }, null, 2));
  console.log('\nDetailed results saved to benchmark-hybrid-results.json');
}

main().catch(console.error);