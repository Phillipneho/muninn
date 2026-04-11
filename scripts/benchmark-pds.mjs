#!/usr/bin/env node
/**
 * LOCOMO Benchmark with PDS-Filtered Search
 * Tests recall accuracy after PDS classification migration
 */

const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

async function searchFacts(query, options = {}) {
  const params = new URLSearchParams({ q: query, limit: 20 });
  if (options.entity) params.append('entity', options.entity);
  if (options.pdsDomain) params.append('pds_domain', options.pdsDomain);
  
  const res = await fetch(`${MUNINN_API}/memories?${params}`, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG
    }
  });
  
  const data = await res.json();
  return data.results || [];
}

async function getFacts(entity) {
  const res = await fetch(`${MUNINN_API}/facts/search?entity=${encodeURIComponent(entity)}&limit=500`, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG
    }
  });
  
  const data = await res.json();
  return data.results || [];
}

// Test questions organized by category
const QUESTIONS = {
  identity: [
    { q: "What is Caroline's identity?", entity: "Caroline", check: (facts) => {
      const woman = facts.find(f => f.object?.toLowerCase().includes('woman'));
      const trans = facts.find(f => f.object?.toLowerCase().includes('transgender'));
      return { found: woman?.object || trans?.object, correct: !!(woman || trans) };
    }},
    { q: "What is Melanie's identity?", entity: "Melanie", check: (facts) => {
      const woman = facts.find(f => f.object?.toLowerCase().includes('woman'));
      return { found: woman?.object, correct: !!woman };
    }},
    { q: "What is John's identity?", entity: "John", check: (facts) => {
      const id = facts.find(f => f.predicate === 'has_identity' || f.predicate === 'identifies_as');
      return { found: id?.object, correct: !!id };
    }},
  ],
  
  temporal: [
    { q: "When did Caroline go to LGBTQ support group?", entity: "Caroline", check: (facts) => {
      const lgbtq = facts.find(f => 
        (f.object?.toLowerCase().includes('lgbtq') || f.object?.toLowerCase().includes('support')) &&
        f.pds_decimal?.startsWith('41')
      );
      if (lgbtq?.valid_from) {
        return { found: `${lgbtq.object} on ${lgbtq.valid_from}`, correct: lgbtq.valid_from.startsWith('2023-05') };
      }
      return { found: null, correct: false };
    }},
    { q: "When did Melanie go camping?", entity: "Melanie", check: (facts) => {
      const camp = facts.find(f => 
        f.object?.toLowerCase().includes('camp') &&
        f.pds_decimal?.startsWith('41')
      );
      if (camp?.valid_from) {
        return { found: `${camp.object} on ${camp.valid_from}`, correct: true };
      }
      return { found: null, correct: false };
    }},
    { q: "When did John take a road trip?", entity: "John", check: (facts) => {
      const trip = facts.find(f => 
        f.object?.toLowerCase().includes('road') || f.object?.toLowerCase().includes('trip') &&
        f.pds_decimal?.startsWith('41')
      );
      if (trip?.valid_from) {
        return { found: `${trip.object} on ${trip.valid_from}`, correct: true };
      }
      return { found: null, correct: false };
    }},
  ],
  
  preferences: [
    { q: "What does Melanie's daughter like?", entity: "Melanie", check: (facts) => {
      const kids = facts.find(f => f.predicate === 'kids_like');
      return { found: kids?.object, correct: !!kids };
    }},
    { q: "What activities does Caroline enjoy?", entity: "Caroline", check: (facts) => {
      const activities = facts.filter(f => f.predicate === 'activity' || f.predicate === 'likes');
      if (activities.length > 0) {
        return { found: activities.map(a => a.object).join(', '), correct: true };
      }
      return { found: null, correct: false };
    }},
  ],
  
  relationships: [
    { q: "Who does Caroline interact with?", entity: "Caroline", check: (facts) => {
      const interactions = facts.filter(f => f.predicate === 'interacts_with' || f.predicate === 'friend_of');
      if (interactions.length > 0) {
        return { found: interactions.map(i => i.object).join(', '), correct: true };
      }
      return { found: null, correct: false };
    }},
    { q: "What is Melanie's relationship status?", entity: "Melanie", check: (facts) => {
      const rel = facts.find(f => f.predicate === 'has_relationship_status' || f.predicate === 'married_to');
      return { found: rel?.object, correct: !!rel };
    }},
  ],
  
  multi_hop: [
    { q: "What do Melanie's kids like to do?", entity: "Melanie", check: (facts) => {
      // Find child entity references
      const childFacts = facts.filter(f => f.predicate === 'has_child' || f.object?.includes('daughter') || f.object?.includes('son'));
      const kidsLike = facts.find(f => f.predicate === 'kids_like');
      return { found: kidsLike?.object, correct: !!kidsLike };
    }},
  ]
};

async function runBenchmark() {
  console.log('=== LOCOMO Benchmark with PDS Classification ===\n');
  
  const results = {
    total: 0,
    correct: 0,
    by_category: {}
  };
  
  for (const [category, questions] of Object.entries(QUESTIONS)) {
    console.log(`\n=== ${category.toUpperCase()} ===`);
    results.by_category[category] = { total: 0, correct: 0 };
    
    for (const test of questions) {
      results.total++;
      results.by_category[category].total++;
      
      // Get facts for entity
      const facts = await getFacts(test.entity);
      
      // Run check
      const { found, correct } = test.check(facts);
      
      if (correct) {
        results.correct++;
        results.by_category[category].correct++;
        console.log(`✅ ${test.q}`);
        console.log(`   Found: ${found?.substring(0, 80)}...`);
      } else {
        console.log(`❌ ${test.q}`);
        console.log(`   Found: ${found || 'nothing'}`);
      }
    }
  }
  
  console.log('\n=== RESULTS ===');
  console.log(`Overall: ${results.correct}/${results.total} (${((results.correct / results.total) * 100).toFixed(1)}%)`);
  console.log('\nBy Category:');
  
  for (const [cat, stats] of Object.entries(results.by_category)) {
    const pct = ((stats.correct / stats.total) * 100).toFixed(1);
    console.log(`  ${cat}: ${stats.correct}/${stats.total} (${pct}%)`);
  }
  
  return results;
}

runBenchmark().catch(console.error);