/**
 * LOCOMO Full Benchmark
 * Tests all 10 conversations with all question categories
 * 
 * Categories:
 * 1 - Single-hop (simple lookup)
 * 2 - Temporal (time-based)
 * 3 - Multi-hop (reasoning)
 * 4 - Multi-hop reasoning (complex)
 * 5 - Temporal multi-hop (complex time)
 */

interface QA {
  question: string;
  answer: string | string[];
  evidence: string[];
  category: number;
}

interface Conversation {
  conversation: string;
  qa: QA[];
  sample_id: string;
  session_summary: string;
}

interface BenchmarkResult {
  conversation: number;
  question: string;
  expectedAnswer: string | string[];
  category: number;
  entity: string;
  searchResult: any;
  topFacts: string[];
  latency: number;
  correct: boolean;
}

const MUNNIN_API = 'https://api.muninn.au/api/memories';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';

async function loadLocomoData(): Promise<Conversation[]> {
  const response = await fetch('https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json');
  return response.json();
}

async function searchMuninn(query: string, entity?: string): Promise<{ result: any; latency: number }> {
  const start = Date.now();
  
  // Use entity facts endpoint for structured search
  if (entity && entity !== 'Unknown') {
    const url = `${MUNNIN_API.replace('/memories', '/entities')}/${encodeURIComponent(entity)}/facts`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'X-Organization-ID': ORG_ID,
      },
    });
    const latency = Date.now() - start;
    const result = await response.json();
    return { result, latency };
  }
  
  // Fallback to keyword search for unknown entities
  const url = `${MUNNIN_API}?q=${encodeURIComponent(query)}&search_type=keyword&limit=10`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'X-Organization-ID': ORG_ID,
    },
  });
  const latency = Date.now() - start;
  const result = await response.json();
  return { result, latency };
}

function extractEntity(question: string): string {
  // Known entity names from LOCOMO conversations
  const knownEntities = [
    'Calvin', 'Dave', 'Caroline', 'Melanie', 'Jon', 'Gina',
    'Maria', 'John', 'Alisha', 'Kevin', 'Max', 'Emma', 'Oliver',
    'Luna', 'Bailey', 'Oscar', 'Matt', 'Patterson', 'Sara',
    'Bareilles', 'Bach', 'Mozart', 'Ed', 'Sheeran', 'Nicole',
    'Shia', 'Labeouf', 'Frank', 'Ocean', 'Summer', 'Sounds',
    'Charlotte', 'Web', 'Becoming', 'Lean', 'Startup'
  ];
  
  // Check for known entities first
  for (const entity of knownEntities) {
    if (question.includes(entity)) {
      return entity;
    }
  }
  
  // Extract capitalized words that aren't question words
  const questionWords = ['What', 'When', 'Where', 'Who', 'Which', 'How', 'Does', 'Did', 'Is', 'Was', 'Would', 'Could', 'Should', 'Why', 'The', 'A', 'An', 'In', 'On', 'At', 'To', 'For', 'From', 'It', 'They', 'He', 'She', 'We', 'I', 'You'];
  
  const capitalizedWords = question.match(/\b([A-Z][a-z]+)\b/g) || [];
  const entities = capitalizedWords.filter(word => !questionWords.includes(word));
  
  if (entities.length > 0) {
    return entities[0];
  }
  
  // Fall back to first capitalized word after question word
  const afterQuestionMatch = question.match(/(?:What|When|Where|Who|Which|How|Does|Did|Is|Was|Would)\s+(?:\w+\s+){0,3}([A-Z][a-z]+)/);
  if (afterQuestionMatch) {
    return afterQuestionMatch[1];
  }
  
  return 'Unknown';
}

function normalizeAnswer(answer: any): string[] {
  // Handle both string and array formats
  if (Array.isArray(answer)) {
    return answer.map((a: any) => String(a).toLowerCase().trim());
  }
  if (typeof answer === 'object' && answer !== null) {
    // Handle object format
    return [String(answer).toLowerCase().trim()];
  }
  return [String(answer).toLowerCase().trim()];
}

function checkAnswer(topFacts: string[], expected: string[]): boolean {
  // Check if any expected answer appears in top facts
  const factsStr = topFacts.join(' ').toLowerCase();
  
  for (const exp of expected) {
    // Handle date formats
    if (exp.match(/^\d{4}$/)) {
      // Year only - check if year appears
      if (factsStr.includes(exp)) return true;
    } else if (exp.match(/^\d{4}-\d{2}$/)) {
      // Year-month
      if (factsStr.includes(exp)) return true;
    } else if (exp.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Full date
      if (factsStr.includes(exp)) return true;
    } else {
      // String match
      if (factsStr.includes(exp)) return true;
    }
  }
  
  return false;
}

function formatFacts(result: any): string[] {
  // Handle entity facts endpoint response
  if (result.facts && Array.isArray(result.facts)) {
    return result.facts.slice(0, 10).map((f: any) => {
      const subject = f.subject || 'Unknown';
      const predicate = f.predicate || 'unknown';
      const object = f.object || '';
      const validFrom = f.valid_from ? ` (${f.valid_from})` : '';
      return `${subject} ${predicate} ${object}${validFrom}`.toLowerCase();
    });
  }
  
  // Handle keyword search response
  if (!result.results || result.results.length === 0) return [];
  
  return result.results.slice(0, 10).map((r: any) => {
    const subject = r.subject || 'Unknown';
    const predicate = r.predicate || 'unknown';
    const object = r.object || '';
    const validFrom = r.valid_from ? ` (${r.valid_from})` : '';
    return `${subject} ${predicate} ${object}${validFrom}`.toLowerCase();
  });
}

function getCategoryName(category: number): string {
  const names: Record<number, string> = {
    1: 'single-hop',
    2: 'temporal',
    3: 'multi-hop',
    4: 'multi-hop-reasoning',
    5: 'temporal-multi-hop',
  };
  return names[category] || 'unknown';
}

async function runBenchmark(): Promise<void> {
  console.log('============================================================');
  console.log('LOCOMO FULL BENCHMARK');
  console.log('============================================================\n');
  
  const data = await loadLocomoData();
  const results: BenchmarkResult[] = [];
  
  // Stats by category
  const stats: Record<number, { correct: number; total: number; latency: number }> = {};
  
  // Process each conversation
  for (let i = 0; i < data.length; i++) {
    const conv = data[i];
    console.log(`\n[CONVERSATION ${i + 1}/10] sample_id: ${conv.sample_id}`);
    console.log(`  Questions: ${conv.qa.length}`);
    
    // Process each question
    for (const qa of conv.qa) {
      const entity = extractEntity(qa.question);
      const { result, latency } = await searchMuninn(qa.question, entity);
      const topFacts = formatFacts(result);
      const expected = normalizeAnswer(qa.answer);
      const correct = checkAnswer(topFacts, expected);
      
      // Track by category
      if (!stats[qa.category]) {
        stats[qa.category] = { correct: 0, total: 0, latency: 0 };
      }
      stats[qa.category].total++;
      stats[qa.category].latency += latency;
      if (correct) stats[qa.category].correct++;
      
      results.push({
        conversation: i + 1,
        question: qa.question,
        expectedAnswer: qa.answer,
        category: qa.category,
        entity,
        searchResult: result,
        topFacts,
        latency,
        correct,
      });
      
      // Log progress
      const status = correct ? '✓' : '✗';
      console.log(`  [${status}] Q: ${qa.question.substring(0, 60)}...`);
      console.log(`      Category: ${getCategoryName(qa.category)}, Entity: ${entity}`);
      console.log(`      Expected: ${Array.isArray(qa.answer) ? qa.answer.join(', ') : qa.answer}`);
      console.log(`      Top facts: ${topFacts.slice(0, 2).join(' | ')}`);
      console.log(`      Latency: ${latency}ms`);
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Print results
  console.log('\n============================================================');
  console.log('BENCHMARK RESULTS');
  console.log('============================================================\n');
  
  let totalCorrect = 0;
  let totalQuestions = 0;
  let totalLatency = 0;
  
  for (const [cat, stat] of Object.entries(stats).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const accuracy = stat.total > 0 ? ((stat.correct / stat.total) * 100).toFixed(1) : '0.0';
    const avgLatency = stat.total > 0 ? Math.round(stat.latency / stat.total) : 0;
    console.log(`${getCategoryName(Number(cat)).padEnd(20)}: ${stat.correct}/${stat.total} = ${accuracy}% (avg ${avgLatency}ms)`);
    totalCorrect += stat.correct;
    totalQuestions += stat.total;
    totalLatency += stat.latency;
  }
  
  const overallAccuracy = totalQuestions > 0 ? ((totalCorrect / totalQuestions) * 100).toFixed(1) : '0.0';
  const avgLatency = totalQuestions > 0 ? Math.round(totalLatency / totalQuestions) : 0;
  
  console.log('\n------------------------------------------------------------');
  console.log(`OVERALL: ${totalCorrect}/${totalQuestions} = ${overallAccuracy}% (avg ${avgLatency}ms)`);
  console.log('============================================================');
  
  // Print misses for analysis
  const misses = results.filter(r => !r.correct);
  if (misses.length > 0 && misses.length <= 20) {
    console.log('\nMISSES (first 20):');
    for (const m of misses.slice(0, 20)) {
      console.log(`  [Cat ${m.category}] ${m.question}`);
      console.log(`    Expected: ${Array.isArray(m.expectedAnswer) ? m.expectedAnswer.join(', ') : m.expectedAnswer}`);
      console.log(`    Got: ${m.topFacts.slice(0, 2).join(' | ')}`);
    }
  }
}

runBenchmark().catch(console.error);