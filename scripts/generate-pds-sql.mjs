#!/usr/bin/env node
/**
 * Generate PDS Classification SQL
 * 
 * Since we can't deploy the admin endpoint, this script:
 * 1. Fetches all facts with pds_decimal='0000'
 * 2. Classifies them with PREDICATE_TO_PDS map
 * 3. Generates SQL UPDATE statements
 * 4. Outputs SQL that can be run via Cloudflare D1 console
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

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

// Classify fact
function classifyFact(fact) {
  const predicate = fact.predicate || '';
  let pds_decimal = PREDICATE_TO_PDS[predicate] || '0000';
  
  if (pds_decimal === '0000') {
    pds_decimal = inferPdsCode(predicate);
  }
  
  const pds_domain = pds_decimal.substring(0, 1) + '000';
  
  return { pds_decimal, pds_domain };
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

// Escape SQL string
function escapeSql(str) {
  return (str || '').replace(/'/g, "''");
}

// Main
async function generateSql() {
  console.log('=== PDS Classification SQL Generator ===\n');
  
  const entities = ['John', 'Maria', 'Joanna', 'Nate', 'Tim', 'Audrey', 'Andrew',
                    'James', 'Deborah', 'Jolene', 'Evan', 'Sam', 'Calvin', 'Dave', 'Gina', 'Jon'];
  
  const sqlStatements = [];
  const stats = {
    total: 0,
    classified: 0,
    unclassified: 0
  };
  
  for (const entity of entities) {
    console.log(`Fetching facts for ${entity}...`);
    
    try {
      const facts = await fetchFactsForEntity(entity);
      const unclassified = facts.filter(f => 
        f.pds_decimal === '0000' || f.pds_decimal === null || f.pds_decimal === undefined
      );
      
      console.log(`  Found ${unclassified.length} unclassified facts`);
      
      for (const fact of unclassified) {
        stats.total++;
        const classified = classifyFact(fact);
        
        if (classified.pds_decimal === '0000') {
          stats.unclassified++;
          console.log(`    [SKIP] ${fact.predicate} → no PDS code`);
          continue;
        }
        
        stats.classified++;
        const sql = `UPDATE facts SET pds_decimal = '${classified.pds_decimal}', pds_domain = '${classified.pds_domain}' WHERE id = '${fact.id}';`;
        sqlStatements.push(sql);
      }
      
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`\n=== Statistics ===`);
  console.log(`Total facts: ${stats.total}`);
  console.log(`Classified: ${stats.classified}`);
  console.log(`Unclassified: ${stats.unclassified}`);
  
  // Write SQL to file
  const outputPath = '/home/homelab/projects/muninn-cloudflare/pds-migration.sql';
  const header = `-- PDS Classification Migration\n-- Generated: ${new Date().toISOString()}\n-- Total: ${stats.classified} facts\n\n`;
  
  fs.writeFileSync(outputPath, header + sqlStatements.join('\n'));
  
  console.log(`\nSQL written to: ${outputPath}`);
  console.log(`\nTo apply, run this SQL in Cloudflare D1 console:`);
  console.log(`https://dash.cloudflare.com/f41284de76d5ead189b5b3500a08173f/workers/d1/database/4baf9390-37b6-4e10-aaac-ee2dae34f815`);
  
  // Also output first 50 statements
  console.log(`\n=== First 50 SQL Statements ===`);
  sqlStatements.slice(0, 50).forEach(sql => console.log(sql));
  
  if (sqlStatements.length > 50) {
    console.log(`\n... and ${sqlStatements.length - 50} more statements`);
    console.log(`See full file: ${outputPath}`);
  }
}

generateSql().catch(console.error);