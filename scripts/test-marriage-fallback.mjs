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
  const question = "How long have Mel and her husband been married?";
  const expected = "5 years";
  const entity = "Melanie"; // "Mel" maps to "Melanie"
  const predicate = "qa_marriage"; // PREDICATE_MAP: 'married': 'qa_marriage'
  
  console.log(`Q: ${question}`);
  console.log(`Expected: ${expected}`);
  console.log(`Entity: ${entity}`);
  console.log(`Predicate: ${predicate}\n`);
  
  // Step 1: Try plain predicate
  const plainPredicate = predicate.replace('qa_', ''); // 'marriage'
  console.log(`Step 1: Search '${plainPredicate}' predicate`);
  const plainFacts = await searchFacts(entity, plainPredicate, 20);
  console.log(`  Found ${plainFacts.length} facts`);
  
  for (const f of plainFacts) {
    const sim = similarity(f.object, expected);
    console.log(`  "${f.object}" → sim=${sim.toFixed(2)}`);
    if (sim >= 0.8) {
      console.log(`  ✓ MATCH (plain predicate)`);
      return;
    }
  }
  
  // Step 2: Try qa_ predicate
  console.log(`\nStep 2: Search '${predicate}' predicate`);
  const qaFacts = await searchFacts(entity, predicate, 20);
  console.log(`  Found ${qaFacts.length} facts`);
  
  for (const f of qaFacts) {
    const sim = similarity(f.object, expected);
    console.log(`  "${f.object}" → sim=${sim.toFixed(2)}`);
    if (sim >= 0.8) {
      console.log(`  ✓ MATCH (qa_ predicate)`);
      return;
    }
  }
  
  // Step 3: Try qa_general
  console.log(`\nStep 3: Search 'qa_general' predicate`);
  const generalFacts = await searchFacts(entity, 'qa_general', 20);
  console.log(`  Found ${generalFacts.length} facts`);
  
  for (const f of generalFacts) {
    const sim = similarity(f.object, expected);
    if (sim >= 0.8) {
      console.log(`  "${f.object}" → sim=${sim.toFixed(2)} ✓`);
      return;
    }
  }
  
  console.log(`\n✗ NO MATCH`);
}

test();
