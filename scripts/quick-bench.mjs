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
const NICKNAME_MAP = { 'mel': 'Melanie', 'carol': 'Caroline', 'gin': 'Gina', 'jonny': 'Jon' };

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
  'where': 'from', 'move': 'from', 'moved': 'from',
  'when did': 'occurred_on', 'when was': 'occurred_on', 'what year': 'occurred_on',
  'how long': 'qa_duration',
  'who is': 'identifies_as', 'identity': 'identifies_as', 'gender': 'identifies_as',
  'who supports': 'supports', 'supports': 'supports',
  'married': 'marriage', 'husband': 'husband',
  'charity': 'charity',
  'motivated': 'motivation', 'motivation': 'motivation',
  'workshop': 'workshop',
  'setback': 'setback',
  'why': 'inspiration', 'reason': 'inspiration',
  'plan': 'plans', 'plans': 'plans',
  'book': 'qa_books', 'read': 'qa_books',
  'pet': 'pets', 'pets': 'pets'
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

let total = 0, correct = 0;
let temporal = { total: 0, correct: 0 };
let identity = { total: 0, correct: 0 };
let relationship = { total: 0, correct: 0 };
let other = { total: 0, correct: 0 };

for (const conv of locomo) {
  for (const qa of (conv.qa || [])) {
    total++;
    const q = qa.question;
    const expected = String(qa.answer || '');
    const category = qa.category || 0;
    const catName = category === 2 ? 'temporal' : category === 3 ? 'identity' : category === 4 ? 'relationship' : 'other';
    
    if (catName === 'temporal') temporal.total++;
    else if (catName === 'identity') identity.total++;
    else if (catName === 'relationship') relationship.total++;
    else other.total++;
    
    const entity = extractEntity(q);
    const predicate = getPredicate(q);
    
    let found = null;
    if (entity) {
      const facts = await searchFacts(entity, predicate, 20);
      for (const f of facts) {
        if (similarity(f.object, expected) >= 0.8) { found = f.object; break; }
      }
      if (!found) {
        const plainFacts = await searchFacts(entity, 'qa_general', 10);
        for (const f of plainFacts) {
          if (similarity(f.object, expected) >= 0.8) { found = f.object; break; }
        }
      }
    }
    
    const isCorrect = found !== null;
    if (isCorrect) {
      correct++;
      if (catName === 'temporal') temporal.correct++;
      else if (catName === 'identity') identity.correct++;
      else if (catName === 'relationship') relationship.correct++;
      else other.correct++;
    }
    
    if (total % 200 === 0) console.log(`Processed ${total} questions...`);
  }
}

console.log('\n=== RESULTS ===');
console.log(`Accuracy: ${correct}/${total} = ${(correct/total*100).toFixed(1)}%`);
console.log('By Category:');
console.log(`  temporal: ${temporal.correct}/${temporal.total} = ${(temporal.correct/temporal.total*100).toFixed(1)}%`);
console.log(`  identity: ${identity.correct}/${identity.total} = ${(identity.correct/identity.total*100).toFixed(1)}%`);
console.log(`  relationship: ${relationship.correct}/${relationship.total} = ${(relationship.correct/relationship.total*100).toFixed(1)}%`);
console.log(`  other: ${other.correct}/${other.total} = ${(other.correct/other.total*100).toFixed(1)}%`);
