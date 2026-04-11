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

const NICKNAME_MAP = {
  'mel': 'Melanie', 'carol': 'Caroline', 'caro': 'Caroline',
  'gin': 'Gina', 'jo': 'John', 'mar': 'Maria',
  'deb': 'Deborah', 'joe': 'Jolene', 'ev': 'Evan',
  'cal': 'Calvin', 'dave': 'Dave'
};

function getPredicate(q) {
  const lower = q.toLowerCase();
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (lower.includes(keyword)) return predicate;
  }
  return 'qa_general';
}

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

async function searchFacts(entity, predicate, limit = 20) {
  const params = new URLSearchParams({ entity, predicate, limit: String(limit) });
  const res = await fetch(`${MUNINN_API}/facts/search?${params}`, {
    headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
  });
  return (await res.json()).results || [];
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

async function test() {
  // Get relationship questions
  const relQuestions = locomo
    .flatMap(c => (c.qa || []).map(qa => ({ ...qa, sample_id: c.sample_id })))
    .filter(qa => qa.category === 4);
  
  console.log('=== Testing 20 Random Relationship Questions ===\n');
  
  const samples = relQuestions.sort(() => Math.random() - 0.5).slice(0, 20);
  
  for (const qa of samples) {
    const q = qa.question;
    const expected = String(qa.answer || '');
    const entity = extractEntity(q);
    const predicate = getPredicate(q);
    
    let found = null;
    let foundPredicate = null;
    
    if (entity) {
      // Try plain predicate
      const plainPredicate = predicate.startsWith('qa_') ? predicate.replace('qa_', '') : predicate;
      const plainFacts = await searchFacts(entity, plainPredicate, 20);
      for (const f of plainFacts) {
        if (similarity(f.object, expected) >= 0.8) {
          found = f.object;
          foundPredicate = plainPredicate;
          break;
        }
      }
      
      // Fallback: qa_ predicate
      if (!found) {
        const facts = await searchFacts(entity, predicate, 20);
        for (const f of facts) {
          if (similarity(f.object, expected) >= 0.8) {
            found = f.object;
            foundPredicate = predicate;
            break;
          }
        }
      }
      
      // Fallback: qa_general
      if (!found) {
        const generalFacts = await searchFacts(entity, 'qa_general', 20);
        for (const f of generalFacts) {
          if (similarity(f.object, expected) >= 0.8) {
            found = f.object;
            foundPredicate = 'qa_general';
            break;
          }
        }
      }
    }
    
    const isCorrect = found !== null;
    const mark = isCorrect ? '✓' : '✗';
    
    console.log(`${mark} [${predicate}] ${q.substring(0, 50)}...`);
    if (!isCorrect) {
      console.log(`   Entity: ${entity || 'NONE'}`);
      console.log(`   Expected: ${expected.substring(0, 40)}`);
      console.log(`   Found: ${found || 'null'}`);
    }
  }
}

test();
