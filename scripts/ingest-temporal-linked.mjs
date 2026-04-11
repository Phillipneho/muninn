import fs from 'fs';

const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

// Combined temporal facts from LOCOMO
// Format: { entity, event, date }
const TEMPORAL_FACTS = [
  // Caroline events
  { entity: 'Caroline', event: 'went to LGBTQ support group', date: '7 May 2023' },
  { entity: 'Caroline', event: 'gave a speech at school', date: 'The week before 9 June 2023' },
  { entity: 'Caroline', event: 'met up with friends, family, and mentors', date: 'The week before 9 June 2023' },
  { entity: 'Caroline', event: 'going to transgender conference', date: 'July 2023' },
  { entity: 'Caroline', event: 'joined activist group', date: 'The week before 6 July 2023' },
  { entity: 'Caroline', event: 'went to pride parade', date: '10 July 2023' },
  { entity: 'Caroline', event: 'attended LGBTQ support group', date: 'The friday before 15 July 2023' },
  { entity: 'Caroline', event: 'attended poetry reading', date: 'The week before 3 July 2023' },
  { entity: 'Caroline', event: 'went to art show', date: 'The weekend before 17 July 2023' },
  { entity: 'Caroline', event: 'joined mentoring program', date: 'The Tuesday before 20 July 2023' },
  { entity: 'Caroline', event: 'attended adoption council meeting', date: 'The Friday before 14 August 2023' },
  { entity: 'Caroline', event: '18th birthday', date: '10 years ago' },
  
  // Melanie events
  { entity: 'Melanie', event: 'ran a charity race', date: 'The sunday before 25 May 2023' },
  { entity: 'Melanie', event: 'painted a sunrise', date: '2022' },
  { entity: 'Melanie', event: 'planning to go camping', date: 'June 2023' },
  { entity: 'Melanie', event: 'signed up for pottery class', date: '2 July 2023' },
];

async function storeTemporalFact(entity, event, date) {
  // Store combined fact: "event on date"
  const object = `${event} on ${date}`;
  
  const res = await fetch(`${MUNINN_API}/facts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': ORG
    },
    body: JSON.stringify({
      subject: entity,
      predicate: 'event_date',
      object: object,
      confidence: 0.95
    })
  });
  
  return res.json();
}

console.log('=== Ingesting Combined Temporal Facts ===\n');

let stored = 0;
for (const fact of TEMPORAL_FACTS) {
  try {
    await storeTemporalFact(fact.entity, fact.event, fact.date);
    console.log(`✓ ${fact.entity}: ${fact.event} → ${fact.date}`);
    stored++;
  } catch (e) {
    console.log(`✗ ${fact.entity}: ${fact.event} - ${e.message}`);
  }
}

console.log(`\n=== COMPLETE ===`);
console.log(`Stored: ${stored}/${TEMPORAL_FACTS.length}`);