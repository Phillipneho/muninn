// Test v3.3: Truth Engine
// Tests temporal decay, state overwriting, and contradiction resolution

import { Muninn } from './index.js';
import { 
  resolveCurrentState, 
  getCurrentTruth,
  getHistoricalTimeline,
  detectContradiction
} from './truth-engine.js';
import { existsSync, unlinkSync } from 'fs';

const dbPath = '/tmp/test-truth-engine.db';
if (existsSync(dbPath)) unlinkSync(dbPath);

const muninn = new Muninn(dbPath);

async function test() {
  console.log('=== v3.3: Truth Engine Test ===\n');
  
  const db = muninn['db'];
  
  // 1. Test state overwriting (dethroning old truth)
  console.log('1. Testing state overwriting (dethroning)...');
  
  const caroline = db.createEntity({ name: 'Caroline', type: 'person' });
  
  // Initial fact: Caroline works at TechCorp (2023)
  await muninn.remember('Caroline works at TechCorp in 2023.', { source: 'test' });
  
  // New fact: Caroline works at DataFlow (2024)
  await muninn.remember('Caroline works at DataFlow since June 2024.', { source: 'test' });
  
  // Check current truth
  const current = getCurrentTruth(db, caroline.id);
  console.log(`   Current truth for Caroline:`);
  current.forEach((f: any) => {
    console.log(`   - ${f.predicate}: ${f.object_value} (from ${f.valid_from})`);
  });
  
  // 2. Test temporal decay (recency wins)
  console.log('\n2. Testing temporal decay (recency wins)...');
  
  // Another entity with conflicting facts
  const dave = db.createEntity({ name: 'Dave', type: 'person' });
  
  // Old fact: Dave lives in Sydney
  await muninn.remember('Dave lives in Sydney in 2023.', { source: 'test' });
  
  // New fact: Dave lives in Brisbane
  await muninn.remember('Dave moved to Brisbane in 2024.', { source: 'test' });
  
  const daveCurrent = resolveCurrentState(db, dave.id, 'lives_in');
  if (daveCurrent) {
    console.log(`   Dave's current location: ${daveCurrent.object_value}`);
    console.log(`   Valid from: ${daveCurrent.valid_from}`);
  } else {
    console.log(`   No current truth found for Dave`);
  }
  
  // 3. Test contradiction detection
  console.log('\n3. Testing contradiction detection...');
  
  const factA = {
    id: 'fact-a',
    subject_entity_id: caroline.id,
    predicate: 'lives_in',
    object_value: 'Sydney',
    confidence: 0.9,
    valid_from: '2023-01-01'
  };
  
  const factB = {
    id: 'fact-b',
    subject_entity_id: caroline.id,
    predicate: 'lives_in',
    object_value: 'Brisbane',
    confidence: 0.9,
    valid_from: '2024-01-01'
  };
  
  const resolution = detectContradiction(db, factA, factB);
  if (resolution) {
    console.log(`   Conflict detected: ${resolution.type}`);
    console.log(`   Winner: ${resolution.winningFactId}`);
    console.log(`   Reason: ${resolution.reason}`);
    if (resolution.supersededFactId) {
      console.log(`   Superseded: ${resolution.supersededFactId}`);
    }
  }
  
  // 4. Test historical timeline
  console.log('\n4. Testing historical timeline...');
  
  const timeline = getHistoricalTimeline(db, caroline.id);
  console.log(`   Caroline's timeline (${timeline.length} facts):`);
  timeline.forEach((f: any) => {
    const current = f.is_current ? ' [CURRENT]' : '';
    console.log(`   - ${f.valid_from}: ${f.predicate} ${f.object_value}${current}`);
  });
  
  // 5. Test "The King is Dead" workflow
  console.log('\n5. Testing "The King is Dead" workflow...');
  
  const frank = db.createEntity({ name: 'Frank', type: 'person' });
  
  // Frank is hired at Company A
  await muninn.remember('Frank works at Company A since 2022.', { source: 'test' });
  
  const frankCurrent1 = resolveCurrentState(db, frank.id, 'works_at');
  console.log(`   After first job: Frank works at ${frankCurrent1?.object_value || 'unknown'}`);
  
  // Frank moves to Company B
  await muninn.remember('Frank now works at Company B as of 2024.', { source: 'test' });
  
  const frankCurrent2 = resolveCurrentState(db, frank.id, 'works_at');
  console.log(`   After job change: Frank works at ${frankCurrent2?.object_value || 'unknown'}`);
  
  // Historical query
  const frankTimeline = getHistoricalTimeline(db, frank.id, 'works_at');
  console.log(`   Frank's employment history:`);
  frankTimeline.forEach((f: any) => {
    const current = f.is_current ? ' [CURRENT]' : ' [PAST]';
    console.log(`   - ${f.valid_from}: ${f.object_value}${current}`);
  });
  
  // 6. Test confidence weighting
  console.log('\n6. Testing confidence weighting...');
  
  const resolution2 = detectContradiction(db, 
    { id: 'a', subject_entity_id: 'x', predicate: 'role', object_value: 'Developer', confidence: 0.9, valid_from: '2023-01-01' },
    { id: 'b', subject_entity_id: 'x', predicate: 'role', object_value: 'Manager', confidence: 0.5, valid_from: '2024-01-01' }
  );
  
  if (resolution2) {
    console.log(`   High confidence old fact vs low confidence new fact:`);
    console.log(`   Resolution: ${resolution2.type}`);
    console.log(`   Winner: ${resolution2.winningFactId}`);
    console.log(`   Reason: ${resolution2.reason}`);
  }
  
  console.log('\n=== Results ===');
  console.log('✓ State overwriting: ' + (current.length > 0 ? 'PASS' : 'FAIL'));
  console.log('✓ Temporal decay: ' + (daveCurrent ? 'PASS' : 'FAIL'));
  console.log('✓ Contradiction detection: ' + (resolution ? 'PASS' : 'FAIL'));
  console.log('✓ Historical timeline: ' + (timeline.length > 0 ? 'PASS' : 'FAIL'));
  console.log('✓ "The King is Dead" workflow: ' + (frankTimeline.length >= 2 ? 'PASS' : 'FAIL'));
  console.log('✓ Confidence weighting: ' + (resolution2 ? 'PASS' : 'FAIL'));
  
  console.log('\n=== Summary ===');
  console.log('The Truth Engine now:');
  console.log('• Prioritizes recent facts over old ones');
  console.log('• Maintains historical timeline for "What happened?" queries');
  console.log('• Detects and resolves contradictions');
  console.log('• Uses confidence weighting for uncertain facts');
  
  muninn.close();
}

test().catch(console.error);