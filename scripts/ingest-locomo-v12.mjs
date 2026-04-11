import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

// Extended facts extracted from session summaries - ALL entities
const EXTENDED_FACTS = {
  'Caroline': [
    // Support/Traits
    { predicate: 'supports', object: 'Her mentors, family, and friends', pds: 2301 },
    { predicate: 'traits', object: 'Thoughtful, authentic, driven', pds: 1204 },
    
    // Family/Gifts
    { predicate: 'gift', object: 'necklace from grandmother in Sweden', pds: 2203 },
    { predicate: 'family', object: 'grandmother in Sweden', pds: 2202 },
    { predicate: 'hobby', object: 'horseback riding with dad', pds: 1401 },
    
    // Inspiration/Motivation
    { predicate: 'inspiration', object: 'visiting an LGBTQ center and wanting to capture unity and strength', pds: 3103 },
    { predicate: 'motivation', object: 'her own journey and the support she received', pds: 3102 },
    { predicate: 'motivation', object: 'to help others in the LGBTQ+ community', pds: 3102 },
    
    // Books/Likes
    { predicate: 'likes', object: "Charlotte's Web", pds: 1401 },
    { predicate: 'likes', object: 'Becoming Nicole by Amy Ellis Nutt', pds: 1401 },
    { predicate: 'symbol', object: 'love, faith, and strength', pds: 1502 },
    
    // Pets
    { predicate: 'pets', object: 'guinea pig named Oscar', pds: 1407 },
    
    // Advice
    { predicate: 'advice', object: 'Do research, find an adoption agency or lawyer, gather necessary documents, and prepare emotionally', pds: 3104 },
    
    // Counseling/Mental Health
    { predicate: 'interest', object: 'counseling or mental health for Transgender people', pds: 1205 },
    { predicate: 'workshop', object: 'LGBTQ+ counseling workshop about therapeutic methods', pds: 1409 },
    
    // Events
    { predicate: 'event', object: 'transgender poetry reading where transgender people shared their stories', pds: 1410 },
    { predicate: 'event', object: 'pride parade where she felt a sense of belonging and community', pds: 1410 },
    
    // Library
    { predicate: 'library', object: "kids' books - classics, stories from different cultures, educational books", pds: 1402 },
    
    // Art
    { predicate: 'art', object: 'abstract painting with blue streaks on a wall', pds: 1406 },
    { predicate: 'art', object: 'stained glass window for a local church', pds: 1406 },
    { predicate: 'art', object: 'mural representing transgender pride and visibility', pds: 1406 }
  ],
  
  'Melanie': [
    // Family
    { predicate: 'children', object: '3', pds: 2102 },
    { predicate: 'marriage', object: '5 years', pds: 2101 },
    { predicate: 'husband', object: 'married for 5 years', pds: 2101 },
    
    // Feelings/Reactions
    { predicate: 'feeling', object: 'in awe of the universe', pds: 1504 },
    { predicate: 'reaction', object: 'happy and thankful', pds: 1504 },
    { predicate: 'reaction', object: 'She was happy and thankful', pds: 1504 },
    { predicate: 'feeling', object: 'Grateful and thankful for her family', pds: 1504 },
    
    // Inspiration/Motivation
    { predicate: 'inspiration', object: 'She wanted to catch the eye and make people smile', pds: 3103 },
    { predicate: 'motivation', object: 'To de-stress and clear her mind', pds: 3102 },
    { predicate: 'reminder', object: 'They remind her to appreciate the small moments and were a part of her wedding decor', pds: 1502 },
    
    // Likes
    { predicate: 'likes', object: "Charlotte's Web", pds: 1401 },
    { predicate: 'likes', object: 'Ed Sheeran', pds: 1401 },
    { predicate: 'likes', object: 'Bach and Mozart', pds: 1401 },
    
    // Pets
    { predicate: 'pets', object: 'cat named Oliver', pds: 1407 },
    { predicate: 'pets', object: 'cat named Bailey', pds: 1407 },
    { predicate: 'pets', object: 'Oliver, Luna, Bailey', pds: 1407 },
    
    // Hobbies
    { predicate: 'hobby', object: 'pottery', pds: 1401 },
    { predicate: 'hobby', object: 'painting', pds: 1401 },
    { predicate: 'hobby', object: 'running', pds: 1401 },
    
    // Setbacks
    { predicate: 'setback', object: 'She got hurt and had to take a break from pottery', pds: 4102 },
    { predicate: 'setback', object: 'her son got into an accident', pds: 4102 },
    
    // Family activities
    { predicate: 'activity', object: 'camping with family', pds: 1401 },
    { predicate: 'activity', object: 'pottery workshop with kids', pds: 1401 },
    { predicate: 'activity', object: 'painting with kids', pds: 1401 },
    { predicate: 'activity', object: 'visiting museum with kids', pds: 1401 },
    
    // Art
    { predicate: 'art', object: 'pottery bowl with colors and patterns', pds: 1406 },
    { predicate: 'art', object: 'pottery plate', pds: 1406 },
    
    // Charity
    { predicate: 'charity', object: 'charity race for mental health awareness', pds: 1411 }
  ],
  
  'Gina': [
    { predicate: 'likes', object: 'dance', pds: 1401 },
    { predicate: 'feeling', object: 'magical', pds: 1504 },
    { predicate: 'hobby', object: 'dance', pds: 1401 },
    { predicate: 'interest', object: 'fashion trends and finding unique pieces', pds: 1401 },
    { predicate: 'partner', object: 'Jon', pds: 2101 },
    { predicate: 'setback', object: 'lost her job', pds: 4102 }
  ],
  
  'Jon': [
    { predicate: 'partner', object: 'Gina', pds: 2101 },
    { predicate: 'traits', object: 'positivity and determination', pds: 1204 },
    { predicate: 'setback', object: 'lost his job', pds: 4102 }
  ],
  
  'John': [
    { predicate: 'hobby', object: 'hiking', pds: 1401 },
    { predicate: 'hobby', object: 'camping', pds: 1401 },
    { predicate: 'family', object: 'wife and kids', pds: 2202 },
    { predicate: 'motivation', object: 'to raise awareness and start conversations to create positive change', pds: 3102 },
    { predicate: 'research', object: 'education reform and infrastructure development', pds: 3101 },
    { predicate: 'cause', object: 'veterans rights', pds: 1411 },
    { predicate: 'feeling', object: 'heartwarming', pds: 1504 },
    { predicate: 'setback', object: 'flood in his old area', pds: 4102 }
  ],
  
  'Maria': [
    { predicate: 'family', object: 'mother', pds: 2202 },
    { predicate: 'activity', object: 'picnic with church friends', pds: 1401 },
    { predicate: 'activity', object: 'hiking', pds: 1401 },
    { predicate: 'activity', object: 'volunteer work at homeless shelter', pds: 1411 },
    { predicate: 'hobby', object: 'kundalini yoga', pds: 1401 },
    { predicate: 'hobby', object: 'poetry and creative writing', pds: 1401 },
    { predicate: 'motivation', object: 'witnessed a family struggling on the streets', pds: 3102 },
    { predicate: 'interest', object: 'military memorials', pds: 1409 }
  ],
  
  'Joanna': [
    { predicate: 'hobby', object: 'writing', pds: 1401 },
    { predicate: 'hobby', object: 'screenwriting', pds: 1401 },
    { predicate: 'likes', object: 'Eternal Sunshine of the Spotless Mind', pds: 1401 },
    { predicate: 'likes', object: 'Dramas and emotionally-driven films', pds: 1401 },
    { predicate: 'partner', object: 'Nate', pds: 2101 },
    { predicate: 'interest', object: 'reptiles and animals with fur', pds: 1401 }
  ],
  
  'Nate': [
    { predicate: 'partner', object: 'Joanna', pds: 2101 },
    { predicate: 'likes', object: 'fantasy and sci-fi movies', pds: 1401 },
    { predicate: 'likes', object: 'coconut milk ice cream', pds: 1401 },
    { predicate: 'hobby', object: 'making ice cream', pds: 1401 }
  ],
  
  'Andrew': [
    { predicate: 'hobby', object: 'photography', pds: 1401 },
    { predicate: 'interest', object: 'vintage cars', pds: 1401 }
  ],
  
  'Audrey': [
    { predicate: 'partner', object: 'Andrew', pds: 2101 },
    { predicate: 'hobby', object: 'photography', pds: 1401 }
  ],
  
  'James': [
    { predicate: 'partner', object: 'John', pds: 2101 }
  ],
  
  'Deborah': [
    { predicate: 'partner', object: 'Jolene', pds: 2101 }
  ],
  
  'Jolene': [
    { predicate: 'partner', object: 'Deborah', pds: 2101 }
  ],
  
  'Evan': [
    { predicate: 'partner', object: 'Sam', pds: 2101 }
  ],
  
  'Sam': [
    { predicate: 'partner', object: 'Evan', pds: 2101 }
  ],
  
  'Calvin': [
    { predicate: 'partner', object: 'Dave', pds: 2101 }
  ],
  
  'Dave': [
    { predicate: 'partner', object: 'Calvin', pds: 2101 }
  ]
};

async function storeFacts(facts) {
  if (facts.length === 0) return { inserted: 0, facts: [] };
  
  const entityNames = [...new Set(facts.map(f => f.subject))];
  const entities = entityNames.map(name => ({ name, type: 'person' }));
  
  const res = await fetch(`${MUNINN_API}/facts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': ORG
    },
    body: JSON.stringify({ facts, entities })
  });
  
  const data = await res.json();
  return { inserted: data.inserted || 0, facts: data.facts || [] };
}

async function main() {
  console.log('=== LOCOMO V12 EXTENDED EXTRACTION ===\n');
  console.log('Adding comprehensive facts for all entities...\n');
  
  let totalStored = 0;
  let totalAttempted = 0;
  
  for (const [entity, entityFacts] of Object.entries(EXTENDED_FACTS)) {
    const facts = entityFacts.map(f => ({
      subject: entity,
      predicate: f.predicate,
      object: String(f.object),
      pds: f.pds,
      confidence: 0.95,
      source: 'locomo_v12_extended'
    }));
    
    totalAttempted += facts.length;
    const result = await storeFacts(facts);
    totalStored += result.inserted;
    
    if (result.inserted > 0) {
      console.log(`${entity}: Stored ${result.inserted}/${facts.length} facts`);
    }
    
    await new Promise(r => setTimeout(r, 50));
  }
  
  console.log(`\n=== COMPLETE ===`);
  console.log(`Total attempted: ${totalAttempted}`);
  console.log(`Total stored: ${totalStored}`);
  console.log(`New predicates added:`);
  
  const allPreds = [...new Set(Object.values(EXTENDED_FACTS).flat().map(f => f.predicate))];
  console.log(allPreds.sort().join(', '));
}

main();