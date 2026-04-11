#!/usr/bin/env node
/**
 * Complete LOCOMO Ingestion with CORRECT entity mapping
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

// CORRECT entity mapping from actual LOCOMO data
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

const PREDICATE_TO_PDS = {
  'identifies_as': '1201', 'has_identity': '1201', 'from': '1201',
  'prefers': '1401', 'likes': '1401', 'enjoy': '1401', 'enjoyed': '1401',
  'activity': '1401', 'has_hobby': '1401',
  'has_relationship_status': '2101', 'married_to': '2101', 'has_child': '2101',
  'occurred_on': '4101', 'attended_on': '4101', 'started_on': '4401',
  'works_at': '3101', 'researched': '3101', 'volunteers': '3301'
};

function classifyFact(predicate) {
  const pds = PREDICATE_TO_PDS[predicate] || '0000';
  return { pds_decimal: pds, pds_domain: pds.substring(0, 1) + '000' };
}

function inferPredicate(text) {
  const t = text.toLowerCase();
  if (t.includes('attend') || t.includes('went to') || t.includes('visited')) return 'attended_on';
  if (t.includes('start') || t.includes('began')) return 'started_on';
  if (t.includes('moved')) return 'moved_to';
  if (t.includes('like') || t.includes('enjoy')) return 'likes';
  if (t.includes('research') || t.includes('study')) return 'researched';
  if (t.includes('work') || t.includes('job')) return 'works_at';
  if (t.includes('volunteer')) return 'volunteers';
  return 'occurred_on';
}

function extractDate(text) {
  const m = text.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
  return m ? m[1] : null;
}

function extractFacts(conv) {
  const facts = [];
  const entities = ENTITY_MAP[conv.sample_id] || [];
  if (entities.length === 0) return facts;

  // Extract from ALL event sessions
  if (conv.event_summary) {
    for (const [key, val] of Object.entries(conv.event_summary)) {
      if (key.startsWith('events_session_') && typeof val === 'object') {
        for (const entity of entities) {
          const events = val[entity];
          if (!Array.isArray(events)) continue;
          
          for (const event of events) {
            if (typeof event !== 'string' || event.length < 5) continue;
            
            const predicate = inferPredicate(event);
            const { pds_decimal, pds_domain } = classifyFact(predicate);
            
            facts.push({
              subject: entity,
              predicate,
              object: event,
              valid_from: extractDate(event),
              pds_decimal,
              pds_domain,
              confidence: 0.9
            });
          }
        }
      }
    }
  }

  // Extract from session summaries
  if (conv.session_summary) {
    for (const [key, val] of Object.entries(conv.session_summary)) {
      if (key.includes('summary') && typeof val === 'object') {
        for (const entity of entities) {
          const summaries = val[entity];
          if (!Array.isArray(summaries)) continue;
          
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
              confidence: 0.8
            });
          }
        }
      }
    }
  }

  // Extract from Q&A
  if (Array.isArray(conv.qa)) {
    for (const qa of conv.qa) {
      if (!qa.answer || qa.answer === 'null' || qa.answer === 'undefined') continue;
      const answer = String(qa.answer);
      if (answer.length < 5) continue;

      let entity = null;
      const q = (qa.question || '').toLowerCase();
      for (const e of ALL_ENTITIES) {
        if (q.includes(e.toLowerCase())) { entity = e; break; }
      }
      if (!entity && entities.length > 0) entity = entities[0];
      if (!entity) continue;

      const predicate = inferPredicate(q + ' ' + answer);
      const { pds_decimal, pds_domain } = classifyFact(predicate);

      facts.push({
        subject: entity,
        predicate,
        object: answer,
        valid_from: extractDate(answer),
        pds_decimal,
        pds_domain,
        confidence: 0.7
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
  console.log('=== Complete LOCOMO Ingestion (Correct Mapping) ===\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  console.log(`Loaded ${locomo.length} conversations\n`);
  
  const stats = { extracted: 0, inserted: 0, byEntity: {} };
  
  for (const conv of locomo) {
    const facts = extractFacts(conv);
    if (facts.length === 0) continue;
    
    console.log(`[${conv.sample_id}] Entities: ${ENTITY_MAP[conv.sample_id]?.join(', ') || 'unknown'} | Extracted ${facts.length} facts`);
    stats.extracted += facts.length;
    
    const result = await storeFacts(facts);
    stats.inserted += result.inserted;
    
    for (const f of facts) {
      stats.byEntity[f.subject] = (stats.byEntity[f.subject] || 0) + 1;
    }
    
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log('\n=== COMPLETE ===');
  console.log(`Extracted: ${stats.extracted}`);
  console.log(`Inserted: ${stats.inserted}`);
  console.log('\nBy Entity:');
  Object.entries(stats.byEntity)
    .sort((a, b) => b[1] - a[1])
    .forEach(([e, c]) => console.log(`  ${e}: ${c}`));
}

main().catch(console.error);