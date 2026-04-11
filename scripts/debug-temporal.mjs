const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

async function searchFacts(entity, predicate, limit = 20) {
  const params = new URLSearchParams({ entity, predicate, limit: String(limit) });
  const res = await fetch(`${MUNINN_API}/facts/search?${params}`, {
    headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
  });
  return (await res.json()).results || [];
}

async function debug() {
  const question = "When did Caroline go to the LGBTQ support group?";
  const expected = "7 May 2023";
  
  console.log(`Question: ${question}`);
  console.log(`Expected: ${expected}\n`);
  
  // Step 1: Search all facts for Caroline
  const allFacts = await searchFacts('Caroline', 'any', 500);
  console.log(`Total facts for Caroline: ${allFacts.length}\n`);
  
  // Step 2: Find facts mentioning "support group"
  const supportGroupFacts = allFacts.filter(f => 
    f.object.toLowerCase().includes('support group') ||
    f.object.toLowerCase().includes('lgbtq')
  );
  console.log(`Facts mentioning 'support group' or 'lgbtq':`);
  supportGroupFacts.forEach(f => console.log(`  [${f.predicate}] ${f.object.substring(0, 60)}... (pds: ${f.pds_decimal})`));
  
  // Step 3: Find temporal facts
  const temporalFacts = await searchFacts('Caroline', 'qa_temporal', 50);
  console.log(`\nTemporal facts:`);
  temporalFacts.forEach(f => console.log(`  [${f.pds_decimal}] ${f.object} (evidence: ${f.evidence})`));
  
  // Step 4: Try to find date by evidence match
  // The event fact has evidence, the date fact might have matching evidence
  const eventEvidence = supportGroupFacts.find(f => f.evidence)?.evidence;
  console.log(`\nEvent evidence: ${eventEvidence}`);
  
  // Step 5: Find date fact with matching evidence
  if (eventEvidence) {
    const dateFact = temporalFacts.find(f => f.evidence === eventEvidence);
    console.log(`Date fact with matching evidence: ${dateFact?.object || 'NOT FOUND'}`);
  }
}

debug();
