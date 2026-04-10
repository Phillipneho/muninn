#!/usr/bin/env node
/**
 * Quick test: Hybrid vs Semantic on first LOCOMO question
 */

async function main() {
  const MUNINN_API = 'https://api.muninn.au/api';
  const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
  const ORG = 'leo-default';
  
  // First LOCOMO question
  const query = "When did Caroline go to the LGBTQ support group?";
  
  console.log('Query:', query);
  console.log();
  
  // Test semantic
  const semUrl = `${MUNINN_API}/raw-sessions?q=${encodeURIComponent(query)}&topK=10&useHybrid=false`;
  const semRes = await fetch(semUrl, {
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG
    }
  });
  const semData = await semRes.json();
  
  console.log('=== Semantic Search ===');
  console.log('Top 3 results:');
  (semData.results || semData.sessions || []).slice(0, 3).forEach((s, i) => {
    console.log(`  ${i+1}. ${s.id} (score: ${s.score?.toFixed(3)})`);
    console.log(`     ${s.content?.substring(0, 100)}...`);
  });
  
  // Test hybrid
  const hybridUrl = `${MUNINN_API}/raw-sessions?q=${encodeURIComponent(query)}&topK=10&useHybrid=true`;
  const hybridRes = await fetch(hybridUrl, {
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG
    }
  });
  const hybridData = await hybridRes.json();
  
  console.log('\n=== Hybrid Search ===');
  console.log('Top 3 results:');
  (hybridData.results || hybridData.sessions || []).slice(0, 3).forEach((s, i) => {
    console.log(`  ${i+1}. ${s.id} (score: ${s.score?.toFixed(3)})`);
    if (s.components) {
      console.log(`     Components: overlap=${s.components.keywordOverlap?.toFixed(2)}, personMatch=${s.components.personMatch}, quoteMatch=${s.components.quoteMatch}`);
    }
    console.log(`     ${s.content?.substring(0, 100)}...`);
  });
}

main().catch(console.error);