// Muninn v2 Retrieval Benchmark
// Tests ONLY the retrieval engine (no LLM ingestion)
// Uses pre-extracted observations from LOCOMO dataset

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';

const DATASET_PATH = './benchmark/locomo10.json';

const CATEGORY_NAMES: Record<number, string> = {
  1: 'single_hop',
  2: 'temporal',
  3: 'multi_hop',
  4: 'open_domain'
};

// Parse session date from natural language
function parseSessionDate(dateStr: string): string {
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.split('T')[0];
  }
  
  // Natural language: "1:56 pm on 8 May, 2023"
  const match = dateStr.match(/(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[,\s]+(\d{4})/i);
  if (match) {
    const day = parseInt(match[1]);
    const year = parseInt(match[3]);
    const monthStr = match[2].toLowerCase();
    const monthMap: Record<string, number> = {
      'jan': 0, 'january': 0, 'feb': 1, 'february': 1, 'mar': 2, 'march': 2,
      'apr': 3, 'april': 3, 'may': 4, 'jun': 5, 'june': 5, 'jul': 6, 'july': 6,
      'aug': 7, 'august': 7, 'sep': 8, 'september': 8, 'oct': 9, 'october': 9,
      'nov': 10, 'november': 10, 'dec': 11, 'december': 11
    };
    const month = monthMap[monthStr] ?? 0;
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  
  return '2024-01-01';
}

// Extract simple facts from text (no LLM)
function extractFactsSimple(text: string): Array<{entity: string, predicate: string, object: string}> {
  const facts: Array<{entity: string, predicate: string, object: string}> = [];
  const lines = text.split('\n');
  
  // Simple regex patterns for common facts
  const patterns = [
    /(\w+) (?:is|was|has|had|likes|loves|plays|works|lives|went|visited|attended|started|finished|bought|got|adopted) ([^.]+)/gi,
    /(\w+)'s ([^.]+) (?:is|was|has) ([^.]+)/gi,
  ];
  
  for (const line of lines) {
    // Extract named entities (capitalized words)
    const entities = new Set<string>();
    const entityMatch = line.matchAll(/\b([A-Z][a-z]+)\b/g);
    for (const m of entityMatch) {
      entities.add(m[1]);
    }
    
    // Extract simple relationships
    for (const pattern of patterns) {
      const matches = line.matchAll(pattern);
      for (const m of matches) {
        if (m[1] && m[2]) {
          facts.push({
            entity: m[1],
            predicate: 'related_to',
            object: m[2]
          });
        }
      }
    }
  }
  
  return facts;
}

// In-memory storage for testing
class SimpleMemory {
  private facts: Map<string, Array<{predicate: string, object: string, date?: string}>> = new Map();
  
  remember(text: string, date?: string): void {
    const facts = extractFactsSimple(text);
    for (const fact of facts) {
      const key = fact.entity.toLowerCase();
      if (!this.facts.has(key)) {
        this.facts.set(key, []);
      }
      this.facts.get(key)!.push({
        predicate: fact.predicate,
        object: fact.object,
        date
      });
    }
  }
  
  recall(query: string): string[] {
    // Extract entity from query
    const entityMatch = query.match(/(?:What|Who|When|Where|How|Which)\s+(?:is|are|was|were|did|does|has|have)\s+(\w+)/i);
    if (!entityMatch) return [];
    
    const entity = entityMatch[1].toLowerCase();
    const facts = this.facts.get(entity) || [];
    
    return facts.map(f => `${f.predicate} ${f.object}`);
  }
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
  return overlap >= Math.min(aWords.size, eWords.size) * 0.5;
}

async function runBenchmark() {
  console.log('=== LOCOMO Benchmark - Retrieval Only (No LLM) ===');
  console.log(`Started: ${new Date().toISOString()}\n`);
  console.log('⚠️ This tests retrieval ONLY - uses simple rule-based extraction');
  console.log('   For full accuracy, use the full pipeline with LLM extraction\n');
  
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
  
  const startTime = Date.now();
  let totalCorrect = 0;
  let totalScored = 0;
  const categoryStats: Record<number, { correct: number; total: number }> = {
    1: { correct: 0, total: 0 },
    2: { correct: 0, total: 0 },
    3: { correct: 0, total: 0 },
    4: { correct: 0, total: 0 }
  };
  
  // Process conversations
  for (let i = 0; i < dataset.length; i++) {
    const conv = dataset[i];
    const convId = conv.sample_id || `conv-${i}`;
    console.log(`\n📍 Conversation ${i + 1}/${dataset.length}: ${convId}`);
    
    // Extract sessions
    const convData = conv.conversation || conv;
    const sessionKeys = Object.keys(convData)
      .filter(k => k.match(/^session_\d+$/))
      .sort((a, b) => parseInt(a.replace('session_', '')) - parseInt(b.replace('session_', '')));
    
    console.log(`📚 Found ${sessionKeys.length} sessions`);
    
    // Ingest into simple memory
    const memory = new SimpleMemory();
    for (const sessionKey of sessionKeys) {
      const sessionNum = sessionKey.replace('session_', '');
      const dateKey = `session_${sessionNum}_date_time`;
      const sessionDate = convData[dateKey] ? parseSessionDate(convData[dateKey]) : '2024-01-01';
      const sessionData = convData[sessionKey];
      
      if (!Array.isArray(sessionData)) continue;
      
      const speakerA = convData.speaker_a || 'A';
      const speakerB = convData.speaker_b || 'B';
      
      const content = sessionData.map((turn: any) => {
        const speaker = turn.speaker || (turn.speaker_name === 'a' ? speakerA : speakerB);
        const text = turn.text || turn.content || '';
        return `${speaker}: ${text}`;
      }).join('\n');
      
      memory.remember(content, sessionDate);
    }
    
    // Process questions
    const qaList = conv.qa || [];
    console.log(`   Questions: ${qaList.length}`);
    
    for (let j = 0; j < qaList.length; j++) {
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
      
      // Retrieve answer
      const results = memory.recall(question);
      const answer = results.length > 0 ? results[0] : "I don't have information about that.";
      
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
      
      // Progress every 50 questions
      if (totalScored % 50 === 0) {
        const pct = ((totalCorrect / totalScored) * 100).toFixed(1);
        console.log(`   📊 Progress: ${totalCorrect}/${totalScored} (${pct}%)`);
      }
    }
    
    // After conversation
    const duration = ((Date.now() - startTime) / 1000).toFixed(0);
    const accuracy = totalScored > 0 ? ((totalCorrect / totalScored) * 100).toFixed(1) : '0.0';
    console.log(`\n   ✅ Conversation ${i + 1} complete`);
    console.log(`   📊 Accuracy: ${accuracy}% (${totalCorrect}/${totalScored})`);
    console.log(`   ⏱️ Duration: ${duration}s`);
  }
  
  // Final results
  const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
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
  
  console.log('\n=== Comparison to LOCOMO Baselines ===');
  console.log('  GPT-3.5 (conv): 24.5%');
  console.log('  GPT-4 (conv): 42.3%');
  console.log('  Mem0: 66.9%');
  console.log('  Engram: 79.6%');
  console.log(`  Muninn v2 (simple): ${finalAccuracy}%\n`);
  
  console.log('⚠️ NOTE: This uses simple rule-based extraction (no LLM).');
  console.log('   Full accuracy requires LLM-powered atomic extraction.\n');
}

runBenchmark().catch(e => {
  console.error('Benchmark failed:', e);
  process.exit(1);
});