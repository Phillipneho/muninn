#!/usr/bin/env node
/**
 * LOCOMO Benchmark v5 - Match Q&A predicates
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

function getPredicate(question) {
  const q = question.toLowerCase();
  
  if (q.includes('when')) return 'qa_temporal';
  if (q.includes('how many child') || q.includes('how many kid')) return 'qa_children';
  if (q.includes('how many times')) return 'qa_count';
  if (q.includes('how long')) return 'qa_duration';
  if (q.includes('what activities') || (q.includes('what do') && q.includes('enjoy'))) return 'qa_activities';
  if (q.includes('what is') && (q.includes('identity') || q.includes('gender'))) return 'qa_identity';
  if (q.includes('where') && (q.includes('from') || q.includes('live'))) return 'qa_location';
  if (q.includes('what') && (q.includes('job') || q.includes('work') || q.includes('career'))) return 'qa_occupation';
  if (q.includes('married') || q.includes('husband') || q.includes('wife')) return 'qa_relationship';
  if (q.includes('child') || q.includes('son') || q.includes('daughter')) return 'qa_family';
  if (q.includes('friend')) return 'qa_friends';
  if (q.includes('like') || q.includes('prefer') || q.includes('enjoy')) return 'qa_likes';
  
  return 'qa_general';
}

async function searchFacts(entity, predicate) {
  const params = new URLSearchParams();
  if (entity) params.set('entity', entity);
  params.set('limit', '10');
  
  const url = `${MUNINN_API}/facts/search?${params.toString()}`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG
    }
  });
  
  const data = await res.json();
  
  if (!data.results || data.results.length === 0) return null;
  
  // Filter by predicate
  const filtered = data.results.filter(f => f.predicate === predicate);
  
  return filtered.length > 0 ? filtered[0] : null;
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
  
  if (f === e) return true;
  if (f.includes(e) || e.includes(f)) return true;
  
  // Numeric match
  const fNum = f.match(/\d+/);
  const eNum = e.match(/\d+/);
  if (fNum && eNum && fNum[0] === eNum[0]) return true;
  
  // Year match
  if (f.match(/\d{4}/) && e.match(/\d{4}/)) {
    const fYear = f.match(/\d{4}/)[0];
    const eYear = e.match(/\d{4}/)[0];
    if (fYear === eYear) return true;
  }
  
  // Key terms (50% match)
  const eWords = e.split(/\s+/).filter(w => w.length > 2);
  const fWords = f.split(/\s+/);
  if (eWords.length === 0) return false;
  const matchCount = eWords.filter(w => fWords.some(fw => fw.includes(w))).length;
  
  return matchCount >= Math.ceil(eWords.length * 0.5);
}

async function runBenchmark() {
  console.log('=== LOCOMO Benchmark v5 (Q&A Predicates) ===\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  let correct = 0;
  let total = 0;
  let byCategory = { temporal: { correct: 0, total: 0 }, identity: { correct: 0, total: 0 }, relationship: { correct: 0, total: 0 }, other: { correct: 0, total: 0 } };
  let predicateMatches = 0;
  
  for (const conv of locomo) {
    if (!Array.isArray(conv.qa)) continue;
    
    for (const qa of conv.qa) {
      total++;
      const q = qa.question || '';
      const expected = qa.answer;
      const category = qa.category || 0;
      
      const entity = extractEntity(q);
      const predicate = getPredicate(q);
      
      const fact = await searchFacts(entity, predicate);
      const found = fact ? fact.object : null;
      
      const isCorrect = checkMatch(found, expected);
      if (isCorrect) correct++;
      if (fact && fact.predicate === predicate) predicateMatches++;
      
      const catName = category === 2 ? 'temporal' : category === 3 ? 'identity' : category === 4 ? 'relationship' : 'other';
      byCategory[catName].total++;
      if (isCorrect) byCategory[catName].correct++;
      
      if (total % 300 === 0) console.log(`Processed ${total} questions...`);
    }
  }
  
  console.log('\n=== RESULTS ===');
  console.log(`Accuracy: ${correct}/${total} = ${((correct/total)*100).toFixed(1)}%`);
  console.log(`Predicate matches: ${predicateMatches}/${total}`);
  console.log('\nBy Category:');
  for (const [cat, stats] of Object.entries(byCategory)) {
    const pct = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) : '0.0';
    console.log(`  ${cat}: ${stats.correct}/${stats.total} = ${pct}%`);
  }
}

runBenchmark().catch(console.error);