/**
 * LOCOMO Local Benchmark - Uses local Ollama extraction
 * 
 * Bypasses the Cloudflare API to use local Ollama for extraction
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

interface DialogTurn {
  speaker: string;
  dia_id: string;
  text: string;
}

async function loadLocomoData(): Promise<any[]> {
  // Try local file first
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
    const turns: DialogTurn[] = convData[sessionKey];
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

async function callOllamaExtract(content: string, sessionDate: string): Promise<any> {
  const PROMPT = `Extract facts from text as JSON.

Text: ${content}

Output JSON on ONE LINE:
{"entities":[{"name":"Name","type":"person"}],"facts":[{"subject":"Name","predicate":"verb","object":"value"}]}

Rules: Resolve pronouns (I=speaker, she/he=actual name). Extract: identity, relationship_status, from, works_at, has_hobby. Include evidence.`;

  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kimi-k2.5:cloud',
      messages: [{ role: 'user', content: PROMPT }],
      stream: false,
      options: { num_ctx: 32768, num_predict: 8192 }
    })
  });

  const data = await response.json();
  const text = data.message?.content || '';
  
  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { entities: [], facts: [] };
  
  try {
    // Handle truncated JSON
    let jsonStr = jsonMatch[0];
    const entityMatches = jsonStr.match(/\{"name":"[^"]+","type":"[^"]+"\}/g) || [];
    const factMatches = jsonStr.match(/\{"subject":"[^"]+","predicate":"[^"]+","object":"[^"]+"[^}]*\}/g) || [];
    
    return {
      entities: entityMatches.map(e => { try { return JSON.parse(e); } catch { return null; } }).filter(Boolean),
      facts: factMatches.map(f => { try { return JSON.parse(f); } catch { return null; } }).filter(Boolean)
    };
  } catch {
    return { entities: [], facts: [] };
  }
}

async function ingestConversation(conv: any, index: number, total: number): Promise<{ success: boolean; facts: number }> {
  const sessionDate = SESSION_DATES[conv.sample_id] || '2023-01-01';
  
  console.log(`\n[${index + 1}/${total}] Ingesting ${conv.sample_id}...`);
  
  const { content, speakers } = flattenConversation(conv.conversation);
  console.log(`  Content: ${content.length} chars, Speakers: ${speakers.join(', ')}`);
  
  // Extract facts locally with Kimi
  console.log(`  Extracting with Kimi K2.5...`);
  const startTime = Date.now();
  const extraction = await callOllamaExtract(content, sessionDate);
  const latency = Date.now() - startTime;
  
  console.log(`  Extracted ${extraction.facts.length} facts in ${(latency / 1000).toFixed(1)}s`);
  
  // Store in Muninn API
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
        },
        // Pass extracted facts directly
        facts: extraction.facts,
        entities: extraction.entities,
      }),
    });

    const result = await response.json();
    
    if (result.error) {
      console.log(`  ✗ API Error: ${result.error}`);
      return { success: false, facts: 0 };
    }
    
    console.log(`  ✓ Stored memory: ${result.id}`);
    return { success: true, facts: extraction.facts.length };
    
  } catch (error: any) {
    console.log(`  ✗ Error: ${error.message}`);
    return { success: false, facts: 0 };
  }
}

async function runBenchmark(): Promise<void> {
  console.log('============================================================');
  console.log('LOCOMO RE-INGESTION WITH KIMI K2.5');
  console.log('============================================================');
  console.log('');
  console.log('Model: kimi-k2.5:cloud (local Ollama)');
  console.log('Endpoint: http://localhost:11434/api/chat');
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

runBenchmark().catch(console.error);