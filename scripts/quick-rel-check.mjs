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

async function test() {
  console.log('=== Relationship Facts After Ingest ===\n');
  
  const tests = [
    { entity: 'Melanie', predicate: 'qa_marriage', expected: '5 years' },
    { entity: 'Melanie', predicate: 'qa_charity', expected: 'mental health' },
    { entity: 'Caroline', predicate: 'qa_marriage', expected: '5 years' }
  ];
  
  for (const t of tests) {
    const facts = await searchFacts(t.entity, t.predicate, 10);
    const found = facts.find(f => f.object.includes(t.expected));
    const status = found ? '✓' : '✗';
    console.log(`${status} ${t.entity}.${t.predicate}: ${found?.object || 'NOT FOUND'}`);
  }
}

test();
