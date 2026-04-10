#!/usr/bin/env node
/**
 * Test batch insertion of LOCOMO sessions
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

async function storeSession(sessionId, content, sessionDate, source, speakers) {
  const res = await fetch(`${MUNINN_API}/raw-sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: sessionId,
      content: content,
      session_date: sessionDate,
      source: source,
      speakers: speakers
    })
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to store ${sessionId}: ${res.status} ${text}`);
  }
  
  return res.json();
}

async function main() {
  console.log('=== Testing LOCOMO Ingestion ===\n');
  
  // Load first dialogue only
  const locomoRaw = fs.readFileSync(LOCOMO_PATH, 'utf-8');
  const locomo = JSON.parse(locomoRaw);
  const dialogue = locomo[0]; // Just first dialogue
  
  console.log(`Testing with dialogue: ${dialogue.sample_id}`);
  
  const conversation = dialogue.conversation;
  const sessionKeys = Object.keys(conversation)
    .filter(k => k.startsWith('session_') && !k.endsWith('_date_time'))
    .filter(k => k !== 'speaker_a' && k !== 'speaker_b')
    .sort((a, b) => {
      const numA = parseInt(a.replace('session_', ''));
      const numB = parseInt(b.replace('session_', ''));
      return numA - numB;
    });
  
  console.log(`Found ${sessionKeys.length} sessions\n`);
  
  let success = 0;
  let failed = 0;
  
  for (const sessionKey of sessionKeys.slice(0, 5)) { // Test first 5
    const sessionNum = parseInt(sessionKey.replace('session_', ''));
    const sessionId = `${dialogue.sample_id}_${sessionNum}`;
    const sessionTurns = conversation[sessionKey];
    
    if (!Array.isArray(sessionTurns) || sessionTurns.length === 0) {
      console.log(`  Skipping ${sessionId} - no turns`);
      continue;
    }
    
    const dateKey = `${sessionKey}_date_time`;
    const sessionDate = conversation[dateKey] || `Session ${sessionNum}`;
    const speakers = [conversation.speaker_a, conversation.speaker_b].filter(Boolean);
    
    const lines = [];
    lines.push(`Session (${sessionDate})`);
    lines.push(`Speakers: ${speakers.join(', ')}`);
    lines.push('');
    for (const turn of sessionTurns) {
      lines.push(`${turn.speaker || 'Unknown'}: ${turn.text || ''}`);
    }
    const content = lines.join('\n');
    
    console.log(`Storing ${sessionId} (${sessionTurns.length} turns)...`);
    
    try {
      const result = await storeSession(sessionId, content, sessionDate, 'locomo', speakers);
      console.log(`  ✓ Success: ${result.id}`);
      success++;
    } catch (err) {
      console.log(`  ✗ Failed: ${err.message}`);
      failed++;
    }
    
    await new Promise(r => setTimeout(r, 200)); // 200ms delay
  }
  
  console.log(`\n=== Results ===`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);