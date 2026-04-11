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
  // Question: "How long have Mel and her husband been married?"
  // Expected: "Mel and her husband have been married for 5 years."
  
  const entity = 'Melanie';
  const expected = 'Mel and her husband have been married for 5 years.';
  
  console.log(`Entity: ${entity}`);
  console.log(`Expected: ${expected}\n`);
  
  // Search for marriage
  const marriageFacts = await searchFacts(entity, 'marriage', 20);
  console.log(`marriage predicate: ${marriageFacts.length} facts`);
  for (const f of marriageFacts) {
    const sim = similarity(f.object, expected);
    console.log(`  [${sim.toFixed(2)}] ${f.object}`);
  }
  
  // Search for husband
  const husbandFacts = await searchFacts(entity, 'husband', 20);
  console.log(`\nhusband predicate: ${husbandFacts.length} facts`);
  for (const f of husbandFacts) {
    const sim = similarity(f.object, expected);
    console.log(`  [${sim.toFixed(2)}] ${f.object}`);
  }
  
  // Search for qa_marriage
  const qaMarriageFacts = await searchFacts(entity, 'qa_marriage', 20);
  console.log(`\nqa_marriage predicate: ${qaMarriageFacts.length} facts`);
  for (const f of qaMarriageFacts) {
    const sim = similarity(f.object, expected);
    console.log(`  [${sim.toFixed(2)}] ${f.object}`);
  }
}

test();
