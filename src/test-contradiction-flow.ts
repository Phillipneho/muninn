// Debug contradiction detection flow
import { Muninn } from './index.js';
import { detectContradictions } from './extraction.js';
import { existsSync, unlinkSync } from 'fs';

const dbPath = '/tmp/test-contradiction-flow.db';
if (existsSync(dbPath)) unlinkSync(dbPath);

const muninn = new Muninn(dbPath);

async function test() {
  console.log('Debug: Contradiction Detection Flow\n');
  
  // Store initial state
  console.log('1. Store: Caroline works at TechCorp');
  await muninn.remember('Caroline works at TechCorp.', { source: 'test' });
  
  // Get current facts
  const currentFacts = muninn['db'].getCurrentFacts('Caroline');
  console.log('   Current facts:', currentFacts.map(f => `${f.subject}.${f.predicate} = ${f.object}`));
  
  // Simulate new fact from extraction
  console.log('\n2. Simulating extraction of: Caroline works at DataFlow');
  const newFact = {
    subject: 'Caroline',
    predicate: 'works_at',
    object: 'DataFlow',
    objectType: 'entity' as const,
    confidence: 0.9,
    evidence: 'test'
  };
  
  // Map to expected format
  const mappedFacts = currentFacts.map(f => ({
    subject: f.subject,
    predicate: f.predicate,
    object: f.object,
    objectType: 'entity' as const,
    confidence: f.confidence || 0.5,
    evidence: (f.evidence && f.evidence[0]) || ''
  }));
  
  console.log('   Mapped facts:', mappedFacts.map(f => `${f.subject}.${f.predicate} = ${f.object}`));
  
  // Check contradictions
  const contradictions = detectContradictions(newFact, mappedFacts);
  console.log('   Contradictions found:', contradictions.length);
  contradictions.forEach(c => {
    console.log(`   - ${c.type}: ${c.fact.subject}.${c.fact.predicate} "${(c as any).stateChange?.oldValue}" → "${(c as any).stateChange?.newValue}" (isTransient: ${(c as any).isTransient})`);
  });
  
  muninn.close();
}

test().catch(console.error);