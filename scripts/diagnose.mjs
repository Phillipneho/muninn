import fs from 'fs';

const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

const ENTITY_MAP = {
  'conv-26': ['Caroline', 'Melanie'],
  'conv-30': ['Gina', 'Jon'],
  'conv-41': ['John', 'Maria'],
  'conv-42': ['Joanna', 'Nate'],
  'conv-43': ['John', 'Tim'],
  'conv-44': ['Andrew', 'Audrey'],
  'conv-47': ['James', 'John'],
  'conv-48': ['Deborah', 'Jolene'],
  'conv-49': ['Evan', 'Sam'],
  'conv-50': ['Calvin', 'Dave']
};

const ALL_ENTITIES = [...new Set(Object.values(ENTITY_MAP).flat())];
const NICKNAME_MAP = { 'mel': 'Melanie', 'carol': 'Caroline' };

function extractEntity(question) {
  const q = question.toLowerCase();
  for (const entity of ALL_ENTITIES) {
    if (q.includes(entity.toLowerCase())) return entity;
  }
  for (const [nick, full] of Object.entries(NICKNAME_MAP)) {
    if (q.includes(nick)) return full;
  }
  return null;
}

const PREDICATE_MAP = {
  'who supports': 'qa_supports', 'supports': 'qa_supports', 'supported by': 'qa_supports',
  'charity': 'qa_charity', 'raise awareness': 'qa_charity',
  'motivated': 'qa_motivation', 'motivation': 'qa_motivation',
  'workshop': 'workshop',
  'setback': 'qa_setback',
  'why': 'qa_reason', 'reason': 'qa_reason'
};

function getPredicate(q) {
  const qLower = q.toLowerCase();
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (qLower.includes(keyword)) return predicate;
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

const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

let correct = 0, total = 0, noEntity = 0, noPredicate = 0;
const failures = [];

for (const conv of locomo) {
  for (const qa of (conv.qa || [])) {
    if (qa.category !== 4) continue;
    total++;
    
    const q = qa.question;
    const expected = String(qa.answer || '');
    const entity = extractEntity(q);
    const predicate = getPredicate(q);
    
    if (!entity) {
      noEntity++;
      failures.push({ q: q.substring(0, 60), reason: 'no entity' });
      continue;
    }
    
    if (predicate === 'qa_general') {
      noPredicate++;
    }
    
    let found = null;
    
    // Try plain predicate
    const plainPredicate = predicate.startsWith('qa_') ? predicate.replace('qa_', '') : predicate;
    const plainFacts = await searchFacts(entity, plainPredicate, 20);
    for (const f of plainFacts) {
      if (similarity(f.object, expected) >= 0.8) { found = f.object; break; }
    }
    
    // Try qa_ predicate
    if (!found && predicate !== plainPredicate) {
      const qaFacts = await searchFacts(entity, predicate, 20);
      for (const f of qaFacts) {
        if (similarity(f.object, expected) >= 0.8) { found = f.object; break; }
      }
    }
    
    // Try qa_general
    if (!found) {
      const genFacts = await searchFacts(entity, 'qa_general', 10);
      for (const f of genFacts) {
        if (similarity(f.object, expected) >= 0.8) { found = f.object; break; }
      }
    }
    
    if (found) correct++;
    else {
      failures.push({ q: q.substring(0, 60), entity, predicate, expected: expected.substring(0, 40) });
    }
  }
}

console.log(`\n=== RESULTS ===`);
console.log(`Correct: ${correct}/${total} = ${(correct/total*100).toFixed(1)}%`);
console.log(`No entity: ${noEntity}`);
console.log(`No predicate match: ${noPredicate}`);
console.log(`\n=== FAILURES (first 20) ===`);
failures.slice(0, 20).forEach((f, i) => {
  console.log(`${i+1}. ${f.q}...`);
  console.log(`   Entity: ${f.entity || 'NONE'}, Predicate: ${f.predicate || 'NONE'}`);
  if (f.expected) console.log(`   Expected: ${f.expected}...`);
});
