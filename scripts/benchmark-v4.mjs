#!/usr/bin/env node
/**
 * LOCOMO Benchmark v4 - Improved matching
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

const ALL_ENTITIES = [...new Set(Object.values(ENTITY_MAP).flat())];

function extractEntity(question) {
  const q = question.toLowerCase();
  for (const entity of ALL_ENTITIES) {
    if (q.includes(entity.toLowerCase())) return entity;
  }
  return null;
}

function extractKeywords(question) {
  const stopWords = ['did', 'does', 'is', 'was', 'were', 'when', 'where', 'what', 'who', 'how', 'why', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'caroline', 'melanie', 'john', 'maria', 'joanna', 'nate', 'tim', 'audrey', 'andrew', 'james', 'deborah', 'jolene', 'evan', 'sam', 'calvin', 'dave', 'gina', 'jon', 'she', 'he', 'they', 'her', 'his', 'their'];
  return question.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));
}

async function searchFacts(entity, keywords, predicate) {
  const params = new URLSearchParams();
  if (entity) params.set('entity', entity);
  params.set('limit', '15');
  
  const url = `${MUNINN_API}/facts/search?${params.toString()}`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG
    }
  });
  
  const data = await res.json();
  
  if (!data.results || data.results.length === 0) return null;
  
  // Filter by predicate if specified
  let filtered = data.results;
  if (predicate) {
    filtered = filtered.filter(f => f.predicate === predicate);
  }
  
  // Score by keyword matches
  const scored = filtered.map(fact => {
    let score = 0;
    const obj = (fact.object || '').toLowerCase();
    const pred = (fact.predicate || '').toLowerCase();
    
    // Predicate match bonus
    if (predicate && pred === predicate.toLowerCase()) score += 3;
    
    // Keyword matches
    for (const kw of keywords) {
      if (obj.includes(kw)) score += 1;
    }
    
    return { ...fact, score };
  });
  
  // Return best match (prefer predicate matches, then keyword matches)
  const sorted = scored.sort((a, b) => b.score - a.score);
  return sorted.length > 0 && sorted[0].score > 0 ? sorted[0] : filtered[0];
}

function normalizeAnswer(answer) {
  if (!answer) return '';
  const a = String(answer).toLowerCase().trim();
  return a.replace(/^(the |a |an |in |on |at )/, '').substring(0, 150);
}

function checkMatch(found, expected) {
  if (!found || !expected) return false;
  
  const f = normalizeAnswer(found);
  const e = normalizeAnswer(expected);
  
  // Exact match
  if (f === e) return true;
  
  // Numeric match
  const fNum = f.match(/\d+/);
  const eNum = e.match(/\d+/);
  if (fNum && eNum && fNum[0] === eNum[0]) return true;
  
  // Contains match
  if (f.includes(e) || e.includes(f)) return true;
  
  // Key terms match (at least 50%)
  const eWords = e.split(/\s+/).filter(w => w.length > 3);
  const fWords = f.split(/\s+/);
  if (eWords.length === 0) return false;
  const matchCount = eWords.filter(w => fWords.some(fw => fw.includes(w))).length;
  
  return matchCount >= Math.ceil(eWords.length * 0.5);
}

async function runBenchmark() {
  console.log('=== LOCOMO Benchmark v4 ===\n');
  console.log('Testing: Temporal, activities, numeric relationships\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  let correct = 0;
  let total = 0;
  let byCategory = { temporal: { correct: 0, total: 0 }, identity: { correct: 0, total: 0 }, relationship: { correct: 0, total: 0 }, other: { correct: 0, total: 0 } };
  let predicateMatches = { temporal: 0, identity: 0, relationship: 0, other: 0 };
  
  for (const conv of locomo) {
    if (!Array.isArray(conv.qa)) continue;
    
    for (const qa of conv.qa) {
      total++;
      const q = (qa.question || '').toLowerCase();
      const expected = qa.answer;
      const category = qa.category || 0;
      
      const entity = extractEntity(q);
      const keywords = extractKeywords(q);
      
      let fact = null;
      let predicate = null;
      
      // Determine query type and predicate
      if (q.includes('when')) {
        predicate = 'occurred_on';
        fact = await searchFacts(entity, keywords, predicate);
      } else if (q.includes('how many child') || q.includes('how many kid')) {
        predicate = 'has_child_count';
        fact = await searchFacts(entity, keywords, predicate);
        if (!fact) fact = await searchFacts(entity, keywords, 'has_child');
      } else if (q.includes('how many times')) {
        predicate = 'count';
        fact = await searchFacts(entity, keywords, predicate);
      } else if (q.includes('married') || q.includes('husband') || q.includes('wife')) {
        predicate = 'married_to';
        fact = await searchFacts(entity, keywords, predicate);
      } else if (q.includes('child') || q.includes('son') || q.includes('daughter')) {
        predicate = 'has_child';
        fact = await searchFacts(entity, keywords, predicate);
      } else if (q.includes('identity') || q.includes('gender')) {
        predicate = 'identifies_as';
        fact = await searchFacts(entity, keywords, predicate);
      } else if (q.includes('what activities') || q.includes('what do') && q.includes('enjoy') || q.includes('what hobby')) {
        predicate = 'likes';
        fact = await searchFacts(entity, keywords, predicate);
      } else if (q.includes('where') && (q.includes('from') || q.includes('live'))) {
        predicate = 'from';
        fact = await searchFacts(entity, keywords, predicate);
      } else if (q.includes('what') && (q.includes('career') || q.includes('job') || q.includes('work') || q.includes('occupation'))) {
        predicate = 'occupation';
        fact = await searchFacts(entity, keywords, predicate);
      } else if (q.includes('like') || q.includes('enjoy') || q.includes('prefer')) {
        predicate = 'likes';
        fact = await searchFacts(entity, keywords, predicate);
      } else {
        fact = await searchFacts(entity, keywords, null);
      }
      
      const found = fact ? fact.object : null;
      const isCorrect = checkMatch(found, expected);
      
      if (isCorrect) correct++;
      if (fact && fact.predicate === predicate) {
        const catName = category === 2 ? 'temporal' : category === 3 ? 'identity' : category === 4 ? 'relationship' : 'other';
        predicateMatches[catName]++;
      }
      
      const catName = category === 2 ? 'temporal' : category === 3 ? 'identity' : category === 4 ? 'relationship' : 'other';
      byCategory[catName].total++;
      if (isCorrect) byCategory[catName].correct++;
      
      if (total % 200 === 0) console.log(`Processed ${total} questions...`);
    }
  }
  
  console.log('\n=== RESULTS ===');
  console.log(`Accuracy: ${correct}/${total} = ${((correct/total)*100).toFixed(1)}%`);
  console.log('\nBy Category:');
  for (const [cat, stats] of Object.entries(byCategory)) {
    const pct = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) : '0.0';
    console.log(`  ${cat}: ${stats.correct}/${stats.total} = ${pct}% (predicate matches: ${predicateMatches[cat]})`);
  }
}

runBenchmark().catch(console.error);