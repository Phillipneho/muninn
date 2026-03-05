// Muninn v2 Simple Benchmark
// - Local Ollama for answer generation (no OpenAI)
// - 30s timeout per question
// - Progress logging after every question
// - Checkpoint every conversation
// - Works offline

import { Muninn } from './index-unified.js';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';

const DATASET_PATH = './benchmark/locomo10.json';
const DB_PATH = '/tmp/locomo-benchmark.db';
const CHECKPOINT_PATH = '/tmp/locomo-checkpoint.json';

const CATEGORY_NAMES: Record<number, string> = {
  1: 'single_hop',
  2: 'temporal',
  3: 'multi_hop',
  4: 'open_domain'
};

const QUESTION_TIMEOUT_MS = 30000; // 30 seconds per question

interface Checkpoint {
  conversationIndex: number;
  totalCorrect: number;
  totalScored: number;
  categoryStats: Record<number, { correct: number; total: number }>;
  startTime: number;
}

// Score answer with flexible matching
function scoreAnswer(answer: string, expected: string): boolean {
  if (!answer || !expected) return false;
  
  const normalize = (s: string) => s.toLowerCase().trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
  
  const a = normalize(answer);
  const e = normalize(expected);
  
  if (a === e) return true;
  if (a.includes(e)) return true;
  if (e.includes(a)) return true;
  
  // Word overlap
  const aWords = new Set(a.split(' ').filter(w => w.length > 2));
  const eWords = new Set(e.split(' ').filter(w => w.length > 2));
  
  if (aWords.size === 0 || eWords.size === 0) return false;
  
  const overlap = [...aWords].filter(w => eWords.has(w)).length;
  return overlap >= Math.min(aWords.size, eWords.size) * 0.6;
}

// Generate answer using local Ollama
async function generateAnswer(query: string, facts: any[]): Promise<string> {
  if (!facts || facts.length === 0) {
    return "I don't have information about that.";
  }
  
  // Build fact string
  const factStr = facts.slice(0, 5).map(f => {
    const subj = f.subjectEntityId || f.subject || 'Unknown';
    const pred = f.predicate || 'related to';
    const obj = f.objectValue || f.objectEntityId || f.object || 'unknown';
    return `- ${subj} ${pred} ${obj}`;
  }).join('\n');
  
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5:1.5b',
        prompt: `Answer this question using ONLY the facts below. Be concise.

Facts:
${factStr}

Question: ${query}

Answer:`,
        stream: false,
        options: { num_predict: 50 }
      })
    });
    
    if (!response.ok) {
      return "I don't have information about that.";
    }
    
    const data = await response.json() as { response?: string };
    return data.response?.trim() || "I don't have information about that.";
  } catch (e) {
    // Ollama not available, use simple extraction
    return facts[0]?.objectValue || facts[0]?.object || "I don't have information about that.";
  }
}

// Timeout wrapper
async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    )
  ]);
}

// Save checkpoint
function saveCheckpoint(cp: Checkpoint): void {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

// Load checkpoint
function loadCheckpoint(): Checkpoint | null {
  if (existsSync(CHECKPOINT_PATH)) {
    return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf-8'));
  }
  return null;
}

// Clear checkpoint
function clearCheckpoint(): void {
  if (existsSync(CHECKPOINT_PATH)) {
    unlinkSync(CHECKPOINT_PATH);
  }
}

async function runBenchmark() {
  console.log('=== LOCOMO Benchmark - Simple Runner ===');
  console.log(`Started: ${new Date().toISOString()}\n`);
  
  // Load dataset
  const dataset = JSON.parse(readFileSync(DATASET_PATH, 'utf-8'));
  console.log(`Dataset: ${dataset.length} conversations`);
  
  // Count questions
  let totalQuestions = 0;
  let scorableQuestions = 0;
  for (const conv of dataset) {
    for (const qa of conv.qa) {
      totalQuestions++;
      if (qa.answer !== null && qa.answer !== undefined) {
        scorableQuestions++;
      }
    }
  }
  console.log(`Total questions: ${totalQuestions}`);
  console.log(`Scorable questions: ${scorableQuestions}\n`);
  
  // Initialize or resume
  let checkpoint = loadCheckpoint();
  let startFromConv = checkpoint?.conversationIndex || 0;
  let totalCorrect = checkpoint?.totalCorrect || 0;
  let totalScored = checkpoint?.totalScored || 0;
  const categoryStats: Record<number, { correct: number; total: number }> = checkpoint?.categoryStats || {
    1: { correct: 0, total: 0 },
    2: { correct: 0, total: 0 },
    3: { correct: 0, total: 0 },
    4: { correct: 0, total: 0 }
  };
  
  if (checkpoint) {
    console.log(`📂 Resuming from conversation ${startFromConv + 1}`);
    console.log(`   Progress so far: ${totalCorrect}/${totalScored} (${((totalCorrect/totalScored)*100).toFixed(1)}%)\n`);
  }
  
  // Initialize Muninn
  const muninn = new Muninn(DB_PATH);
  
  // Handle graceful shutdown
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n\n⚠️ Graceful shutdown...');
    console.log(`   Progress: ${totalCorrect}/${totalScored} (${((totalCorrect/totalScored)*100).toFixed(1)}%)`);
    saveCheckpoint({
      conversationIndex: startFromConv,
      totalCorrect,
      totalScored,
      categoryStats,
      startTime: checkpoint?.startTime || Date.now()
    });
    muninn.close();
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  // Process conversations
  for (let i = startFromConv; i < dataset.length && !shuttingDown; i++) {
    const conv = dataset[i];
    const convId = conv.sample_id || `conv-${i}`;
    console.log(`\n📍 Conversation ${i + 1}/${dataset.length}: ${convId}`);
    
    // Extract sessions
    const convData = conv.conversation || conv;
    const sessionKeys = Object.keys(convData)
      .filter(k => k.match(/^session_\d+$/))
      .sort((a, b) => parseInt(a.replace('session_', '')) - parseInt(b.replace('session_', '')));
    
    console.log(`📚 Found ${sessionKeys.length} sessions`);
    
    // Ingest sessions
    for (const sessionKey of sessionKeys) {
      const sessionNum = sessionKey.replace('session_', '');
      const dateKey = `session_${sessionNum}_date_time`;
      const sessionDate = convData[dateKey] || '2024-01-01';
      const sessionData = convData[sessionKey];
      
      if (!Array.isArray(sessionData)) continue;
      
      const speakerA = convData.speaker_a || 'A';
      const speakerB = convData.speaker_b || 'B';
      
      const content = sessionData.map((turn: any) => {
        const speaker = turn.speaker || (turn.speaker_name === 'a' ? speakerA : speakerB);
        const text = turn.text || turn.content || '';
        return `${speaker}: ${text}`;
      }).join('\n');
      
      try {
        await withTimeout(() => muninn.remember(content, { source: 'locomo', sessionDate }), 60000);
      } catch (e: any) {
        console.log(`   ⚠️ Session ${sessionNum} timeout/error: ${e.message}`);
      }
    }
    
    // Process questions
    const qaList = conv.qa || [];
    console.log(`   Questions: ${qaList.length}`);
    
    for (let j = 0; j < qaList.length && !shuttingDown; j++) {
      const qa = qaList[j];
      const question = qa.question;
      const expected = (() => {
        if (qa.answer === null || qa.answer === undefined) return '';
        if (Array.isArray(qa.answer)) return qa.answer.join(' ');
        if (typeof qa.answer === 'number') return String(qa.answer);
        return String(qa.answer);
      })();
      
      if (!expected) continue;
      
      const category = qa.category || 0;
      if (!categoryStats[category]) {
        categoryStats[category] = { correct: 0, total: 0 };
      }
      
      let answer: string;
      try {
        const result = await withTimeout(() => muninn.recall(question), QUESTION_TIMEOUT_MS);
        answer = await withTimeout(() => generateAnswer(question, result.facts || []), 10000);
      } catch (e: any) {
        answer = "I don't have information about that.";
        if (e.message?.includes('Timeout')) {
          console.log(`   ⏱️ Timeout: "${question.substring(0, 30)}..."`);
        }
      }
      
      const passed = scoreAnswer(answer, expected);
      categoryStats[category].total++;
      totalScored++;
      
      if (passed) {
        categoryStats[category].correct++;
        totalCorrect++;
        console.log(`✅ [${CATEGORY_NAMES[category] || category}] "${question.substring(0, 40)}..."`);
      } else {
        console.log(`❌ [${CATEGORY_NAMES[category] || category}] "${question.substring(0, 40)}..."`);
      }
      
      // Log progress every 10 questions
      if (totalScored % 10 === 0) {
        const pct = ((totalCorrect / totalScored) * 100).toFixed(1);
        console.log(`   📊 Progress: ${totalCorrect}/${totalScored} (${pct}%)`);
      }
    }
    
    // Checkpoint after conversation
    startFromConv = i + 1;
    const duration = ((Date.now() - (checkpoint?.startTime || Date.now())) / 1000 / 60).toFixed(1);
    const accuracy = totalScored > 0 ? ((totalCorrect / totalScored) * 100).toFixed(1) : '0.0';
    console.log(`\n   ✅ Conversation ${i + 1} complete`);
    console.log(`   📊 Accuracy: ${accuracy}% (${totalCorrect}/${totalScored})`);
    console.log(`   ⏱️ Duration: ${duration} minutes`);
    
    saveCheckpoint({
      conversationIndex: startFromConv,
      totalCorrect,
      totalScored,
      categoryStats,
      startTime: checkpoint?.startTime || Date.now()
    });
  }
  
  // Final results
  const totalDuration = ((Date.now() - (checkpoint?.startTime || Date.now())) / 1000 / 60).toFixed(1);
  const finalAccuracy = totalScored > 0 ? ((totalCorrect / totalScored) * 100).toFixed(1) : '0.0';
  
  console.log('\n=== Final Results ===');
  console.log(`Questions Scored: ${totalScored}`);
  console.log(`Correct: ${totalCorrect}`);
  console.log(`Accuracy: ${finalAccuracy}%`);
  console.log(`Duration: ${totalDuration} minutes\n`);
  
  console.log('By Category:');
  for (let i = 1; i <= 4; i++) {
    const cat = categoryStats[i] || { correct: 0, total: 0 };
    const pct = cat.total > 0 ? ((cat.correct / cat.total) * 100).toFixed(1) : '0.0';
    console.log(`  ${i}. ${CATEGORY_NAMES[i]}: ${cat.correct}/${cat.total} (${pct}%)`);
  }
  
  // Save results
  writeFileSync('./benchmark-results-latest.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    totalQuestions,
    scorableQuestions,
    questionsScored: totalScored,
    correct: totalCorrect,
    accuracy: parseFloat(finalAccuracy),
    categories: categoryStats,
    duration: totalDuration
  }, null, 2));
  
  clearCheckpoint();
  muninn.close();
  console.log('\n✅ Benchmark complete!');
}

runBenchmark().catch(e => {
  console.error('Benchmark failed:', e);
  process.exit(1);
});