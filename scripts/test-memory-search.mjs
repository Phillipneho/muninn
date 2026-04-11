const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

async function searchMemories(query, limit = 5) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetch(`${MUNINN_API}/memories?${params}`, {
    headers: { 'Authorization': `Bearer ${MUNINN_KEY}`, 'X-Organization-ID': ORG }
  });
  return (await res.json()).results || [];
}

async function test() {
  console.log('=== Memory Search Test ===\n');
  
  const question = "When did Caroline go to the LGBTQ support group?";
  const expected = "7 May 2023";
  
  // Search for event + date together
  const results = await searchMemories('Caroline LGBTQ support group', 3);
  
  console.log(`Question: ${question}`);
  console.log(`Expected: ${expected}\n`);
  
  for (const r of results) {
    console.log(`Memory (${r.score?.toFixed(2) || 'N/A'}):`);
    console.log(r.content?.substring(0, 300) + '...\n');
    
    // Try to extract date
    const dateMatch = r.content?.match(/(yesterday|\d+ May|\d+ June|\d+ July|May \d+|June \d+|July \d+)/i);
    if (dateMatch) {
      console.log(`Found date: ${dateMatch[0]}`);
    }
  }
}

test();
