#!/usr/bin/env node
/**
 * Ingest LOCOMO session summaries with combined event+date facts
 * Solves the temporal linking problem
 */

import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

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

// Extract temporal facts with event+date combined
function extractTemporalFacts(summary, entities) {
  const facts = [];
  
  // Date patterns
  const datePatterns = [
    /(\d{1,2}\s+(?:May|June|July|August|September|October|November|December)\s+\d{4})/gi,
    /((?:May|June|July|August|September|October)\s+\d{1,2},?\s+\d{4})/gi,
    /(yesterday)/gi,
    /(last (?:week|month|year))/gi,
    /(\d{4})/g,
    /((?:The\s+)?(?:week|weekend|day|Friday|Saturday|Sunday|Tuesday)\s+(?:before|after)\s+\d{1,2}\s+(?:May|June|July|August|September|October))/gi
  ];
  
  // Event patterns (matched with dates)
  const eventPatterns = [
    /(?:attended|went to|joined|started|began|finished|completed|visited)\s+([^.]+?)(?:\s+on\s+|\s+last\s+|\s+this\s+|\.)/gi,
    /([^.]+?)\s+(?:on\s+(?:\d{1,2}\s+(?:May|June|July|August|September|October)))/gi
  ];
  
  // Combined extraction from summary text
  for (const entity of entities) {
    // Find sentences mentioning the entity
    const sentences = summary.split(/[.!?]+/).filter(s => 
      s.toLowerCase().includes(entity.toLowerCase())
    );
    
    for (const sentence of sentences) {
      // Check for date
      for (const pattern of datePatterns) {
        const dateMatch = sentence.match(pattern);
        if (dateMatch) {
          const date = dateMatch[0];
          
          // Extract event from the sentence
          const eventMatch = sentence.match(/(?:attended|went to|joined|started|began|finished|completed|visited|had)\s+([a-zA-Z\s]+?)(?:\s+on|\s+and|,|\.$)/i);
          if (eventMatch) {
            const event = eventMatch[1].trim();
            // Create combined fact
            facts.push({
              subject: entity,
              predicate: 'event_date',
              object: `${event} on ${date}`,
              confidence: 0.9
            });
          }
        }
      }
    }
  }
  
  return facts;
}

async function storeFact(fact) {
  try {
    const res = await fetch(`${MUNINN_API}/facts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MUNINN_KEY}`,
        'Content-Type': 'application/json',
        'X-Organization-ID': ORG
      },
      body: JSON.stringify({ facts: [fact] })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function ingest() {
  console.log('=== Ingesting LOCOMO Temporal Facts ===\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  
  let total = 0;
  let stored = 0;
  
  for (const conv of locomo) {
    const sampleId = conv.sample_id;
    const entities = ENTITY_MAP[sampleId] || [];
    
    if (!entities.length) continue;
    
    // Extract from all session summaries
    const sessionSummary = conv.session_summary;
    if (!sessionSummary) continue;
    
    const summaries = Object.values(sessionSummary)
      .filter(v => typeof v === 'string');
    
    for (const summary of summaries) {
      if (typeof summary !== 'string') continue;
      const facts = extractTemporalFacts(summary, entities);
      total += facts.length;
      
      for (const fact of facts) {
        const ok = await storeFact(fact);
        if (ok) {
          stored++;
          console.log(`✓ ${fact.subject}: ${fact.object}`);
        }
      }
    }
  }
  
  console.log(`\n=== COMPLETE ===`);
  console.log(`Stored: ${stored}/${total}`);
}

ingest().catch(console.error);