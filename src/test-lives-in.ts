// Check facts extracted from "lives in Sydney" vs "moved to Brisbane"
import { Muninn } from './index.js';
import { existsSync, unlinkSync } from 'fs';

const dbPath = '/tmp/test-lives-in.db';
if (existsSync(dbPath)) unlinkSync(dbPath);

const muninn = new Muninn(dbPath);

async function test() {
  console.log('Testing lives_in state change...\n');
  
  // Store initial state
  console.log('1. Store: Caroline lives in Sydney');
  await muninn.remember('Caroline lives in Sydney.', { source: 'test' });
  
  // Check extracted facts
  const facts1 = muninn['db']['db'].prepare(`
    SELECT f.id, e.name as subject, f.predicate, f.object_value 
    FROM facts f 
    JOIN entities e ON f.subject_entity_id = e.id
  `).all();
  console.log('   Facts:', facts1.map((f: any) => `${f.subject}.${f.predicate} = ${f.object_value}`));
  
  // Store state change
  console.log('\n2. Store: Caroline moved to Brisbane');
  await muninn.remember('Caroline moved to Brisbane.', { source: 'test' });
  
  const facts2 = muninn['db']['db'].prepare(`
    SELECT f.id, e.name as subject, f.predicate, f.object_value 
    FROM facts f 
    JOIN entities e ON f.subject_entity_id = e.id
  `).all();
  console.log('   Facts:', facts2.map((f: any) => `${f.subject}.${f.predicate} = ${f.object_value}`));
  
  // Store another location change
  console.log('\n3. Store: Caroline now lives in Melbourne');
  await muninn.remember('Caroline now lives in Melbourne.', { source: 'test' });
  
  const facts3 = muninn['db']['db'].prepare(`
    SELECT f.id, e.name as subject, f.predicate, f.object_value 
    FROM facts f 
    JOIN entities e ON f.subject_entity_id = e.id
  `).all();
  console.log('   Facts:', facts3.map((f: any) => `${f.subject}.${f.predicate} = ${f.object_value}`));
  
  // Check events
  const events = muninn['db']['db'].prepare(`
    SELECT e.id, ent.name as entity, e.attribute, e.old_value, e.new_value
    FROM events e
    JOIN entities ent ON e.entity_id = ent.id
  `).all();
  console.log('\nEvents:', events);
  
  muninn.close();
}

test().catch(console.error);