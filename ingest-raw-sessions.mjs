#!/usr/bin/env node
/**
 * Raw Session Ingestion for LOCOMO Benchmark
 * 
 * Based on MemPal architecture:
 * - Store verbatim sessions (no extraction)
 * - Generate embeddings for semantic search
 * - Preserve original session_date (CRITICAL for temporal queries)
 * - Background refinement extracts facts later
 * 
 * Expected accuracy: 85-90% baseline
 */

import fs from 'fs';

const CF_ACCOUNT = 'f41284de76d5ead189b5b3500a08173f';
const CF_TOKEN = 'cfat_vlGGORiFHhoq5nB5hy7pQohd2HDLBcjUb5E0lzo37784962b';
const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';
const DATA_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const PROGRESS_FILE = '/home/homelab/.openclaw/workspace/memory/raw-sessions-progress.json';

/**
 * Build session content from LOCOMO conversation
 */
function buildSessionContent(conv, sessionKey) {
  const session = conv.conversation;
  const sessionData = session[sessionKey];
  
  if (!sessionData || !Array.isArray(sessionData)) {
    return null;
  }
  
  const lines = [];
  
  // Get speaker names
  const speakers = [session.speaker_a, session.speaker_b].filter(Boolean);
  
  // Add session header with date (CRITICAL)
  const sessionDateField = sessionKey + '_date_time';
  const sessionDate = session[sessionDateField] || '2023-06-09';
  lines.push(`Session (${sessionDate})`);
  lines.push(`Speakers: ${speakers.join(', ')}`);
  lines.push('');
  
  // Add conversation turns
  for (const turn of sessionData) {
    if (turn.text) {
      lines.push(`${turn.speaker}: ${turn.text}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Get all sessions from LOCOMO data
 */
function getAllSessions(data) {
  const sessions = [];
  
  for (const conv of data) {
    const sampleId = conv.sample_id;
    const conversation = conv.conversation;
    
    // Find all session keys
    const sessionKeys = Object.keys(conversation)
      .filter(k => k.startsWith('session_') && !k.includes('_date_time') && Array.isArray(conversation[k]));
    
    for (const sessionKey of sessionKeys) {
      const content = buildSessionContent(conv, sessionKey);
      if (!content) continue;
      
      const sessionDateField = `${sessionKey}_date_time`;
      const sessionDate = conversation[sessionDateField] || '2023-06-09';
      const speakers = [
        conversation.speaker_a,
        conversation.speaker_b
      ].filter(Boolean);
      
      // Extract session number from key (session_1 > 1)
      const sessionNum = parseInt(sessionKey.split('_')[1]) || 1;
      
      sessions.push({
        id: `${sampleId}:${sessionNum}`,
        content,
        session_date: sessionDate,
        source: 'locomo',
        speakers
      });
    }
  }
  
  return sessions;
}

/**
 * Store raw session via API
 */
async function storeRawSession(session) {
  // Use existing memories endpoint with raw_session type
  const res = await fetch(`${MUNINN_API}/raw-sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': ORG
    },
    body: JSON.stringify({
      id: session.id,
      content: session.content,
      session_date: session.session_date,  // CRITICAL: original date
      source: session.source,
      speakers: session.speakers
      // Note: embedding generated server-side
    })
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  
  return await res.json();
}

/**
 * Load/save progress
 */
function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return { done: [], failed: [] };
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Main ingestion
 */
async function run() {
  console.log('=== LOCOMO RAW SESSION INGESTION ===\n');
  console.log('Architecture: MemPal-style raw storage');
  console.log('No LLM extraction during ingestion');
  console.log('Session dates preserved from original data\n');
  
  // Load data
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const sessions = getAllSessions(data);
  
  console.log(`Total sessions: ${sessions.length}`);
  
  // Load progress
  const progress = loadProgress();
  const done = new Set(progress.done);
  
  // Process in batches
  const BATCH_SIZE = 20;
  let processed = 0;
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
    const batch = sessions.slice(i, i + BATCH_SIZE);
    
    const promises = batch.map(async (session) => {
      if (done.has(session.id)) return { skipped: true };
      
      try {
        const result = await storeRawSession(session);
        return { success: true, id: session.id };
      } catch (err) {
        return { failed: true, id: session.id, error: err.message };
      }
    });
    
    const results = await Promise.all(promises);
    
    for (const r of results) {
      if (r.skipped) continue;
      if (r.success) {
        progress.done.push(r.id);
        success++;
      } else {
        progress.failed.push({ id: r.id, error: r.error });
        failed++;
      }
      processed++;
    }
    
    saveProgress(progress);
    console.log(`Progress: ${processed}/${sessions.length} (${success} success, ${failed} failed)`);
  }
  
  console.log('\n=== COMPLETE ===');
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  
  // Verify dates are correct
  console.log('\n=== VERIFICATION ===');
  const verifyRes = await fetch(`${MUNINN_API}/raw-sessions?limit=5`, {
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG
    }
  });
  
  if (verifyRes.ok) {
    const samples = await verifyRes.json();
    console.log('Sample sessions:');
    for (const s of samples.slice(0, 5)) {
      console.log(`  ${s.id}: ${s.session_date}`);
    }
  }
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});