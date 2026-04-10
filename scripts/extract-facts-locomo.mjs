#!/usr/bin/env node
/**
 * Background Fact Extraction for LOCOMO Benchmark
 * 
 * Extracts atomic facts from raw sessions using Cloudflare Workers AI.
 * Facts are extracted separately from ingestion (not during memory creation).
 * 
 * Usage: node scripts/extract-facts-locomo.mjs [--limit N] [--dry-run]
 */

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

// PDS Domain mapping
const PDS_DOMAINS = {
  '1000': 'Internal State',
  '2000': 'Relational Orbit',
  '3000': 'Instrumental',
  '4000': 'Chronological',
  '5000': 'Conceptual'
};

/**
 * Extract facts from session content using Cloudflare Workers AI
 */
async function extractFactsFromSession(content, sessionDate, speakers) {
  try {
    const res = await fetch(`${MUNINN_API}/debug-extraction`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MUNINN_TOKEN}`,
        'X-Organization-ID': ORG,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: content,
        session_date: sessionDate
      })
    });

    if (!res.ok) {
      console.error(`  Extraction error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.extraction || data;
  } catch (err) {
    console.error(`  Extraction error: ${err.message}`);
    return null;
  }
}

/**
 * Normalize date string to ISO-8601 format
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.split('T')[0]; // Just the date part
  }
  
  // Parse natural language dates like "8:50 pm on 12 August, 2023"
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  
  const monthMatch = dateStr.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(\d{4})/i);
  if (monthMatch) {
    const day = monthMatch[1].padStart(2, '0');
    const monthIdx = monthNames.findIndex(m => m.toLowerCase() === monthMatch[2].toLowerCase());
    const month = (monthIdx + 1).toString().padStart(2, '0');
    const year = monthMatch[3];
    return `${year}-${month}-${day}`;
  }
  
  // Try "12 August 2023" format
  const altMonthMatch = dateStr.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i);
  if (altMonthMatch) {
    const monthIdx = monthNames.findIndex(m => m.toLowerCase() === altMonthMatch[1].toLowerCase());
    const month = (monthIdx + 1).toString().padStart(2, '0');
    const day = altMonthMatch[2].padStart(2, '0');
    const year = altMonthMatch[3];
    return `${year}-${month}-${day}`;
  }
  
  // Year only
  const yearMatch = dateStr.match(/\b(\d{4})\b/);
  if (yearMatch) {
    return `${yearMatch[1]}-01-01`;
  }
  
  return null;
}

/**
 * Get raw sessions from Muninn
 */
async function getRawSessions(limit = null) {
  const url = `${MUNINN_API}/raw-sessions?q=*&topK=${limit || 100}`;
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
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 10;

  console.log('=== Muninn Fact Extraction (Cloudflare Workers AI) ===');
  console.log('');
  console.log('Model: gemma4:31b-cloud');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no storage)' : 'EXTRACTION ONLY'}`);
  console.log(`Limit: ${limit} sessions`);
  console.log('');

  // Get raw sessions
  console.log('Fetching raw sessions from Cloudflare D1...');
  const sessions = await getRawSessions(limit);
  console.log(`Found ${sessions.length} sessions`);
  console.log('');

  if (sessions.length === 0) {
    console.log('No sessions to process.');
    return;
  }

  // Track results
  const results = {
    processed: 0,
    entities_extracted: 0,
    facts_extracted: 0,
    errors: 0,
    by_pds_domain: {},
    sample_facts: []
  };

  // Process each session
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    const shortId = session.id?.substring(0, 12) || 'unknown';
    
    console.log(`[${i + 1}/${sessions.length}] Processing ${shortId}...`);
    console.log(`  Date: ${session.session_date || 'unknown'}`);
    console.log(`  Speakers: ${(session.speakers || []).join(', ')}`);

    try {
      // Extract facts using Cloudflare Workers AI
      const extraction = await extractFactsFromSession(
        session.content,
        session.session_date,
        session.speakers || []
      );

      if (!extraction || !extraction.facts || extraction.facts.length === 0) {
        console.log('  No facts extracted');
        console.log('');
        continue;
      }

      console.log(`  ✓ Extracted ${extraction.facts.length} facts, ${extraction.entities?.length || 0} entities`);

      // Track by PDS domain
      for (const fact of extraction.facts) {
        const pdsCode = fact.pds_decimal || '0000';
        const domain = pdsCode.substring(0, 1) + '000';
        results.by_pds_domain[domain] = (results.by_pds_domain[domain] || 0) + 1;
      }

      // Store sample facts for review
      if (results.sample_facts.length < 10) {
        results.sample_facts.push(...extraction.facts.slice(0, 3).map(f => ({
          subject: f.subject,
          predicate: f.predicate,
          object: f.object,
          pds_decimal: f.pds_decimal,
          valid_from: f.validFrom
        })));
      }

      results.processed++;
      results.entities_extracted += extraction.entities?.length || 0;
      results.facts_extracted += extraction.facts.length;

  // Normalize dates and store facts via API
      if (!dryRun) {
        // Normalize valid_from dates to ISO-8601
        const normalizedFacts = extraction.facts.map(f => {
          const normalized = normalizeDate(f.validFrom || f.valid_from || f.date);
          return {
            ...f,
            valid_from: normalized,
            validFrom: normalized, // Override both fields
            date: normalized
          };
        });
        
        const storeRes = await fetch(`${MUNINN_API}/facts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${MUNINN_TOKEN}`,
            'X-Organization-ID': ORG,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            facts: normalizedFacts,
            entities: extraction.entities,
            source_session_id: session.id
          })
        });
        
        if (storeRes.ok) {
          const storeData = await storeRes.json();
          console.log(`  ✓ Stored ${storeData.inserted || 0} facts`);
        } else {
          console.log(`  ✗ Storage failed: ${storeRes.status}`);
        }
      }

    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      results.errors++;
    }

    console.log('');
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Summary
  console.log('');
  console.log('=== Extraction Summary ===');
  console.log('');
  console.log(`Sessions processed: ${results.processed}`);
  console.log(`Entities extracted: ${results.entities_extracted}`);
  console.log(`Facts extracted: ${results.facts_extracted}`);
  console.log(`Errors: ${results.errors}`);
  console.log('');
  console.log('By PDS Domain:');
  for (const [domain, count] of Object.entries(results.by_pds_domain).sort()) {
    const domainName = PDS_DOMAINS[domain] || 'Unknown';
    console.log(`  ${domain} (${domainName}): ${count} facts`);
  }
  
  console.log('');
  console.log('=== Sample Facts ===');
  for (const fact of results.sample_facts.slice(0, 5)) {
    console.log(`  ${fact.subject} ${fact.predicate} ${fact.object || ''} [PDS: ${fact.pds_decimal}]`);
  }

  if (dryRun) {
    console.log('');
    console.log('(Dry run - facts not stored. Deploy /api/facts endpoint to enable storage.)');
  }
}

main().catch(console.error);