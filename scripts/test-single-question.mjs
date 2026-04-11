const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

const PREDICATE_MAP = {
  'when did': 'qa_temporal', 'when was': 'qa_temporal', 'what year': 'qa_temporal', 'what date': 'qa_temporal',
  'what time': 'qa_temporal', 'which month': 'qa_temporal', 'which year': 'qa_temporal', 'which week': 'qa_temporal',
  'what day': 'qa_temporal', 'when is': 'qa_temporal',
  'how long': 'qa_duration',
};

const ALL_ENTITIES = ['Caroline', 'Melanie', 'Gina', 'Jon', 'John', 'Maria', 'Joanna', 'Nate', 'Tim', 'Andrew', 'Audrey', 'James', 'Deborah', 'Jolene', 'Evan', 'Sam', 'Calvin', 'Dave'];

function extractEntity(question) {
  const q = question.toLowerCase();
  for (const entity of ALL_ENTITIES) {
    if (q.includes(entity.toLowerCase())) return entity;
    if (q.includes(entity.toLowerCase() + "'s")) return entity;
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

async function test() {
  const question = "When did Melanie go camping in July?";
  const expected = "two weekends before 17 July 2023";
  
  const entity = extractEntity(question);
  const predicate = getPredicate(question);
  
  console.log('Question:', question);
  console.log('Entity:', entity);
  console.log('Predicate:', predicate);
  console.log('Expected:', expected);
  
  const facts = await searchFacts(entity, predicate, 20);
  console.log('\nFacts found:', facts.length);
  
  for (const fact of facts) {
    const sim = similarity(fact.object, expected);
    console.log(`  ${fact.object} → similarity: ${sim.toFixed(2)}`);
    if (sim >= 0.8) {
      console.log('  ✓ MATCH!');
    }
  }
}

test();
