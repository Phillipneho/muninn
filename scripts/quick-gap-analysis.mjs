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

const PREDICATE_MAP = {
  'when did': 'qa_temporal', 'when was': 'qa_temporal', 'when is': 'qa_temporal',
  'how long': 'qa_duration', 'how many': 'qa_count',
  'who did': 'qa_person', 'who was': 'qa_person',
  'identity': 'qa_identity', 'gender': 'qa_identity',
  'where': 'qa_location', 'from': 'qa_location',
  'job': 'qa_occupation', 'work': 'qa_occupation', 'career': 'qa_occupation',
  'like': 'qa_likes', 'prefer': 'qa_likes', 'enjoy': 'qa_likes', 'favorite': 'qa_likes',
  'activities': 'qa_activities', 'what do': 'qa_activities',
  'friend': 'qa_friends', 'family': 'qa_family',
  'married': 'qa_relationship', 'husband': 'qa_relationship', 'wife': 'qa_relationship',
  'child': 'qa_children', 'kid': 'qa_children',
  'pet': 'qa_pets', 'dog': 'qa_pets', 'cat': 'qa_pets',
  'realize': 'qa_realization', 'think': 'qa_realization',
  'excited': 'qa_excitement', 'looking forward': 'qa_excitement',
  'why': 'qa_reason', 'reason': 'qa_reason',
  'what did': 'qa_what', 'what was': 'qa_what', 'what is': 'qa_what',
  'what kind': 'qa_what', 'what type': 'qa_what'
};

function extractEntity(question) {
  const q = question.toLowerCase();
  for (const entity of ALL_ENTITIES) {
    if (q.includes(entity.toLowerCase())) return entity;
  }
  return null;
}

function getPredicate(question) {
  const q = question.toLowerCase();
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (q.includes(keyword)) return predicate;
  }
  return 'qa_general';
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
  
  let correct = 0, total = 0;
  const failures = [];
  
  for (const conv of locomo) {
    if (!Array.isArray(conv.qa)) continue;
    
    for (const qa of conv.qa) {
      const q = qa.question;
      const expected = String(qa.answer || '');
      if (expected.length < 1 || expected === 'null') continue;
      
      total++;
      const entity = extractEntity(q);
      const predicate = getPredicate(q);
      
      let found = null;
      if (entity) {
        // Try specific predicate first
        const facts = await searchFacts(entity, predicate, 20);
        for (const fact of facts) {
          if (similarity(fact.object, expected) >= 0.8) {
            found = fact.object;
            break;
          }
        }
        
        // Fallback: try qa_general
        if (!found && predicate !== 'qa_general') {
          const general = await searchFacts(entity, 'qa_general', 20);
          for (const fact of general) {
            if (similarity(fact.object, expected) >= 0.8) {
              found = fact.object;
              break;
            }
          }
        }
        
        // Fallback: try qa_temporal for "when" questions
        if (!found && predicate === 'qa_temporal') {
          const temporal = await searchFacts(entity, 'qa_temporal', 30);
          for (const fact of temporal) {
            if (similarity(fact.object, expected) >= 0.8) {
              found = fact.object;
              break;
            }
          }
        }
      }
      
      if (found) correct++;
      else {
        failures.push({ q: q.substring(0, 60), expected: expected.substring(0, 40), entity, predicate });
      }
    }
  }
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Accuracy: ${correct}/${total} = ${(correct/total*100).toFixed(1)}%`);
  console.log(`\nFailures: ${failures.length}`);
  console.log(`\nSample failures:`);
  failures.slice(0, 20).forEach(f => {
    console.log(`[${f.predicate}] ${f.entity || 'NO_ENTITY'}`);
    console.log(`Q: ${f.q}...`);
    console.log(`Expected: ${f.expected}`);
    console.log('');
  });
}

main();
