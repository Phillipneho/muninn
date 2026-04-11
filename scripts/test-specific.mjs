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

function similarity(a, b) {
  const normA = (a || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normB = (b || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.9;
  const wordsA = new Set(normA.split(' '));
  const wordsB = new Set(normB.split(' '));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

async function test() {
  const tests = [
    { entity: 'Caroline', predicate: 'qa_supports', plain: 'supports', q: 'Who supports Caroline when she has a negative experience?', expected: 'Her mentors, family, and friends' },
    { entity: 'Caroline', predicate: 'qa_traits', plain: 'traits', q: 'What personality traits might Melanie say Caroline has?', expected: 'Thoughtful, authentic, driven' },
    { entity: 'Caroline', predicate: 'qa_gift', plain: 'gift', q: 'What was grandma\'s gift to Caroline?', expected: 'necklace' },
    { entity: 'Caroline', predicate: 'qa_inspiration', plain: 'inspiration', q: 'What inspired Caroline\'s painting?', expected: 'visiting an LGBTQ center' },
    { entity: 'Melanie', predicate: 'qa_children', plain: 'children', q: 'How many children does Melanie have?', expected: '3' },
    { entity: 'Melanie', predicate: 'qa_feeling', plain: 'feeling', q: 'How did Melanie feel watching meteor shower?', expected: 'in awe' },
    { entity: 'Melanie', predicate: 'qa_reaction', plain: 'reaction', q: 'What was Melanie\'s reaction to Grand Canyon?', expected: 'happy and thankful' }
  ];
  
  console.log('Testing specific questions...\n');
  
  for (const test of tests) {
    console.log(`Q: ${test.q}`);
    console.log(`Expected: ${test.expected}`);
    
    // Try qa_ predicate first
    let facts = await searchFacts(test.entity, test.predicate);
    console.log(`  qa_${test.plain}: ${facts.length} facts`);
    
    // Try plain predicate
    if (facts.length === 0) {
      facts = await searchFacts(test.entity, test.plain);
      console.log(`  ${test.plain}: ${facts.length} facts`);
    }
    
    // Check for match
    for (const f of facts.slice(0, 3)) {
      const sim = similarity(f.object, test.expected);
      if (sim >= 0.8) {
        console.log(`  ✓ MATCH (${sim.toFixed(2)}): ${f.object.substring(0, 60)}...`);
        break;
      } else {
        console.log(`  ✗ (${sim.toFixed(2)}): ${f.object.substring(0, 40)}...`);
      }
    }
    console.log('');
  }
}

test();
