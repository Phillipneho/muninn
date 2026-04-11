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

// Same PREDICATE_MAP as benchmark-v10.mjs
const PREDICATE_MAP = {
  'when did': 'qa_temporal', 'when was': 'qa_temporal', 'what year': 'qa_temporal',
  'how long': 'qa_duration',
  'who is': 'qa_identity', 'identity': 'qa_identity',
  'who supports': 'qa_supports', 'supports': 'qa_supports',
  'married': 'qa_marriage', 'husband': 'qa_husband',
  'children': 'qa_children', 'child': 'qa_children', 'kid': 'qa_children',
  'charity': 'qa_charity',
  'motivated': 'qa_motivation', 'motivation': 'qa_motivation',
  'workshop': 'workshop',
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
  return (await res.json()).results || [];
}

function similarity(a, b) {
  const normA = (a || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normB = (b || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.9;
  return 0;
}

const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

// Find specific failing questions
console.log('=== TRACING RELATIONSHIP QUESTIONS ===\n');
let count = 0;

for (const conv of locomo) {
  for (const qa of (conv.qa || [])) {
    if (qa.category !== 4) continue;
    if (count >= 10) break;
    
    const q = qa.question;
    const expected = String(qa.answer || '');
    const entity = extractEntity(q);
    const predicate = getPredicate(q);
    
    if (predicate === 'qa_general' && entity) {
      console.log(`Q: ${q.substring(0, 70)}...`);
      console.log(`Entity: ${entity}, Predicate: ${predicate}`);
      console.log(`Expected: ${expected.substring(0, 50)}...`);
      
      // Check if qa_general has the answer
      const facts = await searchFacts(entity, 'qa_general', 20);
      for (const f of facts) {
        if (similarity(f.object, expected) >= 0.8) {
          console.log(`Found in qa_general: ${f.object.substring(0, 50)}`);
          break;
        }
      }
      console.log('');
      count++;
    }
  }
  if (count >= 10) break;
}
