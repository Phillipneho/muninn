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
  const aa = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (aa === bb) return 1;
  const wordsA = new Set(aa.split(' '));
  const wordsB = new Set(bb.split(' '));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

async function test() {
  const question = "How many children does Melanie have?";
  const expected = "3";
  const entity = "Melanie";
  
  console.log(`Q: ${question}`);
  console.log(`Expected: ${expected}\n`);
  
  // Step 1: Try plain predicate
  const plainFacts = await searchFacts(entity, 'children', 20);
  console.log(`children (plain): ${plainFacts.length} facts`);
  for (const f of plainFacts) {
    const sim = similarity(f.object, expected);
    console.log(`  "${f.object}" → sim=${sim.toFixed(2)}`);
    if (sim >= 0.8) {
      console.log(`  ✓ MATCH`);
      return;
    }
  }
  
  // Step 2: Try qa_ predicate
  const qaFacts = await searchFacts(entity, 'qa_children', 20);
  console.log(`\nqa_children: ${qaFacts.length} facts`);
  for (const f of qaFacts) {
    const sim = similarity(f.object, expected);
    console.log(`  "${f.object}" → sim=${sim.toFixed(2)}`);
    if (sim >= 0.8) {
      console.log(`  ✓ MATCH`);
      return;
    }
  }
  
  console.log('\n✗ NO MATCH');
}

test();
