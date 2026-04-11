#!/usr/bin/env node
/**
 * Full LOCOMO Benchmark with PDS Classification
 * Tests all entities from LOCOMO dataset with proper entity extraction
 */

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';
const LOCOMO_DATA = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

import fs from 'fs';

const factCache = {};

async function getFacts(entity) {
  if (factCache[entity]) return factCache[entity];
  
  const res = await fetch(`${MUNINN_API}/facts/search?entity=${encodeURIComponent(entity)}&limit=500`, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG
    }
  });
  
  const data = await res.json();
  factCache[entity] = data.results || [];
  return factCache[entity];
}

function extractEntityFromQuestion(question) {
  const q = question.toLowerCase();
  const entities = [
    'Caroline', 'Melanie', 'John', 'Maria', 'Joanna', 'Nate', 'Tim', 
    'Audrey', 'Andrew', 'James', 'Deborah', 'Jolene', 'Evan', 'Sam', 
    'Calvin', 'Dave', 'Gina', 'Jon'
  ];
  
  for (const e of entities) {
    if (q.includes(e.toLowerCase())) return e;
  }
  return null;
}

function categorizeQuestion(question) {
  const q = question.toLowerCase();
  
  if (q.includes('when did') || q.includes('when was') || q.includes('how long') || q.includes('what date')) {
    return 'temporal';
  }
  
  if (q.includes("'s ") && (q.includes('like') || q.includes('do') || q.includes('did'))) {
    return 'multi_hop';
  }
  
  if (q.includes('identity') || q.includes('who is')) {
    return 'identity';
  }
  
  if (q.includes('like') || q.includes('enjoy') || q.includes('prefer') || q.includes('activity') || q.includes('hobby')) {
    return 'preferences';
  }
  
  if (q.includes('relationship') || q.includes('interact') || q.includes('friend') || q.includes('married') || q.includes('family')) {
    return 'relationships';
  }
  
  return 'open_domain';
}

function checkAnswer(facts, question, expectedAnswer) {
  const q = question.toLowerCase();
  const expected = String(expectedAnswer || '').toLowerCase();
  const entity = extractEntityFromQuestion(question);
  
  // Temporal questions
  if (q.includes('when')) {
    const temporal = facts.find(f => 
      f.pds_decimal?.startsWith('41') && 
      (f.valid_from || f.object?.match(/\d{4}[-/]\d{2}/))
    );
    if (temporal?.valid_from) {
      const dateMatch = expected.includes(temporal.valid_from.substring(0, 10)) || 
                       expected.includes(temporal.valid_from.substring(5, 10));
      return { correct: dateMatch, found: `${temporal.object} (${temporal.valid_from})`, entity };
    }
    return { correct: false, found: 'No temporal fact', entity };
  }
  
  // Identity questions
  if (q.includes('identity')) {
    const id = facts.find(f => f.predicate === 'has_identity' || f.predicate === 'identifies_as');
    if (id) {
      const match = expected.split(/[\s,]+/).some(w => id.object?.toLowerCase().includes(w));
      return { correct: match, found: id.object, entity };
    }
    return { correct: false, found: 'No identity fact', entity };
  }
  
  // Likes/preferences
  if (q.includes('like') || q.includes('enjoy') || q.includes('activity')) {
    const likes = facts.filter(f => 
      f.predicate === 'likes' || f.predicate === 'activity' || f.predicate === 'kids_like'
    );
    if (likes.length > 0) {
      const found = likes.map(l => l.object).join(', ');
      const match = expected.split(/[\s,]+/).some(w => found.toLowerCase().includes(w));
      return { correct: match, found: found.substring(0, 100), entity };
    }
    return { correct: false, found: 'No preference facts', entity };
  }
  
  // Relationships
  if (q.includes('relationship') || q.includes('married') || q.includes('friend')) {
    const rel = facts.find(f => 
      f.predicate === 'has_relationship_status' || f.predicate === 'married_to' || f.predicate === 'friend_of'
    );
    if (rel) {
      const match = expected.includes(rel.object?.toLowerCase());
      return { correct: match, found: rel.object, entity };
    }
    return { correct: false, found: 'No relationship fact', entity };
  }
  
  // Multi-hop (kids like)
  if (q.includes("'s ") && q.includes('like')) {
    const kidsLike = facts.find(f => f.predicate === 'kids_like');
    if (kidsLike) {
      const match = expected.split(/[\s,]+/).some(w => kidsLike.object?.toLowerCase().includes(w));
      return { correct: match, found: kidsLike.object, entity };
    }
  }
  
  // General keyword match
  const keywords = expected.split(/[\s,]+/).filter(w => w.length > 3).slice(0, 3);
  const matches = facts.filter(f => 
    keywords.some(k => f.object?.toLowerCase().includes(k))
  );
  
  if (matches.length > 0) {
    return { correct: true, found: matches[0].object?.substring(0, 100), entity };
  }
  
  return { correct: false, found: 'No matching facts', entity };
}

async function runBenchmark() {
  console.log('=== LOCOMO Benchmark with PDS Classification ===\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_DATA, 'utf8'));
  console.log(`Loaded ${locomo.length} conversations\n`);
  
  const results = {
    total: 0,
    correct: 0,
    by_category: {},
    by_entity: {}
  };
  
  for (const conv of locomo) {
    for (const qa of (conv.qa || [])) {
      results.total++;
      
      const entity = extractEntityFromQuestion(qa.question);
      const category = categorizeQuestion(qa.question);
      
      if (!results.by_category[category]) {
        results.by_category[category] = { total: 0, correct: 0 };
      }
      results.by_category[category].total++;
      
      // Get facts for this entity
      const facts = entity ? await getFacts(entity) : [];
      
      // Check answer
      const { correct, found, entity: actualEntity } = checkAnswer(facts, qa.question, qa.answer);
      
      if (correct) {
        results.correct++;
        results.by_category[category].correct++;
      }
      
      if (entity && !results.by_entity[entity]) {
        results.by_entity[entity] = { total: 0, correct: 0 };
      }
      if (entity) {
        results.by_entity[entity].total++;
        if (correct) results.by_entity[entity].correct++;
      }
      
      if (results.total <= 20 || !correct) {
        console.log(`${correct ? '✅' : '❌'} [${entity || 'Unknown'}] ${qa.question?.substring(0, 50)}...`);
        console.log(`   Expected: ${String(qa.answer).substring(0, 50)}`);
        console.log(`   Found: ${found?.substring(0, 50)}`);
      }
      
      if (results.total % 100 === 0) {
        console.log(`\nProcessed ${results.total} questions...`);
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
  
  console.log('\nBy Entity:');
  const sortedEntities = Object.entries(results.by_entity)
    .sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total));
  for (const [entity, stats] of sortedEntities) {
    const pct = ((stats.correct / stats.total) * 100).toFixed(1);
    console.log(`  ${entity}: ${stats.correct}/${stats.total} (${pct}%)`);
  }
  
  return results;
}

runBenchmark().catch(console.error);