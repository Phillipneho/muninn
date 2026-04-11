const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

async function searchFacts(entity, predicate, limit = 20) {
  const params = new URLSearchParams({ entity, predicate, limit: String(limit) });
  const res = await fetch(`${MUNINN_API}/facts/search?${params}`, {
    headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
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
    { q: 'Who supports Caroline when she has a negative experience?', entity: 'Caroline', pred: 'supports', expected: 'Her mentors, family, and friends' },
    { q: 'What did the charity race raise awareness for?', entity: 'Melanie', pred: 'charity', expected: 'mental health' },
    { q: 'How many children does Melanie have?', entity: 'Melanie', pred: 'children', expected: '3' },
    { q: 'How long have Mel and her husband been married?', entity: 'Melanie', pred: 'marriage', expected: '5 years' },
    { q: "What is Melanie's reaction to Grand Canyon?", entity: 'Melanie', pred: 'reaction', expected: 'happy and thankful' }
  ];
  
  console.log('Testing relationship questions...\n');
  
  for (const test of tests) {
    console.log(`Q: ${test.q}`);
    console.log(`Expected: ${test.expected}`);
    
    // Try plain predicate
    let facts = await searchFacts(test.entity, test.pred);
    console.log(`  ${test.pred}: ${facts.length} facts`);
    
    for (const f of facts.slice(0, 3)) {
      const sim = similarity(f.object, test.expected);
      console.log(`    [${sim.toFixed(2)}] ${f.object.substring(0, 50)}...`);
      if (sim >= 0.8) {
        console.log(`    ✓ MATCH`);
        break;
      }
    }
    console.log('');
  }
}

test();
