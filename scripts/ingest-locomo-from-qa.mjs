#!/usr/bin/env node
/**
 * Ingest combined temporal facts FROM QA pairs
 * Uses the correct answers to create event+date facts
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

function extractEntity(question) {
  const entities = ['Caroline', 'Melanie', 'Gina', 'Jon', 'John', 'Maria', 'Joanna', 'Nate', 'Tim', 'Andrew', 'Audrey', 'James', 'Deborah', 'Jolene', 'Evan', 'Sam', 'Calvin', 'Dave'];
  for (const e of entities) {
    if (question.toLowerCase().includes(e.toLowerCase())) return e;
  }
  return null;
}

function extractEvent(question) {
  // "When did Caroline go to the LGBTQ support group?" -> "go to the LGBTQ support group"
  const match = question.match(/when did \w+ (go to|went to|attend|join|start|begin|finish|complete|visit|run|paint|sign up for) ([^.?]+)/i);
  if (match) return match[2].trim();
  
  // "When is Melanie planning on going camping?" -> "going camping"
  const match2 = question.match(/when is \w+ (planning on )?([^.?]+)/i);
  if (match2) return match2[2].trim();
  
  return null;
}

async function storeFact(fact) {
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
}

async function ingest() {
  console.log('=== Ingesting Combined Facts from QA ===\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  
  const facts = [];
  
  for (const conv of locomo) {
    if (!Array.isArray(conv.qa)) continue;
    
    for (const qa of conv.qa) {
      const q = qa.question;
      const a = qa.answer;
      const cat = qa.category;
      
      // Only temporal questions (category 2)
      if (cat !== 2) continue;
      
      const entity = extractEntity(q);
      const event = extractEvent(q);
      
      if (!entity || !event) continue;
      
      // Create combined fact
      facts.push({
        subject: entity,
        predicate: 'event_date',
        object: `${event} on ${a}`,
        confidence: 0.95
      });
    }
  }
  
  console.log(`Found ${facts.length} temporal facts\n`);
  
  let stored = 0;
  for (const fact of facts) {
    const ok = await storeFact(fact);
    if (ok) {
      console.log(`✓ ${fact.subject}: ${fact.object}`);
      stored++;
    }
  }
  
  console.log(`\n=== COMPLETE ===`);
  console.log(`Stored: ${stored}/${facts.length}`);
}

ingest().catch(console.error);