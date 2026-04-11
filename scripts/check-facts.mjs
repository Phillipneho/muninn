const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

async function checkFacts() {
  // Get all facts with count
  const res = await fetch(`${MUNINN_API}/facts?limit=1000`, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG
    }
  });
  
  const text = await res.text();
  console.log('Raw response:', text.substring(0, 500));
  
  try {
    const data = JSON.parse(text);
    console.log('\nTotal facts:', data.facts?.length || data.results?.length || 'unknown');
    
    if (data.facts) {
      const predicates = {};
      for (const f of data.facts) {
        predicates[f.predicate] = (predicates[f.predicate] || 0) + 1;
      }
      console.log('\nPredicates:');
      Object.entries(predicates)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .forEach(([pred, count]) => console.log(`  ${pred}: ${count}`));
    }
    
    if (data.results) {
      const predicates = {};
      for (const f of data.results) {
        predicates[f.predicate] = (predicates[f.predicate] || 0) + 1;
      }
      console.log('\nPredicates:');
      Object.entries(predicates)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .forEach(([pred, count]) => console.log(`  ${pred}: ${count}`));
    }
  } catch (err) {
    console.error('Parse error:', err.message);
  }
}

checkFacts();
