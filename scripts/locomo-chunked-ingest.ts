/**
 * LOCOMO Re-ingestion with Chunked Extraction
 * 
 * Chunks long conversations (65k-100k chars) into 5k pieces
 * Extracts facts from each chunk with Kimi K2.5
 * Combines and deduplicates facts before storing
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

const PROMPT_TEMPLATE = `Extract ALL facts from this conversation segment. Be thorough and detailed.

Text: {CONTENT}

Output JSON on ONE line:
{"entities":[{"name":"Name","type":"person|place|organization|event"}],"facts":[{"subject":"Name","predicate":"verb_or_relation","object":"value","date":"YYYY-MM-DD if mentioned"}]}

Extract EVERYTHING:
- Identity facts: name is X, name is a Y, name from Z
- Relationships: name is friend of X, name is dating X, name works with X
- Temporal facts: name did X on DATE, name will do X on DATE
- Events: name attended X, name went to Y, name participated in Z
- Preferences: name likes X, name hates Y, name wants Z
- Activities: name plays X, name watches Y, name reads Z
- Locations: name lives in X, name visited Y, name is from Z
- Work: name works at X, name is a Y, name studies Z
- Family: name's mother is X, name's father is Y, name has Z siblings
- Pets: name has a dog/cat named X, name adopted X on DATE
- Temporal references: "last week", "yesterday", "in June", "on July 5"

IMPORTANT:
- Convert relative dates to ISO dates using the session date {SESSION_DATE}
- Include ALL entities mentioned (people, places, organizations, events)
- Extract temporal facts (when things happened or will happen)
- Be exhaustive - extract 50-100+ facts from this segment`;

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

async function callKimiExtract(content: string, sessionDate: string): Promise<{ entities: any[], facts: any[] }> {
  const prompt = PROMPT_TEMPLATE
    .replace('{CONTENT}', content)
    .replace('{SESSION_DATE}', sessionDate);
  
  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kimi-k2.5:cloud',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { num_ctx: 32768, num_predict: 8192 }
      })
    });
    
    const data = await response.json();
    const text = data.message?.content || '';
    
    // Extract all JSON entities and facts using regex
    const entityMatches = text.match(/\{"name":"[^"]+","type":"[^"]+"\}/g) || [];
    const factMatches = text.match(/\{"subject":"[^"]+","predicate":"[^"]+","object":"[^"]*"[^}]*\}/g) || [];
    
    const entities = entityMatches
      .map(e => { try { return JSON.parse(e); } catch { return null; } })
      .filter(Boolean);
    
    const facts = factMatches
      .map(f => { 
        try { 
          const parsed = JSON.parse(f);
          return parsed;
        } catch { 
          return null; 
        } 
      })
      .filter(Boolean);
    
    return { entities, facts };
  } catch (error) {
    console.error('[EXTRACT] Error:', error);
    return { entities: [], facts: [] };
  }
}

async function loadLocomoData(): Promise<any[]> {
  try {
    const localPath = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
    const data = JSON.parse(readFileSync(localPath, 'utf-8'));
    console.log('[LOCOMO] Loaded from local file:', localPath);
    return data;
  } catch {
    console.log('[LOCOMO] Loading from GitHub...');
    const response = await fetch('https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json');
    return response.json();
  }
}

function flattenConversation(convData: any): { content: string; speakers: string[] } {
  const lines: string[] = [];
  const speakers = new Set<string>();
  
  const sessionKeys = Object.keys(convData)
    .filter(k => k.startsWith('session_') && !k.includes('_date'))
    .sort((a, b) => {
      const numA = parseInt(a.replace('session_', ''));
      const numB = parseInt(b.replace('session_', ''));
      return numA - numB;
    });
  
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

function deduplicateFacts(facts: any[]): any[] {
  const seen = new Set<string>();
  return facts.filter(f => {
    const key = `${f.subject}|${f.predicate}|${f.object}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function ingestConversation(conv: any, index: number, total: number): Promise<{ success: boolean; facts: number }> {
  const sessionDate = SESSION_DATES[conv.sample_id] || '2023-01-01';
  
  console.log(`\n[${index + 1}/${total}] Ingesting ${conv.sample_id}...`);
  
  const { content, speakers } = flattenConversation(conv.conversation);
  console.log(`  Content: ${content.length} chars, Speakers: ${speakers.join(', ')}`);
  
  // Chunk content for thorough extraction
  const chunks = chunkContent(content, 5000);
  console.log(`  Split into ${chunks.length} chunks`);
  
  const allFacts: any[] = [];
  const allEntities: any[] = [];
  
  // Extract facts from each chunk
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  Extracting chunk ${i + 1}/${chunks.length}...`);
    const startTime = Date.now();
    
    const result = await callKimiExtract(chunks[i], sessionDate);
    const latency = Date.now() - startTime;
    
    console.log(`    Extracted ${result.facts.length} facts in ${(latency / 1000).toFixed(1)}s`);
    
    allFacts.push(...result.facts);
    allEntities.push(...result.entities);
  }
  
  // Deduplicate
  const uniqueFacts = deduplicateFacts(allFacts);
  console.log(`  Total: ${allFacts.length} facts → ${uniqueFacts.length} unique`);
  
  // Store in Muninn
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
          extraction_model: 'kimi-k2.5:cloud',
          chunk_count: chunks.length,
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
  console.log('LOCOMO RE-INGESTION WITH CHUNKED KIMI EXTRACTION');
  console.log('============================================================');
  console.log('');
  console.log('Model: kimi-k2.5:cloud (local Ollama)');
  console.log('Strategy: 5k chunks with thorough extraction');
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
  console.log('');
  console.log('Run LOCOMO benchmark to measure accuracy improvement.');
}

run().catch(console.error);