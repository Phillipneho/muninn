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
  return 0;
}

async function test() {
  const entity = 'Caroline';
  const expected = 'Her mentors, family, and friends';
  
  // Try qa_ predicate first (what PREDICATE_MAP routes to)
  const qaFacts = await searchFacts(entity, 'qa_supports', 20);
  console.log(`qa_supports: ${qaFacts.length} facts`);
  
  // Fallback: try plain predicate
  const plainFacts = await searchFacts(entity, 'supports', 20);
  console.log(`supports: ${plainFacts.length} facts`);
  
  for (const f of plainFacts) {
    const sim = similarity(f.object, expected);
    if (sim >= 0.8) {
      console.log(`✓ Found: ${f.object}`);
      return;
    }
  }
  console.log(`✗ Not found`);
}

test();
