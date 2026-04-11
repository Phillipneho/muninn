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
  const entity = 'Caroline';
  const expected = 'Her mentors, family, and friends';
  
  console.log('Testing: "Who supports Caroline?"');
  console.log(`Expected: ${expected}`);
  console.log(`\nStep 1: PREDICATE_MAP routes to qa_supports`);
  
  // Step 2: Try plain predicate
  console.log('\nStep 2: Try plain predicate (supports)');
  const plainFacts = await searchFacts(entity, 'supports', 20);
  console.log(`  Found ${plainFacts.length} facts`);
  for (const f of plainFacts) {
    const sim = similarity(f.object, expected);
    console.log(`  [${sim.toFixed(2)}] ${f.predicate}: ${f.object}`);
  }
  
  // Step 3: Try qa_ predicate
  console.log('\nStep 3: Try qa_ predicate (qa_supports)');
  const qaFacts = await searchFacts(entity, 'qa_supports', 20);
  console.log(`  Found ${qaFacts.length} facts`);
  
  // Final: Find match
  console.log('\nFinal result:');
  for (const f of plainFacts) {
    if (similarity(f.object, expected) >= 0.8) {
      console.log(`  ✓ MATCH: ${f.object}`);
      return;
    }
  }
  console.log('  ✗ NO MATCH');
}

test();
