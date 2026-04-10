#!/usr/bin/env node
/**
 * LOCOMO Robust Ingestion Script
 * 
 * Features:
 * - Session-by-session ingestion (not whole conversations)
 * - Retry with exponential backoff on timeout
 * - Resume from last successful session
 * - Progress tracking in memory/locomo-progress.json
 * - Uses gemma4:26b (26B A4B) via Ollama Cloud
 */

import fs from 'fs';
import path from 'path';

const DATA_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const PROGRESS_PATH = '/home/homelab/.openclaw/workspace/memory/locomo-progress.json';
const API = 'https://api.muninn.au/api/memories';
const TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';

// Model configuration - gemma4:26b (26B A4B parameters)
const EXTRACTION_MODEL = 'gemma4:26b';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_TIMEOUT = 300000; // 5 minutes (gemma4:26b is slower)
const BACKOFF_MULTIPLIER = 1.5;

function loadProgress() {
  if (fs.existsSync(PROGRESS_PATH)) {
    return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  }
  return {
    startedAt: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
    model: EXTRACTION_MODEL,
    sessions: [],
    stats: { total: 0, success: 0, failed: 0, pending: 0 }
  };
}

function saveProgress(progress) {
  progress.lastUpdate = new Date().toISOString();
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

function buildSessionContent(conv, sessionKey) {
  const speakers = [conv.conversation.speaker_a, conv.conversation.speaker_b].filter(Boolean);
  const turns = conv.conversation[sessionKey];
  const dateKey = sessionKey + '_date_time';
  const date = conv.conversation[dateKey] || 'unknown';
  
  if (!Array.isArray(turns) || turns.length === 0) {
    return null;
  }
  
  const dialogueNum = sessionKey.replace('session_', '');
  const lines = [];
  
  lines.push(`LOCOMO ${conv.sample_id} - Session ${dialogueNum}`);
  lines.push(`Date: ${date}`);
  lines.push(`Speakers: ${speakers.join(', ')}`);
  lines.push('');
  
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    // Remove [Dx:y] prefixes - confusing for extraction
    lines.push(`${turn.speaker}: ${turn.text}`);
  }
  
  return lines.join('\n');
}

function getAllSessions(data) {
  const sessions = [];
  
  for (const conv of data) {
    const sessionKeys = Object.keys(conv.conversation)
      .filter(k => k.startsWith('session_') && !k.includes('date'))
      .sort((a, b) => parseInt(a.replace('session_', '')) - parseInt(b.replace('session_', '')));
    
    for (const sessionKey of sessionKeys) {
      const sessionNum = parseInt(sessionKey.replace('session_', ''));
      sessions.push({ conv, sessionKey, sessionNum });
    }
  }
  
  return sessions;
}

async function ingestSession(conv, sessionKey, sessionNum, retryCount = 0) {
  const content = buildSessionContent(conv, sessionKey);
  
  if (!content) {
    return { success: false, error: 'Empty session' };
  }
  
  // Extract session date from LOCOMO data
  const sessionDateField = sessionKey + '_date_time';
  const sessionDate = conv.conversation[sessionDateField] || conv.conversation[sessionKey.replace('session_', 'session_date_time')] || null;
  
  const speakers = [conv.conversation.speaker_a, conv.conversation.speaker_b].filter(Boolean);
  const timeout = INITIAL_TIMEOUT * Math.pow(BACKOFF_MULTIPLIER, retryCount);
  
  console.log(`  [${conv.sample_id}:${sessionNum}] ${content.length} chars, timeout: ${timeout/1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const payload = {
      content,
      type: 'episodic',
      session_date: sessionDate, // Pass as top-level for API to use in date resolution
      metadata: {
        source: 'locomo_benchmark',
        sample_id: conv.sample_id,
        session_num: sessionNum,
        speakers,
        extraction_model: EXTRACTION_MODEL,
        session_date: sessionDate // Also in metadata for storage
      }
    };
    
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'X-Organization-ID': ORG
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const result = await res.json();
    
    if (result.id) {
      console.log(`    ✓ Success: ${result.id.substring(0, 8)}`);
      return { success: true, id: result.id };
    } else {
      const error = result.error || JSON.stringify(result);
      console.log(`    ✗ API error: ${error}`);
      return { success: false, error };
    }
  } catch (e) {
    clearTimeout(timeoutId);
    
    if (e.name === 'AbortError') {
      console.log(`    ⏱ Timeout after ${timeout/1000}s`);
      return { success: false, error: `Timeout after ${timeout/1000}s` };
    }
    
    console.log(`    ✗ Network error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

async function run() {
  console.log('=== LOCOMO ROBUST INGESTION ===\n');
  console.log(`Model: ${EXTRACTION_MODEL}`);
  console.log(`Max retries: ${MAX_RETRIES}`);
  console.log(`Initial timeout: ${INITIAL_TIMEOUT/1000}s`);
  console.log('');
  
  // Load data
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  console.log(`Loaded ${data.length} conversations`);
  
  // Get all sessions
  const allSessions = getAllSessions(data);
  console.log(`Total sessions: ${allSessions.length}`);
  
  // Load progress
  let progress = loadProgress();
  
  // Build set of already processed sessions
  const processedKeys = new Set(
    progress.sessions
      .filter(s => s.status === 'success')
      .map(s => `${s.conversationId}:${s.sessionNum}`)
  );
  
  console.log(`Already processed: ${processedKeys.size}`);
  console.log(`Remaining: ${allSessions.length - processedKeys.size}`);
  console.log('');
  
  // Process each session
  for (const { conv, sessionKey, sessionNum } of allSessions) {
    const key = `${conv.sample_id}:${sessionNum}`;
    
    // Skip if already processed
    if (processedKeys.has(key)) {
      continue;
    }
    
    console.log(`\n[${conv.sample_id}] Session ${sessionNum}`);
    
    // Retry loop
    let lastResult = { success: false };
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      lastResult = await ingestSession(conv, sessionKey, sessionNum, attempt);
      
      if (lastResult.success) {
        break;
      }
      
      // If not success and not last attempt, wait before retry
      if (attempt < MAX_RETRIES - 1) {
        const waitTime = 5000 * Math.pow(2, attempt);
        console.log(`    Waiting ${waitTime/1000}s before retry...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
    
    // Record progress
    const sessionProgress = {
      conversationId: conv.sample_id,
      sessionNum,
      status: lastResult.success ? 'success' : 'failed',
      attempts: MAX_RETRIES,
      lastError: lastResult.error,
      timestamp: new Date().toISOString()
    };
    
    progress.sessions.push(sessionProgress);
    progress.stats.total = allSessions.length;
    progress.stats.success = progress.sessions.filter(s => s.status === 'success').length;
    progress.stats.failed = progress.sessions.filter(s => s.status === 'failed').length;
    progress.stats.pending = allSessions.length - progress.stats.success - progress.stats.failed;
    
    saveProgress(progress);
    
    // Rate limiting between sessions
    if (!lastResult.success) {
      console.log(`    ⚠ FAILED after ${MAX_RETRIES} attempts: ${lastResult.error}`);
    }
    
    await new Promise(r => setTimeout(r, 3000));
  }
  
  console.log('\n=== COMPLETE ===');
  console.log(`Total: ${progress.stats.total}`);
  console.log(`Success: ${progress.stats.success}`);
  console.log(`Failed: ${progress.stats.failed}`);
  console.log(`Pending: ${progress.stats.pending}`);
  console.log(`\nProgress saved to: ${PROGRESS_PATH}`);
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});