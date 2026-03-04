// Debug state change detection
import { Muninn } from './index.js';
import { existsSync, unlinkSync } from 'fs';

const dbPath = '/tmp/test-debug-state.db';
if (existsSync(dbPath)) unlinkSync(dbPath);

const muninn = new Muninn(dbPath);

async function test() {
  console.log('Debug: State Change Detection\n');
  
  // Store initial state
  console.log('1. Store: Caroline works at TechCorp');
  await muninn.remember('Caroline works at TechCorp.', { source: 'test' });
  
  // Check facts
  const facts1 = muninn['db']['db'].prepare(`
    SELECT f.id, e.name as subject, f.predicate, f.object_value 
    FROM facts f 
    JOIN entities e ON f.subject_entity_id = e.id
  `).all();
  console.log('   Facts:', facts1);
  
  // Store state change
  console.log('\n2. Store: Caroline works at DataFlow now');
  await muninn.remember('Caroline works at DataFlow now.', { source: 'test' });
  
  // Check facts again
  const facts2 = muninn['db']['db'].prepare(`
    SELECT f.id, e.name as subject, f.predicate, f.object_value 
    FROM facts f 
    JOIN entities e ON f.subject_entity_id = e.id
  `).all();
  console.log('   Facts:', facts2);
  
  // Check events
  const events = muninn['db']['db'].prepare(`
    SELECT e.id, ent.name as entity, e.attribute, e.old_value, e.new_value
    FROM events e
    JOIN entities ent ON e.entity_id = ent.id
  `).all();
  console.log('   Events:', events);
  
  muninn.close();
}

test().catch(console.error);