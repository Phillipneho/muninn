const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

// Test a specific failing question
// "What did Caroline research?" Expected: "Adoption agencies"

async function searchFacts(entity, predicate, limit = 20) {
  const params = new URLSearchParams({ entity, predicate, limit: String(limit) });
  const res = await fetch(`${MUNINN_API}/facts/search?${params}`, {
    headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
  });
  return (await res.json()).results || [];
}

async function test() {
  console.log('Testing: "What did Caroline research?"');
  console.log('Expected: "Adoption agencies"\n');
  
  // What predicates does the benchmark route to?
  // "research" keyword → qa_research
  console.log('=== qa_research ===');
  const research = await searchFacts('Caroline', 'qa_research', 20);
  console.log(`Found ${research.length} facts`);
  research.forEach(f => console.log(`  [${f.score?.toFixed(2)}] ${f.object}`));
  
  // Try plain 'research'
  console.log('\n=== research (plain) ===');
  const researchPlain = await searchFacts('Caroline', 'research', 20);
  console.log(`Found ${researchPlain.length} facts`);
  researchPlain.forEach(f => console.log(`  [${f.score?.toFixed(2)}] ${f.object}`));
  
  // Try researched
  console.log('\n=== researched ===');
  const researched = await searchFacts('Caroline', 'researched', 20);
  console.log(`Found ${researched.length} facts`);
  researched.forEach(f => console.log(`  [${f.score?.toFixed(2)}] ${f.object}`));
  
  // Try qa_general
  console.log('\n=== qa_general ===');
  const general = await searchFacts('Caroline', 'qa_general', 20);
  console.log(`Found ${general.length} facts`);
  general.forEach(f => console.log(`  [${f.score?.toFixed(2)}] ${f.object}`));
}

test();
