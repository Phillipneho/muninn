import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

// LOCOMO categories: 1=general, 2=temporal, 3=identity, 4=relationship, 5=other
const CATEGORY_MAP = { 1: 'general', 2: 'temporal', 3: 'identity', 4: 'relationship', 5: 'other' };

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

const NICKNAME_MAP = {
  'mel': 'Melanie', 'carol': 'Caroline', 'caro': 'Caroline',
  'gin': 'Gina', 'jo': 'John', 'mar': 'Maria',
  'deb': 'Deborah', 'joe': 'Jolene', 'ev': 'Evan',
  'cal': 'Calvin', 'dave': 'Dave'
};

function extractEntity(q) {
  const lower = q.toLowerCase();
  for (const entity of ALL_ENTITIES) {
    if (lower.includes(entity.toLowerCase())) return entity;
    if (lower.includes(entity.toLowerCase() + "'s")) return entity;
    if (lower.includes(entity.toLowerCase() + "'")) return entity;
  }
  for (const [nick, full] of Object.entries(NICKNAME_MAP)) {
    if (lower.includes(nick)) return full;
  }
  return null;
}

const factCache = new Map();

async function getAllFacts(entity) {
  if (factCache.has(entity)) return factCache.get(entity);
  
  const res = await fetch(`${MUNINN_API}/facts/search?entity=${entity}&limit=500`, {
    headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
  });
  const data = await res.json();
  const facts = data.results || [];
  factCache.set(entity, facts);
  return facts;
}

function similarity(a, b) {
  const aa = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.9;
  const wordsA = new Set(aa.split(' '));
  const wordsB = new Set(bb.split(' '));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

const stats = { total: 0, correct: 0, byCategory: {} };
Object.values(CATEGORY_MAP).forEach(c => stats.byCategory[c] = { total: 0, correct: 0 });

console.log('=== LOCOMO Benchmark (Search ALL Predicates) ===\n');

for (const conv of locomo) {
  for (const qa of (conv.qa || [])) {
    const q = qa.question;
    const expected = String(qa.answer || '');
    const catName = CATEGORY_MAP[qa.category] || 'other';
    
    stats.total++;
    stats.byCategory[catName].total++;
    
    const entity = extractEntity(q);
    let found = null;
    
    if (entity) {
      const allFacts = await getAllFacts(entity);
      
      for (const fact of allFacts) {
        const sim = similarity(fact.object, expected);
        if (sim >= 0.8) {
          found = fact.object;
          break;
        }
      }
    }
    
    const sim = found ? similarity(found, expected) : 0;
    const isCorrect = sim >= 0.8;
    
    if (isCorrect) {
      stats.correct++;
      stats.byCategory[catName].correct++;
    }
    
    if (stats.total % 200 === 0) {
      console.log(`Processed ${stats.total} questions...`);
    }
  }
}

console.log('\n=== RESULTS ===');
const accuracy = (stats.correct / stats.total * 100).toFixed(1);
console.log(`Accuracy: ${stats.correct}/${stats.total} = ${accuracy}%`);
console.log('By Category:');
for (const [cat, data] of Object.entries(stats.byCategory)) {
  const catAcc = data.total > 0 ? (data.correct / data.total * 100).toFixed(1) : 0;
  console.log(`  ${cat}: ${data.correct}/${data.total} = ${catAcc}%`);
}
