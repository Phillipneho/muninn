#!/usr/bin/env node
/**
 * Ingest ALL LOCOMO conversations with proper fact extraction
 * Extracts facts from event_summary, session_summary, and Q&A evidence
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
  // 1000 - Internal State
  'identifies_as': '1201', 'has_identity': '1201', 'has_gender': '1201',
  'has_nationality': '1201', 'has_occupation': '1201', 'has_trait': '1301',
  'has_personality': '1301', 'prefers': '1401', 'likes': '1401', 'dislikes': '1401',
  'has_hobby': '1401', 'activity': '1401', 'kids_like': '1401', 'has_inclusivity': '1401',
  'from': '1201', 'loved': '1401', 'creating': '3201', 'favorite_childhood_book': '1401',
  'enjoy': '1401', 'enjoyed': '1401',
  
  // 2000 - Relational Orbit
  'has_relationship_status': '2101', 'married_to': '2101', 'married_for': '2101',
  'dating': '2101', 'has_child': '2101', 'has_partner': '2101', 'family_of': '2201',
  'friend_of': '2301', 'interacts_with': '2301', 'is_supportive_to': '2301',
  'known_for_duration': '2301', 'known_for': '2301', 'has_meetup': '2301',
  'has_support': '2101', 'supports': '2301',
  
  // 3000 - Instrumental
  'works_at': '3101', 'researched': '3101', 'has_goal': '3101', 'intends_to': '3101',
  'creates': '3201', 'creates_art': '3201', 'creates_content': '3201',
  'volunteers': '3301', 'participates_in': '3301', 'participated_in': '3301',
  'has_achievement': '3401', 'achieved_on': '3401', 'has_institution': '3101',
  
  // 4000 - Chronological
  'occurred_on': '4101', 'attended_on': '4101', 'visited': '4101', 'went_to': '4101',
  'started_on': '4401', 'started_activity': '4401', 'ended_on': '4401',
  'moved_from': '4401', 'moved_to': '4401', 'camped_at': '4101',
  'has_duration': '4201', 'completed_on': '4401', 'completed': '4401',
  'applied_to': '4101', 'signed_up_for': '4101', 'experienced': '4101',
  'encountered': '4101', 'joined': '4101', 'realized': '4101',
  'has_activity': '1401', 'has_location': '4401', 'has_possession': '1401',
  'possesses': '1401', 'pet': '1401',
  
  // Fallback
  'has': '0000', 'mentioned': '0000'
};

function inferPdsCode(predicate) {
  const pred = predicate.toLowerCase();
  
  if (pred.includes('identity') || pred.includes('gender') || pred.includes('nationality')) return '1201';
  if (pred.includes('trait') || pred.includes('personality')) return '1301';
  if (pred.includes('relationship') || pred.includes('married') || pred.includes('partner')) return '2101';
  if (pred.includes('child') || pred.includes('family')) return '2101';
  if (pred.includes('friend') || pred.includes('interact') || pred.includes('support')) return '2301';
  if (pred.includes('attend') || pred.includes('visit') || pred.includes('occur')) return '4101';
  if (pred.includes('start') || pred.includes('begin') || pred.includes('move')) return '4401';
  if (pred.includes('work') || pred.includes('research') || pred.includes('goal')) return '3101';
  if (pred.includes('create') || pred.includes('make')) return '3201';
  if (pred.includes('like') || pred.includes('prefer') || pred.includes('hobby')) return '1401';
  
  return '0000';
}

function classifyFact(predicate) {
  const pds_decimal = PREDICATE_TO_PDS[predicate] || inferPdsCode(predicate);
  const pds_domain = pds_decimal.substring(0, 1) + '000';
  return { pds_decimal, pds_domain };
}

// Extract facts from conversation
function extractFactsFromConversation(conv) {
  const facts = [];
  const entities = ENTITY_MAP[conv.sample_id] || [];
  
  if (entities.length === 0) {
    console.log(`  Skipping ${conv.sample_id} - no entity mapping`);
    return facts;
  }
  
  console.log(`  Entities: ${entities.join(', ')}`);
  
  // Extract from event_summary
  if (conv.event_summary) {
    for (const entity of entities) {
      const events = conv.event_summary[entity] || [];
      for (const event of events) {
        if (typeof event === 'string') {
          // Parse event string like "Caroline attended LGBTQ support group on 2023-05-07"
          const dateMatch = event.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
          const valid_from = dateMatch ? dateMatch[1] : null;
          
          // Infer predicate from content
          let predicate = 'occurred_on';
          if (event.toLowerCase().includes('attend')) predicate = 'attended_on';
          if (event.toLowerCase().includes('start')) predicate = 'started_on';
          if (event.toLowerCase().includes('join')) predicate = 'joined';
          if (event.toLowerCase().includes('visit')) predicate = 'visited';
          if (event.toLowerCase().includes('move')) predicate = 'moved_to';
          
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
  
  // Extract from session_summary
  if (conv.session_summary) {
    for (const entity of entities) {
      const summaries = conv.session_summary[entity] || [];
      for (const summary of summaries) {
        if (typeof summary === 'string') {
          // Infer predicate from content
          let predicate = 'has';
          if (summary.toLowerCase().includes('like') || summary.toLowerCase().includes('enjoy')) predicate = 'likes';
          if (summary.toLowerCase().includes('activity') || summary.toLowerCase().includes('hobby')) predicate = 'activity';
          if (summary.toLowerCase().includes('identity')) predicate = 'has_identity';
          if (summary.toLowerCase().includes('relationship') || summary.toLowerCase().includes('married')) predicate = 'has_relationship_status';
          if (summary.toLowerCase().includes('work') || summary.toLowerCase().includes('job')) predicate = 'works_at';
          if (summary.toLowerCase().includes('research')) predicate = 'researched';
          if (summary.toLowerCase().includes('volunteer')) predicate = 'volunteers';
          
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
  
  // Extract from Q&A evidence
  if (conv.qa) {
    for (const qa of conv.qa) {
      if (!qa.evidence || !qa.answer) continue;
      
      // Extract entity from question
      let entity = null;
      for (const e of Object.values(ENTITY_MAP).flat()) {
        if (qa.question.toLowerCase().includes(e.toLowerCase())) {
          entity = e;
          break;
        }
      }
      
      if (!entity && entities.length > 0) {
        entity = entities[0];
      }
      
      if (!entity) continue;
      
      // Create fact from answer
      const answer = String(qa.answer);
      
      // Skip if answer is too short or undefined
      if (answer.length < 5 || answer === 'undefined' || answer === 'null') continue;
      
      // Infer predicate from question
      let predicate = 'has';
      const q = qa.question.toLowerCase();
      
      if (q.includes('when')) predicate = 'occurred_on';
      if (q.includes('what') && q.includes('like')) predicate = 'likes';
      if (q.includes('what') && q.includes('activity')) predicate = 'activity';
      if (q.includes('what') && q.includes('identity')) predicate = 'has_identity';
      if (q.includes('relationship')) predicate = 'has_relationship_status';
      if (q.includes('research')) predicate = 'researched';
      if (q.includes('work') || q.includes('job')) predicate = 'works_at';
      
      // Extract date from answer
      const dateMatch = answer.match(/(\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December))/i);
      const valid_from = dateMatch ? dateMatch[1] : null;
      
      const { pds_decimal, pds_domain } = classifyFact(predicate);
      
      facts.push({
        subject: entity,
        predicate,
        object: answer,
        valid_from,
        pds_decimal,
        pds_domain,
        confidence: 0.7,
        source: 'qa_evidence'
      });
    }
  }
  
  return facts;
}

// Store facts
async function storeFacts(facts) {
  if (facts.length === 0) return { inserted: 0 };
  
  const res = await fetch(`${MUNINN_API}/facts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ facts })
  });
  
  if (!res.ok) {
    console.error(`  Error storing facts: ${res.status}`);
    return { inserted: 0, error: res.status };
  }
  
  return res.json();
}

async function ingestAll() {
  console.log('=== Ingesting ALL LOCOMO Conversations ===\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  console.log(`Loaded ${locomo.length} conversations\n`);
  
  const stats = {
    total: 0,
    inserted: 0,
    by_entity: {}
  };
  
  for (const conv of locomo) {
    console.log(`\n[${conv.sample_id}]`);
    
    const facts = extractFactsFromConversation(conv);
    
    if (facts.length === 0) continue;
    
    console.log(`  Extracted ${facts.length} facts`);
    
    const result = await storeFacts(facts);
    stats.total += facts.length;
    stats.inserted += result.inserted || 0;
    
    for (const fact of facts) {
      if (!stats.by_entity[fact.subject]) {
        stats.by_entity[fact.subject] = 0;
      }
      stats.by_entity[fact.subject]++;
    }
    
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n=== INGESTION COMPLETE ===');
  console.log(`Total facts extracted: ${stats.total}`);
  console.log(`Facts inserted: ${stats.inserted}`);
  console.log('\nBy Entity:');
  
  const sorted = Object.entries(stats.by_entity)
    .sort((a, b) => b[1] - a[1]);
  
  for (const [entity, count] of sorted) {
    console.log(`  ${entity}: ${count}`);
  }
  
  return stats;
}

ingestAll().catch(console.error);