// Fast LOCOMO benchmark with batch extraction
import { Muninn } from './index.js';
import { generateAnswer } from './answer-generation.js';
import { batchExtractSessions, resolveRelativeDate } from './temporal-resolution.js';
import { readFileSync, existsSync, unlinkSync } from 'fs';

const datasetPath = './benchmark/locomo10.json';
const dataset = JSON.parse(readFileSync(datasetPath, 'utf-8'));

// Test just first 3 conversations for speed
const TEST_CONVERSATIONS = 3;

const dbPath = '/tmp/locomo-fast-benchmark.db';
if (existsSync(dbPath)) unlinkSync(dbPath);

const muninn = new Muninn(dbPath);

const CATEGORY_NAMES: Record<number, string> = {
  1: 'single_hop',
  2: 'temporal',
  3: 'multi_hop',
  4: 'open_domain',
};

async function runBenchmark() {
  console.log('🧪 LOCOMO Fast Benchmark (Muninn v2)\n');
  console.log(`Testing ${TEST_CONVERSATIONS} conversations\n`);
  
  const categoryStats: Record<number, { correct: number; total: number }> = {
    1: { correct: 0, total: 0 },
    2: { correct: 0, total: 0 },
    3: { correct: 0, total: 0 },
    4: { correct: 0, total: 0 }
  };
  
  let totalCorrect = 0;
  let totalQuestions = 0;
  
  for (let i = 0; i < Math.min(TEST_CONVERSATIONS, dataset.length); i++) {
    const conv = dataset[i];
    console.log(`\n📍 Conversation ${i + 1}: ${conv.sample_id}`);
    
    const conversation = conv.conversation;
    const sessionKeys = Object.keys(conversation)
      .filter(k => k.startsWith('session_') && !k.includes('date_time'))
      .sort((a, b) => parseInt(a.replace('session_', '')) - parseInt(b.replace('session_', '')));
    
    console.log(`📚 ${sessionKeys.length} sessions (batch processing)...`);
    
    // Build sessions array
    const sessions = sessionKeys.map(key => {
      const sessionData = conversation[key];
      const sessionDate = conversation[`${key}_date_time`];
      
      if (!sessionData || !Array.isArray(sessionData)) return null;
      
      const speakerA = conversation.speaker_a as string;
      const speakerB = conversation.speaker_b as string;
      
      const content = sessionData.map((turn: any) => {
        const speaker = turn.speaker || (turn.speaker_name === 'a' ? speakerA : speakerB);
        const text = turn.text || turn.content || '';
        return `${speaker}: ${text}`;
      }).join('\n');
      
      return {
        id: key,
        date: sessionDate || '2023-01-01',
        content
      };
    }).filter(Boolean) as Array<{ id: string; date: string; content: string }>;
    
    // Batch extract (5 sessions at a time)
    const extractions = await batchExtractSessions(sessions, 5);
    
    // Store in Muninn
    for (const extraction of extractions) {
      // Create entities
      for (const entity of extraction.entities) {
        muninn['db'].findOrCreateEntity(entity.name, entity.type);
      }
      
      // Create facts with temporal
      for (const fact of extraction.facts) {
        const subjectId = muninn['db'].findOrCreateEntity(fact.subject, 'person').id;
        let objectId: string | undefined;
        
        if (fact.object_type === 'entity') {
          objectId = muninn['db'].findOrCreateEntity(fact.object, 'entity').id;
        }
        
        muninn['db'].createFact({
          subjectEntityId: subjectId,
          predicate: fact.predicate,
          objectEntityId: objectId,
          objectValue: fact.object_type === 'literal' ? fact.object : undefined,
          valueType: fact.object_type === 'entity' ? 'entity' : 'string',
          confidence: fact.confidence || 0.8,
          validFrom: fact.temporal?.resolved_date ? new Date(fact.temporal.resolved_date) : undefined
        });
      }
      
      // Create events with temporal
      for (const event of extraction.events) {
        const entityId = muninn['db'].findOrCreateEntity(event.entity, 'person').id;
        
        muninn['db'].createEvent({
          entityId,
          attribute: event.attribute,
          oldValue: event.old_value,
          newValue: event.new_value,
          occurredAt: event.temporal?.resolved_date ? new Date(event.temporal.resolved_date) : new Date()
        });
      }
    }
    
    const stats = muninn['db'].getStats();
    console.log(`   Entities: ${stats.entityCount}, Facts: ${stats.factCount}, Events: ${stats.eventCount}`);
    
    // Answer questions
    console.log(`\n❓ Answering ${conv.qa.length} questions...`);
    
    for (const qa of conv.qa) {
      if (qa.category === 5) continue;
      
      const result = await muninn.recall(qa.question);
      const answer = await generateAnswer(qa.question, result);
      
      // Check correctness
      const genNorm = answer.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const expNorm = String(qa.answer).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      
      // Overlap check
      const genWords = genNorm.split(' ').filter((w: string) => w.length > 2);
      const expWords = expNorm.split(' ').filter((w: string) => w.length > 2);
      const overlap = genWords.filter((w: string) => expWords.includes(w)).length;
      
      const isCorrect = genNorm === expNorm || 
        genNorm.includes(expNorm) || 
        expNorm.includes(genNorm) ||
        (overlap >= Math.ceil(expWords.length * 0.5));
      
      if (isCorrect) totalCorrect++;
      totalQuestions++;
      categoryStats[qa.category].total++;
      if (isCorrect) categoryStats[qa.category].correct++;
      
      const icon = isCorrect ? '✅' : '❌';
      const catName = CATEGORY_NAMES[qa.category];
      
      if (!isCorrect && totalQuestions < 30) {
        console.log(`  ${icon} [${catName}] "${qa.question}"`);
        console.log(`     Expected: "${qa.answer}"`);
        console.log(`     Got: "${answer}"`);
      }
    }
    
    // Clear for next conversation
    muninn.close();
    if (existsSync(dbPath)) unlinkSync(dbPath);
    // @ts-ignore
    muninn.db = new (await import('./database-sqlite.js')).MuninnDatabase(dbPath);
    // @ts-ignore
    muninn.retriever = new (await import('./retrieval-sqlite.js')).Retriever(muninn.db);
  }
  
  // Results
  console.log('\n' + '='.repeat(80));
  console.log('📊 BENCHMARK RESULTS');
  console.log('='.repeat(80));
  console.log(`\nOverall: ${totalCorrect}/${totalQuestions} (${((totalCorrect/totalQuestions)*100).toFixed(1)}%)\n`);
  
  console.log('By Category:');
  for (const [cat, stats] of Object.entries(categoryStats)) {
    const pct = stats.total > 0 ? ((stats.correct/stats.total)*100).toFixed(1) : '0.0';
    const name = CATEGORY_NAMES[parseInt(cat)];
    console.log(`  ${name}: ${stats.correct}/${stats.total} (${pct}%)`);
  }
  
  console.log('\n📈 Comparison:');
  console.log('  | System      | Single-Hop | Temporal | Multi-Hop | Open-Domain | Overall |');
  console.log('  |-------------|------------|----------|-----------|-------------|---------|');
  console.log('  | Mem0        | 67.13%     | 55.51%   | 51.15%    | 72.93%      | 66.88%  |');
  console.log('  | Muninn v1   | 8.9%       | 1.2%     | 11.5%     | 5.5%        | 5.2%    |');
  console.log(`  | Muninn v2   | ${categoryStats[1].total > 0 ? ((categoryStats[1].correct/categoryStats[1].total)*100).toFixed(1) : '0.0'}%      | ${categoryStats[2].total > 0 ? ((categoryStats[2].correct/categoryStats[2].total)*100).toFixed(1) : '0.0'}%    | ${categoryStats[3].total > 0 ? ((categoryStats[3].correct/categoryStats[3].total)*100).toFixed(1) : '0.0'}%     | ${categoryStats[4].total > 0 ? ((categoryStats[4].correct/categoryStats[4].total)*100).toFixed(1) : '0.0'}%       | ${((totalCorrect/totalQuestions)*100).toFixed(1)}%    |`);
  
  muninn.close();
}

runBenchmark().catch(console.error);