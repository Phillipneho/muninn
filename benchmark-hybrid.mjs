#!/usr/bin/env node
/**
 * Benchmark: Hybrid Scoring vs Pure Semantic Search
 * 
 * MemPal claims 96.6% R@5 with hybrid scoring (no LLM).
 * We're at 26.7% R@10 with pure semantic search.
 * 
 * This benchmark tests if adding MemPal-style hybrid scoring
 * closes the gap.
 * 
 * Usage: node benchmark-hybrid.mjs
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

// Parse evidence format "D{n}:{session_id}" to session index
function parseEvidence(evidence) {
  const match = evidence.match(/D(\d+):(.+)/);
  if (!match) return null;
  const sessionIdx = parseInt(match[1]);
  const sessionId = match[2];
  // LOCOMO uses 1-indexed D, so conv-N = sessionIdx + 25
  return {
    sessionIdx,
    sessionId,
    convId: `conv-${sessionIdx + 25}`
  };
}

async function main() {
  console.log('=== Hybrid Scoring Benchmark ===\n');
  
  // Load LOCOMO dataset
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf-8'));
  const questions = locomo.slice(0, 100); // Test on first 100 questions
  
  console.log(`Testing ${questions.length} questions...\n`);
  
  let correctSem = 0;
  let correctHybrid = 0;
  let total = 0;
  
  for (const q of questions) {
    const query = q.question || q.query;
    const evidence = q.evidence || q.gold_evidence || [];
    
    if (!query || evidence.length === 0) continue;
    
    // Parse expected session IDs
    const expected = new Set(
      evidence
        .map(e => parseEvidence(e))
        .filter(p => p !== null)
        .map(p => p.convId)
    );
    
    if (expected.size === 0) continue;
    
    // Test pure semantic search
    const semUrl = `${MUNINN_API}/raw-sessions?q=${encodeURIComponent(query)}&topK=10&useHybrid=false`;
    const semRes = await fetch(semUrl, {
      headers: {
        'Authorization': `Bearer ${MUNINN_TOKEN}`,
        'X-Organization-ID': ORG
      }
    });
    const semData = await semRes.json();
    
    const semHits = (semData.results || semData.sessions || [])
      .filter(s => expected.has(s.session_id || s.id))
      .length;
    
    if (semHits > 0) correctSem++;
    
    // Test hybrid search
    const hybridUrl = `${MUNINN_API}/raw-sessions?q=${encodeURIComponent(query)}&topK=10&useHybrid=true`;
    const hybridRes = await fetch(hybridUrl, {
      headers: {
        'Authorization': `Bearer ${MUNINN_TOKEN}`,
        'X-Organization-ID': ORG
      }
    });
    const hybridData = await hybridRes.json();
    
    const hybridHits = (hybridData.results || hybridData.sessions || [])
      .filter(s => expected.has(s.session_id || s.id))
      .length;
    
    if (hybridHits > 0) correctHybrid++;
    
    total++;
    
    if (total % 10 === 0) {
      const semRecall = ((correctSem / total) * 100).toFixed(1);
      const hybridRecall = ((correctHybrid / total) * 100).toFixed(1);
      console.log(`Progress: ${total}/${questions.length}`);
      console.log(`  Semantic: ${semRecall}% R@10`);
      console.log(`  Hybrid: ${hybridRecall}% R@10`);
      console.log();
    }
  }
  
  console.log('=== Final Results ===\n');
  console.log(`Total questions: ${total}`);
  console.log(`Semantic R@10: ${((correctSem / total) * 100).toFixed(1)}%`);
  console.log(`Hybrid R@10: ${((correctHybrid / total) * 100).toFixed(1)}%`);
  console.log(`\nMemPal target: 96.6% R@5 (no LLM)`);
  console.log(`Our semantic baseline: 26.7% R@10`);
  console.log(`Improvement: ${(((correctHybrid / total) - (correctSem / total)) * 100).toFixed(1)}pp`);
}

main().catch(console.error);