#!/usr/bin/env node
/**
 * LOCOMO Benchmark - Smart matching with available predicates
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

const ENTITY_MAP = {
  'conv-26': ['Caroline', 'Melanie'],
  'conv-30': ['Gina', 'Jon'],
  'conv-41': ['John', 'Maria'],
  'conv-42': ['Joanna', 'Nate'],
  'conv-43': ['John', 'Tim'],
  'conv-44': ['Andrew', 'Audrey'],
  'conv-47': ['James', 'John'],
  'conv-48': ['Deborah', 'Jolene'],
  'conv-49': ['Evan', 'Sam'],
  'conv-50': ['Calvin', 'Dave']
};

// Map question patterns to available predicates
const PREDICATE_MAP = {
  'when did': ['occurred_on', 'attended_on', 'started_on', 'joined_on'],
  'when is': ['occurred_on', 'attended_on', 'started_on'],
  'what did': ['occurred_on', 'works_at', 'researched'],
  'what does': ['likes', 'occurred_on'],
  'what is': ['has_identity', 'occurred_on'],
  'what activity': ['occurred_on', 'likes'],
  'where': ['from', 'occurred_on'],
  'who': ['has_friend', 'married_to', 'has_child', 'occurred_on'],
  'how many': ['occurred_on', 'likes'],
  'how long': ['occurred_on'],
  'why': ['occurred_on']
};

function extractEntity(question) {
  const q = question.toLowerCase();
  for (const [convId, entities] of Object.entries(ENTITY_MAP)) {
    for (const entity of entities) {
      if (q.includes(entity.toLowerCase())) {
        return entity;
      }
    }
  }
  return null;
}

function extractKeywords(question) {
  // Remove common words and extract meaningful terms
  const stopWords = ['did', 'does', 'is', 'was', 'were', 'when', 'where', 'what', 'who', 'how', 'why', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
  const words = question.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));
  return words;
}

async function searchFacts(entity, keywords, predicates) {
  const params = new URLSearchParams();
  if (entity) params.set('entity', entity);
  params.set('limit', '20');
  
  const url = `${MUNINN_API}/facts/search?${params.toString()}`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG
    }
  });
  
  const data = await res.json();
  
  if (!data.results || data.results.length === 0) {
    return null;
  }
  
  // Filter by keywords and predicates
  const scored = data.results.map(fact => {
    let score = 0;
    const obj = (fact.object || '').toLowerCase();
    
    // Check predicate match
    if (predicates && predicates.includes(fact.predicate)) {
      score += 2;
    }
    
    // Check keyword matches
    for (const kw of keywords) {
      if (obj.includes(kw)) {
        score += 1;
      }
    }
    
    return { ...fact, score };
  }).filter(f => f.score > 0).sort((a, b) => b.score - a.score);
  
  return scored.length > 0 ? scored[0] : null;
}

function normalizeAnswer(answer) {
  if (!answer) return '';
  const a = String(answer).toLowerCase().trim();
  // Remove common prefixes
  return a.replace(/^(the |a |an |in |on |at )/, '').substring(0, 100);
}

function checkMatch(found, expected) {
  if (!found || !expected) return false;
  
  const f = normalizeAnswer(found);
  const e = normalizeAnswer(expected);
  
  // Exact match
  if (f === e) return true;
  
  // Contains match
  if (f.includes(e) || e.includes(f)) return true;
  
  // Check for key terms
  const eWords = e.split(/\s+/).filter(w => w.length > 3);
  const fWords = f.split(/\s+/);
  const matchCount = eWords.filter(w => fWords.some(fw => fw.includes(w))).length;
  
  return matchCount >= Math.ceil(eWords.length * 0.5);
}

async function runBenchmark() {
  console.log('=== LOCOMO Smart Benchmark ===\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  let correct = 0;
  let total = 0;
  let byCategory = {};
  
  for (const conv of locomo) {
    if (!Array.isArray(conv.qa)) continue;
    
    const entities = ENTITY_MAP[conv.sample_id] || [];
    
    for (const qa of conv.qa) {
      total++;
      const question = qa.question || '';
      const expected = qa.answer;
      const category = qa.category || 0;
      
      // Extract entity
      const entity = extractEntity(question);
      
      // Determine predicate candidates
      const qLower = question.toLowerCase();
      let predicates = ['occurred_on', 'works_at', 'started_on', 'likes', 'attended_on'];
      
      for (const [pattern, preds] of Object.entries(PREDICATE_MAP)) {
        if (qLower.includes(pattern)) {
          predicates = preds;
          break;
        }
      }
      
      // Extract keywords
      const keywords = extractKeywords(question);
      
      // Search for matching fact
      const fact = await searchFacts(entity, keywords, predicates);
      
      const found = fact ? fact.object : null;
      const isCorrect = checkMatch(found, expected);
      
      if (isCorrect) correct++;
      
      // Track by category
      const catName = category === 2 ? 'temporal' : 
                      category === 3 ? 'identity' :
                      category === 4 ? 'relationship' : 'other';
      byCategory[catName] = byCategory[catName] || { correct: 0, total: 0 };
      if (isCorrect) byCategory[catName].correct++;
      byCategory[catName].total++;
      
      // Progress
      if (total % 50 === 0) {
        console.log(`Processed ${total} questions...`);
      }
    }
  }
  
  console.log('\n=== RESULTS ===');
  console.log(`Accuracy: ${correct}/${total} = ${((correct/total)*100).toFixed(1)}%`);
  console.log('\nBy Category:');
  for (const [cat, stats] of Object.entries(byCategory)) {
    const pct = ((stats.correct / stats.total) * 100).toFixed(1);
    console.log(`  ${cat}: ${stats.correct}/${stats.total} = ${pct}%`);
  }
}

runBenchmark().catch(console.error);