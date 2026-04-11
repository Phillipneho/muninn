import fs from 'fs';

const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

// From benchmark-v11.mjs
const PREDICATE_MAP = {
  'research': 'qa_research',
  'researched': 'qa_research'
};

function getPredicate(question) {
  const q = question.toLowerCase();
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (q.includes(keyword)) return predicate;
  }
  return 'qa_general';
}

function extractEntity(q) {
  if (q.toLowerCase().includes('caroline')) return 'Caroline';
  return null;
}

function similarity(a, b) {
  const normA = (a || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normB = (b || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.9;
  return 0;
}

async function searchFacts(entity, predicate, limit = 20) {
  const params = new URLSearchParams({ entity, predicate, limit: String(limit) });
  const res = await fetch(`${MUNINN_API}/facts/search?${params}`, {
    headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
  });
  return (await res.json()).results || [];
}

const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

// Find "What did Caroline research?"
for (const conv of locomo) {
  for (const qa of (conv.qa || [])) {
    if (qa.question.includes('research') && qa.question.includes('Caroline')) {
      const q = qa.question;
      const expected = String(qa.answer || '');
      
      console.log(`Question: ${q}`);
      console.log(`Expected: ${expected}`);
      
      const entity = extractEntity(q);
      const predicate = getPredicate(q);
      
      console.log(`Entity: ${entity}`);
      console.log(`Predicate: ${predicate}`);
      
      // Simulate benchmark logic
      const facts = await searchFacts(entity, predicate, 20);
      console.log(`\nFacts returned: ${facts.length}`);
      
      let found = null;
      for (const fact of facts) {
        const sim = similarity(fact.object, expected);
        console.log(`  [${sim.toFixed(2)}] ${fact.object.substring(0, 50)}`);
        if (sim >= 0.8) {
          found = fact.object;
          console.log(`  ✓ MATCH!`);
          break;
        }
      }
      
      if (found) {
        console.log(`\nResult: PASS - found "${found}"`);
      } else {
        console.log(`\nResult: FAIL - no match found`);
      }
    }
  }
}
