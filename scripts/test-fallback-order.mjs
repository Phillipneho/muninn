const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

async function searchFacts(entity, predicate, limit = 20) {
  const params = new URLSearchParams({ entity, predicate, limit: String(limit) });
  const res = await fetch(`${MUNINN_API}/facts/search?${params}`, {
    headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
  });
  return (await res.json()).results || [];
}

function similarity(a, b) {
  const normA = (a || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normB = (b || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.9;
  return 0;
}

async function test() {
  const tests = [
    { q: 'Who supports Caroline?', entity: 'Caroline', predicate: 'qa_supports', expected: 'Her mentors, family, and friends' },
    { q: 'How long married?', entity: 'Melanie', predicate: 'qa_marriage', expected: '5 years' },
    { q: 'What inspired painting?', entity: 'Caroline', predicate: 'qa_inspiration', expected: 'visiting an LGBTQ' }
  ];
  
  for (const test of tests) {
    console.log(`\n=== ${test.q} ===`);
    console.log(`Predicate: ${test.predicate}`);
    console.log(`Expected: ${test.expected}`);
    
    // Step 1: Try plain predicate (strip qa_)
    const plainPred = test.predicate.replace('qa_', '');
    const plainFacts = await searchFacts(test.entity, plainPred, 20);
    console.log(`Plain '${plainPred}': ${plainFacts.length} facts`);
    
    let found = null;
    for (const f of plainFacts) {
      const sim = similarity(f.object, test.expected);
      if (sim >= 0.8) {
        found = f.object;
        console.log(`✓ Found in plain: ${f.object}`);
        break;
      }
    }
    
    // Step 2: Try qa_ predicate
    if (!found) {
      const qaFacts = await searchFacts(test.entity, test.predicate, 20);
      console.log(`QA '${test.predicate}': ${qaFacts.length} facts`);
      for (const f of qaFacts) {
        const sim = similarity(f.object, test.expected);
        if (sim >= 0.8) {
          found = f.object;
          console.log(`✓ Found in QA: ${f.object}`);
          break;
        }
      }
    }
    
    if (!found) {
      console.log(`✗ NOT FOUND`);
    }
  }
}

test();
