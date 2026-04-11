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
  // Test a few relationship questions
  const tests = [
    { q: 'How many children does Melanie have?', entity: 'Melanie', preds: ['qa_children', 'children', 'has_child_count'], expected: '3' },
    { q: 'How long have Mel and her husband been married?', entity: 'Melanie', preds: ['marriage', 'qa_marriage', 'husband'], expected: '5 years' },
    { q: 'What is Caroline relationship status?', entity: 'Caroline', preds: ['qa_status', 'status', 'qa_relationship'], expected: 'Single' }
  ];
  
  for (const test of tests) {
    console.log(`Q: ${test.q}`);
    console.log(`Expected: ${test.expected}`);
    
    for (const pred of test.preds) {
      const facts = await searchFacts(test.entity, pred);
      if (facts.length > 0) {
        for (const f of facts) {
          const sim = similarity(f.object, test.expected);
          if (sim >= 0.8) {
            console.log(`  ✓ [${sim.toFixed(2)}] ${pred}: ${f.object}`);
          }
        }
      }
    }
    console.log('');
  }
}

test();
