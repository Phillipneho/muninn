#!/usr/bin/env node
/**
 * Enhanced LOCOMO Ingestion - Extract temporal dates and relationships
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

// Entity mapping (from actual LOCOMO data)
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

// PDS codes for different fact types
const PDS_CODES = {
  // Internal State (1000)
  'identifies_as': '1201',
  'has_identity': '1201',
  'gender': '1201',
  'age': '1202',
  'from': '1203',
  'lives_in': '1204',
  'occupation': '1205',
  
  // Preferences (1400)
  'likes': '1401',
  'prefers': '1401',
  'enjoys': '1401',
  'has_hobby': '1401',
  'favorite': '1401',
  
  // Relational (2000)
  'married_to': '2101',
  'has_child': '2102',
  'has_partner': '2103',
  'has_friend': '2201',
  'family_of': '2202',
  'parent_of': '2104',
  
  // Instrumental (3000)
  'works_at': '3101',
  'studies_at': '3102',
  'researched': '3301',
  'volunteers_at': '3302',
  'has_goal': '3401',
  
  // Chronological (4000)
  'occurred_on': '4101',
  'attended_on': '4101',
  'visited_on': '4102',
  'started_on': '4401',
  'ended_on': '4402',
  'moved_on': '4403',
  'joined_on': '4404',
  'bought_on': '4501',
  'made_on': '4502',
  'met_on': '4103'
};

function getPDSCode(predicate) {
  return PDS_CODES[predicate] || '0000';
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // Handle various date formats
  const formats = [
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})/i,
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i,
    /(\d{4})/,
    /(\d{4})[-/](\d{2})[-/](\d{2})/
  ];
  
  for (const fmt of formats) {
    const m = dateStr.match(fmt);
    if (m) return m[0];
  }
  
  return null;
}

function extractTemporalFromQA(conv) {
  const facts = [];
  const entities = ENTITY_MAP[conv.sample_id] || [];
  if (entities.length === 0 || !Array.isArray(conv.qa)) return facts;
  
  for (const qa of conv.qa) {
    const question = (qa.question || '').toLowerCase();
    const answer = String(qa.answer || '');
    
    if (answer.length < 2 || answer === 'null' || answer === 'undefined') continue;
    
    // Detect entity from question
    let entity = null;
    for (const e of ALL_ENTITIES) {
      if (question.includes(e.toLowerCase())) {
        entity = e;
        break;
      }
    }
    if (!entity && entities.length > 0) entity = entities[0];
    if (!entity) continue;
    
    // Extract date from answer
    const date = parseDate(answer);
    
    // Determine predicate from question
    let predicate = 'occurred_on';
    if (question.includes('when did') || question.includes('when is')) {
      if (question.includes('start')) predicate = 'started_on';
      else if (question.includes('end')) predicate = 'ended_on';
      else if (question.includes('join')) predicate = 'joined_on';
      else if (question.includes('meet')) predicate = 'met_on';
      else if (question.includes('move')) predicate = 'moved_on';
      else if (question.includes('buy') || question.includes('get')) predicate = 'bought_on';
      else if (question.includes('make') || question.includes('create')) predicate = 'made_on';
      else if (question.includes('attend') || question.includes('go to') || question.includes('visit')) predicate = 'attended_on';
    } else if (question.includes('how many')) {
      predicate = 'count';
    } else if (question.includes('what') || question.includes('who')) {
      predicate = 'has_identity';
    } else if (question.includes('where')) {
      predicate = 'from';
    }
    
    // Create fact with temporal info
    const pdsCode = getPDSCode(predicate);
    const pdsDomain = pdsCode.substring(0, 1) + '000';
    
    facts.push({
      subject: entity,
      predicate,
      object: answer,
      valid_from: date,
      evidence: qa.evidence || [],
      pds_decimal: pdsCode,
      pds_domain: pdsDomain,
      confidence: 0.9,
      source: 'qa',
      category: qa.category
    });
  }
  
  return facts;
}

function extractRelationshipsFromDialog(conv) {
  const facts = [];
  const entities = ENTITY_MAP[conv.sample_id] || [];
  if (entities.length === 0 || !conv.conversation) return facts;
  
  const sessions = Object.keys(conv.conversation)
    .filter(k => k.startsWith('session_') && !k.includes('date_time') && !k.includes('speaker'))
    .map(k => k.replace('session_', ''));
  
  for (const sessionNum of sessions) {
    const sessionKey = `session_${sessionNum}`;
    const dateKey = `session_${sessionNum}_date_time`;
    const dialog = conv.conversation[sessionKey];
    const dateStr = conv.conversation[dateKey];
    
    if (!Array.isArray(dialog)) continue;
    
    // Parse session date
    const sessionDate = parseDate(dateStr);
    
    for (const turn of dialog) {
      const text = (turn.text || '').toLowerCase();
      const speaker = turn.speaker;
      
      if (!ALL_ENTITIES.includes(speaker)) continue;
      
      // Extract relationships
      const relationships = [
        { pattern: /married|husband|wife/, predicate: 'married_to', pds: '2101' },
        { pattern: /child|son|daughter|kid/, predicate: 'has_child', pds: '2102' },
        { pattern: /partner|boyfriend|girlfriend/, predicate: 'has_partner', pds: '2103' },
        { pattern: /friend/, predicate: 'has_friend', pds: '2201' },
        { pattern: /mother|father|mom|dad|parent/, predicate: 'parent_of', pds: '2104' }
      ];
      
      for (const rel of relationships) {
        if (rel.pattern.test(text)) {
          const pdsDomain = rel.pds.substring(0, 1) + '000';
          facts.push({
            subject: speaker,
            predicate: rel.predicate,
            object: turn.text.substring(0, 200),
            valid_from: sessionDate,
            evidence: [turn.dia_id],
            pds_decimal: rel.pds,
            pds_domain: pdsDomain,
            confidence: 0.7,
            source: 'dialog'
          });
        }
      }
      
      // Extract activities with dates
      const activities = [
        { pattern: /went to|visited|attended/, predicate: 'attended_on', pds: '4101' },
        { pattern: /started|began/, predicate: 'started_on', pds: '4401' },
        { pattern: /joined/, predicate: 'joined_on', pds: '4404' },
        { pattern: /bought|got|purchased/, predicate: 'bought_on', pds: '4501' },
        { pattern: /made|created|built/, predicate: 'made_on', pds: '4502' }
      ];
      
      for (const act of activities) {
        if (act.pattern.test(text)) {
          const pdsDomain = act.pds.substring(0, 1) + '000';
          facts.push({
            subject: speaker,
            predicate: act.predicate,
            object: turn.text.substring(0, 200),
            valid_from: sessionDate,
            evidence: [turn.dia_id],
            pds_decimal: act.pds,
            pds_domain: pdsDomain,
            confidence: 0.8,
            source: 'dialog'
          });
        }
      }
    }
  }
  
  return facts;
}

function extractFromSessionSummary(conv) {
  const facts = [];
  const entities = ENTITY_MAP[conv.sample_id] || [];
  if (entities.length === 0 || !conv.session_summary) return facts;
  
  for (const [key, val] of Object.entries(conv.session_summary)) {
    if (!key.includes('summary') || typeof val !== 'object') continue;
    
    for (const entity of entities) {
      const summaries = val[entity];
      if (!Array.isArray(summaries)) continue;
      
      for (const summary of summaries) {
        if (typeof summary !== 'string' || summary.length < 5) continue;
        
        // Infer predicate from summary text
        let predicate = 'occurred_on';
        if (/started|began/i.test(summary)) predicate = 'started_on';
        else if (/attended|went to|visited/i.test(summary)) predicate = 'attended_on';
        else if (/joined/i.test(summary)) predicate = 'joined_on';
        
        const pdsCode = getPDSCode(predicate);
        const pdsDomain = pdsCode.substring(0, 1) + '000';
        
        facts.push({
          subject: entity,
          predicate,
          object: summary,
          evidence: [],
          pds_decimal: pdsCode,
          pds_domain: pdsDomain,
          confidence: 0.7,
          source: 'session_summary'
        });
      }
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
  console.log('=== Enhanced LOCOMO Ingestion ===\n');
  console.log('Extracting: Temporal dates, Relationships, Activities\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  console.log(`Loaded ${locomo.length} conversations\n`);
  
  const stats = {
    temporal: { extracted: 0, inserted: 0 },
    relationships: { extracted: 0, inserted: 0 },
    summaries: { extracted: 0, inserted: 0 },
    byEntity: {}
  };
  
  for (const conv of locomo) {
    const convId = conv.sample_id;
    const entities = ENTITY_MAP[convId] || [];
    console.log(`[${convId}] Entities: ${entities.join(', ')}`);
    
    // Extract temporal facts from Q&A
    const temporalFacts = extractTemporalFromQA(conv);
    if (temporalFacts.length > 0) {
      console.log(`  Temporal Q&A: ${temporalFacts.length} facts`);
      stats.temporal.extracted += temporalFacts.length;
      const result = await storeFacts(temporalFacts);
      stats.temporal.inserted += result.inserted;
      
      for (const f of temporalFacts) {
        stats.byEntity[f.subject] = (stats.byEntity[f.subject] || 0) + 1;
      }
    }
    
    // Extract relationships from dialog
    const relFacts = extractRelationshipsFromDialog(conv);
    if (relFacts.length > 0) {
      console.log(`  Relationships: ${relFacts.length} facts`);
      stats.relationships.extracted += relFacts.length;
      const result = await storeFacts(relFacts);
      stats.relationships.inserted += result.inserted;
      
      for (const f of relFacts) {
        stats.byEntity[f.subject] = (stats.byEntity[f.subject] || 0) + 1;
      }
    }
    
    // Extract from session summaries
    const summaryFacts = extractFromSessionSummary(conv);
    if (summaryFacts.length > 0) {
      console.log(`  Session summaries: ${summaryFacts.length} facts`);
      stats.summaries.extracted += summaryFacts.length;
      const result = await storeFacts(summaryFacts);
      stats.summaries.inserted += result.inserted;
      
      for (const f of summaryFacts) {
        stats.byEntity[f.subject] = (stats.byEntity[f.subject] || 0) + 1;
      }
    }
    
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log('\n=== EXTRACTION COMPLETE ===');
  console.log(`Temporal Q&A: ${stats.temporal.extracted} extracted, ${stats.temporal.inserted} inserted`);
  console.log(`Relationships: ${stats.relationships.extracted} extracted, ${stats.relationships.inserted} inserted`);
  console.log(`Session summaries: ${stats.summaries.extracted} extracted, ${stats.summaries.inserted} inserted`);
  console.log('\nBy Entity:');
  Object.entries(stats.byEntity)
    .sort((a, b) => b[1] - a[1])
    .forEach(([e, c]) => console.log(`  ${e}: ${c}`));
}

main().catch(console.error);