// LOCOMO Benchmark - With Vectorize Consistency Wait
import { readFileSync } from 'fs';

const DATASET_PATH = './benchmark/locomo10.json';
const API_URL = 'https://api.muninn.au';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = `locomo-final-${Date.now()}`;

const CATEGORY_NAMES: Record<number, string> = {
  1: 'single_hop',
  2: 'temporal',
  3: 'multi_hop',
  4: 'open_domain'
};

async function apiCall(endpoint: string, method: string = 'GET', body?: any, timeoutMs: number = 30000) {
  const url = `${API_URL}/api${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-Organization-ID': ORG_ID
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function runBenchmark() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        LOCOMO Benchmark - With Wait for Vectorize          ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`API: ${API_URL}`);
  console.log(`Org: ${ORG_ID}`);
  console.log(`Started: ${new Date().toISOString()}\n`);
  
  const dataset = JSON.parse(readFileSync(DATASET_PATH, 'utf-8'));
  console.log(`📚 Dataset: ${dataset.length} conversations\n`);
  
  // Prepare memories
  console.log('📋 Preparing memories...');
  const allMemories: any[] = [];
  
  for (let i = 0; i < dataset.length; i++) {
    const conv = dataset[i];
    const conversation = conv.conversation;
    const sessionKeys = Object.keys(conversation)
      .filter(k => k.startsWith('session_') && !k.includes('date_time'))
      .sort((a, b) => parseInt(a.replace('session_', '')) - parseInt(b.replace('session_', '')));
    
    const speakerA = conversation.speaker_a as string;
    const speakerB = conversation.speaker_b as string;
    
    for (const sessionKey of sessionKeys) {
      const sessionData = conversation[sessionKey];
      const sessionDate = conversation[`${sessionKey}_date_time`];
      
      if (!sessionData || !Array.isArray(sessionData)) continue;
      
      const sessionContent = sessionData.map((turn: any) => {
        const speaker = turn.speaker || (turn.speaker_name === 'a' ? speakerA : speakerB);
        const text = turn.text || turn.content || '';
        return `${speaker}: ${text}`;
      }).join('\n');
      
      allMemories.push({
        content: sessionContent,
        type: 'conversation',
        metadata: {
          source: `locomo-${conv.sample_id}`,
          session: sessionKey,
          date: sessionDate,
          conversation_id: conv.sample_id
        }
      });
    }
    console.log(`   Conv ${i + 1}: ${sessionKeys.length} sessions`);
  }
  
  console.log(`\n📊 Total: ${allMemories.length} memories\n`);
  
  // PHASE 1: INGEST
  console.log('═'.repeat(60));
  console.log('PHASE 1: INGESTION');
  console.log('═'.repeat(60));
  
  const ingestStart = Date.now();
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < allMemories.length; i++) {
    try {
      await apiCall('/memories', 'POST', { ...allMemories[i], extractFacts: false });
      success++;
      process.stdout.write('.');
    } catch (e) {
      failed++;
      process.stdout.write('x');
    }
  }
  console.log();
  
  const ingestTime = ((Date.now() - ingestStart) / 1000).toFixed(1);
  console.log(`\n✅ Ingested: ${success}/${allMemories.length} in ${ingestTime}s`);
  console.log(`   Rate: ${(success / parseFloat(ingestTime)).toFixed(1)} memories/sec\n`);
  
  // Wait for Vectorize consistency
  console.log('⏳ Waiting 60s for Vectorize consistency...');
  await sleep(60000);
  console.log('   Done waiting.\n');
  
  // PHASE 2: QUERY
  console.log('═'.repeat(60));
  console.log('PHASE 2: QUERY & SCORE');
  console.log('═'.repeat(60));
  
  const queryStart = Date.now();
  const categoryStats: Record<number, { correct: number; total: number; topScore: number }> = {
    1: { correct: 0, total: 0, topScore: 0 },
    2: { correct: 0, total: 0, topScore: 0 },
    3: { correct: 0, total: 0, topScore: 0 },
    4: { correct: 0, total: 0, topScore: 0 }
  };
  
  let totalCorrect = 0;
  let totalScored = 0;
  let totalScore = 0;
  
  for (let i = 0; i < dataset.length; i++) {
    const conv = dataset[i];
    console.log(`\n📍 Conv ${i + 1}/${dataset.length}: ${conv.sample_id}`);
    
    for (const qa of conv.qa || []) {
      if (qa.category === 5) continue;
      if (qa.answer === null || qa.answer === undefined) continue;
      
      totalScored++;
      const result = await queryAndScore(qa.question, qa.answer);
      
      if (result.correct) {
        totalCorrect++;
        totalScore += result.topScore;
        categoryStats[qa.category].correct++;
        categoryStats[qa.category].topScore += result.topScore;
      }
      categoryStats[qa.category].total++;
      
      const icon = result.correct ? '✅' : '❌';
      const shortQ = qa.question.length > 50 ? qa.question.substring(0, 50) + '...' : qa.question;
      console.log(`  ${icon} [${CATEGORY_NAMES[qa.category]}] ${shortQ}`);
    }
  }
  
  const queryTime = ((Date.now() - queryStart) / 1000).toFixed(1);
  
  // Results
  console.log('\n' + '═'.repeat(60));
  console.log('📊 BENCHMARK RESULTS');
  console.log('═'.repeat(60));
  console.log(`\nOverall: ${totalCorrect}/${totalScored} = ${((totalCorrect / totalScored) * 100).toFixed(1)}%`);
  console.log(`Avg Score: ${(totalScore / totalScored).toFixed(2)}/5`);
  console.log(`\nIngest: ${ingestTime}s (${(success / parseFloat(ingestTime)).toFixed(1)} mem/s)`);
  console.log(`Query: ${queryTime}s (${(totalScored / parseFloat(queryTime)).toFixed(1)} q/s)`);
  console.log(`Total: ${((Date.now() - ingestStart) / 1000).toFixed(1)}s\n`);
  
  console.log('By Category:');
  for (const [cat, stats] of Object.entries(categoryStats)) {
    if (stats.total === 0) continue;
    const pct = ((stats.correct / stats.total) * 100).toFixed(1);
    const avgScore = (stats.topScore / stats.total).toFixed(2);
    console.log(`  ${CATEGORY_NAMES[parseInt(cat)].padEnd(12)}: ${stats.correct}/${stats.total} = ${pct}% (avg: ${avgScore})`);
  }
  
  console.log('\n' + '═'.repeat(60));
}

async function queryAndScore(question: string, expectedAnswer: string): Promise<{ correct: boolean; topScore: number }> {
  const result = await apiCall(`/memories?q=${encodeURIComponent(question)}&search_type=semantic&limit=5`);
  
  if (!result.results || result.results.length === 0) {
    return { correct: false, topScore: 0 };
  }
  
  const normalize = (s: any) => {
    if (typeof s !== 'string') return '';
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  };
  const expected = normalize(expectedAnswer);
  
  for (let i = 0; i < result.results.length; i++) {
    const r = result.results[i];
    const content = normalize(r.content || `${r.subject || ''} ${r.predicate || ''} ${r.object || ''} ${r.evidence || ''}`);
    
    if (content.includes(expected) || expected.includes(content)) {
      return { correct: true, topScore: 5 - i };
    }
    
    const expectedWords = expected.split(' ').filter(w => w.length > 2);
    const contentWords = content.split(' ').filter(w => w.length > 2);
    
    if (expectedWords.length === 0) continue;
    
    const overlap = expectedWords.filter(w => contentWords.includes(w)).length;
    if (overlap >= expectedWords.length * 0.5) {
      return { correct: true, topScore: 3 };
    }
  }
  
  return { correct: false, topScore: 0 };
}

runBenchmark().catch(console.error);
