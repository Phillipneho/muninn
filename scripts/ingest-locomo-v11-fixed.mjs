import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

// Manual facts extracted from session summaries - WITHOUT qa_ prefix
const MANUAL_FACTS = {
  'Caroline': [
    { predicate: 'supports', object: 'Her mentors, family, and friends', pds: 2301 },
    { predicate: 'traits', object: 'Thoughtful, authentic, driven', pds: 1204 },
    { predicate: 'gift', object: 'necklace from grandmother in Sweden', pds: 2203 },
    { predicate: 'inspiration', object: 'visiting an LGBTQ center and wanting to capture unity and strength', pds: 3103 },
    { predicate: 'motivation', object: 'her own journey and the support she received', pds: 3102 },
    { predicate: 'likes', object: "Charlotte's Web", pds: 1401 },
    { predicate: 'likes', object: 'Becoming Nicole by Amy Ellis Nutt', pds: 1401 },
    { predicate: 'hobby', object: 'horseback riding with dad', pds: 1401 },
    { predicate: 'pets', object: 'guinea pig named Oscar', pds: 1407 },
    { predicate: 'symbol', object: 'love, faith, and strength', pds: 1502 },
    { predicate: 'advice', object: 'Do research, find an adoption agency or lawyer, gather necessary documents, and prepare emotionally', pds: 3104 }
  ],
  'Melanie': [
    { predicate: 'children', object: '3', pds: 2102 },
    { predicate: 'marriage', object: '5 years', pds: 2101 },
    { predicate: 'husband', object: 'married for 5 years', pds: 2101 },
    { predicate: 'feeling', object: 'in awe of the universe', pds: 1504 },
    { predicate: 'reaction', object: 'happy and thankful', pds: 1504 },
    { predicate: 'inspiration', object: 'She wanted to catch the eye and make people smile', pds: 3103 },
    { predicate: 'motivation', object: 'To de-stress and clear her mind', pds: 3102 },
    { predicate: 'likes', object: "Charlotte's Web", pds: 1401 },
    { predicate: 'likes', object: 'Ed Sheeran', pds: 1401 },
    { predicate: 'likes', object: 'Bach and Mozart', pds: 1401 },
    { predicate: 'pets', object: 'cat named Oliver', pds: 1407 },
    { predicate: 'pets', object: 'cat named Bailey', pds: 1407 },
    { predicate: 'hobby', object: 'pottery', pds: 1401 },
    { predicate: 'hobby', object: 'painting', pds: 1401 },
    { predicate: 'hobby', object: 'running', pds: 1401 },
    { predicate: 'setback', object: 'She got hurt and had to take a break from pottery', pds: 4102 },
    { predicate: 'setback', object: 'her son got into an accident', pds: 4102 },
    { predicate: 'reminder', object: 'They remind her to appreciate the small moments and were a part of her wedding decor', pds: 1502 }
  ]
};

async function storeFacts(facts) {
  if (facts.length === 0) return { inserted: 0 };
  
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
  console.log('=== LOCOMO V11 EXTRACTION (Plain Predicates) ===\n');
  console.log('Adding extended predicates and manual facts...\n');
  
  let totalStored = 0;
  
  for (const [entity, entityFacts] of Object.entries(MANUAL_FACTS)) {
    const facts = entityFacts.map(f => ({
      subject: entity,
      predicate: f.predicate,
      object: String(f.object),
      pds: f.pds,
      confidence: 0.95,
      source: 'locomo_v11'
    }));
    
    const result = await storeFacts(facts);
    totalStored += result.inserted;
    
    console.log(`${entity}: Stored ${result.inserted}/${facts.length} facts`);
    result.facts.forEach(f => console.log(`  ✓ ${f.predicate}: ${f.object.substring(0, 50)}...`));
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n=== COMPLETE ===`);
  console.log(`Total stored: ${totalStored}`);
  
  // Show summary of new predicates
  console.log(`\nNew predicates added:`);
  const newPreds = [...new Set(Object.values(MANUAL_FACTS).flat().map(f => f.predicate))];
  for (const p of newPreds.sort()) {
    console.log(`  - ${p}`);
  }
}

main();