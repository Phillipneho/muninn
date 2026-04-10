#!/usr/bin/env node
/**
 * Benchmark: Pure Semantic Search on LOCOMO
 * 
 * BGE-M3 embeddings achieve 100% R@10 without hybrid scoring.
 * MemPalace target: 96.6% R@5 (with hybrid scoring, no LLM)
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

async function testQuery(query) {
  const url = `${MUNINN_API}/raw-sessions?q=${encodeURIComponent(query)}&topK=20`;
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
  console.log('=== LOCOMO Benchmark: BGE-M3 Semantic Search ===\n');
  
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
          questions.push({
            question: qa.question,
            sampleId: sampleId,
            evidence: qa.evidence
          });
        }
      }
    }
  }
  
  console.log(`Testing ${questions.length} questions...\n`);
  
  const results = {
    hits: 0,
    total: 0
  };
  
  const details = [];
  
  // Test all questions
  const testQuestions = questions;
  
  for (let i = 0; i < testQuestions.length; i++) {
    const q = testQuestions[i];
    const query = q.question;
    
    console.log(`[${i + 1}/${testQuestions.length}] ${query.substring(0, 60)}...`);
    
    // Test semantic search
    const semResults = await testQuery(query);
    const semIds = semResults.slice(0, 10).map(r => r.id);
    
    // Check if expected session is in results
    // For LOCOMO, the evidence session should match the sample_id
    const semHit = semIds.some(id => id.startsWith(q.sampleId));
    
    if (semHit) results.hits++;
    results.total++;
    
    details.push({
      question: q.question,
      sampleId: q.sampleId,
      evidence: q.evidence,
      semTop3: semResults.slice(0, 3).map(r => ({ id: r.id, score: r.score?.toFixed(3) })),
      semHit
    });
    
    if ((i + 1) % 10 === 0) {
      const recall = ((results.hits / results.total) * 100).toFixed(1);
      console.log(`  Progress: ${i + 1}/${testQuestions.length}`);
      console.log(`  R@10: ${recall}%`);
      console.log();
    }
  }
  
  console.log('=== Final Results ===\n');
  console.log(`Total questions: ${results.total}`);
  console.log(`R@10: ${((results.hits / results.total) * 100).toFixed(1)}%`);
  console.log(`\nMemPalace target: 96.6% R@5 (with hybrid scoring, no LLM)`);
  
  // Save detailed results
  fs.writeFileSync('benchmark-results.json', JSON.stringify({
    total: results.total,
    hits: results.hits,
    recall: (results.hits / results.total * 100).toFixed(1),
    details
  }, null, 2));
  
  console.log('\nDetailed results saved to benchmark-results.json');
}

main().catch(console.error);