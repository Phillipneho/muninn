#!/usr/bin/env node
/**
 * MIGRATE PDS CLASSIFICATION
 * 
 * Fixes facts with pds_decimal='0000' by:
 * 1. Fetching all unclassified facts
 * 2. Classifying with PREDICATE_TO_PDS map
 * 3. Detecting entity linkages (related_pds)
 * 4. Updating in database
 */

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

// PDS Taxonomy - Predicate to PDS mapping
const PREDICATE_TO_PDS = {
  // 1000 - Internal State
  'identifies_as': '1201',
  'has_identity': '1201',
  'has_gender': '1201',
  'has_nationality': '1201',
  'has_occupation': '1201',
  'has_trait': '1301',
  'has_personality': '1301',
  'prefers': '1401',
  'likes': '1401',
  'dislikes': '1401',
  'has_hobby': '1401',
  'activity': '1401',
  'kids_like': '1401',
  'has_inclusivity': '1401',
  
  // 2000 - Relational Orbit
  'has_relationship_status': '2101',
  'married_to': '2101',
  'married_for': '2101',
  'dating': '2101',
  'has_child': '2101',
  'has_partner': '2101',
  'family_of': '2201',
  'friend_of': '2301',
  'interacts_with': '2301',
  'is_supportive_to': '2301',
  'known_for_duration': '2301',
  'known_for': '2301',
  'has_meetup': '2301',
  
  // 3000 - Instrumental
  'works_at': '3101',
  'researched': '3101',
  'has_goal': '3101',
  'intends_to': '3101',
  'creates': '3201',
  'creates_art': '3201',
  'creates_content': '3201',
  'volunteers': '3301',
  'participates_in': '3301',
  'participated_in': '3301',
  'has_achievement': '3401',
  'achieved_on': '3401',
  'has_institution': '3101',
  
  // 4000 - Chronological
  'occurred_on': '4101',
  'attended_on': '4101',
  'visited': '4101',
  'went_to': '4101',
  'started_on': '4401',
  'started_activity': '4401',
  'ended_on': '4401',
  'moved_from': '4401',
  'moved_to': '4401',
  'camped_at': '4101',
  'has_duration': '4201',
  'completed_on': '4401',
  'completed': '4401',
  'applied_to': '4101',
  'signed_up_for': '4101',
  'experienced': '4101',
  'encountered': '4101',
  'joined': '4101',
  'realized': '4101',
  'has_activity': '1401',
  
  // Fallback
  'has': '0000',
  'mentioned': '0000',
  'possesses': '1401',
  'has_support': '2101',
  'has_location': '4401',
  'has_possession': '1401'
};

// Infer PDS from predicate patterns
function inferPdsCode(predicate) {
  const pred = predicate.toLowerCase();
  
  // Identity patterns
  if (pred.includes('identity') || pred.includes('gender') || pred.includes('nationality')) {
    return '1201';
  }
  if (pred.includes('trait') || pred.includes('personality')) {
    return '1301';
  }
  
  // Relationship patterns
  if (pred.includes('relationship') || pred.includes('married') || pred.includes('partner')) {
    return '2101';
  }
  if (pred.includes('child') || pred.includes('family')) {
    return '2101';
  }
  if (pred.includes('friend') || pred.includes('interact') || pred.includes('support')) {
    return '2301';
  }
  
  // Event patterns
  if (pred.includes('attend') || pred.includes('visit') || pred.includes('occur')) {
    return '4101';
  }
  if (pred.includes('start') || pred.includes('begin') || pred.includes('move')) {
    return '4401';
  }
  
  // Project patterns
  if (pred.includes('work') || pred.includes('research') || pred.includes('goal')) {
    return '3101';
  }
  if (pred.includes('create') || pred.includes('make')) {
    return '3201';
  }
  
  // Preference patterns
  if (pred.includes('like') || pred.includes('prefer') || pred.includes('hobby')) {
    return '1401';
  }
  
  return '0000';
}

// Detect entity linkages
function detectEntityLinkage(predicate, object) {
  const personNames = [
    'Caroline', 'Melanie', 'John', 'Maria', 'Joanna', 'Nate', 'Tim',
    'Audrey', 'Andrew', 'James', 'Deborah', 'Jolene', 'Evan', 'Sam',
    'Calvin', 'Dave', 'Gina', 'Jon'
  ];
  
  const objStr = (object || '').toString();
  const isPersonObject = personNames.some(name => objStr.includes(name));
  
  if (!isPersonObject) return null;
  
  const pred = predicate.toLowerCase();
  
  // Social relationship
  if (pred.includes('support') || pred.includes('friend') || pred.includes('interact')) {
    return '2300';
  }
  
  // Core relationship
  if (pred.includes('family') || pred.includes('married') || pred.includes('partner')) {
    return '2100';
  }
  
  return null;
}

// Classify a fact
function classifyFact(fact) {
  const predicate = fact.predicate || '';
  
  // Look up PDS code
  let pds_decimal = PREDICATE_TO_PDS[predicate] || '0000';
  
  // Infer from patterns if not found
  if (pds_decimal === '0000') {
    pds_decimal = inferPdsCode(predicate);
  }
  
  // Detect entity linkage
  const related_pds = detectEntityLinkage(predicate, fact.object);
  
  // Get PDS domain
  const pds_domain = pds_decimal.substring(0, 1) + '000';
  
  return {
    ...fact,
    pds_decimal,
    pds_domain,
    related_pds
  };
}

// Fetch all facts and filter by pds_decimal='0000'
async function fetchUnclassifiedFacts() {
  // Fetch facts by entity (API doesn't support pds_decimal filter)
  const entities = ['John', 'Maria', 'Joanna', 'Nate', 'Tim', 'Audrey', 'Andrew', 
                    'James', 'Deborah', 'Jolene', 'Evan', 'Sam', 'Calvin', 'Dave', 'Gina', 'Jon'];
  
  const allFacts = [];
  
  for (const entity of entities) {
    try {
      const res = await fetch(`${MUNINN_API}/facts/search?entity=${encodeURIComponent(entity)}&limit=200`, {
        headers: {
          'Authorization': `Bearer ${MUNINN_TOKEN}`,
          'X-Organization-ID': ORG
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        const unclassified = (data.results || []).filter(f => 
          f.pds_decimal === '0000' || f.pds_decimal === null || f.pds_decimal === undefined
        );
        allFacts.push(...unclassified);
        console.log(`  ${entity}: ${unclassified.length} unclassified facts`);
      }
    } catch (err) {
      console.error(`  ${entity}: ${err.message}`);
    }
  }
  
  return allFacts;
}

// Update fact in database
async function updateFact(factId, updates) {
  const res = await fetch(`${MUNINN_API}/facts/${factId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update fact ${factId}: ${res.status} ${text}`);
  }
  
  return res.json();
}

// Main migration
async function migrate() {
  console.log('=== PDS Classification Migration ===\n');
  
  // Fetch all facts with pds_decimal='0000'
  console.log('Fetching unclassified facts...');
  const facts = await fetchUnclassifiedFacts();
  
  console.log(`Found ${facts.length} facts with pds_decimal='0000'\n`);
  
  if (facts.length === 0) {
    console.log('No facts to migrate. Done!');
    return;
  }
  
  // Classify each fact
  console.log('Classifying facts...\n');
  
  let updated = 0;
  let failed = 0;
  
  for (const fact of facts) {
    try {
      const classified = classifyFact(fact);
      
      // Skip if still unclassified
      if (classified.pds_decimal === '0000') {
        console.log(`  [SKIP] ${fact.subject} ${fact.predicate} ${fact.object?.substring(0, 30)}... (no PDS code)`);
        continue;
      }
      
      // Update in database
      await updateFact(fact.id, {
        pds_decimal: classified.pds_decimal,
        pds_domain: classified.pds_domain,
        related_pds: classified.related_pds
      });
      
      console.log(`  [✓] ${fact.subject} ${fact.predicate} → PDS ${classified.pds_decimal}`);
      updated++;
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (err) {
      console.error(`  [✗] ${fact.id}: ${err.message}`);
      failed++;
    }
  }
  
  console.log(`\n=== Migration Complete ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${facts.length - updated - failed}`);
}

migrate().catch(console.error);