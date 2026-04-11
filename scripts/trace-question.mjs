const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

const LOCOMO = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const fs = require('fs');

const locomo = JSON.parse(fs.readFileSync(LOCOMO, 'utf8'));

// Find first failing relationship question
for (const conv of locomo) {
  for (const qa of (conv.qa || [])) {
    if (qa.category !== 4) continue;
    
    const q = qa.question;
    const expected = String(qa.answer || '');
    
    // Skip if it's about Caroline or Melanie (those work)
    if (q.toLowerCase().includes('caroline') || q.toLowerCase().includes('melanie')) continue;
    
    console.log(`Q: ${q}`);
    console.log(`Expected: ${expected}`);
    
    // Check what facts exist for this entity
    const entityMatch = q.match(/(?:Gina|Jon|John|Maria|Joanna|Nate|Andrew|Audrey|James|Deborah|Jolene|Evan|Sam|Calvin|Dave)/i);
    if (entityMatch) {
      const entity = entityMatch[0];
      console.log(`Entity: ${entity}`);
      
      const res = await fetch(`${MUNINN_API}/facts/search?entity=${entity}&limit=20`, {
        headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
      });
      const data = await res.json();
      console.log(`Total facts for ${entity}: ${data.results?.length || 0}`);
      console.log(`Predicates: ${data.results?.map(f => f.predicate).join(', ')}`);
    }
    
    break;
  }
  break;
}
