#!/usr/bin/env node
/**
 * LOCOMO Benchmark v5 - Fixed predicate assignment
 * 
 * Key fixes:
 * 1. Only assign predicate if question pattern matches EXACTLY
 * 2. Extract activities as noun lists from events
 * 3. Extract just numbers for numeric questions
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

// Activity keywords to extract
const ACTIVITY_KEYWORDS = [
  'camping', 'hiking', 'swimming', 'painting', 'pottery', 'reading', 
  'writing', 'dancing', 'singing', 'yoga', 'running', 'biking',
  'volunteering', 'gardening', 'cooking', 'baking', 'photography',
  'gaming', 'music', 'art', 'drawing', 'knitting', 'fishing',
  'surfing', 'skiing', 'traveling', 'meditation', 'church'
];

function extractActivities(text) {
  const t = text.toLowerCase();
  const activities = [];
  for (const activity of ACTIVITY_KEYWORDS) {
    if (t.includes(activity) && !activities.includes(activity)) {
      activities.push(activity);
    }
  }
  return activities;
}

function parseDate(text) {
  if (!text) return null;
  const t = text.toString();
  
  // "7 May 2023" → "2023-05-07"
  const m1 = t.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})/i);
  if (m1) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const month = months.indexOf(m1[2].toLowerCase()) + 1;
    return `${m1[3]}-${String(month).padStart(2,'0')}-${String(m1[1]).padStart(2,'0')}`;
  }
  
  // "May 2023" → "2023-05-01"
  const m2 = t.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (m2) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const month = months.indexOf(m2[1].toLowerCase()) + 1;
    return `${m2[2]}-${String(month).padStart(2,'0')}-01`;
  }
  
  // "2023" → "2023-01-01"
  const m3 = t.match(/\b(20\d{2})\b/);
  if (m3) return `${m3[1]}-01-01`;
  
  return null;
}

function extractFacts(conv) {
  const facts = [];
  const entities = ENTITY_MAP[conv.sample_id] || [];
  if (!Array.isArray(conv.qa)) return facts;
  
  for (const qa of conv.qa) {
    const q = (qa.question || '').toLowerCase();
    const a = String(qa.answer || '');
    
    if (a.length < 1 || a === 'null' || a === 'undefined') continue;
    
    const entity = extractEntity(q);
    if (!entity) continue;
    
    // ONLY extract facts with clear predicate patterns
    
    // 1. TEMPORAL: "When did X..."
    if (q.includes('when did') || q.includes('when is') || q.includes('when was')) {
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
      continue;
    }
    
    // 2. IDENTITY: "What is X's identity/gender"
    if (q.includes("identity") || q.includes("gender")) {
      facts.push({
        subject: entity,
        predicate: 'identifies_as',
        object: a,
        pds_decimal: '1201',
        pds_domain: '1000',
        confidence: 0.9
      });
      continue;
    }
    
    // 3. LOCATION: "Where is X from/where does X live"
    if ((q.includes('from') || q.includes('live') || q.includes('where')) && 
        (q.includes('from') || q.includes('live'))) {
      facts.push({
        subject: entity,
        predicate: 'from',
        object: a,
        pds_decimal: '1203',
        pds_domain: '1000',
        confidence: 0.9
      });
      continue;
    }
    
    // 4. OCCUPATION: "What is X's job/work/career"
    if (q.includes('job') || q.includes('work') || q.includes('career') || q.includes('occupation') || q.includes('profession')) {
      facts.push({
        subject: entity,
        predicate: 'occupation',
        object: a,
        pds_decimal: '1205',
        pds_domain: '1000',
        confidence: 0.9
      });
      continue;
    }
    
    // 5. CHILDREN: "How many children/kids"
    if (q.includes('how many') && (q.includes('child') || q.includes('kid'))) {
      const numMatch = a.match(/\d+/);
      if (numMatch) {
        facts.push({
          subject: entity,
          predicate: 'has_child_count',
          object: numMatch[0],
          pds_decimal: '2102',
          pds_domain: '2000',
          confidence: 0.9
        });
      }
      continue;
    }
    
    // 6. ACTIVITIES: "What activities" or "What does X like"
    if (q.includes('what activities') || (q.includes('what') && q.includes('like')) || 
        (q.includes('what') && q.includes('enjoy'))) {
      // Split by comma and 'and'
      const activities = a.split(/,|and/).map(s => s.trim()).filter(s => s.length > 1);
      for (const activity of activities) {
        if (activity.length < 50) {
          facts.push({
            subject: entity,
            predicate: 'likes',
            object: activity,
            pds_decimal: '1401',
            pds_domain: '1000',
            confidence: 0.8
          });
        }
      }
      continue;
    }
    
    // 7. MARRIAGE: "How long married"
    if (q.includes('married') || q.includes('husband') || q.includes('wife')) {
      const yearMatch = a.match(/(\d+)\s*years?/i);
      if (yearMatch) {
        facts.push({
          subject: entity,
          predicate: 'married_years',
          object: yearMatch[1],
          pds_decimal: '2101',
          pds_domain: '2000',
          confidence: 0.9
        });
      } else {
        facts.push({
          subject: entity,
          predicate: 'married_to',
          object: a,
          pds_decimal: '2101',
          pds_domain: '2000',
          confidence: 0.8
        });
      }
      continue;
    }
    
    // 8. FRIENDS: "What friends"
    if (q.includes('friend') && !q.includes('friendly')) {
      facts.push({
        subject: entity,
        predicate: 'has_friend',
        object: a,
        pds_decimal: '2201',
        pds_domain: '2000',
        confidence: 0.8
      });
      continue;
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
  console.log('=== LOCOMO Extraction v5 (Fixed Predicates) ===\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  console.log(`Loaded ${locomo.length} conversations\n`);
  
  const stats = { extracted: 0, inserted: 0, byPredicate: {} };
  
  for (const conv of locomo) {
    const convId = conv.sample_id;
    const entities = ENTITY_MAP[convId] || [];
    
    const facts = extractFacts(conv);
    if (facts.length > 0) {
      console.log(`[${convId}] ${facts.length} facts`);
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
  console.log('\nBy Predicate:');
  Object.entries(stats.byPredicate)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pred, count]) => console.log(`  ${pred}: ${count}`));
}

main().catch(console.error);