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

const NICKNAME_MAP = {
  'mel': 'Melanie', 'carol': 'Caroline', 'gin': 'Gina',
  'jo': 'John', 'mar': 'Maria', 'deb': 'Deborah',
  'joe': 'Jolene', 'ev': 'Evan', 'cal': 'Calvin'
};

const PREDICATE_MAP = {
  'when did': 'qa_temporal', 'when was': 'qa_temporal', 'when is': 'qa_temporal',
  'how long': 'qa_duration', 'how many': 'qa_count',
  'who did': 'qa_person', 'who was': 'qa_person', 'whose': 'qa_person',
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
  'what kind': 'qa_what', 'what type': 'qa_what',
  'motivated': 'qa_motivation', 'inspired': 'qa_motivation',
  'feel': 'qa_feeling', 'how did': 'qa_feeling'
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
  if (!entity) return [];
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
  const categories = { no_entity: [], multi_entity: [], predicate_mismatch: [], fact_missing: [] };
  
  for (const conv of locomo) {
    if (!Array.isArray(conv.qa)) continue;
    
    for (const qa of conv.qa) {
      const q = qa.question;
      const expected = String(qa.answer || '');
      if (expected.length < 1 || expected === 'null') continue;
      
      const entity = extractEntity(q);
      const predicate = getPredicate(q);
      
      let found = null;
      let factsSearched = [];
      
      if (entity) {
        const facts = await searchFacts(entity, predicate, 20);
        factsSearched = facts.slice(0, 5).map(f => f.object);
        
        for (const fact of facts) {
          if (similarity(fact.object, expected) >= 0.8) {
            found = fact.object;
            break;
          }
        }
        
        // Fallback to qa_general
        if (!found && predicate !== 'qa_general') {
          const general = await searchFacts(entity, 'qa_general', 20);
          for (const fact of general) {
            if (similarity(fact.object, expected) >= 0.8) {
              found = fact.object;
              break;
            }
          }
        }
      }
      
      if (!found) {
        const failure = {
          conversation: conv.sample_id,
          question: q,
          expected,
          entity,
          predicate,
          factsSearched,
          analysis: analyzeFailure(q, expected, entity, predicate)
        };
        failures.push(failure);
        
        // Categorize
        if (!entity) {
          categories.no_entity.push(failure);
        } else if (q.toLowerCase().includes(' and ')) {
          categories.multi_entity.push(failure);
        } else if (predicate === 'qa_general' || predicate === 'qa_what') {
          categories.predicate_mismatch.push(failure);
        } else {
          categories.fact_missing.push(failure);
        }
      }
    }
  }
  
  console.log('=== FAILURE ANALYSIS ===\n');
  console.log(`Total failures: ${failures.length}`);
  console.log(`\nBy category:`);
  console.log(`  No entity: ${categories.no_entity.length}`);
  console.log(`  Multi-entity: ${categories.multi_entity.length}`);
  console.log(`  Predicate mismatch: ${categories.predicate_mismatch.length}`);
  console.log(`  Fact missing: ${categories.fact_missing.length}`);
  
  console.log('\n\n=== NO ENTITY FAILURES (need entity inference) ===\n');
  for (const f of categories.no_entity.slice(0, 15)) {
    console.log(`Q: ${f.question}`);
    console.log(`Expected: ${f.expected}`);
    console.log(`Analysis: ${f.analysis}`);
    console.log('');
  }
  
  console.log('\n=== MULTI-ENTITY FAILURES (need entity linking) ===\n');
  for (const f of categories.multi_entity.slice(0, 15)) {
    console.log(`Q: ${f.question}`);
    console.log(`Entity found: ${f.entity}`);
    console.log(`Expected: ${f.expected}`);
    console.log(`Facts searched: ${f.factsSearched.slice(0, 3).join(', ')}`);
    console.log(`Analysis: ${f.analysis}`);
    console.log('');
  }
  
  console.log('\n=== PREDICATE MISMATCH (need better predicates) ===\n');
  for (const f of categories.predicate_mismatch.slice(0, 15)) {
    console.log(`Q: ${f.question}`);
    console.log(`Predicate used: ${f.predicate}`);
    console.log(`Expected: ${f.expected}`);
    console.log(`Analysis: ${f.analysis}`);
    console.log('');
  }
  
  console.log('\n=== FACT MISSING (need to extract) ===\n');
  for (const f of categories.fact_missing.slice(0, 15)) {
    console.log(`Q: ${f.question}`);
    console.log(`Entity: ${f.entity}, Predicate: ${f.predicate}`);
    console.log(`Expected: ${f.expected}`);
    console.log(`Facts found: ${f.factsSearched.slice(0, 2).join(', ')}`);
    console.log(`Analysis: ${f.analysis}`);
    console.log('');
  }
}

function analyzeFailure(question, expected, entity, predicate) {
  const q = question.toLowerCase();
  
  // Check for implicit entities
  const implicitEntities = {
    'charity race': 'Melanie',
    'meteor shower': 'Melanie',
    'pottery workshop': 'Melanie',
    'camping': ['Melanie', 'Caroline'],
    'adoption': 'Caroline',
    'lgbtq': 'Caroline',
    'counseling': 'Caroline'
  };
  
  // Check for multi-entity patterns
  if (q.includes(' and ')) {
    return 'MULTI_ENTITY: Question references multiple entities (e.g., "Mel and kids")';
  }
  
  // Check for possessive patterns
  if (q.includes("'s ") && !entity) {
    const possessive = q.match(/(\w+)'s/);
    if (possessive) {
      return `POSSESSIVE: "${possessive[1]}" not in entity list (need to add)`;
    }
  }
  
  // Check for pet names
  const petNames = ['oliver', 'max', 'buddy', 'luna', 'bella', 'charlie'];
  for (const pet of petNames) {
    if (q.includes(pet)) {
      return `PET_NAME: "${pet}" is a pet, not in entity list`;
    }
  }
  
  // Check for implicit subject
  for (const [keyword, implied] of Object.entries(implicitEntities)) {
    if (q.includes(keyword)) {
      return `IMPLICIT_SUBJECT: "${keyword}" implies entity "${Array.isArray(implied) ? implied.join(' or ') : implied}"`;
    }
  }
  
  // Generic predicate suggestion
  if (predicate === 'qa_general' || predicate === 'qa_what') {
    // Suggest better predicate based on question
    const predicateSuggestions = {
      'motivated': 'qa_motivation',
      'inspired': 'qa_motivation',
      'feel': 'qa_feeling',
      'celebrate': 'qa_event',
      'discuss': 'qa_discussion',
      'raise awareness': 'qa_awareness',
      'symbolize': 'qa_symbol',
      'remind': 'qa_reminder',
      'gift': 'qa_gift'
    };
    
    for (const [keyword, suggestedPred] of Object.entries(predicateSuggestions)) {
      if (q.includes(keyword)) {
        return `PREDICATE_SUGGESTION: Use "${suggestedPred}" instead of "${predicate}"`;
      }
    }
  }
  
  return `FACT_MISSING: Need to extract fact: "${expected}"`;
}

main();
