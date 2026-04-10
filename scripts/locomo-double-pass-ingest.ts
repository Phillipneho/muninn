/**
 * LOCOMO Double-Pass Re-ingestion
 * 
 * Pass 1: Entity identification + basic facts
 * Pass 2: Identity, temporal, and state facts with date resolution
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

// PASS 1: Entity Identification + Basic Facts
const PASS_ONE_PROMPT = `Identify all people and extract basic facts from this conversation.

Text:
{{CONTENT}}

Instructions:
1. List ALL people mentioned (including speaker and anyone referenced)
2. Extract basic facts: attended, visited, works_at, lives_in, has_hobby, owns, mentioned
3. Convert "I" to the speaker name, "she/he" to actual person names
4. Include evidence for each fact

Output JSON on one line:
{"speaker":"Name","entities":[{"name":"Name","type":"person"}],"facts":[{"subject":"Name","predicate":"predicate","object":"value","evidence":"quote from text"}]}

Example predicates: attended, visited, works_at, lives_in, has_hobby, owns, mentioned, went_to, started, ended`;

// PASS 2: Identity, Temporal, and State Facts
const PASS_TWO_PROMPT = `Extract identity, relationship, temporal, and state facts for these entities.

Text:
{{CONTENT}}

Speaker: {{SPEAKER}}
Entities: {{ENTITIES}}

Instructions:
1. Identity facts: gender, nationality, occupation, personality traits
2. Relationship facts: dating, married, friends_with, family_of
3. Temporal facts with dates: events with WHEN they happened (convert "yesterday" to specific dates based on session date {{SESSION_DATE}})
4. State facts: emotional states, preferences, beliefs

Output JSON on one line:
{"identity_facts":[{"subject":"Name","predicate":"is","object":"value","evidence":"quote"}],"relationship_facts":[{"subject":"Name","predicate":"relationship","object":"Name","evidence":"quote"}],"temporal_facts":[{"subject":"Name","predicate":"action","object":"value","date":"YYYY-MM-DD","evidence":"quote"}],"state_facts":[{"subject":"Name","predicate":"prefers","object":"value","evidence":"quote"}]}

Important:
- Convert relative dates to specific dates (session date is {{SESSION_DATE}})
- Extract: is, from, relationship_status, prefers, believes, wants
- Dates MUST be in YYYY-MM-DD format`;

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
      options: { num_ctx: 32768, num_predict: 8192 }
    })
  });

  const data = await response.json();
  return data.message?.content || '';
}

function parseJSON(text: string): any {
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  
  let jsonStr = jsonMatch[0];
  jsonStr = jsonStr.replace(/(\w+)\s*:/g, '"$1":');
  jsonStr = jsonStr.replace(/'/g, '"');
  jsonStr = jsonStr.replace(/,\s*}/g, '}');
  jsonStr = jsonStr.replace(/,\s*]/g, ']');
  
  const openBraces = (jsonStr.match(/\{/g) || []).length;
  const closeBraces = (jsonStr.match(/\}/g) || []).length;
  const openBrackets = (jsonStr.match(/\[/g) || []).length;
  const closeBrackets = (jsonStr.match(/\]/g) || []).length;
  
  for (let i = closeBrackets; i < openBrackets; i++) jsonStr += ']';
  for (let i = closeBraces; i < openBraces; i++) jsonStr += '}';
  
  try {
    return JSON.parse(jsonStr);
  } catch {
    const entityMatches = jsonStr.match(/\{"name":"[^"]+","type":"[^"]+"\}/g) || [];
    const factMatches = jsonStr.match(/\{"subject":"[^"]+","predicate":"[^"]+","object":"[^"]*"[^}]*\}/g) || [];
    
    return {
      entities: entityMatches.map((e) => { try { return JSON.parse(e); } catch { return null; } }).filter(Boolean),
      facts: factMatches.map((f) => { try { return JSON.parse(f); } catch { return null; } }).filter(Boolean)
    };
  }
}

interface ExtractedFact {
  subject: string;
  predicate: string;
  object: string;
  date?: string;
  evidence?: string;
}

interface ExtractionResult {
  entities: { name: string; type: string }[];
  facts: ExtractedFact[];
}

async function doublePassExtract(chunk: string, sessionDate: string): Promise<ExtractionResult> {
  const allEntities: { name: string; type: string }[] = [];
  const allFacts: ExtractedFact[] = [];
  let speaker = 'Unknown';
  
  // PASS 1: Entity Identification + Basic Facts
  const passOnePrompt = PASS_ONE_PROMPT.replace('{{CONTENT}}', chunk);
  const passOneResponse = await callOllama(passOnePrompt, 'kimi-k2.5:cloud');
  const passOneData = parseJSON(passOneResponse);
  
  if (passOneData) {
    speaker = passOneData.speaker || passOneData.entities?.[0]?.name || 'Unknown';
    
    if (passOneData.entities) {
      allEntities.push(...passOneData.entities);
    }
    
    if (passOneData.facts) {
      allFacts.push(...passOneData.facts.map((f: any) => ({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        evidence: f.evidence
      })));
    }
  }
  
  // PASS 2: Identity + Temporal + State Facts
  const entityNames = allEntities.map(e => e.name).join(', ');
  const passTwoPrompt = PASS_TWO_PROMPT
    .replace('{{CONTENT}}', chunk)
    .replace('{{SPEAKER}}', speaker)
    .replace('{{ENTITIES}}', entityNames)
    .replace(/{{SESSION_DATE}}/g, sessionDate);
  
  const passTwoResponse = await callOllama(passTwoPrompt, 'kimi-k2.5:cloud');
  const passTwoData = parseJSON(passTwoResponse);
  
  if (passTwoData) {
    // Identity facts
    if (passTwoData.identity_facts) {
      allFacts.push(...passTwoData.identity_facts.map((f: any) => ({
        subject: f.subject,
        predicate: f.predicate || 'is',
        object: f.object,
        evidence: f.evidence
      })));
    }
    
    // Relationship facts
    if (passTwoData.relationship_facts) {
      allFacts.push(...passTwoData.relationship_facts.map((f: any) => ({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        evidence: f.evidence
      })));
    }
    
    // Temporal facts
    if (passTwoData.temporal_facts) {
      allFacts.push(...passTwoData.temporal_facts.map((f: any) => ({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        date: f.date,
        evidence: f.evidence
      })));
    }
    
    // State facts
    if (passTwoData.state_facts) {
      allFacts.push(...passTwoData.state_facts.map((f: any) => ({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        evidence: f.evidence
      })));
    }
  }
  
  return { entities: allEntities, facts: allFacts };
}

function deduplicateFacts(facts: ExtractedFact[]): ExtractedFact[] {
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

async function ingestConversation(conv: any, index: number, total: number): Promise<{ success: boolean; facts: number }> {
  const sessionDate = SESSION_DATES[conv.sample_id] || '2023-01-01';
  
  console.log(`\n[${index + 1}/${total}] Ingesting ${conv.sample_id}...`);
  
  const { content, speakers } = flattenConversation(conv.conversation);
  console.log(`  Content: ${content.length} chars, Speakers: ${speakers.join(', ')}`);
  
  const chunks = chunkContent(content, 5000);
  console.log(`  Split into ${chunks.length} chunks`);
  
  const allEntities: { name: string; type: string }[] = [];
  const allFacts: ExtractedFact[] = [];
  
  // Double-pass extraction for each chunk
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  [Chunk ${i + 1}/${chunks.length}] Double-pass extraction...`);
    const startTime = Date.now();
    
    const result = await doublePassExtract(chunks[i], sessionDate);
    const latency = Date.now() - startTime;
    
    console.log(`    Pass 1 + Pass 2: ${result.facts.length} facts in ${(latency / 1000).toFixed(1)}s`);
    
    allEntities.push(...result.entities);
    allFacts.push(...result.facts);
  }
  
  const uniqueEntities = [...new Map(allEntities.map(e => [e.name, e])).values()];
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
          extraction_model: 'kimi-k2.5:cloud-double-pass',
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
  console.log('LOCOMO DOUBLE-PASS RE-INGESTION');
  console.log('============================================================');
  console.log('');
  console.log('Model: kimi-k2.5:cloud (local Ollama)');
  console.log('Strategy: Two-pass extraction per chunk');
  console.log('  Pass 1: Entity identification + basic facts');
  console.log('  Pass 2: Identity + temporal + state facts');
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
  console.log('DOUBLE-PASS INGESTION COMPLETE');
  console.log('============================================================');
  console.log(`Success: ${successCount}/${data.length}`);
  console.log(`Total facts: ${totalFacts}`);
  console.log('');
  console.log('Run LOCOMO benchmark to measure accuracy improvement.');
}

run().catch(console.error);