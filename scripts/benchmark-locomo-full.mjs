#!/usr/bin/env node
/**
 * Full LOCOMO Benchmark with PDS Classification
 * Tests all 10 conversations from LOCOMO dataset
 */

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';
const LOCOMO_DATA = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

import fs from 'fs';

const ENTITY_MAP = {
  'conv-26': 'John',
  'conv-27': 'Maria',
  'conv-28': 'Joanna',
  'conv-29': 'Nate',
  'conv-30': 'Tim',
  'conv-31': 'Audrey',
  'conv-32': 'Andrew',
  'conv-33': 'James',
  'conv-34': 'Deborah',
  'conv-35': 'Jolene',
  'conv-36': 'Evan',
  'conv-37': 'Sam',
  'conv-38': 'Calvin',
  'conv-39': 'Dave',
  'conv-40': 'Gina',
  'conv-41': 'Jon'
};

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

function categorizeQuestion(qa) {
  const q = qa.question.toLowerCase();
  
  // Temporal questions
  if (q.includes('when did') || q.includes('when was') || q.includes('how long') || q.includes('date')) {
    return 'temporal';
  }
  
  // Multi-hop questions (involves relationships or chaining)
  if (q.includes("'s ") && (q.includes('like') || q.includes('do') || q.includes('did'))) {
    return 'multi_hop';
  }
  if (q.includes('child') && q.includes('like')) {
    return 'multi_hop';
  }
  
  // Identity questions
  if (q.includes('identity') || q.includes('who is')) {
    return 'identity';
  }
  
  // Preference questions
  if (q.includes('like') || q.includes('enjoy') || q.includes('prefer') || q.includes('activity') || q.includes('hobby')) {
    return 'preferences';
  }
  
  // Relationship questions
  if (q.includes('relationship') || q.includes('interact') || q.includes('friend') || q.includes('married') || q.includes('family')) {
    return 'relationships';
  }
  
  // Default to open_domain
  return 'open_domain';
}

function checkAnswer(facts, qa) {
  const question = qa.question.toLowerCase();
  const answer = String(qa.answer || '').toLowerCase();
  
  // Extract entity from question (not conversation)
  let entity = null;
  const entities = ['Caroline', 'Melanie', 'John', 'Maria', 'Joanna', 'Nate', 'Tim', 'Audrey', 'Andrew', 'James', 'Deborah', 'Jolene', 'Evan', 'Sam', 'Calvin', 'Dave', 'Gina', 'Jon'];
  for (const e of entities) {
    if (question.includes(e.toLowerCase())) {
      entity = e;
      break;
    }
  }
  
  if (!entity) entity = 'Unknown';
  
  // Temporal check
  if (question.includes('when')) {
    const temporal = facts.find(f => 
      f.pds_decimal?.startsWith('41') || f.pds_decimal?.startsWith('44')
    );
    if (temporal?.valid_from) {
      return { 
        correct: answer.includes(temporal.valid_from.substring(0, 10)) || answer.includes(temporal.object?.toLowerCase()),
        found: `${temporal.object} on ${temporal.valid_from}`
      };
    }
    return { correct: false, found: 'No temporal fact' };
  }
  
  // Identity check
  if (question.includes('identity')) {
    const id = facts.find(f => f.predicate === 'has_identity' || f.predicate === 'identifies_as');
    if (id) {
      return { 
        correct: answer.includes(id.object?.toLowerCase()),
        found: id.object 
      };
    }
    return { correct: false, found: 'No identity fact' };
  }
  
  // Likes/preferences check
  if (question.includes('like') || question.includes('enjoy') || question.includes('activity')) {
    const likes = facts.filter(f => 
      f.predicate === 'likes' || f.predicate === 'activity' || f.predicate === 'kids_like'
    );
    if (likes.length > 0) {
      const found = likes.map(l => l.object).join(', ');
      return { 
        correct: likes.some(l => answer.includes(l.object?.toLowerCase())),
        found: found.substring(0, 100)
      };
    }
    return { correct: false, found: 'No preference facts' };
  }
  
  // Relationship check
  if (question.includes('relationship') || question.includes('married') || question.includes('friend')) {
    const rel = facts.find(f => 
      f.predicate === 'has_relationship_status' || f.predicate === 'married_to' || f.predicate === 'friend_of'
    );
    if (rel) {
      return { 
        correct: answer.includes(rel.object?.toLowerCase()),
        found: rel.object 
      };
    }
    return { correct: false, found: 'No relationship fact' };
  }
  
  // Multi-hop check
  if (question.includes("'s ")) {
    const kidsLike = facts.find(f => f.predicate === 'kids_like');
    if (kidsLike) {
      return { 
        correct: answer.includes(kidsLike.object?.toLowerCase()),
        found: kidsLike.object 
      };
    }
  }
  
  // General keyword match
  const keywords = answer.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
  const matches = facts.filter(f => 
    keywords.some(k => f.object?.toLowerCase().includes(k))
  );
  
  if (matches.length > 0) {
    return { 
      correct: true,
      found: matches[0].object?.substring(0, 100)
    };
  }
  
  return { correct: false, found: 'No matching facts' };
}

async function runBenchmark() {
  console.log('=== Full LOCOMO Benchmark with PDS Classification ===\n');
  
  // Load LOCOMO data
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_DATA, 'utf8'));
  console.log(`Loaded ${locomo.length} conversations\n`);
  
  const results = {
    total: 0,
    correct: 0,
    by_category: {},
    by_entity: {}
  };
  
  // Cache facts by entity
  const factCache = {};
  
  for (const conv of locomo) {
    const sampleId = conv.sample_id || conv.conversation_id;
    
    // Process questions
    for (const qa of (conv.qa || [])) {
      results.total++;
      
      const category = categorizeQuestion(qa);
      if (!results.by_category[category]) {
        results.by_category[category] = { total: 0, correct: 0 };
      }
      results.by_category[category].total++;
      
      const { correct, found } = checkAnswer(facts, qa);
      
      if (results.total <= 10 || !correct) {
        console.log(`${correct ? '✅' : '❌'} [${firstName}] ${qa.question?.substring(0, 50)}...`);
        console.log(`   Expected: ${String(qa.answer).substring(0, 50)}`);
        console.log(`   Found: ${found?.substring(0, 50)}`);
      }
      
      if (correct) {
        results.correct++;
        results.by_category[category].correct++;
        results.by_entity[firstName].correct++;
      }
      
      // Progress
      if (results.total % 100 === 0) {
        console.log(`Processed ${results.total} questions...`);
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
  for (const [entity, stats] of sortedEntities.slice(0, 10)) {
    const pct = ((stats.correct / stats.total) * 100).toFixed(1);
    console.log(`  ${entity}: ${stats.correct}/${stats.total} (${pct}%)`);
  }
  
  return results;
}

runBenchmark().catch(console.error);