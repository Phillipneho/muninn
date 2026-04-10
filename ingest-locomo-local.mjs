#!/usr/bin/env node
/**
 * LOCOMO Local Ingestion - Uses local Ollama (kimi-k2.5:cloud)
 * Bypasses Cloudflare Worker CPU limits
 */

import fs from 'fs';

const DATA_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const PROGRESS_PATH = '/home/homelab/.openclaw/workspace/memory/locomo-progress.json';
const API = 'https://api.muninn.au/api/memories';
const TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';
const OLLAMA_LOCAL = 'http://localhost:11434/api/chat';
const MODEL = 'kimi-k2.5:cloud';

// Simple extraction prompt
const EXTRACTION_PROMPT = `Extract facts from the dialogue. Use these predicates:
- identifies_as (identity, gender)
- has_relationship_status (single, married)
- has_child (children count)
- moved_from (origin location)
- known_for (duration: X years)
- researched (topics investigated)
- kids_like (child preferences)
- camped_at (locations)
- activity (hobbies)

Session: {{SESSION_DATE}}
Dialogue: {{CONTENT}}

Output ONLY valid JSON on one line:
{"entities":[{"name":"Name","type":"person"}],"facts":[{"subject":"Name","predicate":"identifies_as","object":"value","pds_decimal":"1201","evidence":"quote"}]}`;

function loadProgress() {
  if (fs.existsSync(PROGRESS_PATH)) {
    return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  }
  return { startedAt: new Date().toISOString(), lastUpdate: new Date().toISOString(), sessions: [], stats: { total: 0, success: 0, failed: 0, pending: 0 } };
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
  
  if (!Array.isArray(turns) || turns.length === 0) return null;
  
  const dialogueNum = sessionKey.replace('session_', '');
  const lines = [`Session ${dialogueNum} (${date})`, `Speakers: ${speakers.join(', ')}`, ''];
  
  for (const turn of turns) {
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
      sessions.push({ conv, sessionKey, sessionNum: parseInt(sessionKey.replace('session_', '')) });
    }
  }
  return sessions;
}

async function extractWithOllama(content, sessionDate) {
  const prompt = EXTRACTION_PROMPT
    .replace('{{SESSION_DATE}}', sessionDate || '2023-06-09')
    .replace('{{CONTENT}}', content);
  
  try {
    const res = await fetch(OLLAMA_LOCAL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { num_ctx: 8192, temperature: 0 }
      })
    });
    
    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status}`);
    }
    
    const data = await res.json();
    const responseText = data.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }
    
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.log(`    ⚠ Extraction error: ${e.message}`);
    return { entities: [], facts: [] };
  }
}

async function ingestSession(conv, sessionKey, sessionNum) {
  const content = buildSessionContent(conv, sessionKey);
  if (!content) return { success: false, error: 'Empty session' };
  
  const sessionDateField = sessionKey + '_date_time';
  const sessionDate = conv.conversation[sessionDateField] || '2023-06-09';
  const speakers = [conv.conversation.speaker_a, conv.conversation.speaker_b].filter(Boolean);
  
  console.log(`  [${conv.sample_id}:${sessionNum}] ${content.length} chars`);
  
  // Extract with local Ollama
  const extraction = await extractWithOllama(content, sessionDate);
  
  if (!extraction.facts || extraction.facts.length === 0) {
    console.log(`    ⚠ No facts extracted`);
  } else {
    console.log(`    ✓ ${extraction.facts.length} facts, ${extraction.entities?.length || 0} entities`);
  }
  
  // Store via Muninn API
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'X-Organization-ID': ORG
      },
      body: JSON.stringify({
        content,
        type: 'episodic',
        session_date: sessionDate,
        metadata: {
          source: 'locomo_benchmark',
          sample_id: conv.sample_id,
          session_num: sessionNum,
          speakers,
          extraction_model: MODEL,
          pre_extracted_facts: extraction.facts,
          pre_extracted_entities: extraction.entities
        }
      })
    });
    
    const result = await res.json();
    
    if (result.id) {
      return { success: true, id: result.id, facts: result.facts_created || extraction.facts.length };
    } else {
      return { success: false, error: result.error || 'Unknown error' };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function run() {
  console.log('=== LOCOMO LOCAL INGESTION ===\n');
  console.log(`Model: ${MODEL} (local Ollama)`);
  console.log(`API: ${API}\n`);
  
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  console.log(`Loaded ${data.length} conversations`);
  
  const allSessions = getAllSessions(data);
  console.log(`Total sessions: ${allSessions.length}`);
  
  let progress = loadProgress();
  const processedKeys = new Set(progress.sessions.filter(s => s.status === 'success').map(s => `${s.conversationId}:${s.sessionNum}`));
  
  console.log(`Already processed: ${processedKeys.size}`);
  console.log(`Remaining: ${allSessions.length - processedKeys.size}\n`);
  
  for (const { conv, sessionKey, sessionNum } of allSessions) {
    const key = `${conv.sample_id}:${sessionNum}`;
    if (processedKeys.has(key)) continue;
    
    console.log(`\n[${conv.sample_id}] Session ${sessionNum}`);
    
    const result = await ingestSession(conv, sessionKey, sessionNum);
    
    progress.sessions.push({
      conversationId: conv.sample_id,
      sessionNum,
      status: result.success ? 'success' : 'failed',
      facts: result.facts || 0,
      error: result.error,
      timestamp: new Date().toISOString()
    });
    
    progress.stats.total = allSessions.length;
    progress.stats.success = progress.sessions.filter(s => s.status === 'success').length;
    progress.stats.failed = progress.sessions.filter(s => s.status === 'failed').length;
    progress.stats.pending = allSessions.length - progress.stats.success - progress.stats.failed;
    
    saveProgress(progress);
    await new Promise(r => setTimeout(r, 1000)); // 1s between sessions
  }
  
  console.log('\n=== COMPLETE ===');
  console.log(`Success: ${progress.stats.success}/${progress.stats.total}`);
  console.log(`Failed: ${progress.stats.failed}`);
}

run().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});