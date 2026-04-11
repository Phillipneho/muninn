const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

async function test() {
  // Test specific questions that should work with new facts
  const tests = [
    { entity: 'Caroline', predicates: ['supports', 'support'], expected: 'mentors, family, and friends' },
    { entity: 'Caroline', predicates: ['symbol', 'symbols'], expected: 'love, faith, and strength' },
    { entity: 'Melanie', predicates: ['charity', 'charities'], expected: 'mental health' },
    { entity: 'Melanie', predicates: ['marriage', 'married'], expected: '5 years' },
    { entity: 'Melanie', predicates: ['children', 'child'], expected: '3' }
  ];
  
  console.log('Testing predicate variations...\n');
  
  for (const test of tests) {
    console.log(`${test.entity}: looking for "${test.expected.substring(0, 30)}..."`);
    
    for (const pred of test.predicates) {
      const res = await fetch(`${MUNINN_API}/facts/search?entity=${test.entity}&predicate=${pred}&limit=5`, {
        headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
      });
      const data = await res.json();
      
      if (data.results && data.results.length > 0) {
        for (const f of data.results) {
          const match = f.object.toLowerCase().includes(test.expected.toLowerCase().substring(0, 10));
          if (match) {
            console.log(`  ✓ ${pred}: ${f.object.substring(0, 50)}...`);
          }
        }
      }
    }
    console.log('');
  }
}

test();
