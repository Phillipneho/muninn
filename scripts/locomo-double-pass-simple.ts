/**
 * LOCOMO Double-Pass Simple - Focused, shorter prompts
 */

import { readFileSync } from 'fs';

const MUNNIN_API = 'https://api.muninn.au/api/memories';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';

const SESSION_DATES: Record<string, string> = {
  'conv-26': '2023-03-23',
  'conv-30': '2023-05-07',
  'conv-41': '2023-06-15',
  'conv-42': '2023-07-20',
  'conv-43': '2023-08-10',
  'conv-44': '2023-08-26',
  'conv-47': '2023-09-15',
  'conv-48': '2023-10-05',
  'conv-49': '2023-10-26',
  'conv-50': '2023-11-10',
};

// PASS 1: Just entities (short output)
const PASS_ONE_PROMPT = `List all people mentioned in this conversation. Output JSON array: ["Name1", "Name2"]

Text: {{CONTENT}}`;

// PASS 2: Facts with entities (focused output)
const PASS_TWO_PROMPT = `Extract facts for these entities: {{ENTITIES}}

Text: {{CONTENT}}

Output JSON array of facts. Each fact: {"s":"Subject","p":"predicate","o":"object"}
Use short predicates: is, from, works_at, lives_in, has, knows, went, dated, started, ended, likes, owns, attended.

Session date: {{SESSION_DATE}} - convert "yesterday" etc to YYYY-MM-DD.`;

function chunkContent(content: string, maxSize: number = 5000): string[] {
  const chunks: string[] = [];
  const lines = content.split('\n');
  let currentChunk: string[] = [];
  let currentSize = 0;
  
  for (const line of lines) {
    if (currentSize + line.length > maxSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [];
      currentSize = 0;
    }
    currentChunk.push(line);
    currentSize += line.length + 1;
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }
  
  return chunks;
}

async function callOllama(prompt: string, model: string = 'kimi-k2.5:cloud'): Promise<string> {
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { num_ctx: 16384, num_predict: 4096 }
    })
  });

  const data = await response.json();
  return data.message?.content || '';
}

function parseEntities(text: string): string[] {
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0].replace(/'/g, '"'));
  } catch {
    const names = text.match(/"[A-Z][a-z]+"/g) || [];
    return names.map(n => n.replace(/"/g, ''));
  }
}

function parseFacts(text: string): { subject: string; predicate: string; object: string; date?: string }[] {
  // Match facts with short keys: {"s":"...","p":"...","o":"..."}
  const factMatches = text.match(/\{"s":"[^"]+","p":"[^"]+","o":"[^"]*"[^}]*\}/g) || [];
  
  return factMatches.map(f => {
    try {
      const parsed = JSON.parse(f);
      return {
        subject: parsed.s,
        predicate: parsed.p,
        object: parsed.o,
        date: parsed.d
      };
    } catch {
      return null;
    }
  }).filter(Boolean) as { subject: string; predicate: string; object: string; date?: string }[];
}

async function doublePassExtract(chunk: string, sessionDate: string): Promise<{ entities: string[]; facts: any[] }> {
  // PASS 1: Get entities (short output)
  const passOnePrompt = PASS_ONE_PROMPT.replace('{{CONTENT}}', chunk);
  const passOneResponse = await callOllama(passOnePrompt);
  const entities = parseEntities(passOneResponse);
  
  if (entities.length === 0) {
    return { entities: [], facts: [] };
  }
  
  // PASS 2: Get facts for these entities
  const passTwoPrompt = PASS_TWO_PROMPT
    .replace('{{ENTITIES}}', entities.join(', '))
    .replace('{{CONTENT}}', chunk)
    .replace('{{SESSION_DATE}}', sessionDate);
  
  const passTwoResponse = await callOllama(passTwoPrompt);
  const facts = parseFacts(passTwoResponse);
  
  return { entities, facts };
}

function deduplicateFacts(facts: any[]): any[] {
  const seen = new Set<string>();
  return facts.filter(f => {
    const key = `${f.subject}|${f.predicate}|${f.object}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadLocomoData(): Promise<any[]> {
  try {
    const localPath = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
    return JSON.parse(readFileSync(localPath, 'utf-8'));
  } catch {
    const response = await fetch('https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json');
    return response.json();
  }
}

function flattenConversation(convData: any): { content: string; speakers: string[] } {
  const lines: string[] = [];
  const speakers = new Set<string>();
  
  const sessionKeys = Object.keys(convData)
    .filter(k => k.startsWith('session_') && !k.includes('_date'))
    .sort((a, b) => parseInt(a.replace('session_', '')) - parseInt(b.replace('session_', '')));
  
  for (const sessionKey of sessionKeys) {
    const turns = convData[sessionKey];
    if (!Array.isArray(turns)) continue;
    
    for (const turn of turns) {
      if (turn.speaker && turn.text) {
        lines.push(`[${turn.dia_id}] ${turn.speaker}: ${turn.text}`);
        speakers.add(turn.speaker);
      }
    }
  }
  
  return { content: lines.join('\n'), speakers: Array.from(speakers) };
}

async function ingestConversation(conv: any, index: number, total: number): Promise<{ success: boolean; facts: number }> {
  const sessionDate = SESSION_DATES[conv.sample_id] || '2023-01-01';
  
  console.log(`\n[${index + 1}/${total}] Ingesting ${conv.sample_id}...`);
  
  const { content, speakers } = flattenConversation(conv.conversation);
  console.log(`  Content: ${content.length} chars, Speakers: ${speakers.join(', ')}`);
  
  const chunks = chunkContent(content, 5000);
  console.log(`  Split into ${chunks.length} chunks`);
  
  const allEntities = new Set<string>();
  const allFacts: any[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  [Chunk ${i + 1}/${chunks.length}] Double-pass...`);
    const startTime = Date.now();
    
    const result = await doublePassExtract(chunks[i], sessionDate);
    const latency = Date.now() - startTime;
    
    console.log(`    ${result.facts.length} facts, ${result.entities.length} entities in ${(latency / 1000).toFixed(1)}s`);
    
    result.entities.forEach(e => allEntities.add(e));
    allFacts.push(...result.facts);
  }
  
  const uniqueFacts = deduplicateFacts(allFacts);
  console.log(`  Total: ${allFacts.length} facts → ${uniqueFacts.length} unique`);
  
  const formattedContent = `[LOCOMO ${conv.sample_id}]\nSpeakers: ${speakers.join(', ')}\n\n${content}`;
  
  try {
    const response = await fetch(MUNNIN_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-Organization-ID': ORG_ID,
      },
      body: JSON.stringify({
        content: formattedContent,
        type: 'episodic',
        session_date: sessionDate,
        metadata: {
          source: 'locomo-benchmark',
          sample_id: conv.sample_id,
          extraction_model: 'kimi-double-pass-simple',
        },
      }),
    });
    
    const result = await response.json();
    
    if (result.error) {
      console.log(`  ✗ API Error: ${result.error}`);
      return { success: false, facts: 0 };
    }
    
    console.log(`  ✓ Stored memory: ${result.id}`);
    return { success: true, facts: uniqueFacts.length };
    
  } catch (error: any) {
    console.log(`  ✗ Error: ${error.message}`);
    return { success: false, facts: 0 };
  }
}

async function run(): Promise<void> {
  console.log('============================================================');
  console.log('LOCOMO DOUBLE-PASS SIMPLE');
  console.log('============================================================');
  console.log('');
  console.log('Model: kimi-k2.5:cloud');
  console.log('Pass 1: Entity list (short output)');
  console.log('Pass 2: Facts with entities (focused output)');
  console.log('');

  const data = await loadLocomoData();
  console.log(`Loaded ${data.length} conversations`);
  
  let totalFacts = 0;
  let successCount = 0;
  
  for (let i = 0; i < data.length; i++) {
    const result = await ingestConversation(data[i], i, data.length);
    if (result.success) {
      successCount++;
      totalFacts += result.facts;
    }
  }
  
  console.log('\n============================================================');
  console.log('INGESTION COMPLETE');
  console.log('============================================================');
  console.log(`Success: ${successCount}/${data.length}`);
  console.log(`Total facts: ${totalFacts}`);
}

run().catch(console.error);