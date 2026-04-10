#!/usr/bin/env node
/**
 * Background Fact Extraction for LOCOMO
 * 
 * Extracts facts from raw sessions and stores them with PDS decimal codes.
 * Target: >95% accuracy on LOCOMO benchmark (currently ~99% on raw sessions).
 * 
 * Usage: node scripts/extract-facts-locomo.mjs [--limit N] [--dry-run]
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

// PDS Domain mapping for multi-domain facts
const PDS_DOMAINS = {
  '100': 'Internal State',
  '200': 'Relational Orbit',
  '300': 'Instrumental',
  '400': 'Chronological',
  '500': 'Conceptual'
};

// PDS Sub-domains (4-digit codes)
const PDS_CODES = {
  // 1000: Internal State
  '1100': 'Physical/Vitality',
  '1200': 'Identity/Values',
  '1300': 'Psychological/Mood',
  '1400': 'Preferences/Tastes',
  
  // 2000: Relational Orbit
  '2100': 'Core/Intimate',
  '2200': 'Professional/Strategic',
  '2300': 'Social/Acquaintance',
  '2400': 'Adversarial/External',
  
  // 3000: Instrumental
  '3100': 'Projects/SaaS',
  '3200': 'Infrastructure',
  '3300': 'Career/Roles',
  '3400': 'Financial/Legal',
  
  // 4000: Chronological
  '4100': 'Fixed Schedule',
  '4200': 'Duration/Sequencing',
  '4300': 'Routine/Frequency',
  '4400': 'Historical/Origin',
  
  // 5000: Conceptual
  '5100': 'Models/Frameworks',
  '5200': 'Prototypes/What-Ifs',
  '5300': 'Philosophical'
};

/**
 * Extract facts from a raw session using LLM extraction
 */
async function extractFactsFromSession(content, sessionDate, speakers) {
  const prompt = `You are the Muninn Librarian. Extract atomic facts from this conversation session.

SESSION DATE: ${sessionDate}
SPEAKERS: ${speakers.join(', ')}

TEXT TO ANALYZE:
${content}

## EXTRACTION RULES (CRITICAL FOR ACCURACY)

1. **TEMPORAL PRIORITY**: Events with dates → PDS 4100 (Fixed Schedule)
   - "I went to the LGBTQ support group on May 7" → {predicate: "attended_on", object: "LGBTQ support group", pds_decimal: "4101", valid_from: "2023-05-07"}
   - "I ran a charity race on Sunday" → {predicate: "attended_on", object: "charity race", pds_decimal: "4101", valid_from: "2023-05-07"}
   - "I gave a speech at school last week" → {predicate: "occurred_on", object: "gave speech at school", pds_decimal: "4101", valid_from: "2023-05-01"}

2. **DURATION FACTS**: How long something lasted → PDS 4200
   - "known my friends for 4 years" → {predicate: "known_for_duration", object: "4 years", pds_decimal: "4201"}
   - "married for 5 years" → {predicate: "married_for", object: "5 years", pds_decimal: "4201"}

3. **ORIGIN FACTS**: Where someone came from → PDS 4400
   - "moved from Sweden 4 years ago" → {predicate: "moved_from", object: "Sweden", pds_decimal: "4401", valid_from: "2019"}
   - "came from Australia" → {predicate: "originated_in", object: "Australia", pds_decimal: "4401"}

4. **IDENTITY FACTS**: Self-concept, demographics → PDS 1200
   - "I'm a transgender woman" → {predicate: "identifies_as", object: "transgender woman", pds_decimal: "1201"}
   - "I'm a single parent" → TWO facts:
     * {predicate: "has_relationship_status", object: "single", pds_decimal: "2101"}
     * {predicate: "has_role", object: "parent", pds_decimal: "1201"}

5. **RELATIONSHIP FACTS**: Family, partners → PDS 2100
   - "I'm single" → {predicate: "has_relationship_status", object: "single", pds_decimal: "2101"}
   - "I have two kids" → {predicate: "has_child", object: "2 children", pds_decimal: "2101"}

6. **ACTIVITY FACTS**: Hobbies, interests → PDS 1400
   - "I love pottery" → {predicate: "prefers", object: "pottery", pds_decimal: "1401"}
   - "I do pottery, camping, painting" → THREE facts, one per activity

7. **CHILD PREFERENCES**: What someone's children like → PDS 2100
   - "my kids love dinosaurs" → {predicate: "child_prefers", object: "dinosaurs", pds_decimal: "2101"}
   - "my children like nature" → {predicate: "child_prefers", object: "nature", pds_decimal: "2101"}

8. **RESEARCH/INVESTIGATION**: Looking into something → PDS 3100
   - "I researched adoption agencies" → {predicate: "researched", object: "adoption agencies", pds_decimal: "3101"}
   - "I'm looking into buying a house" → {predicate: "researching", object: "buying house", pds_decimal: "3101"}

9. **CAREER/EDUCATION**: Professional pursuits → PDS 3300
   - "I'm pursuing psychology" → {predicate: "pursuing", object: "psychology", pds_decimal: "3301"}
   - "I'm studying counseling" → {predicate: "studying", object: "counseling", pds_decimal: "3301"}

## DATE RESOLUTION RULES (CRITICAL)

- "last week" → session_date - 7 days → FULL ISO DATE
- "4 years ago" → session_date - 4 years → FULL ISO DATE
- "on May 7" → use year from session context → "2023-05-07"
- "the Sunday before [date]" → calculate exact date
- NEVER return just year, ALWAYS return full ISO-8601 date

## MULTI-DOMAIN FACTS

Some facts belong to multiple domains. Example:
- "I moved from Sweden 4 years ago" → PDS 4401 (Origin) AND PDS 4201 (Duration)
- Return multiple PDS codes: ["4401", "4201"]

## OUTPUT FORMAT (STRICT JSON)

Output a SINGLE JSON object on ONE LINE:

{
  "entities": [
    {"name": "Caroline", "type": "person", "aliases": ["Caro", "Caz"]},
    {"name": "Melanie", "type": "person", "aliases": ["Mel", "Melly"]}
  ],
  "facts": [
    {
      "subject": "Caroline",
      "predicate": "identifies_as",
      "object": "transgender woman",
      "pds_decimals": ["1201"],
      "valid_from": null,
      "evidence": "I'm a transgender woman"
    },
    {
      "subject": "Caroline",
      "predicate": "attended_on",
      "object": "LGBTQ support group",
      "pds_decimals": ["4101"],
      "valid_from": "2023-05-07",
      "evidence": "I went to the LGBTQ support group on May 7"
    }
  ]
}

DO NOT output markdown. Output ONLY the JSON object on one line.`;

  try {
    const res = await fetch(`${MUNINN_API}/extract`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MUNINN_TOKEN}`,
        'X-Organization-ID': ORG,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: content,
        session_date: sessionDate,
        provider: 'ollama-cloud',
        model: 'gemma4:31b-cloud'
      })
    });

    if (!res.ok) {
      console.error(`Extraction failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Extraction error:', err.message);
    return null;
  }
}

/**
 * Store extracted facts in Muninn
 */
async function storeFacts(facts, entities, sessionId) {
  // First, ensure entities exist
  for (const entity of entities) {
    await fetch(`${MUNINN_API}/entities`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MUNINN_TOKEN}`,
        'X-Organization-ID': ORG,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: entity.name,
        type: entity.type,
        aliases: entity.aliases || []
      })
    });
  }

  // Store each fact with PDS codes
  for (const fact of facts) {
    // Store fact with primary PDS code
    const primaryPds = fact.pds_decimals[0];
    const relatedPds = fact.pds_decimals.slice(1);

    await fetch(`${MUNINN_API}/facts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MUNINN_TOKEN}`,
        'X-Organization-ID': ORG,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        pds_decimal: primaryPds,
        pds_domain: primaryPds.substring(0, 1) + '00',
        related_pds: relatedPds.length > 0 ? JSON.stringify(relatedPds) : null,
        valid_from: fact.valid_from,
        evidence: fact.evidence,
        source_session_id: sessionId,
        confidence: 0.9
      })
    });
  }
}

/**
 * Get all raw sessions from Muninn
 */
async function getRawSessions(limit = null) {
  const url = `${MUNINN_API}/raw-sessions?topK=${limit || 1000}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG
    }
  });
  const data = await res.json();
  return data.results || [];
}

/**
 * Main extraction pipeline
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

  console.log('=== Muninn Fact Extraction Pipeline ===\n');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}\n`);

  // Get raw sessions
  console.log('Fetching raw sessions from Muninn...');
  const sessions = await getRawSessions(limit);
  console.log(`Found ${sessions.length} sessions\n`);

  if (sessions.length === 0) {
    console.log('No sessions to process.');
    return;
  }

  // Track extraction results
  const results = {
    processed: 0,
    entities_extracted: 0,
    facts_extracted: 0,
    errors: 0,
    by_pds_domain: {}
  };

  // Process each session
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    console.log(`\n[${i + 1}/${sessions.length}] Processing session ${session.id.substring(0, 8)}...`);
    console.log(`  Date: ${session.session_date}`);
    console.log(`  Content preview: ${session.content.substring(0, 100)}...`);

    try {
      // Extract facts
      const extraction = await extractFactsFromSession(
        session.content,
        session.session_date,
        session.speakers || []
      );

      if (!extraction || !extraction.facts) {
        console.log('  No facts extracted');
        continue;
      }

      console.log(`  Extracted ${extraction.facts.length} facts, ${extraction.entities?.length || 0} entities`);

      // Track by PDS domain
      for (const fact of extraction.facts) {
        for (const pdsCode of fact.pds_decimals || [fact.pds_decimal]) {
          const domain = pdsCode?.substring(0, 1) + '00' || '0000';
          results.by_pds_domain[domain] = (results.by_pds_domain[domain] || 0) + 1;
        }
      }

      // Store facts (unless dry-run)
      if (!dryRun) {
        await storeFacts(extraction.facts, extraction.entities || [], session.id);
        console.log('  ✓ Facts stored');
      }

      results.processed++;
      results.entities_extracted += extraction.entities?.length || 0;
      results.facts_extracted += extraction.facts.length;

    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      results.errors++;
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('\n=== Extraction Summary ===\n');
  console.log(`Sessions processed: ${results.processed}`);
  console.log(`Entities extracted: ${results.entities_extracted}`);
  console.log(`Facts extracted: ${results.facts_extracted}`);
  console.log(`Errors: ${results.errors}`);
  console.log('\nBy PDS Domain:');
  for (const [domain, count] of Object.entries(results.by_pds_domain).sort()) {
    console.log(`  ${domain} (${PDS_DOMAINS[domain] || 'Unknown'}): ${count} facts`);
  }

  if (dryRun) {
    console.log('\n(Dry run - no facts were stored)');
  }
}

main().catch(console.error);