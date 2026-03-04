// Muninn v2 End-to-End Integration Test
// Tests the full pipeline: remember → recall → query

import { Muninn } from './index.js';
import fs from 'fs';

const TEST_DB = '/tmp/muninn-v2-e2e-test.db';

async function testRememberRecall() {
  console.log('\n=== Test: Remember → Recall ===');
  
  // Clean up test db
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  const memory = new Muninn(TEST_DB);
  
  // Remember some content
  console.log('Storing: "Sarah manages the engineering team. She has been at the company for 3 years."');
  const result1 = await memory.remember(
    'Sarah manages the engineering team. She has been at the company for 3 years.',
    { source: 'conversation', sessionDate: '2024-03-04' }
  );
  
  console.log('Result:', {
    facts: result1.factsCreated,
    entities: result1.entitiesCreated,
    events: result1.eventsCreated
  });
  
  // Recall: Who is Sarah?
  const recall1 = await memory.recall('Who is Sarah?');
  console.log('\nQuery: Who is Sarah?');
  console.log('Source:', recall1.source);
  if (recall1.facts) {
    recall1.facts.forEach(f => {
      console.log(`  ${f.predicate}: ${f.objectValue || f.objectEntityId}`);
    });
  }
  
  // Remember more content
  console.log('\nStoring: "Phillip works on Project Phoenix. He reports to Sarah."');
  const result2 = await memory.remember(
    'Phillip works on Project Phoenix. He reports to Sarah.',
    { source: 'conversation' }
  );
  
  console.log('Result:', {
    facts: result2.factsCreated,
    entities: result2.entitiesCreated
  });
  
  // Recall: Who does Phillip report to?
  const recall2 = await memory.recall('Who does Phillip report to?');
  console.log('\nQuery: Who does Phillip report to?');
  console.log('Source:', recall2.source);
  
  // Recall: What does Phillip work on?
  const recall3 = await memory.recall('What does Phillip work on?');
  console.log('\nQuery: What does Phillip work on?');
  console.log('Source:', recall3.source);
  
  memory.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  console.log('✓ Remember → Recall test complete\n');
}

async function testTemporalEvolution() {
  console.log('\n=== Test: Temporal Evolution ===');
  
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  const memory = new Muninn(TEST_DB);
  
  // Remember a state change
  console.log('Storing: "Caroline\'s risk level changed from Low to Medium in February 2024."');
  await memory.remember(
    'Caroline\'s risk level changed from Low to Medium in February 2024.',
    { source: 'assessment', sessionDate: '2024-02-15' }
  );
  
  console.log('Storing: "Caroline\'s risk level is now High as of March 2024."');
  await memory.remember(
    'Caroline\'s risk level is now High as of March 2024.',
    { source: 'assessment', sessionDate: '2024-03-04' }
  );
  
  // Get evolution
  const evolution = await memory.getEvolution('Caroline');
  console.log('\nEvolution for Caroline:');
  evolution.forEach(e => {
    console.log(`  ${e.attribute}: ${e.old_value} → ${e.new_value} (${e.occurred_at})`);
  });
  
  // Recall: How did Caroline's risk level change?
  const recall = await memory.recall('How did Caroline\'s risk level change?');
  console.log('\nQuery: How did Caroline\'s risk level change?');
  console.log('Source:', recall.source);
  
  memory.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  console.log('✓ Temporal Evolution test complete\n');
}

async function testGraphTraversal() {
  console.log('\n=== Test: Graph Traversal ===');
  
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  const memory = new Muninn(TEST_DB);
  
  // Create a relationship graph
  console.log('Storing: "Alice is the CEO. Bob reports to Alice. Carol reports to Bob."');
  await memory.remember(
    'Alice is the CEO. Bob reports to Alice. Carol reports to Bob.',
    { source: 'org-chart' }
  );
  
  // Traverse graph
  const path = await memory.traverseGraph('Alice', 3);
  console.log('\nGraph traversal from Alice:');
  path.forEach(p => {
    console.log(`  ${p.entity} → ${p.relationship} → ${p.related_entity} (depth ${p.depth})`);
  });
  
  // Find path
  const recall = await memory.recall('How is Carol connected to Alice?');
  console.log('\nQuery: How is Carol connected to Alice?');
  console.log('Source:', recall.source);
  
  memory.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  console.log('✓ Graph Traversal test complete\n');
}

async function testContradictionDetection() {
  console.log('\n=== Test: Contradiction Detection ===');
  
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  const memory = new Muninn(TEST_DB);
  
  // Store a fact
  console.log('Storing: "The project deadline is March 15."');
  await memory.remember(
    'The project deadline is March 15.',
    { source: 'planning' }
  );
  
  // Store a contradicting fact
  console.log('Storing: "The project deadline is April 1."');
  await memory.remember(
    'The project deadline is April 1.',
    { source: 'planning-update' }
  );
  
  // Check for contradictions
  const contradictions = await memory.getContradictions();
  console.log('\nContradictions found:', contradictions.length);
  contradictions.forEach(c => {
    console.log(`  ${c.subject}: "${c.value_a}" vs "${c.value_b}" (${c.conflict_type})`);
  });
  
  memory.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  console.log('✓ Contradiction Detection test complete\n');
}

async function testSessionBriefing() {
  console.log('\n=== Test: Session Briefing ===');
  
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  const memory = new Muninn(TEST_DB);
  
  // Remember some context
  await memory.remember(
    'Phillip is working on Muninn v2. The goal is to reach 55% on LOCOMO benchmark.',
    { source: 'planning' }
  );
  
  await memory.remember(
    'Phase 4 (Retrieval) is complete. Next is Phase 6 (Integration).',
    { source: 'status' }
  );
  
  // Get stats
  const db = memory['db'];
  const stats = db.getStats();
  console.log('\nMemory Stats:');
  console.log(`  Entities: ${stats.entityCount}`);
  console.log(`  Facts: ${stats.factCount}`);
  console.log(`  Events: ${stats.eventCount}`);
  console.log(`  Relationships: ${stats.relationshipCount}`);
  
  // Recall current status
  const recall = await memory.recall('What is the current status of Muninn?');
  console.log('\nQuery: What is the current status of Muninn?');
  console.log('Source:', recall.source);
  
  memory.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  
  console.log('✓ Session Briefing test complete\n');
}

async function main() {
  console.log('Muninn v2 End-to-End Integration Tests\n');
  console.log('Testing full pipeline: remember → recall → query\n');
  
  try {
    await testRememberRecall();
    await testTemporalEvolution();
    await testGraphTraversal();
    await testContradictionDetection();
    await testSessionBriefing();
    
    console.log('\n✅ All end-to-end tests passed!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();