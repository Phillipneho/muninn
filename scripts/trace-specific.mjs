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
  const intersection = [...wordsA].filter(x => wordsB.has(x)).length;
  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

const PREDICATE_MAP = {
  'motivated': 'motivation', 'motivation': 'motivation', 'pursue': 'motivation',
  'setback': 'setback',
  'workshop': 'workshop',
  'charity': 'charity',
  'self-care': 'selfcare', 'self care': 'selfcare',
  'plan': 'plans', 'plans': 'plans',
  'why': 'reason', 'reason': 'reason',
  'what did': 'qa_what', 'what is': 'qa_what'
};

function getPredicate(q) {
  const qLower = q.toLowerCase();
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (qLower.includes(keyword)) return predicate;
  }
  return 'qa_general';
}

async function test() {
  const tests = [
    { q: 'What motivated Caroline to pursue counseling?', entity: 'Caroline', expected: 'to help others in the LGBTQ+ community' },
    { q: 'What setback did Melanie face in October 2023?', entity: 'Melanie', expected: 'She got hurt' }
  ];
  
  for (const test of tests) {
    console.log(`\nQ: ${test.q}`);
    console.log(`Expected: ${test.expected}`);
    
    const predicate = getPredicate(test.q);
    console.log(`Routed to: ${predicate}`);
    
    // Try plain predicate
    const plainPred = predicate.startsWith('qa_') ? predicate.replace('qa_', '') : predicate;
    const plainFacts = await searchFacts(test.entity, plainPred, 20);
    console.log(`\nPlain "${plainPred}": ${plainFacts.length} facts`);
    for (const f of plainFacts) {
      const sim = similarity(f.object, test.expected);
      console.log(`  [${sim.toFixed(2)}] ${f.object}`);
    }
  }
}

test();
