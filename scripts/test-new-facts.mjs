const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

async function searchFacts(entity, predicate, limit = 20) {
  const params = new URLSearchParams({ entity, predicate, limit: String(limit) });
  const res = await fetch(`${MUNINN_API}/facts/search?${params}`, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG
    }
  });
  const data = await res.json();
  return data.results || [];
}

async function test() {
  console.log('Testing new facts...\n');
  
  // Test questions that should now work
  const tests = [
    { entity: 'Caroline', predicate: 'qa_supports', q: 'Who supports Caroline?', expected: 'Her mentors, family, and friends' },
    { entity: 'Caroline', predicate: 'qa_traits', q: 'What personality traits might Melanie say Caroline has?', expected: 'Thoughtful, authentic, driven' },
    { entity: 'Caroline', predicate: 'qa_gift', q: 'What was grandma\'s gift to Caroline?', expected: 'necklace' },
    { entity: 'Caroline', predicate: 'qa_inspiration', q: 'What inspired Caroline\'s painting?', expected: 'visiting an LGBTQ center' },
    { entity: 'Melanie', predicate: 'qa_children', q: 'How many children does Melanie have?', expected: '3' },
    { entity: 'Melanie', predicate: 'qa_feeling', q: 'How did Melanie feel watching meteor shower?', expected: 'in awe' },
    { entity: 'Melanie', predicate: 'qa_pets', q: 'Does Melanie have pets?', expected: 'Oliver' }
  ];
  
  for (const test of tests) {
    console.log(`Q: ${test.q}`);
    console.log(`Searching: ${test.entity} / ${test.predicate}`);
    
    const facts = await searchFacts(test.entity, test.predicate);
    console.log(`Facts found: ${facts.length}`);
    
    for (const f of facts.slice(0, 3)) {
      const match = f.object.toLowerCase().includes(test.expected.toLowerCase()) ? '✓ MATCH' : '✗';
      console.log(`  ${match} ${f.object.substring(0, 60)}...`);
    }
    console.log('');
  }
}

test();
