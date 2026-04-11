const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

const PREDICATE_MAP = {
  'who supports': 'qa_supports',
  'supports': 'qa_supports',
  'how many child': 'qa_children',
  'children': 'qa_children',
  'married': 'qa_marriage',
  'husband': 'qa_husband'
};

function getPredicate(question) {
  const q = question.toLowerCase();
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (q.includes(keyword)) return predicate;
  }
  return 'qa_general';
}

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
  const tests = [
    { q: 'Who supports Caroline when she has a negative experience?', entity: 'Caroline', expected: 'Her mentors, family, and friends' },
    { q: 'How many children does Melanie have?', entity: 'Melanie', expected: '3' },
    { q: 'How long have Mel and her husband been married?', entity: 'Melanie', expected: '5 years' }
  ];
  
  for (const test of tests) {
    const predicate = getPredicate(test.q);
    console.log(`Q: ${test.q}`);
    console.log(`  Routed to: ${predicate}`);
    
    // Try plain predicate
    const plainPredicate = predicate.startsWith('qa_') ? predicate.replace('qa_', '') : predicate;
    const plainFacts = await searchFacts(test.entity, plainPredicate, 20);
    console.log(`  Plain predicate "${plainPredicate}": ${plainFacts.length} facts`);
    for (const f of plainFacts) {
      const sim = similarity(f.object, test.expected);
      if (sim >= 0.8) console.log(`    ✓ [${sim.toFixed(2)}] ${f.object}`);
    }
    
    // Try qa_ predicate
    const qaFacts = await searchFacts(test.entity, predicate, 20);
    console.log(`  QA predicate "${predicate}": ${qaFacts.length} facts`);
    for (const f of qaFacts) {
      const sim = similarity(f.object, test.expected);
      if (sim >= 0.8) console.log(`    ✓ [${sim.toFixed(2)}] ${f.object}`);
    }
    console.log('');
  }
}

test();
