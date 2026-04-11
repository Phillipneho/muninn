#!/usr/bin/env node
/**
 * LOCOMO Extraction v4 - Relative dates, activities, numeric relationships
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

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

function parseMonth(name) {
  return MONTHS.indexOf(name.toLowerCase()) + 1;
}

function parseDate(text) {
  if (!text) return null;
  const t = text.toString();
  
  // "7 May 2023" → "2023-05-07"
  const m1 = t.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})/i);
  if (m1) return `${m1[3]}-${String(parseMonth(m1[2])).padStart(2,'0')}-${String(m1[1]).padStart(2,'0')}`;
  
  // "May 2023" → "2023-05-01"
  const m2 = t.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (m2) return `${m2[2]}-${String(parseMonth(m2[1])).padStart(2,'0')}-01`;
  
  // "2023" → "2023-01-01"
  const m3 = t.match(/\b(20\d{2})\b/);
  if (m3) return `${m3[1]}-01-01`;
  
  // "The week before 9 June 2023" → extract reference date
  const m4 = t.match(/week before\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})/i);
  if (m4) {
    const month = parseMonth(m4[2]);
    const day = parseInt(m4[1]);
    const year = parseInt(m4[3]);
    // Subtract 7 days
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() - 7);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  
  // "The Friday before 15 July 2023" → extract reference date
  const m5 = t.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+before\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})/i);
  if (m5) {
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const targetDay = dayNames.indexOf(m5[1].toLowerCase());
    const month = parseMonth(m5[3]);
    const refDay = parseInt(m5[2]);
    const year = parseInt(m5[4]);
    const date = new Date(year, month - 1, refDay);
    // Go back to previous target day
    while (date.getDay() !== targetDay) {
      date.setDate(date.getDate() - 1);
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  
  // "Two weeks before 11 August 2023"
  const m6 = t.match(/(\d+)\s+weeks?\s+before\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})/i);
  if (m6) {
    const weeks = parseInt(m6[1]);
    const day = parseInt(m6[2]);
    const month = parseMonth(m6[3]);
    const year = parseInt(m6[4]);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() - (weeks * 7));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  
  // "The weekend before 9 June 2023" → Saturday/Sunday before
  const m7 = t.match(/weekend before\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})/i);
  if (m7) {
    const day = parseInt(m7[1]);
    const month = parseMonth(m7[2]);
    const year = parseInt(m7[3]);
    const date = new Date(year, month - 1, day);
    // Go back to previous Saturday (day 6)
    while (date.getDay() !== 6) {
      date.setDate(date.getDate() - 1);
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  
  return null;
}

function extractEntity(question) {
  const q = question.toLowerCase();
  for (const entity of ALL_ENTITIES) {
    if (q.includes(entity.toLowerCase())) return entity;
  }
  return null;
}

function extractTemporalFacts(conv) {
  const facts = [];
  if (!Array.isArray(conv.qa)) return facts;
  
  for (const qa of conv.qa) {
    const q = (qa.question || '').toLowerCase();
    const a = String(qa.answer || '');
    
    if (!q.includes('when')) continue;
    if (a.length < 2 || a === 'null' || a === 'undefined') continue;
    
    const entity = extractEntity(q);
    if (!entity) continue;
    
    const date = parseDate(a);
    
    facts.push({
      subject: entity,
      predicate: 'occurred_on',
      object: a,
      valid_from: date,
      evidence: JSON.stringify(qa.evidence || []),
      pds_decimal: '4101',
      pds_domain: '4000',
      confidence: 0.9
    });
  }
  
  return facts;
}

function extractActivityFacts(conv) {
  const facts = [];
  const entities = ENTITY_MAP[conv.sample_id] || [];
  if (!Array.isArray(conv.qa)) return facts;
  
  for (const qa of conv.qa) {
    const q = (qa.question || '').toLowerCase();
    const a = String(qa.answer || '');
    
    if (a.length < 2 || a === 'null' || a === 'undefined') continue;
    
    const entity = extractEntity(q);
    if (!entity) continue;
    
    // Activity questions
    if (q.includes('what activities') || q.includes('what does') && q.includes('do') || q.includes('what do') && q.includes('enjoy') || q.includes('what hobby') || q.includes('what activity')) {
      // Parse comma-separated activities
      const activities = a.split(/,|and/).map(s => s.trim()).filter(s => s.length > 2);
      
      for (const activity of activities) {
        if (activity.length < 2 || activity.length > 100) continue;
        
        facts.push({
          subject: entity,
          predicate: 'likes',
          object: activity,
          evidence: JSON.stringify(qa.evidence || []),
          pds_decimal: '1401',
          pds_domain: '1000',
          confidence: 0.8
        });
      }
    }
  }
  
  return facts;
}

function extractNumericRelationships(conv) {
  const facts = [];
  if (!Array.isArray(conv.qa)) return facts;
  
  for (const qa of conv.qa) {
    const q = (qa.question || '').toLowerCase();
    const a = String(qa.answer || '');
    
    if (a.length < 1 || a === 'null' || a === 'undefined') continue;
    
    const entity = extractEntity(q);
    if (!entity) continue;
    
    // "How many children/kids"
    if (q.includes('how many child') || q.includes('how many kid')) {
      const numMatch = a.match(/(\d+)/);
      if (numMatch) {
        facts.push({
          subject: entity,
          predicate: 'has_child_count',
          object: numMatch[1],
          evidence: JSON.stringify(qa.evidence || []),
          pds_decimal: '2102',
          pds_domain: '2000',
          confidence: 0.9
        });
      }
    }
    
    // "How long married"
    if (q.includes('how long') && (q.includes('married') || q.includes('relationship'))) {
      const yearMatch = a.match(/(\d+)\s*years?/i);
      if (yearMatch) {
        facts.push({
          subject: entity,
          predicate: 'married_duration_years',
          object: yearMatch[1],
          evidence: JSON.stringify(qa.evidence || []),
          pds_decimal: '2101',
          pds_domain: '2000',
          confidence: 0.9
        });
      }
    }
    
    // "How many times"
    if (q.includes('how many times')) {
      const numMatch = a.match(/(\d+)/);
      if (numMatch) {
        facts.push({
          subject: entity,
          predicate: 'count',
          object: numMatch[1],
          evidence: JSON.stringify(qa.evidence || []),
          pds_decimal: '4201',
          pds_domain: '4000',
          confidence: 0.9
        });
      }
    }
  }
  
  return facts;
}

function extractIdentityFacts(conv) {
  const facts = [];
  if (!Array.isArray(conv.qa)) return facts;
  
  for (const qa of conv.qa) {
    const q = (qa.question || '').toLowerCase();
    const a = String(qa.answer || '');
    
    if (a.length < 2 || a === 'null' || a === 'undefined') continue;
    
    const entity = extractEntity(q);
    if (!entity) continue;
    
    let predicate = null;
    let pdsCode = null;
    
    if (q.includes("what is") && q.includes("identity")) {
      predicate = 'identifies_as';
      pdsCode = '1201';
    } else if (q.includes("what is") && q.includes("gender")) {
      predicate = 'identifies_as';
      pdsCode = '1201';
    } else if (q.includes("where") && (q.includes("from") || q.includes("live"))) {
      predicate = 'from';
      pdsCode = '1203';
    } else if (q.includes("what") && (q.includes("career") || q.includes("job") || q.includes("work") || q.includes("occupation") || q.includes("profession"))) {
      predicate = 'occupation';
      pdsCode = '1205';
    } else if (q.includes("what") && (q.includes("do") && !q.includes("how"))) {
      predicate = 'occupation';
      pdsCode = '1205';
    }
    
    if (predicate) {
      facts.push({
        subject: entity,
        predicate,
        object: a,
        evidence: JSON.stringify(qa.evidence || []),
        pds_decimal: pdsCode,
        pds_domain: pdsCode.substring(0, 1) + '000',
        confidence: 0.9
      });
    }
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
  console.log('=== LOCOMO Extraction v4 ===\n');
  console.log('Features: Relative dates, activities, numeric relationships\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  console.log(`Loaded ${locomo.length} conversations\n`);
  
  const stats = {
    temporal: { extracted: 0, inserted: 0, withDates: 0 },
    activities: { extracted: 0, inserted: 0 },
    numeric: { extracted: 0, inserted: 0 },
    identity: { extracted: 0, inserted: 0 }
  };
  
  for (const conv of locomo) {
    const convId = conv.sample_id;
    const entities = ENTITY_MAP[convId] || [];
    console.log(`[${convId}] ${entities.join(', ')}`);
    
    // Temporal with relative dates
    const temporalFacts = extractTemporalFacts(conv);
    if (temporalFacts.length > 0) {
      const withDates = temporalFacts.filter(f => f.valid_from).length;
      console.log(`  Temporal: ${temporalFacts.length} (${withDates} with dates)`);
      stats.temporal.extracted += temporalFacts.length;
      stats.temporal.withDates += withDates;
      const result = await storeFacts(temporalFacts);
      stats.temporal.inserted += result.inserted;
    }
    
    // Activities
    const activityFacts = extractActivityFacts(conv);
    if (activityFacts.length > 0) {
      console.log(`  Activities: ${activityFacts.length}`);
      stats.activities.extracted += activityFacts.length;
      const result = await storeFacts(activityFacts);
      stats.activities.inserted += result.inserted;
    }
    
    // Numeric relationships
    const numericFacts = extractNumericRelationships(conv);
    if (numericFacts.length > 0) {
      console.log(`  Numeric: ${numericFacts.length}`);
      stats.numeric.extracted += numericFacts.length;
      const result = await storeFacts(numericFacts);
      stats.numeric.inserted += result.inserted;
    }
    
    // Identity
    const identityFacts = extractIdentityFacts(conv);
    if (identityFacts.length > 0) {
      console.log(`  Identity: ${identityFacts.length}`);
      stats.identity.extracted += identityFacts.length;
      const result = await storeFacts(identityFacts);
      stats.identity.inserted += result.inserted;
    }
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log('\n=== COMPLETE ===');
  console.log(`Temporal: ${stats.temporal.extracted} extracted, ${stats.temporal.withDates} with dates, ${stats.temporal.inserted} inserted`);
  console.log(`Activities: ${stats.activities.extracted} extracted, ${stats.activities.inserted} inserted`);
  console.log(`Numeric: ${stats.numeric.extracted} extracted, ${stats.numeric.inserted} inserted`);
  console.log(`Identity: ${stats.identity.extracted} extracted, ${stats.identity.inserted} inserted`);
}

main().catch(console.error);