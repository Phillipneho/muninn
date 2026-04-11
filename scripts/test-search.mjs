const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

async function test() {
  // Test search for Caroline temporal facts
  const res = await fetch(`${MUNINN_API}/facts/search?entity=Caroline&predicate=qa_temporal&limit=5`, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG
    }
  });
  
  const data = await res.json();
  console.log('Search results:', JSON.stringify(data, null, 2));
  
  // Check if facts have object_value or object field
  if (data.results && data.results.length > 0) {
    console.log('\nFirst fact fields:');
    for (const [key, value] of Object.entries(data.results[0])) {
      console.log(`  ${key}: ${value}`);
    }
  }
}

test();
