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
  'when did': 'qa_temporal', 'when was': 'qa_temporal', 'what year': 'qa_temporal', 'what date': 'qa_temporal',
  'what time': 'qa_temporal', 'which month': 'qa_temporal', 'which year': 'qa_temporal', 'which week': 'qa_temporal',
  'what day': 'qa_temporal', 'when is': 'qa_temporal',
  'how long': 'qa_duration',
  'who did': 'qa_person', 'who was': 'qa_person', 'who had': 'qa_person',
  'identity': 'qa_identity', 'gender': 'qa_identity',
  'personality': 'qa_traits', 'trait': 'qa_traits',
  'age': 'qa_age', 'how old': 'qa_age',
  'where': 'qa_location', 'live': 'qa_location', 'from': 'qa_location',
  'would be considered': 'qa_inference', 'would likely': 'qa_inference',
  'job': 'qa_occupation', 'work': 'qa_occupation', 'career': 'qa_occupation',
  'married': 'qa_relationship', 'husband': 'qa_relationship', 'wife': 'qa_relationship',
  'friend': 'qa_friends', 'friends': 'qa_friends', 'family': 'qa_family',
  'activities': 'qa_activities', 'like': 'qa_likes',
  'research': 'qa_research',
  'how many': 'qa_count',
  'what did': 'qa_what', 'what was': 'qa_what', 'what is': 'qa_what'
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

async function searchFacts(entity, predicate, limit = 10) {
  const params = new URLSearchParams({ entity, predicate, limit: String(limit) });
  const res = await fetch(`${MUNINN_API}/facts/search?${params}`, {
    headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
  });
  const data = await res.json();
  return data.results || [];
}

async function main() {
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  
  const failures = { temporal: [], relationship: [] };
  
  for (const conv of locomo) {
    if (!Array.isArray(conv.qa)) continue;
    
    for (const qa of conv.qa) {
      const q = qa.question;
      const expected = String(qa.answer || '');
      const category = qa.category || 0;
      
      if (category !== 2 && category !== 4) continue; // Only temporal and relationship
      
      const catName = category === 2 ? 'temporal' : 'relationship';
      const entity = extractEntity(q);
      const predicate = getPredicate(q);
      
      let found = null;
      if (entity) {
        const facts = await searchFacts(entity, predicate, 5);
        for (const fact of facts) {
          if (similarity(fact.object, expected) >= 0.8) {
            found = fact.object;
            break;
          }
        }
      }
      
      if (!found && failures[catName].length < 20) {
        failures[catName].push({
          question: q.substring(0, 80),
          expected: expected.substring(0, 60),
          predicate,
          entity
        });
      }
    }
  }
  
  console.log('=== TEMPORAL FAILURES ===\n');
  for (const f of failures.temporal.slice(0, 15)) {
    console.log(`Q: ${f.question}`);
    console.log(`Expected: ${f.expected}`);
    console.log(`Predicate: ${f.predicate}, Entity: ${f.entity}`);
    console.log('');
  }
  
  console.log('\n=== RELATIONSHIP FAILURES ===\n');
  for (const f of failures.relationship.slice(0, 15)) {
    console.log(`Q: ${f.question}`);
    console.log(`Expected: ${f.expected}`);
    console.log(`Predicate: ${f.predicate}, Entity: ${f.entity}`);
    console.log('');
  }
}

main();
