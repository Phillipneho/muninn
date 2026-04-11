#!/usr/bin/env node
/**
 * LOCOMO Extraction v7 - Fix predicate assignments
 * 
 * Key fix: Only assign predicate when question EXACTLY matches
 * the expected predicate type. Skip ambiguous questions.
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

function classifyQuestion(question, answer) {
  const q = question.toLowerCase();
  const a = String(answer || '').toLowerCase();
  
  // TEMPORAL: "When did X..." or "What year..." or "What date..."
  if (q.includes('when did') || q.includes('when was') || q.includes('what year') || q.includes('what date')) {
    return {
      predicate: 'qa_temporal',
      pds: '4101',
      domain: '4000'
    };
  }
  
  // DURATION: "How long..."
  if (q.includes('how long') && !q.includes('how long ago')) {
    return {
      predicate: 'qa_duration',
      pds: '4301',
      domain: '4000'
    };
  }
  
  // IDENTITY: "What is X's identity/gender"
  if (q.includes("identity") || q.includes("gender")) {
    return {
      predicate: 'qa_identity',
      pds: '1201',
      domain: '1000'
    };
  }
  
  // ORIGIN: "Where is X from/where does X live"
  if ((q.includes('where') && q.includes('from')) || (q.includes('where') && q.includes('live'))) {
    return {
      predicate: 'qa_location',
      pds: '1203',
      domain: '1000'
    };
  }
  
  // OCCUPATION: "What is X's job/work/career/profession"
  if (q.includes('job') || q.includes('work as') || q.includes('career') || q.includes('occupation') || q.includes('profession')) {
    return {
      predicate: 'qa_occupation',
      pds: '1205',
      domain: '1000'
    };
  }
  
  // CHILDREN: "How many children/kids"
  if ((q.includes('how many') && (q.includes('child') || q.includes('kid')))) {
    return {
      predicate: 'qa_children',
      pds: '2102',
      domain: '2000'
    };
  }
  
  // COUNT: "How many times"
  if (q.includes('how many times')) {
    return {
      predicate: 'qa_count',
      pds: '0000',
      domain: '000'
    };
  }
  
  // ACTIVITIES: "What activities" or "What does X like to do"
  if (q.includes('what activities') || (q.includes('what') && q.includes('like to do')) || (q.includes('what') && q.includes('enjoy'))) {
    return {
      predicate: 'qa_activities',
      pds: '1401',
      domain: '1000'
    };
  }
  
  // LIKES: "What does X like/enjoy" (but not "Likely")
  if ((q.includes('what') && q.includes('like') && !q.includes('likely')) || (q.includes('what') && q.includes('prefer'))) {
    return {
      predicate: 'qa_likes',
      pds: '1401',
      domain: '1000'
    };
  }
  
  // RESEARCH: "What did X research"
  if (q.includes('research')) {
    return {
      predicate: 'qa_research',
      pds: '3101',
      domain: '3000'
    };
  }
  
  // STATUS: "What is X's status" (relationship, marital)
  if (q.includes('status') || q.includes('single') || q.includes('married') || q.includes('relationship')) {
    return {
      predicate: 'qa_status',
      pds: '2101',
      domain: '2000'
    };
  }
  
  // Skip ambiguous questions
  return null;
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
    
    const classified = classifyQuestion(q, a);
    if (!classified) continue; // Skip ambiguous
    
    const date = classified.predicate === 'qa_temporal' ? parseDate(a) : null;
    
    facts.push({
      subject: entity,
      predicate: classified.predicate,
      object: a,
      valid_from: date,
      evidence: JSON.stringify(qa.evidence || []),
      pds_decimal: classified.pds,
      pds_domain: classified.domain,
      confidence: 0.9,
      category
    });
  }
  
  return facts;
}

async function clearOldQA() {
  console.log('Clearing old qa_* facts...');
  try {
    const res = await fetch(`${MUNINN_API}/facts?predicate_prefix=qa_`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${MUNINN_KEY}`,
        'X-Organization-ID': ORG
      }
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      console.log(`Deleted ${data.deleted || data.changes || 0} facts\n`);
    } catch (e) {
      console.log(`Clear attempted (${res.status})\n`);
    }
  } catch (e) {
    console.log('Could not clear old facts, continuing...\n');
  }
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
  console.log('=== LOCOMO Extraction v7 (Fixed Predicates) ===\n');
  
  // Clear old qa_* facts
  await clearOldQA();
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  console.log(`Loaded ${locomo.length} conversations\n`);
  
  const stats = { extracted: 0, inserted: 0, skipped: 0, byPredicate: {} };
  
  for (const conv of locomo) {
    const facts = extractFacts(conv);
    const skipped = (conv.qa || []).length - facts.length;
    stats.skipped += skipped;
    
    if (facts.length > 0) {
      console.log(`[${conv.sample_id}] ${facts.length} facts (${skipped} skipped)`);
      stats.extracted += facts.length;
      
      const result = await storeFacts(facts);
      stats.inserted += result.inserted;
      
      for (const f of facts) {
        stats.byPredicate[f.predicate] = (stats.byPredicate[f.predicate] || 0) + 1;
      }
    }
    
    await new Promise(r => setTimeout(r, 50));
  }
  
  console.log('\n=== COMPLETE ===');
  console.log(`Extracted: ${stats.extracted}`);
  console.log(`Inserted: ${stats.inserted}`);
  console.log(`Skipped: ${stats.skipped} (ambiguous questions)`);
  
  console.log('\nBy Predicate:');
  Object.entries(stats.byPredicate)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pred, count]) => console.log(`  ${pred}: ${count}`));
}

main().catch(console.error);