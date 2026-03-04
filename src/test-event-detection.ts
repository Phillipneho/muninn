// Test P1: Event Auto-Detection
import { Muninn } from './index.js';
import { existsSync, unlinkSync } from 'fs';

const dbPath = '/tmp/test-event-detection.db';
if (existsSync(dbPath)) unlinkSync(dbPath);

const muninn = new Muninn(dbPath);

async function test() {
  console.log('=== P1: Event Auto-Detection Test ===\n');
  
  // 1. Store initial state
  console.log('1. Storing initial employment state...');
  await muninn.remember('Caroline works at TechCorp as a software engineer. She lives in Sydney.', {
    source: 'test',
    sessionDate: '2023-01-15'
  });
  
  let stats = muninn['db'].getStats();
  console.log(`   Stats: ${stats.entityCount} entities, ${stats.factCount} facts, ${stats.eventCount} events\n`);
  
  // 2. Store state change (persistent predicate)
  console.log('2. Storing state change (employment_status -> persistent)...');
  await muninn.remember('Caroline got a new job at DataFlow as a senior engineer. She now works there.', {
    source: 'test',
    sessionDate: '2023-06-01'
  });
  
  stats = muninn['db'].getStats();
  console.log(`   Stats: ${stats.entityCount} entities, ${stats.factCount} facts, ${stats.eventCount} events\n`);
  
  // 3. Store transient state (should NOT create event)
  console.log('3. Storing transient state (is_at -> should NOT create event)...');
  await muninn.remember('Caroline is at the park right now walking her dog.', {
    source: 'test',
    sessionDate: '2023-06-15'
  });
  
  stats = muninn['db'].getStats();
  console.log(`   Stats: ${stats.entityCount} entities, ${stats.factCount} facts, ${stats.eventCount} events\n`);
  
  // 4. Store another persistent change
  console.log('4. Storing location change (moved_to -> persistent)...');
  await muninn.remember('Caroline moved to Brisbane last month.', {
    source: 'test',
    sessionDate: '2023-08-01'
  });
  
  stats = muninn['db'].getStats();
  console.log(`   Stats: ${stats.entityCount} entities, ${stats.factCount} facts, ${stats.eventCount} events\n`);
  
  // 5. Query events
  console.log('5. Querying events table...');
  const events = muninn['db']['db'].prepare(`
    SELECT e.id, ent.name as entity, e.attribute, e.old_value, e.new_value, e.occurred_at
    FROM events e
    JOIN entities ent ON e.entity_id = ent.id
    ORDER BY e.occurred_at
  `).all();
  
  console.log(`   Found ${events.length} events:`);
  events.forEach((e: any) => {
    console.log(`   - ${e.entity}.${e.attribute}: ${e.old_value} → ${e.new_value} (${e.occurred_at.split('T')[0]})`);
  });
  
  // 6. Query facts
  console.log('\n6. Current facts for Caroline...');
  const facts = muninn['db'].getCurrentFacts('Caroline');
  facts.forEach((f: any) => {
    console.log(`   - ${f.predicate}: ${f.object || f.object_value}`);
  });
  
  console.log('\n=== Results ===');
  console.log(`Persistent state changes detected: ${events.filter((e: any) => ['job', 'lives_in'].includes(e.attribute)).length}`);
  console.log(`Transient states ignored: Expected 1 (is_at), got events with transient predicates`);
  
  muninn.close();
}

test().catch(console.error);