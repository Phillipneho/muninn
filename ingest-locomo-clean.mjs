#!/usr/bin/env node
/**
 * Clear existing LOCOMO sessions and re-ingest
 */

import fs from 'fs';

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

// First, get existing sessions
const existingRes = await fetch(`${MUNINN_API}/raw-sessions?limit=500`, {
  headers: {
    'Authorization': `Bearer ${MUNINN_TOKEN}`,
    'X-Organization-ID': ORG
  }
});
const existing = await existingRes.json();
const existingIds = (existing.sessions || []).map(s => s.id);
console.log(`Found ${existingIds.length} existing sessions`);

// Delete existing LOCOMO sessions
for (const id of existingIds) {
  if (id.startsWith('conv-') || id.startsWith('test-')) {
    console.log(`Deleting ${id}...`);
    const delRes = await fetch(`${MUNINN_API}/raw-sessions/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${MUNINN_TOKEN}`,
        'X-Organization-ID': ORG
      }
    });
    if (delRes.ok) {
      console.log(`  ✓ Deleted ${id}`);
    } else {
      console.log(`  ✗ Failed to delete ${id}: ${delRes.status}`);
    }
    await new Promise(r => setTimeout(r, 100));
  }
}

console.log('\n=== Starting fresh ingestion ===\n');

// Load LOCOMO
const locomoRaw = fs.readFileSync(LOCOMO_PATH, 'utf-8');
const locomo = JSON.parse(locomoRaw);
console.log(`Loaded ${locomo.length} dialogues\n`);

let totalSessions = 0;
let storedSessions = 0;
let failedSessions = 0;

for (const dialogue of locomo) {
  const sampleId = dialogue.sample_id;
  const conversation = dialogue.conversation;
  
  const sessionKeys = Object.keys(conversation)
    .filter(k => k.startsWith('session_') && !k.endsWith('_date_time'))
    .filter(k => k !== 'speaker_a' && k !== 'speaker_b')
    .sort((a, b) => parseInt(a.replace('session_', '')) - parseInt(b.replace('session_', '')));
  
  console.log(`\n${sampleId}: ${sessionKeys.length} sessions`);
  
  for (const sessionKey of sessionKeys) {
    const sessionNum = parseInt(sessionKey.replace('session_', ''));
    const sessionId = `${sampleId}_${sessionNum}`;
    const sessionTurns = conversation[sessionKey];
    
    if (!Array.isArray(sessionTurns) || sessionTurns.length === 0) continue;
    
    totalSessions++;
    
    const dateKey = `${sessionKey}_date_time`;
    const sessionDate = conversation[dateKey] || `Session ${sessionNum}`;
    const speakers = [conversation.speaker_a, conversation.speaker_b].filter(Boolean);
    
    const lines = [`Session (${sessionDate})`, `Speakers: ${speakers.join(', ')}`, ''];
    for (const turn of sessionTurns) {
      lines.push(`${turn.speaker || 'Unknown'}: ${turn.text || ''}`);
    }
    const content = lines.join('\n');
    
    console.log(`  Storing ${sessionId} (${sessionTurns.length} turns)...`);
    
    try {
      const res = await fetch(`${MUNINN_API}/raw-sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MUNINN_TOKEN}`,
          'X-Organization-ID': ORG,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: sessionId,
          content,
          session_date: sessionDate,
          source: 'locomo',
          speakers
        })
      });
      
      if (res.ok) {
        storedSessions++;
        console.log(`    ✓ Stored`);
      } else {
        const text = await res.text();
        console.log(`    ✗ Failed: ${res.status} ${text.substring(0, 100)}`);
        failedSessions++;
      }
    } catch (err) {
      console.log(`    ✗ Error: ${err.message}`);
      failedSessions++;
    }
    
    await new Promise(r => setTimeout(r, 150));
  }
}

console.log(`\n=== Summary ===`);
console.log(`Total sessions: ${totalSessions}`);
console.log(`Stored: ${storedSessions}`);
console.log(`Failed: ${failedSessions}`);