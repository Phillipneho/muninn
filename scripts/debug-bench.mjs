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

function extractEntity(question) {
  const q = question.toLowerCase();
  for (const entity of ALL_ENTITIES) {
    if (q.includes(entity.toLowerCase())) return entity;
  }
  // Nickname mapping
  const NICKNAMES = { 'mel': 'Melanie', 'carol': 'Caroline', 'gin': 'Gina', 'jonny': 'Jon' };
  for (const [nick, full] of Object.entries(NICKNAMES)) {
    if (q.includes(nick)) return full;
  }
  return null;
}

const PREDICATE_MAP = {
  'motivated': 'qa_motivation', 'motivation': 'qa_motivation', 'pursue': 'qa_motivation',
  'setback': 'qa_setback',
  'workshop': 'workshop',
  'charity': 'qa_charity',
  'self-care': 'qa_selfcare', 'self care': 'qa_selfcare',
  'plan': 'qa_plans', 'plans': 'qa_plans',
  'why': 'qa_reason', 'reason': 'qa_reason',
  'what did': 'qa_what', 'what is': 'qa_what'
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

// Find specific relationship questions
let count = 0;
for (const conv of locomo) {
  for (const qa of (conv.qa || [])) {
    if (qa.category === 4 && count < 5) {
      const q = qa.question;
      const expected = String(qa.answer || '');
      const entity = extractEntity(q);
      const predicate = getPredicate(q);
      
      if (entity && predicate !== 'qa_general') {
        const plainPred = predicate.startsWith('qa_') ? predicate.replace('qa_', '') : predicate;
        const plainFacts = await searchFacts(entity, plainPred, 20);
        const qaFacts = await searchFacts(entity, predicate, 20);
        
        let found = null;
        for (const f of plainFacts) {
          if (similarity(f.object, expected) >= 0.8) { found = f.object; break; }
        }
        if (!found) {
          for (const f of qaFacts) {
            if (similarity(f.object, expected) >= 0.8) { found = f.object; break; }
          }
        }
        
        const isCorrect = found !== null;
        console.log(`\n${isCorrect ? '✓' : '✗'} ${q}`);
        console.log(`  Entity: ${entity}, Predicate: ${predicate} → plain: ${plainPred}`);
        console.log(`  Plain facts: ${plainFacts.length}, QA facts: ${qaFacts.length}`);
        console.log(`  Expected: ${expected.substring(0, 60)}...`);
        console.log(`  Found: ${found ? found.substring(0, 60) : 'NONE'}...`);
        count++;
      }
    }
  }
}
