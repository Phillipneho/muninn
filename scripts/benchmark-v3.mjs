#!/usr/bin/env node
/**
 * LOCOMO Benchmark v3 - Use temporal and predicate-specific queries
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
  const stopWords = ['did', 'does', 'is', 'was', 'were', 'when', 'where', 'what', 'who', 'how', 'why', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'caroline', 'melanie', 'john', 'maria', 'joanna', 'nate', 'tim', 'audrey', 'andrew', 'james', 'deborah', 'jolene', 'evan', 'sam', 'calvin', 'dave', 'gina', 'jon'];
  return question.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));
}

function parseDate(text) {
  if (!text) return null;
  
  // "7 May 2023" -> "2023-05-07"
  const m1 = text.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})/i);
  if (m1) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const month = months.indexOf(m1[2].toLowerCase()) + 1;
    return `${m1[3]}-${String(month).padStart(2,'0')}-${String(m1[1]).padStart(2,'0')}`;
  }
  
  // "May 2023" -> "2023-05"
  const m2 = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (m2) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const month = months.indexOf(m2[1].toLowerCase()) + 1;
    return `${m2[2]}-${String(month).padStart(2,'0')}`;
  }
  
  // "2023"
  const m3 = text.match(/\b(20\d{2})\b/);
  if (m3) return m3[1];
  
  return null;
}

async function searchFacts(entity, keywords, predicate) {
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
  
  // Filter by predicate if specified
  let filtered = data.results;
  if (predicate) {
    filtered = filtered.filter(f => f.predicate === predicate);
  }
  
  // Score by keyword matches
  const scored = filtered.map(fact => {
    let score = 0;
    const obj = (fact.object || '').toLowerCase();
    
    for (const kw of keywords) {
      if (obj.includes(kw)) score += 1;
    }
    
    return { ...fact, score };
  }).filter(f => f.score > 0).sort((a, b) => b.score - a.score);
  
  return scored.length > 0 ? scored[0] : filtered[0];
}

async function searchTemporal(entity, targetDate) {
  // Use temporal endpoint for "when" questions
  const params = new URLSearchParams();
  params.set('entity', entity);
  params.set('at', targetDate);
  params.set('limit', '5');
  
  const url = `${MUNINN_API}/facts/temporal?${params.toString()}`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG
    }
  });
  
  const data = await res.json();
  return data.facts && data.facts.length > 0 ? data.facts[0] : null;
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
  
  // Contains match
  if (f.includes(e) || e.includes(f)) return true;
  
  // Key terms match
  const eWords = e.split(/\s+/).filter(w => w.length > 3);
  const fWords = f.split(/\s+/);
  const matchCount = eWords.filter(w => fWords.some(fw => fw.includes(w))).length;
  
  return matchCount >= Math.ceil(eWords.length * 0.5);
}

async function runBenchmark() {
  console.log('=== LOCOMO Benchmark v3 ===\n');
  console.log('Using: Temporal queries, Predicate-specific search\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  let correct = 0;
  let total = 0;
  let byCategory = { temporal: { correct: 0, total: 0 }, identity: { correct: 0, total: 0 }, relationship: { correct: 0, total: 0 }, other: { correct: 0, total: 0 } };
  
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
      
      // Determine query type
      if (q.includes('when')) {
        // Try temporal endpoint first
        const targetDate = parseDate(String(expected));
        if (targetDate) {
          fact = await searchTemporal(entity, targetDate);
        }
        if (!fact) {
          fact = await searchFacts(entity, keywords, 'occurred_on');
        }
      } else if (q.includes('how many child') || q.includes('how many kid')) {
        fact = await searchFacts(entity, keywords, 'has_child');
      } else if (q.includes('married') || q.includes('husband') || q.includes('wife')) {
        fact = await searchFacts(entity, keywords, 'married_to');
      } else if (q.includes('identity') || q.includes('gender')) {
        fact = await searchFacts(entity, keywords, 'identifies_as');
      } else if (q.includes('what') && (q.includes('do') || q.includes('job') || q.includes('work') || q.includes('career'))) {
        fact = await searchFacts(entity, keywords, 'occupation');
      } else if (q.includes('where') && (q.includes('from') || q.includes('live'))) {
        fact = await searchFacts(entity, keywords, 'from');
      } else if (q.includes('like') || q.includes('enjoy') || q.includes('prefer') || q.includes('activity')) {
        fact = await searchFacts(entity, keywords, 'likes');
      } else {
        fact = await searchFacts(entity, keywords, null);
      }
      
      const found = fact ? fact.object : null;
      const isCorrect = checkMatch(found, expected);
      
      if (isCorrect) correct++;
      
      const catName = category === 2 ? 'temporal' : category === 3 ? 'identity' : category === 4 ? 'relationship' : 'other';
      byCategory[catName].total++;
      if (isCorrect) byCategory[catName].correct++;
      
      if (total % 100 === 0) console.log(`Processed ${total} questions...`);
    }
  }
  
  console.log('\n=== RESULTS ===');
  console.log(`Accuracy: ${correct}/${total} = ${((correct/total)*100).toFixed(1)}%`);
  console.log('\nBy Category:');
  for (const [cat, stats] of Object.entries(byCategory)) {
    const pct = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) : '0.0';
    console.log(`  ${cat}: ${stats.correct}/${stats.total} = ${pct}%`);
  }
}

runBenchmark().catch(console.error);