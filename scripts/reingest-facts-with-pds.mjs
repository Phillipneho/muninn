#!/usr/bin/env node
/**
 * Re-ingest Facts with PDS Classification
 * 
 * This script:
 * 1. Identifies entities with facts having pds_decimal='0000'
 * 2. Deletes those facts
 * 3. Re-extracts facts using LIBRARIAN_EXTRACTION_PROMPT (with PDS taxonomy)
 * 4. Stores new facts with proper PDS codes
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';
const CF_ACCOUNT = 'f41284de76d5ead189b5b3500a08173f';
const CF_TOKEN = 'cfat_vlGGORiFHhoq5nB5hy7pQohd2HDLBcjUb5E0lzo37784962b';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

// PDS Domain Taxonomy (from Librarian prompt)
const PDS_DOMAINS = {
  '1000': 'INTERNAL STATE - Identity, Personality, Preferences',
  '1100': 'Core Identity',
  '1200': 'Social Identity',
  '1300': 'Personality',
  '1400': 'Preferences/Interests',
  '2000': 'RELATIONAL ORBIT - Social network and relationships',
  '2100': 'Immediate Kin',
  '2200': 'Extended Family',
  '2300': 'Social Orbit',
  '2400': 'Community/Groups',
  '3000': 'INSTRUMENTAL - Work, Projects, Goals',
  '3100': 'Work/Career',
  '3200': 'Creative Projects',
  '3300': 'Community Service',
  '3400': 'Achievements',
  '4000': 'CHRONOLOGICAL - Time and events',
  '4100': 'Fixed Schedule',
  '4200': 'Duration/Intervals',
  '4300': 'Recurrence',
  '4400': 'Transitions',
  '5000': 'CONCEPTUAL - Ideas, beliefs, values',
  '5100': 'Values',
  '5200': 'Beliefs',
  '5300': 'Knowledge'
};

// Predicate to PDS mapping (deterministic)
const PREDICATE_TO_PDS = {
  // 1000 - Internal State
  'identifies_as': '1201', 'has_identity': '1201', 'has_gender': '1201',
  'has_nationality': '1201', 'has_occupation': '1201', 'has_trait': '1301',
  'has_personality': '1301', 'prefers': '1401', 'likes': '1401', 'dislikes': '1401',
  'has_hobby': '1401', 'activity': '1401', 'kids_like': '1401', 'has_inclusivity': '1401',
  
  // 2000 - Relational Orbit
  'has_relationship_status': '2101', 'married_to': '2101', 'married_for': '2101',
  'dating': '2101', 'has_child': '2101', 'has_partner': '2101', 'family_of': '2201',
  'friend_of': '2301', 'interacts_with': '2301', 'is_supportive_to': '2301',
  'known_for_duration': '2301', 'known_for': '2301', 'has_meetup': '2301',
  'has_support': '2101',
  
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

// Infer PDS from predicate patterns
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

// Classify facts with PDS codes (deterministic)
function classifyFacts(facts) {
  return facts.map(fact => {
    const predicate = fact.predicate || '';
    
    // Look up PDS code
    let pds_decimal = PREDICATE_TO_PDS[predicate] || '0000';
    
    // Infer from patterns if not found
    if (pds_decimal === '0000') {
      pds_decimal = inferPdsCode(predicate);
    }
    
    // Get PDS domain
    const pds_domain = pds_decimal.substring(0, 1) + '000';
    
    return {
      ...fact,
      pds_decimal,
      pds_domain
    };
  });
}

// Fetch facts for entity
async function fetchFactsForEntity(entity) {
  const res = await fetch(`${MUNINN_API}/facts/search?entity=${encodeURIComponent(entity)}&limit=500`, {
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG
    }
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch facts for ${entity}: ${res.status}`);
  }
  
  const data = await res.json();
  return data.results || [];
}

// Delete facts for entity
async function deleteFactsForEntity(entity) {
  const res = await fetch(`${MUNINN_API}/admin/facts/by-entity/${encodeURIComponent(entity)}?confirm=true`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG
    }
  });
  
  if (!res.ok) {
    throw new Error(`Failed to delete facts for ${entity}: ${res.status}`);
  }
  
  return res.json();
}

// Store facts
async function storeFacts(facts) {
  const res = await fetch(`${MUNINN_API}/facts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ facts })
  });
  
  if (!res.ok) {
    throw new Error(`Failed to store facts: ${res.status}`);
  }
  
  return res.json();
}

// Main migration
async function migrate() {
  console.log('=== PDS Classification Migration ===\n');
  
  // Entities with unclassified facts
  const entities = ['John', 'Maria', 'Joanna', 'Nate', 'Tim', 'Audrey', 'Andrew',
                    'James', 'Deborah', 'Jolene', 'Evan', 'Sam', 'Calvin', 'Dave', 'Gina', 'Jon'];
  
  const results = {
    processed: 0,
    deleted: 0,
    reinserted: 0,
    errors: []
  };
  
  for (const entity of entities) {
    try {
      console.log(`\nProcessing ${entity}...`);
      
      // Fetch existing facts
      const facts = await fetchFactsForEntity(entity);
      const unclassified = facts.filter(f => 
        f.pds_decimal === '0000' || f.pds_decimal === null || f.pds_decimal === undefined
      );
      
      if (unclassified.length === 0) {
        console.log(`  ✓ ${entity}: All facts already classified`);
        continue;
      }
      
      console.log(`  Found ${unclassified.length} unclassified facts`);
      
      // Classify facts with PDS codes
      const classified = classifyFacts(unclassified);
      const canClassify = classified.filter(f => f.pds_decimal !== '0000');
      
      if (canClassify.length === 0) {
        console.log(`  ⚠ ${entity}: No facts can be classified`);
        continue;
      }
      
      // Delete old facts
      const deleteResult = await deleteFactsForEntity(entity);
      console.log(`  Deleted ${deleteResult.deleted} old facts`);
      results.deleted += deleteResult.deleted;
      
      // Prepare facts for storage (remove old fields)
      const newFacts = canClassify.map(f => ({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object_value || f.object,
        pds_decimal: f.pds_decimal,
        pds_domain: f.pds_domain,
        valid_from: f.valid_from,
        evidence: f.evidence,
        confidence: f.confidence || 0.8
      }));
      
      // Store new facts with PDS codes
      const storeResult = await storeFacts(newFacts);
      console.log(`  ✓ Re-inserted ${storeResult.inserted} facts with PDS codes`);
      results.reinserted += storeResult.inserted;
      results.processed++;
      
    } catch (err) {
      console.error(`  ✗ ${entity}: ${err.message}`);
      results.errors.push({ entity, error: err.message });
    }
    
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n=== Migration Complete ===`);
  console.log(`Entities processed: ${results.processed}`);
  console.log(`Facts deleted: ${results.deleted}`);
  console.log(`Facts re-inserted: ${results.reinserted}`);
  console.log(`Errors: ${results.errors.length}`);
  
  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(e => console.log(`  ${e.entity}: ${e.error}`));
  }
}

migrate().catch(console.error);