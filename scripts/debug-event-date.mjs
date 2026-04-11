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
  const len = Math.max(aa.length, bb.length);
  let matches = 0;
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    if (aa[i] === bb[i]) matches++;
  }
  return matches / len;
}

async function test() {
  const question = "When did Caroline go to the LGBTQ support group?";
  const expected = "7 May 2023";
  
  console.log(`Question: ${question}`);
  console.log(`Expected: ${expected}\n`);
  
  // Try event_date predicate
  const eventDateFacts = await searchFacts('Caroline', 'event_date', 50);
  console.log(`event_date facts for Caroline: ${eventDateFacts.length}\n`);
  
  // Find ones mentioning "support group"
  const matching = eventDateFacts.filter(f => 
    f.object.toLowerCase().includes('support group')
  );
  
  console.log('Matching facts:');
  matching.forEach(f => console.log(`  ${f.object}`));
  
  // Check similarity
  for (const f of matching) {
    const sim = similarity(f.object, expected);
    console.log(`\nFact: "${f.object}"`);
    console.log(`Expected: "${expected}"`);
    console.log(`Similarity: ${sim.toFixed(2)}`);
  }
}

test();
