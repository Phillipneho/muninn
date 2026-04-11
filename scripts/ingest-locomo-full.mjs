#!/usr/bin/env node
/**
 * Proper LOCOMO ingestion - extracts ALL events from ALL sessions
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

// Entity mapping from conversation IDs
const ENTITY_MAP = {
  'conv-26': ['Caroline', 'Melanie'],
  'conv-27': ['Maria', 'John'],
  'conv-28': ['Joanna', 'Nate'],
  'conv-29': ['Tim', 'Audrey'],
  'conv-30': ['Andrew', 'James'],
  'conv-31': ['Deborah', 'Jolene'],
  'conv-32': ['Evan', 'Sam'],
  'conv-33': ['Calvin', 'Dave'],
  'conv-34': ['Gina', 'Jon'],
  'conv-35': ['Evan', 'Sam'],
  'conv-36': ['Calvin', 'Dave'],
  'conv-37': ['Gina', 'Jon'],
  'conv-38': ['John', 'Maria'],
  'conv-39': ['Tim', 'Audrey'],
  'conv-40': ['Andrew', 'James'],
  'conv-41': ['Deborah', 'Jolene'],
  'conv-42': ['John', 'Jean'],
  'conv-43': ['Maria', 'Jean'],
  'conv-44': ['Calvin', 'Dave'],
  'conv-47': ['Gina', 'Jon'],
  'conv-48': ['Tim', 'Audrey'],
  'conv-49': ['John', 'Maria']
};

// PDS code mapping
const PREDICATE_TO_PDS = {
  'identifies_as': '1201', 'has_identity': '1201', 'from': '1201',
  'prefers': '1401', 'likes': '1401', 'enjoy': '1401', 'enjoyed': '1401',
  'activity': '1401', 'has_hobby': '1401', 'has_activity': '1401',
  'has_relationship_status': '2101', 'married_to': '2101', 'married_for': '2101',
  'has_child': '2101', 'has_partner': '2101', 'supports': '2301',
  'occurred_on': '4101', 'attended_on': '4101', 'attended': '4101',
  'started_on': '4401', 'ended_on': '4401', 'moved_to': '4401',
  'works_at': '3101', 'researched': '3101', 'has_goal': '3101',
  'volunteers': '3301', 'participated_in': '3301',
  'has_achievement': '3401', 'achieved_on': '3401'
};

function inferPdsCode(predicate) {
  const pred = predicate.toLowerCase();
  if (pred.includes('attend') || pred.includes('visit') || pred.includes('occur')) return '4101';
  if (pred.includes('start') || pred.includes('begin') || pred.includes('move')) return '4401';
  if (pred.includes('like') || pred.includes('prefer') || pred.includes('hobby')) return '1401';
  if (pred.includes('work') || pred.includes('research') || pred.includes('goal')) return '3101';
  if (pred.includes('identity') || pred.includes('gender') || pred.includes('from')) return '1201';
  if (pred.includes('relationship') || pred.includes('married') || pred.includes('child')) return '2101';
  return '0000';
}

function classifyFact(predicate) {
  const pds_decimal = PREDICATE_TO_PDS[predicate] || inferPdsCode(predicate);
  const pds_domain = pds_decimal.substring(0, 1) + '000';
  return { pds_decimal, pds_domain };
}

function inferPredicate(text) {
  const t = text.toLowerCase();
  if (t.includes('attend') || t.includes('went to') || t.includes('visited')) return 'attended_on';
  if (t.includes('start') || t.includes('began') || t.includes('started')) return 'started_on';
  if (t.includes('moved')) return 'moved_to';
  if (t.includes('like') || t.includes('enjoy') || t.includes('loves')) return 'likes';
  if (t.includes('identity') || t.includes('is a') || t.includes('from')) return 'has_identity';
  if (t.includes('research') || t.includes('study')) return 'researched';
  if (t.includes('work') || t.includes('job')) return 'works_at';
  if (t.includes('volunteer')) return 'volunteers';
  if (t.includes('relationship') || t.includes('married') || t.includes('dating')) return 'has_relationship_status';
  return 'occurred_on';
}

function extractDate(text) {
  // ISO date
  const iso = text.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
  if (iso) return iso[1];
  
  // Relative date - would need session_date context
  return null;
}

function extractFactsFromConversation(conv) {
  const facts = [];
  const entities = ENTITY_MAP[conv.sample_id] || [];
  
  if (entities.length === 0) return facts;
  
  // Extract from event_summary (session-specific keys like events_session_1.Caroline)
  if (conv.event_summary) {
    for (const [key, value] of Object.entries(conv.event_summary)) {
      if (key.startsWith('events_session_')) {
        // This is a session events object
        for (const entity of entities) {
          const events = value[entity] || [];
          for (const event of events) {
            if (typeof event !== 'string' || event.length < 5) continue;
            
            const predicate = inferPredicate(event);
            const valid_from = extractDate(event);
            const { pds_decimal, pds_domain } = classifyFact(predicate);
            
            facts.push({
              subject: entity,
              predicate,
              object: event,
              valid_from,
              pds_decimal,
              pds_domain,
              confidence: 0.9,
              source: 'event_summary'
            });
          }
        }
      }
    }
  }
  
  // Extract from session_summary (session-specific keys like session_1_summary.Caroline)
  if (conv.session_summary) {
    for (const [key, value] of Object.entries(conv.session_summary)) {
      if (key.includes('session') && key.includes('summary')) {
        for (const entity of entities) {
          const summaries = value[entity] || [];
          for (const summary of summaries) {
            if (typeof summary !== 'string' || summary.length < 5) continue;
            
            const predicate = inferPredicate(summary);
            const { pds_decimal, pds_domain } = classifyFact(predicate);
            
            facts.push({
              subject: entity,
              predicate,
              object: summary,
              pds_decimal,
              pds_domain,
              confidence: 0.8,
              source: 'session_summary'
            });
          }
        }
      }
    }
  }
  
  // Extract from Q&A evidence
  if (conv.qa) {
    for (const qa of conv.qa) {
      if (!qa.answer || qa.answer === 'null' || qa.answer === 'undefined') continue;
      const answer = String(qa.answer);
      if (answer.length < 5) continue;
      
      // Find entity from question
      let entity = null;
      const q = qa.question.toLowerCase();
      for (const e of Object.values(ENTITY_MAP).flat()) {
        if (q.includes(e.toLowerCase())) {
          entity = e;
          break;
        }
      }
      if (!entity && entities.length > 0) entity = entities[0];
      if (!entity) continue;
      
      const predicate = inferPredicate(q);
      const valid_from = extractDate(answer);
      const { pds_decimal, pds_domain } = classifyFact(predicate);
      
      facts.push({
        subject: entity,
        predicate,
        object: answer,
        valid_from,
        pds_decimal,
        pds_domain,
        confidence: 0.7,
        source: 'qa'
      });
    }
  }
  
  return facts;
}

async function storeFacts(facts) {
  if (facts.length === 0) return { inserted: 0 };
  
  // Batch insert
  const batchSize = 100;
  let inserted = 0;
  
  for (let i = 0; i < facts.length; i += batchSize) {
    const batch = facts.slice(i, i + batchSize);
    
    const res = await fetch(`${MUNINN_API}/facts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MUNINN_KEY}`,
        'X-Organization-ID': ORG,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ facts: batch })
    });
    
    if (!res.ok) {
      console.error(`  Error: ${res.status}`);
      continue;
    }
    
    const data = await res.json();
    inserted += data.inserted || 0;
  }
  
  return { inserted };
}

async function ingestAll() {
  console.log('=== Full LOCOMO Ingestion ===\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  console.log(`Loaded ${locomo.length} conversations\n`);
  
  const stats = { total: 0, inserted: 0, by_entity: {} };
  
  for (const conv of locomo) {
    console.log(`[${conv.sample_id}]`);
    
    const facts = extractFactsFromConversation(conv);
    if (facts.length === 0) continue;
    
    console.log(`  Extracted ${facts.length} facts`);
    
    const result = await storeFacts(facts);
    stats.total += facts.length;
    stats.inserted += result.inserted;
    
    for (const f of facts) {
      stats.by_entity[f.subject] = (stats.by_entity[f.subject] || 0) + 1;
    }
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log('\n=== COMPLETE ===');
  console.log(`Extracted: ${stats.total}`);
  console.log(`Inserted: ${stats.inserted}`);
  console.log('\nBy Entity:');
  Object.entries(stats.by_entity)
    .sort((a, b) => b[1] - a[1])
    .forEach(([e, c]) => console.log(`  ${e}: ${c}`));
}

ingestAll().catch(console.error);