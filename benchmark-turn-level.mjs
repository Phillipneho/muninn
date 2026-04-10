#!/usr/bin/env node
/**
 * LOCOMO Benchmark: Hybrid vs Semantic Search
 * 
 * Properly matches evidence turns to sessions.
 * Evidence format: "D{n}:{session_id}" where D{n} is turn number.
 * Sessions stored as: conv-{dialogue_idx}:{session_idx}
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

/**
 * Map LOCOMO evidence to session IDs
 * 
 * LOCOMO structure:
 * - sample_id: "conv-26" (dialogue ID)
 * - conversation: { session_1: [...turns], session_2: [...turns], ... }
 * - evidence: ["D1:3", "D2:8"] means turn 3 from session 1, turn 8 from session 2
 * 
 * Stored sessions:
 * - conv-{dialogue_idx}:{session_idx} where dialogue_idx = locomo_idx + offset
 * - For locomo10.json, dialogue 0 is stored as conv-26
 * 
 * We need to find the actual session content that contains turn D{n}:{turn_id}
 */
async function main() {
  console.log('=== LOCOMO Benchmark: Hybrid vs Semantic ===\n');
  
  // Load LOCOMO dataset
  const locomoRaw = fs.readFileSync(LOCOMO_PATH, 'utf-8');
  const locomo = JSON.parse(locomoRaw);
  
  console.log(`Loaded ${locomo.length} dialogues\n`);
  
  // First, get all sessions to build a turn-to-session map
  console.log('Fetching all sessions to build turn map...');
  const allSessionsRes = await fetch(`${MUNINN_API}/raw-sessions?limit=500`, {
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG
    }
  });
  const allSessionsData = await allSessionsRes.json();
  const allSessions = allSessionsData.sessions || [];
  console.log(`Found ${allSessions.length} sessions\n`);
  
  // Build session content map for evidence matching
  // Session IDs are like conv-26:1, conv-26:2, etc.
  const sessionMap = new Map();
  for (const session of allSessions) {
    sessionMap.set(session.id, session);
  }
  
  // Flatten all Q&A pairs with evidence
  const questions = [];
  for (let dialogueIdx = 0; dialogueIdx < locomo.length; dialogueIdx++) {
    const dialogue = locomo[dialogueIdx];
    const sampleId = dialogue.sample_id; // e.g., "conv-26"
    
    if (dialogue.qa) {
      // qa can be array of arrays
      const qaArray = Array.isArray(dialogue.qa[0]) ? dialogue.qa.flat() : dialogue.qa;
      
      for (const qa of qaArray) {
        if (qa.question && qa.evidence && qa.evidence.length > 0) {
          // Evidence format: "D{n}:{turn_id}" where n is session number
          // We need to find which session contains this turn
          const expectedSessions = new Set();
          
          for (const ev of qa.evidence) {
            const match = ev.match(/D(\d+):(\d+)/);
            if (match) {
              const sessionNum = parseInt(match[1]); // Session number within dialogue
              // Sessions are stored as conv-26_1, conv-26_2, etc. (underscore, not colon)
              const sessionId = `${sampleId}_${sessionNum}`;
              expectedSessions.add(sessionId);
            }
          }
          
          if (expectedSessions.size > 0) {
            questions.push({
              question: qa.question,
              evidence: qa.evidence,
              sampleId: sampleId,
              expectedSessions: Array.from(expectedSessions),
              category: qa.category
            });
          }
        }
      }
    }
  }
  
  console.log(`Testing ${questions.length} questions...\n`);
  
  const results = {
    semantic: { hits: 0, total: 0, r1: 0, r5: 0, r10: 0 },
    hybrid: { hits: 0, total: 0, r1: 0, r5: 0, r10: 0 }
  };
  
  // Test first 100 questions
  const testQuestions = questions.slice(0, 100);
  const details = [];
  
  for (let i = 0; i < testQuestions.length; i++) {
    const q = testQuestions[i];
    const query = q.question;
    
    // Test semantic search
    const semResults = await testQuery(query, false);
    const semIds = semResults.slice(0, 20).map(r => r.id);
    
    // Test hybrid search
    const hybridResults = await testQuery(query, true);
    const hybridIds = hybridResults.slice(0, 20).map(r => r.id);
    
    // Check recall at different k values
    const expected = q.expectedSessions;
    
    // Semantic
    const semR1 = expected.some(e => semIds.slice(0, 1).includes(e));
    const semR5 = expected.some(e => semIds.slice(0, 5).includes(e));
    const semR10 = expected.some(e => semIds.slice(0, 10).includes(e));
    
    // Hybrid
    const hybridR1 = expected.some(e => hybridIds.slice(0, 1).includes(e));
    const hybridR5 = expected.some(e => hybridIds.slice(0, 5).includes(e));
    const hybridR10 = expected.some(e => hybridIds.slice(0, 10).includes(e));
    
    results.semantic.r1 += semR1 ? 1 : 0;
    results.semantic.r5 += semR5 ? 1 : 0;
    results.semantic.r10 += semR10 ? 1 : 0;
    results.semantic.total++;
    
    results.hybrid.r1 += hybridR1 ? 1 : 0;
    results.hybrid.r5 += hybridR5 ? 1 : 0;
    results.hybrid.r10 += hybridR10 ? 1 : 0;
    results.hybrid.total++;
    
    details.push({
      question: query.substring(0, 80),
      expected: expected,
      semTop5: semIds.slice(0, 5),
      hybridTop5: hybridIds.slice(0, 5),
      semR10: semR10,
      hybridR10: hybridR10
    });
    
    if ((i + 1) % 10 === 0) {
      console.log(`[${i + 1}/${testQuestions.length}]`);
      console.log(`  Semantic: R@1=${((results.semantic.r1/results.semantic.total)*100).toFixed(0)}% R@5=${((results.semantic.r5/results.semantic.total)*100).toFixed(0)}% R@10=${((results.semantic.r10/results.semantic.total)*100).toFixed(0)}%`);
      console.log(`  Hybrid:   R@1=${((results.hybrid.r1/results.hybrid.total)*100).toFixed(0)}% R@5=${((results.hybrid.r5/results.hybrid.total)*100).toFixed(0)}% R@10=${((results.hybrid.r10/results.hybrid.total)*100).toFixed(0)}%`);
      console.log();
    }
  }
  
  console.log('=== Final Results ===\n');
  console.log(`Total questions: ${results.semantic.total}`);
  console.log();
  console.log('Semantic Search:');
  console.log(`  R@1:  ${((results.semantic.r1/results.semantic.total)*100).toFixed(1)}%`);
  console.log(`  R@5:  ${((results.semantic.r5/results.semantic.total)*100).toFixed(1)}%`);
  console.log(`  R@10: ${((results.semantic.r10/results.semantic.total)*100).toFixed(1)}%`);
  console.log();
  console.log('Hybrid Search:');
  console.log(`  R@1:  ${((results.hybrid.r1/results.hybrid.total)*100).toFixed(1)}%`);
  console.log(`  R@5:  ${((results.hybrid.r5/results.hybrid.total)*100).toFixed(1)}%`);
  console.log(`  R@10: ${((results.hybrid.r10/results.hybrid.total)*100).toFixed(1)}%`);
  console.log();
  console.log('MemPalace target: 96.6% R@5 (no LLM)');
  console.log(`Improvement at R@5: ${((results.hybrid.r5/results.hybrid.total) - (results.semantic.r5/results.semantic.total))*100}pp`);
  
  // Save results
  fs.writeFileSync('benchmark-results-turn.json', JSON.stringify({ results, details }, null, 2));
  console.log('\nDetailed results saved to benchmark-results-turn.json');
}

main().catch(console.error);