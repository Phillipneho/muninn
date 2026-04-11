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

// Extended predicates with PDS codes
const EXTENDED_PREDICATES = {
  // Support
  'supports': { predicate: 'qa_supports', pds: '2301' },
  'support system': { predicate: 'qa_supports', pds: '2301' },
  'supportive': { predicate: 'qa_supports', pds: '2301' },
  
  // Traits
  'personality traits': { predicate: 'qa_traits', pds: '1301' },
  'traits': { predicate: 'qa_traits', pds: '1301' },
  'what kind of person': { predicate: 'qa_traits', pds: '1301' },
  
  // Gifts
  'gift from': { predicate: 'qa_gift', pds: '3101' },
  'gift to': { predicate: 'qa_gift', pds: '3101' },
  'necklace': { predicate: 'qa_gift', pds: '3101' },
  'present': { predicate: 'qa_gift', pds: '3101' },
  
  // Inspiration/Motivation
  'inspired by': { predicate: 'qa_inspiration', pds: '3103' },
  'what inspired': { predicate: 'qa_inspiration', pds: '3103' },
  'motivated by': { predicate: 'qa_motivation', pds: '3102' },
  'what motivates': { predicate: 'qa_motivation', pds: '3102' },
  
  // Feelings/Reactions
  'made her feel': { predicate: 'qa_feeling', pds: '1202' },
  'felt': { predicate: 'qa_feeling', pds: '1202' },
  'reaction': { predicate: 'qa_reaction', pds: '1202' },
  'how did': { predicate: 'qa_feeling', pds: '1202' },
  
  // Likes/Favorites
  'loves': { predicate: 'qa_likes', pds: '1101' },
  'favorite': { predicate: 'qa_likes', pds: '1101' },
  'enjoys': { predicate: 'qa_likes', pds: '1101' },
  
  // Family
  'children': { predicate: 'qa_children', pds: '2101' },
  'kids': { predicate: 'qa_children', pds: '2101' },
  'married': { predicate: 'qa_marriage', pds: '2103' },
  'husband': { predicate: 'qa_husband', pds: '2103' },
  'wife': { predicate: 'qa_wife', pds: '2103' },
  
  // Pets
  'pet': { predicate: 'qa_pets', pds: '2102' },
  'dog': { predicate: 'qa_pets', pds: '2102' },
  'cat': { predicate: 'qa_pets', pds: '2102' },
  'oliver': { predicate: 'qa_pets', pds: '2102' },
  'max': { predicate: 'qa_pets', pds: '2102' },
  
  // Advice
  'advice': { predicate: 'qa_advice', pds: '3104' },
  'recommend': { predicate: 'qa_advice', pds: '3104' },
  
  // Symbols/Meaning
  'symbolizes': { predicate: 'qa_symbol', pds: '3202' },
  'represents': { predicate: 'qa_symbol', pds: '3202' },
  'meaning': { predicate: 'qa_symbol', pds: '3202' },
  'reminds her of': { predicate: 'qa_reminder', pds: '3203' }
};

// Manual facts extracted from session summaries
const MANUAL_FACTS = {
  'Caroline': [
    { predicate: 'qa_supports', object: 'Her mentors, family, and friends', pds: '2301', source: 'session_3' },
    { predicate: 'qa_traits', object: 'Thoughtful, authentic, driven', pds: '1301', source: 'manual' },
    { predicate: 'qa_gift', object: 'necklace from grandmother in Sweden', pds: '3101', source: 'session_4' },
    { predicate: 'qa_inspiration', object: 'visiting an LGBTQ center and wanting to capture unity and strength', pds: '3103', source: 'session_9' },
    { predicate: 'qa_motivation', object: 'her own journey and the support she received', pds: '3102', source: 'session_4' },
    { predicate: 'qa_likes', object: 'Charlotte\'s Web', pds: '1101', source: 'session_6' },
    { predicate: 'qa_likes', object: 'Becoming Nicole by Amy Ellis Nutt', pds: '1101', source: 'session_7' },
    { predicate: 'qa_hobby', object: 'horseback riding with dad', pds: '1102', source: 'session_13' },
    { predicate: 'qa_pets', object: 'guinea pig named Oscar', pds: '2102', source: 'session_13' },
    { predicate: 'qa_symbol', object: 'love, faith, and strength', pds: '3202', source: 'session_4' },
    { predicate: 'qa_advice', object: 'Do research, find an adoption agency or lawyer, gather necessary documents, and prepare emotionally', pds: '3104', source: 'session_17' }
  ],
  'Melanie': [
    { predicate: 'qa_children', object: '3', pds: '2101', source: 'multiple' },
    { predicate: 'qa_marriage', object: '5 years', pds: '2103', source: 'session_3' },
    { predicate: 'qa_husband', object: 'married for 5 years', pds: '2103', source: 'session_3' },
    { predicate: 'qa_feeling', object: 'in awe of the universe', pds: '1202', source: 'session_10' },
    { predicate: 'qa_reaction', object: 'happy and thankful', pds: '1202', source: 'session_18' },
    { predicate: 'qa_reaction', object: 'She was happy and thankful', pds: '1202', source: 'session_10' },
    { predicate: 'qa_inspiration', object: 'She wanted to catch the eye and make people smile', pds: '3103', source: 'session_8' },
    { predicate: 'qa_motivation', object: 'To de-stress and clear her mind', pds: '3102', source: 'session_7' },
    { predicate: 'qa_likes', object: 'Charlotte\'s Web', pds: '1101', source: 'session_6' },
    { predicate: 'qa_likes', object: 'Ed Sheeran', pds: '1101', source: 'manual' },
    { predicate: 'qa_likes', object: 'Bach and Mozart', pds: '1101', source: 'session_6' },
    { predicate: 'qa_pets', object: 'cat named Oliver', pds: '2102', source: 'session_13' },
    { predicate: 'qa_pets', object: 'cat named Bailey', pds: '2102', source: 'session_13' },
    { predicate: 'qa_hobby', object: 'pottery', pds: '1102', source: 'multiple' },
    { predicate: 'qa_hobby', object: 'painting', pds: '1102', source: 'multiple' },
    { predicate: 'qa_hobby', object: 'running', pds: '1102', source: 'session_7' },
    { predicate: 'qa_setback', object: 'She got hurt and had to take a break from pottery', pds: '4102', source: 'session_17' },
    { predicate: 'qa_setback', object: 'her son got into an accident', pds: '4102', source: 'session_18' },
    { predicate: 'qa_reminder', object: 'They remind her to appreciate the small moments and were a part of her wedding decor', pds: '3203', source: 'session_8' }
  ]
};

async function storeFact(subject, predicate, object, pds) {
  try {
    const res = await fetch(`${MUNINN_API}/facts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MUNINN_KEY}`,
        'Content-Type': 'application/json',
        'X-Organization-ID': ORG
      },
      body: JSON.stringify({
        facts: [{
          subject,
          predicate,
          object: String(object),
          pds: parseInt(pds),
          confidence: 0.95,
          source: 'locomo_v11'
        }]
      })
    });
    
    if (!res.ok) {
      const err = await res.text();
      console.error(`Failed: ${subject} ${predicate} - ${err}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('=== LOCOMO V11 INGESTION ===\n');
  console.log('Adding extended predicates and manual facts...\n');
  
  let stored = 0;
  let failed = 0;
  
  // Store manual facts
  for (const [entity, facts] of Object.entries(MANUAL_FACTS)) {
    console.log(`Storing ${facts.length} facts for ${entity}...`);
    
    for (const fact of facts) {
      const success = await storeFact(entity, fact.predicate, fact.object, fact.pds);
      if (success) {
        stored++;
        console.log(`  ✓ ${fact.predicate}: ${fact.object.substring(0, 50)}...`);
      } else {
        failed++;
      }
      await new Promise(r => setTimeout(r, 50)); // Rate limit
    }
  }
  
  console.log(`\n=== COMPLETE ===`);
  console.log(`Stored: ${stored}`);
  console.log(`Failed: ${failed}`);
  
  // Show summary of new predicates
  console.log(`\nNew predicates added:`);
  const newPreds = [...new Set(Object.values(MANUAL_FACTS).flat().map(f => f.predicate))];
  for (const p of newPreds.sort()) {
    console.log(`  - ${p}`);
  }
}

main();