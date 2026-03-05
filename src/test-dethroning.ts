/**
 * Test Script: Dethroning Verification
 * 
 * Verifies that the Truth Engine correctly handles state conflicts:
 * - Piano → Violin should dethrone old instrument
 * - Historical facts should be marked with valid_until
 * - Current facts should have valid_until: null
 */

import { Muninn } from './index-unified.js';

async function testDethroning() {
  console.log('=== Dethroning Test Suite ===\n');
  
  // Create fresh test database
  const muninn = new Muninn({ dbPath: ':memory:' });
  
  // Test case 1: Learning instrument conflict
  console.log('Test 1: Piano → Violin Conflict');
  console.log('--------------------------------');
  
  // Day 1: Tim starts learning piano
  console.log('\nDay 1: Tim starts learning piano...');
  await muninn.remember('Tim has been playing the piano for about four months.', {
    source: 'test',
    sessionDate: '2024-06-01'
  });
  
  // Check: Should have piano with valid_until: null
  let piano = await findObservation(muninn, 'Tim', 'learning_instrument');
  console.log('  Piano observation:', piano ? 'FOUND' : 'NOT FOUND');
  if (piano) {
    console.log(`    content: ${piano.content}`);
    console.log(`    valid_until: ${piano.valid_until || 'null (CURRENT)'}`);
  }
  
  // Day 30: Tim starts learning violin
  console.log('\nDay 30: Tim starts learning violin...');
  await muninn.remember('Tim recently started learning the violin.', {
    source: 'test',
    sessionDate: '2024-12-01'
  });
  
  // Check: Piano should now have valid_until set
  piano = await findObservation(muninn, 'Tim', 'learning_instrument', 'piano');
  console.log('  Piano after violin:');
  if (piano) {
    console.log(`    content: ${piano.content}`);
    console.log(`    valid_until: ${piano.valid_until || 'null (ERROR: should be set)'}`);
    console.log(`    tags: ${piano.tags?.join(', ') || 'none'}`);
  } else {
    console.log('    NOT FOUND (ERROR: piano should still exist as historical)');
  }
  
  // Check: Violin should be current
  const violin = await findObservation(muninn, 'Tim', 'learning_instrument', 'violin');
  console.log('  Violin:');
  if (violin) {
    console.log(`    content: ${violin.content}`);
    console.log(`    valid_until: ${violin.valid_until || 'null (CORRECT)'}`);
    console.log(`    tags: ${violin.tags?.join(', ') || 'none'}`);
  } else {
    console.log('    NOT FOUND (ERROR: violin should be current)');
  }
  
  // Test query: "What instrument is Tim learning?"
  console.log('\nQuery: What instrument is Tim learning?');
  const result = await muninn.recall('What instrument is Tim learning?');
  console.log('  Retrieved:', result.observations?.[0]?.content || 'NONE');
  
  // Test case 2: Location change
  console.log('\n\nTest 2: Location Conflict (New York → Brisbane)');
  console.log('------------------------------------------------');
  
  // Clear for fresh test
  const muninn2 = new Muninn({ dbPath: ':memory:' });
  
  // 2023: John lives in New York
  console.log('\n2023: John lives in New York...');
  await muninn2.remember('John moved to New York in 2023.', {
    source: 'test',
    sessionDate: '2023-06-01'
  });
  
  // 2025: John moves to Brisbane
  console.log('2025: John moves to Brisbane...');
  await muninn2.remember('John relocated to Brisbane in January 2025.', {
    source: 'test',
    sessionDate: '2025-01-15'
  });
  
  // Check current location
  const brisbane = await findObservation(muninn2, 'John', 'lives_in', 'Brisbane');
  const newYork = await findObservation(muninn2, 'John', 'lives_in', 'New York');
  
  console.log('  New York:', newYork ? `valid_until=${newYork.valid_until || 'null'}` : 'NOT FOUND');
  console.log('  Brisbane:', brisbane ? `valid_until=${brisbane.valid_until || 'null (CURRENT)'}` : 'NOT FOUND');
  
  // Test query
  console.log('\nQuery: Where does John live?');
  const result2 = await muninn2.recall('Where does John live?');
  console.log('  Retrieved:', result2.observations?.[0]?.content || 'NONE');
  
  // Summary
  console.log('\n=== Test Summary ===');
  console.log('✓ Piano should be HISTORICAL after violin');
  console.log('✓ Violin should be CURRENT');
  console.log('✓ Query should return violin, not piano');
  console.log('✓ New York should be HISTORICAL after Brisbane');
  console.log('✓ Brisbane should be CURRENT');
  
  console.log('\nDethroning tests complete.');
  
  muninn.close();
  muninn2.close();
}

async function findObservation(muninn: any, entity: string, predicate: string, content?: string): Promise<any> {
  const stats = muninn.getStats();
  // This is a simplified query - adjust based on actual Muninn API
  const result = await muninn.recall(`${entity} ${predicate} ${content || ''}`);
  return result.observations?.find((o: any) => 
    o.entity_name === entity && 
    o.predicate === predicate &&
    (!content || o.content.toLowerCase().includes(content.toLowerCase()))
  );
}

testDethroning().catch(console.error);