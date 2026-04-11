import fs from 'fs';

const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

const ALL_ENTITIES = ['Caroline', 'Melanie', 'Gina', 'Jon', 'John', 'Maria', 'Joanna', 'Nate', 'Tim', 'Andrew', 'Audrey', 'James', 'Deborah', 'Jolene', 'Evan', 'Sam', 'Calvin', 'Dave'];

const NICKNAME_MAP = {
  'mel': 'Melanie', 'carol': 'Caroline', 'gin': 'Gina', 'jo': 'John', 'mar': 'Maria'
};

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
  
  // Find specific failing relationship questions
  const failures = [];
  
  for (const conv of locomo) {
    if (!Array.isArray(conv.qa)) continue;
    
    for (const qa of conv.qa) {
      const cat = qa.category || 0;
      if (cat !== 4) continue; // Only relationship
      
      const q = qa.question;
      const expected = String(qa.answer || '');
      const entity = extractEntity(q);
      
      if (!entity) continue;
      
      // Try multiple predicates
      const predicates = ['supports', 'traits', 'gift', 'inspiration', 'motivation', 'feeling', 'reaction', 'children', 'husband', 'marriage', 'family', 'likes', 'hobby', 'pets'];
      
      let found = null;
      for (const pred of predicates) {
        const facts = await searchFacts(entity, pred);
        for (const f of facts) {
          if (similarity(f.object, expected) >= 0.8) {
            found = { predicate: pred, object: f.object };
            break;
          }
        }
        if (found) break;
      }
      
      if (!found && expected.length > 5) {
        failures.push({ question: q, expected, entity });
      }
    }
  }
  
  console.log(`\n=== RELATIONSHIP FAILURES (no match in any predicate) ===\n`);
  for (const f of failures.slice(0, 30)) {
    console.log(`Entity: ${f.entity}`);
    console.log(`Q: ${f.question.substring(0, 80)}...`);
    console.log(`Expected: ${f.expected.substring(0, 80)}`);
    console.log('');
  }
  
  console.log(`\nTotal relationship failures: ${failures.length}`);
}

main();
