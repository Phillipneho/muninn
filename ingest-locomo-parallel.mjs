#!/usr/bin/env node
/**
 * LOCOMO Parallel Ingestion - 10 concurrent sessions
 */

import fs from 'fs';

const CF_ACCOUNT = 'f41284de76d5ead189b5b3500a08173f';
const CF_TOKEN = 'cfat_vlGGORiFHhoq5nB5hy7pQohd2HDLBcjUb5E0lzo37784962b';
const MUNINN_API = 'https://api.muninn.au/api/memories';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';
const DATA_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const PROGRESS_PATH = '/home/homelab/.openclaw/workspace/memory/locomo-progress.json';
const CONCURRENCY = 20;

const MINIMAL_PROMPT = `Extract facts from the dialogue. Use these predicates:
- identifies_as (identity, gender)
- has_relationship_status (single, married)
- has_child (children)
- moved_from (origin location)
- known_for (duration: X years)
- researched (topics investigated)
- kids_like (child preferences)
- camped_at (locations)
- activity (hobbies)
- attended_on (events with dates)

Session: {{SESSION_DATE}}
Dialogue: {{CONTENT}}

Output ONLY valid JSON on one line:
{"entities":[{"name":"Name","type":"person"}],"facts":[{"subject":"Name","predicate":"predicate","object":"value","pds_decimal":"code","evidence":"quote"}]}`;

function loadProgress() {
  if (fs.existsSync(PROGRESS_PATH)) {
    return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  }
  return { startedAt: new Date().toISOString(), sessions: [], stats: { total: 0, success: 0, failed: 0 } };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

function buildSessionContent(conv, sessionKey) {
  const speakers = [conv.conversation.speaker_a, conv.conversation.speaker_b].filter(Boolean);
  const turns = conv.conversation[sessionKey];
  const dateKey = sessionKey + '_date_time';
  const date = conv.conversation[dateKey] || 'unknown';
  
  if (!Array.isArray(turns) || turns.length === 0) return null;
  
  const lines = [`Session (${date})`, `Speakers: ${speakers.join(', ')}`, ''];
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

async function extractWithCloudflareAI(content, sessionDate) {
  const prompt = MINIMAL_PROMPT
    .replace('{{SESSION_DATE}}', sessionDate || '2023-06-09')
    .replace('{{CONTENT}}', content.substring(0, 3000));
  
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/meta/llama-3.1-8b-instruct`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0
    })
  });
  
  if (!res.ok) throw new Error(`Cloudflare AI error: ${res.status}`);
  
  const data = await res.json();
  const responseText = data.result?.response || '';
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { entities: [], facts: [] };
  
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    return { entities: [], facts: [] };
  }
}

async function storeMemory(content, sessionDate, metadata, extraction) {
  const res = await fetch(MUNINN_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': ORG
    },
    body: JSON.stringify({
      content,
      type: 'episodic',
      metadata: {
        ...metadata,
        session_date: sessionDate,
        pre_extracted_facts: extraction.facts,
        pre_extracted_entities: extraction.entities
      }
    })
  });
  
  if (!res.ok) throw new Error(`Muninn API error: ${res.status}`);
  return await res.json();
}

async function ingestSession(conv, sessionKey, sessionNum) {
  const content = buildSessionContent(conv, sessionKey);
  if (!content) return { success: false, error: 'Empty session' };
  
  const sessionDateField = sessionKey + '_date_time';
  const sessionDate = conv.conversation[sessionDateField] || '2023-06-09';
  const speakers = [conv.conversation.speaker_a, conv.conversation.speaker_b].filter(Boolean);
  
  const extraction = await extractWithCloudflareAI(content, sessionDate);
  const result = await storeMemory(content, sessionDate, {
    source: 'locomo_benchmark',
    sample_id: conv.sample_id,
    session_num: sessionNum,
    speakers,
    extraction_model: 'cloudflare-llama-3.1-8b'
  }, extraction);
  
  if (result.id) {
    return { success: true, id: result.id, facts: result.facts_created || extraction.facts?.length || 0 };
  } else {
    return { success: false, error: result.error || 'Unknown error' };
  }
}

async function processBatch(sessions, progress, processedKeys) {
  const promises = sessions.map(async ({ conv, sessionKey, sessionNum }) => {
    const key = `${conv.sample_id}:${sessionNum}`;
    if (processedKeys.has(key)) return null;
    
    try {
      const result = await ingestSession(conv, sessionKey, sessionNum);
      console.log(`[${conv.sample_id}:${sessionNum}] ${result.success ? '✓' : '✗'} ${result.facts || 0} facts`);
      return { conv, sessionNum, result, key };
    } catch (e) {
      console.log(`[${conv.sample_id}:${sessionNum}] ✗ ${e.message}`);
      return { conv, sessionNum, result: { success: false, error: e.message }, key };
    }
  });
  
  return await Promise.all(promises);
}

async function run() {
  console.log('=== LOCOMO PARALLEL INGESTION ===\n');
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('Extraction: @cf/meta/llama-3.1-8b-instruct');
  console.log('Storage: Muninn API\n');
  
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const allSessions = getAllSessions(data);
  console.log(`Total sessions: ${allSessions.length}`);
  
  const progress = loadProgress();
  const processedKeys = new Set(progress.sessions.filter(s => s.status === 'success').map(s => `${s.conversationId}:${s.sessionNum}`));
  const remaining = allSessions.filter(s => !processedKeys.has(`${s.conv.sample_id}:${s.sessionNum}`));
  
  console.log(`Already processed: ${processedKeys.size}`);
  console.log(`Remaining: ${remaining.length}\n`);
  
  // Process in batches
  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);
    const results = await processBatch(batch, progress, processedKeys);
    
    for (const r of results) {
      if (!r) continue;
      progress.sessions.push({
        conversationId: r.conv.sample_id,
        sessionNum: r.sessionNum,
        status: r.result.success ? 'success' : 'failed',
        facts: r.result.facts || 0,
        error: r.result.error,
        timestamp: new Date().toISOString()
      });
      processedKeys.add(r.key);
    }
    
    progress.stats.total = allSessions.length;
    progress.stats.success = progress.sessions.filter(s => s.status === 'success').length;
    progress.stats.failed = progress.sessions.filter(s => s.status === 'failed').length;
    saveProgress(progress);
    
    console.log(`Progress: ${progress.stats.success}/${progress.stats.total} (${Math.round(progress.stats.success/progress.stats.total*100)}%)\n`);
  }
  
  console.log('\n=== COMPLETE ===');
  console.log(`Success: ${progress.stats.success}/${progress.stats.total}`);
  console.log(`Failed: ${progress.stats.failed}`);
}

run().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});