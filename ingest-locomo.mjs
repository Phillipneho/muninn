#!/usr/bin/env node
/**
 * Ingest LOCOMO sessions properly
 * 
 * LOCOMO structure:
 * - Each dialogue has multiple sessions (session_1, session_2, ..., session_19)
 * - Each session has multiple turns with dia_id like "D{n}:{turn_id}"
 * - We need to store each session as a separate raw_session
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
    console.error(`Failed to store ${sessionId}: ${res.status} ${text}`);
    return null;
  }
  
  return res.json();
}

async function main() {
  console.log('=== Ingesting LOCOMO Sessions ===\n');
  
  // Load LOCOMO dataset
  const locomoRaw = fs.readFileSync(LOCOMO_PATH, 'utf-8');
  const locomo = JSON.parse(locomoRaw);
  
  console.log(`Loaded ${locomo.length} dialogues\n`);
  
  let totalSessions = 0;
  let storedSessions = 0;
  
  for (const dialogue of locomo) {
    const sampleId = dialogue.sample_id; // e.g., "conv-26"
    const conversation = dialogue.conversation;
    
    // Find all session keys (session_1, session_2, etc.)
    const sessionKeys = Object.keys(conversation)
      .filter(k => k.startsWith('session_') && !k.endsWith('_date_time'))
      .filter(k => k !== 'speaker_a' && k !== 'speaker_b')
      .sort((a, b) => {
        const numA = parseInt(a.replace('session_', ''));
        const numB = parseInt(b.replace('session_', ''));
        return numA - numB;
      });
    
    console.log(`\n${sampleId}: ${sessionKeys.length} sessions`);
    
    for (const sessionKey of sessionKeys) {
      const sessionNum = parseInt(sessionKey.replace('session_', ''));
      const sessionId = `${sampleId}_${sessionNum}`;  // Use underscore instead of colon
      const sessionTurns = conversation[sessionKey];
      
      if (!Array.isArray(sessionTurns) || sessionTurns.length === 0) {
        console.log(`  Skipping ${sessionId} - no turns`);
        continue;
      }
      
      totalSessions++;
      
      // Get session date
      const dateKey = `${sessionKey}_date_time`;
      const sessionDate = conversation[dateKey] || `Session ${sessionNum}`;
      
      // Get speakers
      const speakers = [conversation.speaker_a, conversation.speaker_b].filter(Boolean);
      
      // Build content from turns
      const lines = [];
      lines.push(`Session (${sessionDate})`);
      lines.push(`Speakers: ${speakers.join(', ')}`);
      lines.push('');
      
      for (const turn of sessionTurns) {
        const speaker = turn.speaker || 'Unknown';
        const text = turn.text || '';
        lines.push(`${speaker}: ${text}`);
      }
      
      const content = lines.join('\n');
      
      // Store session
      console.log(`  Storing ${sessionId} (${sessionTurns.length} turns)...`);
      const result = await storeSession(sessionId, content, sessionDate, 'locomo', speakers);
      
      if (result) {
        storedSessions++;
        console.log(`    ✓ Stored ${sessionId}`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total sessions: ${totalSessions}`);
  console.log(`Stored sessions: ${storedSessions}`);
  console.log(`Failed: ${totalSessions - storedSessions}`);
}

main().catch(console.error);