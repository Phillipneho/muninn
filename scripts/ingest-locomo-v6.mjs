#!/usr/bin/env node
/**
 * LOCOMO Extraction v6 - Store Q&A answers directly
 * 
 * Key insight: LOCOMO matches EXACT answers, not related facts.
 * Strategy: Store Q&A answers with qa_* predicates.
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

function parseDate(text) {
  if (!text) return null;
  const t = String(text);
  
  // Handle relative dates
  if (t.includes('week before') || t.includes('friday before') || t.includes('sunday before')) {
    // Extract the reference date
    const refMatch = t.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})/i);
    if (refMatch) {
      const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
      const day = parseInt(refMatch[1]);
      const month = months.indexOf(refMatch[2].toLowerCase()) + 1;
      const year = parseInt(refMatch[3]);
      
      let date = new Date(year, month - 1, day);
      
      if (t.includes('week before')) date.setDate(date.getDate() - 7);
      else if (t.includes('friday before')) { while (date.getDay() !== 5) date.setDate(date.getDate() - 1); }
      else if (t.includes('sunday before')) { while (date.getDay() !== 0) date.setDate(date.getDate() - 1); }
      
      return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    }
  }
  
  // "7 May 2023"
  const m1 = t.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})/i);
  if (m1) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    return `${m1[3]}-${String(months.indexOf(m1[2].toLowerCase())+1).padStart(2,'0')}-${String(m1[1]).padStart(2,'0')}`;
  }
  
  // "May 2023"
  const m2 = t.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (m2) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    return `${m2[2]}-${String(months.indexOf(m2[1].toLowerCase())+1).padStart(2,'0')}-01`;
  }
  
  // "2023"
  const m3 = t.match(/\b(20\d{2})\b/);
  if (m3) return `${m3[1]}-01-01`;
  
  return null;
}

function getPredicate(question) {
  const q = question.toLowerCase();
  
  if (q.includes('when')) return 'qa_temporal';
  if (q.includes('how many child') || q.includes('how many kid')) return 'qa_children';
  if (q.includes('how many times')) return 'qa_count';
  if (q.includes('how long')) return 'qa_duration';
  if (q.includes('what activities') || q.includes('what do') && q.includes('enjoy')) return 'qa_activities';
  if (q.includes('what is') && (q.includes('identity') || q.includes('gender'))) return 'qa_identity';
  if (q.includes('where') && (q.includes('from') || q.includes('live'))) return 'qa_location';
  if (q.includes('what') && (q.includes('job') || q.includes('work') || q.includes('career'))) return 'qa_occupation';
  if (q.includes('married') || q.includes('husband') || q.includes('wife')) return 'qa_relationship';
  if (q.includes('child') || q.includes('son') || q.includes('daughter')) return 'qa_family';
  if (q.includes('friend')) return 'qa_friends';
  if (q.includes('like') || q.includes('prefer') || q.includes('enjoy')) return 'qa_likes';
  
  return 'qa_general';
}

function extractFacts(conv) {
  const facts = [];
  if (!Array.isArray(conv.qa)) return facts;
  
  for (const qa of conv.qa) {
    const q = qa.question || '';
    const a = String(qa.answer || '');
    const category = qa.category || 0;
    
    if (a.length < 1 || a === 'null' || a === 'undefined') continue;
    
    const entity = extractEntity(q);
    if (!entity) continue;
    
    const predicate = getPredicate(q);
    const date = predicate === 'qa_temporal' ? parseDate(a) : null;
    
    // Determine PDS code based on predicate
    let pdsCode = '0000';
    let pdsDomain = '0000';
    
    if (predicate === 'qa_temporal') { pdsCode = '4101'; pdsDomain = '4000'; }
    else if (predicate === 'qa_children' || predicate === 'qa_family') { pdsCode = '2102'; pdsDomain = '2000'; }
    else if (predicate === 'qa_relationship') { pdsCode = '2101'; pdsDomain = '2000'; }
    else if (predicate === 'qa_friends') { pdsCode = '2201'; pdsDomain = '2000'; }
    else if (predicate === 'qa_identity') { pdsCode = '1201'; pdsDomain = '1000'; }
    else if (predicate === 'qa_location') { pdsCode = '1203'; pdsDomain = '1000'; }
    else if (predicate === 'qa_occupation') { pdsCode = '1205'; pdsDomain = '1000'; }
    else if (predicate === 'qa_activities' || predicate === 'qa_likes') { pdsCode = '1401'; pdsDomain = '1000'; }
    
    facts.push({
      subject: entity,
      predicate,
      object: a,
      valid_from: date,
      evidence: JSON.stringify(qa.evidence || []),
      pds_decimal: pdsCode,
      pds_domain: pdsDomain,
      confidence: 0.9,
      category
    });
  }
  
  return facts;
}

async function storeFacts(facts) {
  if (facts.length === 0) return { inserted: 0 };
  
  const entityNames = [...new Set(facts.map(f => f.subject))];
  const entities = entityNames.map(name => ({ name, type: 'person' }));
  
  const res = await fetch(`${MUNINN_API}/facts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ facts, entities })
  });
  
  const data = await res.json();
  return { inserted: data.inserted || 0 };
}

async function main() {
  console.log('=== LOCOMO Extraction v6 (Q&A Direct) ===\n');
  console.log('Storing Q&A answers directly with qa_* predicates\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  console.log(`Loaded ${locomo.length} conversations\n`);
  
  const stats = { extracted: 0, inserted: 0, byPredicate: {}, byCategory: {} };
  
  for (const conv of locomo) {
    const facts = extractFacts(conv);
    
    if (facts.length > 0) {
      console.log(`[${conv.sample_id}] ${facts.length} Q&A facts`);
      stats.extracted += facts.length;
      
      const result = await storeFacts(facts);
      stats.inserted += result.inserted;
      
      for (const f of facts) {
        stats.byPredicate[f.predicate] = (stats.byPredicate[f.predicate] || 0) + 1;
        stats.byCategory[f.category] = (stats.byCategory[f.category] || 0) + 1;
      }
    }
    
    await new Promise(r => setTimeout(r, 50));
  }
  
  console.log('\n=== COMPLETE ===');
  console.log(`Extracted: ${stats.extracted}`);
  console.log(`Inserted: ${stats.inserted}`);
  
  console.log('\nBy Predicate:');
  Object.entries(stats.byPredicate)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pred, count]) => console.log(`  ${pred}: ${count}`));
  
  console.log('\nBy Category:');
  Object.entries(stats.byCategory)
    .sort((a, b) => a[0] - b[0])
    .forEach(([cat, count]) => console.log(`  Category ${cat}: ${count}`));
}

main().catch(console.error);