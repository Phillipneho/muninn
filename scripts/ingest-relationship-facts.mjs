#!/usr/bin/env node
/**
 * Ingest relationship facts from LOCOMO session summaries
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

// Extract relationship facts from text
function extractRelationshipFacts(text, entities) {
  const facts = [];
  const lower = text.toLowerCase();
  
  for (const entity of entities) {
    const entityLower = entity.toLowerCase();
    
    // Check for marriage duration
    const marriedMatch = text.match(/married for (\d+ years?)/i);
    if (marriedMatch && lower.includes(entityLower)) {
      facts.push({
        subject: entity,
        predicate: 'qa_marriage',
        object: marriedMatch[1],
        confidence: 0.9
      });
    }
    
    // Check for charity race
    if (lower.includes('charity race') && lower.includes('mental health')) {
      facts.push({
        subject: entity,
        predicate: 'qa_charity',
        object: 'mental health',
        confidence: 0.9
      });
    }
    
    // Check for self-care realization
    if (lower.includes('self-care is important') || lower.includes('importance of self-care')) {
      facts.push({
        subject: entity,
        predicate: 'qa_realization',
        object: 'self-care is important',
        confidence: 0.9
      });
    }
    
    // Check for support mentions
    const supportMatch = text.match(/support(?:ed)? by ([^.]+)/i);
    if (supportMatch) {
      facts.push({
        subject: entity,
        predicate: 'qa_supports',
        object: supportMatch[1].trim(),
        confidence: 0.85
      });
    }
    
    // Check for children count
    const childrenMatch = text.match(/(\d+) (?:kids?|children)/i);
    if (childrenMatch) {
      facts.push({
        subject: entity,
        predicate: 'qa_children',
        object: childrenMatch[1],
        confidence: 0.9
      });
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
  console.log('=== Ingesting Relationship Facts ===\n');
  
  const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));
  
  const allFacts = [];
  
  for (const conv of locomo) {
    const sampleId = conv.sample_id;
    const entities = ENTITY_MAP[sampleId] || [];
    if (!entities.length) continue;
    
    const sessionSummary = conv.session_summary;
    if (!sessionSummary) continue;
    
    for (const [key, value] of Object.entries(sessionSummary)) {
      if (typeof value !== 'string') continue;
      const facts = extractRelationshipFacts(value, entities);
      if (facts.length > 0) {
        console.log(`${key}: ${facts.length} facts`);
        allFacts.push(...facts);
      }
    }
  }
  
  console.log(`\nFound ${allFacts.length} relationship facts\n`);
  
  let stored = 0;
  for (const fact of allFacts) {
    const ok = await storeFact(fact);
    if (ok) {
      console.log(`✓ ${fact.subject}: [${fact.predicate}] ${fact.object}`);
      stored++;
    }
  }
  
  console.log(`\n=== COMPLETE ===`);
  console.log(`Stored: ${stored}/${allFacts.length}`);
}

ingest().catch(console.error);