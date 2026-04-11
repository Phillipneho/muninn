import fs from 'fs';

const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

async function searchFacts(entity, predicate, limit = 20) {
  const params = new URLSearchParams({ entity, predicate, limit: String(limit) });
  const res = await fetch(`${MUNINN_API}/facts/search?${params}`, {
    headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
  });
  return (await res.json()).results || [];
}

function extractEntity(q) {
  if (q.toLowerCase().includes('caroline')) return 'Caroline';
  if (q.toLowerCase().includes('melanie') || q.toLowerCase().includes('mel ')) return 'Melanie';
  return null;
}

const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

console.log('=== Analyzing failures by searching qa_general ===\n');

let failures = [];

for (const conv of locomo) {
  for (const qa of (conv.qa || [])) {
    const q = qa.question;
    const expected = String(qa.answer || '');
    const entity = extractEntity(q);
    
    if (!entity) continue;
    
    // Check if answer exists in qa_general
    const general = await searchFacts(entity, 'qa_general', 30);
    let found = false;
    for (const f of general) {
      if (f.object.toLowerCase().includes(expected.toLowerCase()) ||
          expected.toLowerCase().includes(f.object.toLowerCase())) {
        found = true;
        break;
      }
    }
    
    // If not found, check all predicates
    if (!found) {
      const allFacts = await searchFacts(entity, 'any', 500);
      let foundIn = null;
      for (const f of allFacts) {
        if (f.object.toLowerCase().includes(expected.toLowerCase()) ||
            expected.toLowerCase().includes(f.object.toLowerCase())) {
          foundIn = f.predicate;
          break;
        }
      }
      failures.push({ q: q.substring(0, 60), expected: expected.substring(0, 40), entity, foundIn });
    }
  }
}

console.log(`Total failures: ${failures.length}\n`);
console.log('=== Sample failures ===\n');

for (const f of failures.slice(0, 15)) {
  console.log(`Q: ${f.q}...`);
  console.log(`Expected: ${f.expected}`);
  console.log(`Entity: ${f.entity}`);
  console.log(`Found in: ${f.foundIn || 'NOT FOUND'}`);
  console.log('');
}
