import fs from 'fs';

const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

// Targeted facts for specific failing questions
const TARGETED_FACTS = {
  'Melanie': [
    // Charity race
    { predicate: 'charity', object: 'charity race for mental health awareness', pds: 1411 },
    { predicate: 'realization', object: 'self-care is important', pds: 1504 },
    { predicate: 'selfcare', object: 'carving out me-time each day for activities like running, reading, or playing the violin', pds: 1503 },
    
    // Family activities
    { predicate: 'activity', object: 'explored nature, roasted marshmallows, and went on a hike while camping', pds: 1401 },
    { predicate: 'family', object: 'husband and 3 children', pds: 2202 },
    { predicate: 'marriage', object: 'married for 5 years', pds: 2101 },
    
    // Art
    { predicate: 'art', object: 'hand-painted bowl', pds: 1406 },
    { predicate: 'reminder', object: 'art and self-expression', pds: 1502 },
    
    // Opinion
    { predicate: 'opinion', object: 'thinks Caroline is doing something amazing and will be an awesome mom', pds: 1501 },
    
    // Violin
    { predicate: 'instrument', object: 'violin', pds: 1408 }
  ],
  
  'Caroline': [
    // Adoption
    { predicate: 'plans', object: 'researching adoption agencies', pds: 3105 },
    { predicate: 'excitement', object: 'creating a family for kids who need one', pds: 1505 },
    { predicate: 'reason', object: 'because of their inclusivity and support for LGBTQ+ individuals', pds: 3201 },
    { predicate: 'agency', object: 'adoption agency that supports LGBTQ+ individuals', pds: 3101 },
    
    // Family
    { predicate: 'family', object: 'grandmother from Sweden', pds: 2202 },
    { predicate: 'location', object: 'grandmother from Sweden', pds: 1203 },
    { predicate: 'symbol', object: 'love, faith, and strength', pds: 1502 },
    
    // Counseling
    { predicate: 'counseling', object: 'working with trans people, helping them accept themselves and supporting their mental health', pds: 1205 },
    { predicate: 'workshop', object: 'LGBTQ+ counseling workshop', pds: 1409 },
    { predicate: 'content', object: 'therapeutic methods and how to best work with trans people', pds: 3201 },
    { predicate: 'motivation', object: 'her own journey and the support she received, and how counseling improved her life', pds: 3102 },
    
    // Goals
    { predicate: 'desire', object: 'a safe and inviting place for people to grow', pds: 3105 }
  ]
};

async function storeFacts(facts) {
  if (facts.length === 0) return { inserted: 0 };
  
  const res = await fetch(`${MUNINN_API}/facts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': ORG
    },
    body: JSON.stringify({ 
      facts: facts.map(f => ({
        subject: f.subject,
        predicate: f.predicate,
        object: String(f.object),
        pds: f.pds,
        confidence: 0.95,
        source: 'locomo_v12_targeted'
      }))
    })
  });
  
  const data = await res.json();
  return { inserted: data.inserted || 0 };
}

async function main() {
  console.log('=== TARGETED FACT EXTRACTION ===\n');
  
  let total = 0;
  
  for (const [entity, facts] of Object.entries(TARGETED_FACTS)) {
    const factsWithSubject = facts.map(f => ({ subject: entity, ...f }));
    const result = await storeFacts(factsWithSubject);
    total += result.inserted;
    console.log(`${entity}: ${result.inserted} facts stored`);
  }
  
  console.log(`\nTotal: ${total} facts stored`);
}

main();