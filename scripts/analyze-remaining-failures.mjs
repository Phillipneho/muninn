import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

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
    if (q.includes(entity.toLowerCase() + "'s")) return entity;
  }
  return null;
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

async function searchFacts(entity, predicate, limit = 20) {
  const params = new URLSearchParams({ entity, predicate, limit: String(limit) });
  const res = await fetch(`${MUNINN_API}/facts/search?${params}`, {
    headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
  });
  const data = await res.json();
  return data.results || [];
}

async function main() {
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  
  const failures = [];
  
  for (const conv of locomo) {
    if (!Array.isArray(conv.qa)) continue;
    
    for (const qa of conv.qa) {
      const q = qa.question;
      const expected = String(qa.answer || '');
      const category = qa.category || 0;
      
      const catName = ['temporal', 'identity', 'relationship', 'relationship', 'other'][category] || 'other';
      const entity = extractEntity(q);
      
      let found = null;
      if (entity) {
        const facts = await searchFacts(entity, 'qa_general', 20);
        for (const fact of facts) {
          if (similarity(fact.object, expected) >= 0.8) {
            found = fact.object;
            break;
          }
        }
      }
      
      if (!found) {
        failures.push({
          category: catName,
          question: q.substring(0, 80),
          expected: expected.substring(0, 60),
          entity
        });
      }
      
      if (failures.length >= 50) break;
    }
    if (failures.length >= 50) break;
  }
  
  console.log(`=== ${failures.length} FAILURES ===\n`);
  
  const byCategory = {};
  for (const f of failures) {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  }
  
  console.log('By Category:', byCategory);
  console.log('\nSample failures:\n');
  
  for (const f of failures.slice(0, 30)) {
    console.log(`[${f.category}] Entity: ${f.entity}`);
    console.log(`Q: ${f.question}`);
    console.log(`Expected: ${f.expected}`);
    console.log('');
  }
}

main();
