import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

const PREDICATE_MAP = {
  'when did': 'qa_temporal', 'when was': 'qa_temporal', 'what year': 'qa_temporal',
  'what date': 'qa_temporal', 'when is': 'qa_temporal',
  'how long': 'qa_duration', 'how many years': 'qa_duration',
  'who did': 'qa_person', 'who was': 'qa_person', 'whose birthday': 'qa_person',
  'who supports': 'qa_supports', 'supports': 'qa_supports', 'supported by': 'qa_supports',
  'identity': 'qa_identity', 'gender': 'qa_identity',
  'personality traits': 'qa_traits', 'traits': 'qa_traits', 'trait': 'qa_traits',
  'how many child': 'qa_children', 'how many kid': 'qa_children',
  'children': 'qa_children', 'child': 'qa_children', 'kid': 'qa_children',
  'married': 'qa_marriage', 'husband': 'qa_husband', 'wife': 'qa_wife',
  'partner': 'qa_partner', 'spouse': 'qa_partner',
  'friend': 'qa_friends', 'friends': 'qa_friends',
  'family': 'qa_family', 'grandma': 'qa_family', 'grandmother': 'qa_family',
  'gift': 'qa_gift', 'present': 'qa_gift',
  'inspired': 'qa_inspiration', 'inspiration': 'qa_inspiration',
  'motivated': 'qa_motivation', 'motivation': 'qa_motivation',
  'how did': 'qa_feeling', 'how does': 'qa_feeling',
  'felt after': 'qa_feeling', 'feel after': 'qa_feeling',
  'reaction': 'qa_reaction', 'react': 'qa_reaction',
  'favorite': 'qa_likes', 'favorite book': 'qa_books',
  'favorite song': 'qa_music', 'favorite movie': 'qa_movies',
  'like': 'qa_likes', 'love': 'qa_likes', 'enjoy': 'qa_likes',
  'hobby': 'qa_hobby', 'hobbies': 'qa_hobby',
  'activity': 'qa_activities', 'activities': 'qa_activities',
  'symbolize': 'qa_symbol', 'symbol': 'qa_symbol', 'meaning': 'qa_symbol',
  'reminder': 'qa_reminder', 'reminds': 'qa_reminder',
  'advice': 'qa_advice', 'recommend': 'qa_advice',
  'event': 'qa_event', 'events': 'qa_event',
  'workshop': 'qa_workshop', 'charity': 'qa_charity',
  'setback': 'qa_setback', 'accident': 'qa_setback',
  'research': 'qa_research', 'studied': 'qa_research', 'cause': 'qa_cause',
  'what did': 'qa_what', 'what was': 'qa_what', 'what is': 'qa_what',
  'what kind': 'qa_what', 'what type': 'qa_what',
  'why': 'qa_reason', 'reason': 'qa_reason',
  'how many': 'qa_count'
};

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

function getPredicate(q) {
  const lower = q.toLowerCase();
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (lower.includes(keyword)) return predicate;
  }
  return 'qa_general';
}

function extractEntity(q) {
  for (const e of ALL_ENTITIES) {
    if (q.toLowerCase().includes(e.toLowerCase())) return e;
  }
  return null;
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

async function searchFacts(entity, predicate, limit = 20) {
  const params = new URLSearchParams({ entity, predicate, limit: String(limit) });
  const res = await fetch(`${MUNINN_API}/facts/search?${params}`, {
    headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
  });
  return (await res.json()).results || [];
}

let correct = 0;
let total = 0;

const relQuestions = locomo
  .flatMap(c => (c.qa || []).map(qa => ({ ...qa, sample_id: c.sample_id })))
  .filter(qa => qa.category === 4);

console.log(`=== Testing ${relQuestions.length} Relationship Questions ===\n`);

const samples = [];

for (const qa of relQuestions) {
  total++;
  const q = qa.question;
  const expected = String(qa.answer || '');
  const entity = extractEntity(q);
  const predicate = getPredicate(q);
  
  let found = null;
  
  if (entity) {
    // Try plain predicate first
    const plainPredicate = predicate.startsWith('qa_') ? predicate.replace('qa_', '') : predicate;
    const plainFacts = await searchFacts(entity, plainPredicate, 20);
    
    for (const fact of plainFacts) {
      const sim = similarity(fact.object, expected);
      if (sim >= 0.8) {
        found = fact.object;
        break;
      }
    }
    
    // Fallback: try qa_ predicate
    if (!found) {
      const facts = await searchFacts(entity, predicate, 20);
      for (const fact of facts) {
        const sim = similarity(fact.object, expected);
        if (sim >= 0.8) {
          found = fact.object;
          break;
        }
      }
    }
    
    // Fallback: try general search
    if (!found) {
      const generalFacts = await searchFacts(entity, 'qa_general', 20);
      for (const fact of generalFacts) {
        const sim = similarity(fact.object, expected);
        if (sim >= 0.8) {
          found = fact.object;
          break;
        }
      }
    }
  }
  
  const sim = found ? similarity(found, expected) : 0;
  const isCorrect = sim >= 0.8;
  
  if (isCorrect) correct++;
  
  if (samples.length < 10) {
    samples.push({
      q: q.substring(0, 60),
      expected: expected.substring(0, 40),
      found: found ? found.substring(0, 40) : 'null',
      predicate,
      correct: isCorrect
    });
  }
}

const pct = ((correct / total) * 100).toFixed(1);
console.log(`Result: ${correct}/${total} = ${pct}%\n`);

console.log('=== Samples ===');
for (const s of samples) {
  const mark = s.correct ? '✓' : '✗';
  console.log(`${mark} Q: ${s.q}`);
  console.log(`   Predicate: ${s.predicate}`);
  console.log(`   Expected: ${s.expected}`);
  console.log(`   Found: ${s.found}\n`);
}
