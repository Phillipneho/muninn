/**
 * LOCOMO Robust Ingestion
 * 
 * - Smaller chunks (1500 chars)
 * - Retry failed chunks with exponential backoff
 * - Narrative preprocessing
 * - Progress tracking
 */

const MUNNIN_API = 'https://api.muninn.au/api/memories';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';

const SESSION_DATES: Record<string, string> = {
  'conv-26': '2023-08-01',
  'conv-30': '2023-01-20',
  'conv-41': '2023-08-14',
  'conv-42': '2023-08-20',
  'conv-43': '2023-08-24',
  'conv-44': '2023-08-27',
  'conv-47': '2023-09-12',
  'conv-48': '2023-10-05',
  'conv-49': '2023-10-21',
  'conv-50': '2023-10-27',
};

interface DialogTurn {
  speaker: string;
  dia_id: string;
  text: string;
}

async function loadLocomoData(): Promise<any[]> {
  const response = await fetch('https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json');
  return response.json();
}

function extractFactsFromDialogue(dialogue: string, speakers: string[]): string[] {
  const facts: string[] = [];
  const lines = dialogue.split('\n');
  
  const speakerPattern = new RegExp(`^(${speakers.join('|')}):\\s*(.+)$`);
  
  for (const line of lines) {
    const match = line.match(speakerPattern);
    if (!match) continue;
    
    const speaker = match[1];
    const text = match[2];
    
    // Split into sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
    
    for (const sentence of sentences) {
      const s = sentence.trim();
      
      // Skip questions, greetings, short responses
      if (s.match(/^(hi|hello|hey|how are|what's|thanks?|yes|no|oh|wow|really|that's|great|cool|yeah|yep|ok)/i)) continue;
      if (s.includes('?')) continue;
      if (s.length < 20) continue;
      
      // Convert first-person to third-person
      let fact = s
        .replace(/\bI\b/g, speaker)
        .replace(/\bmy\b/gi, `${speaker}'s`)
        .replace(/\bme\b/gi, speaker)
        .replace(/\bwe\b/gi, `${speaker} and family`)
        .replace(/\bour\b/gi, `${speaker}'s`);
      
      facts.push(fact);
    }
  }
  
  return facts;
}

function chunkFacts(facts: string[], maxSize: number): string[] {
  const chunks: string[] = [];
  let current = '';
  
  for (const fact of facts) {
    if (current.length + fact.length + 1 > maxSize && current.length > 0) {
      chunks.push(current.trim());
      current = fact;
    } else {
      current += ' ' + fact;
    }
  }
  
  if (current.trim()) {
    chunks.push(current.trim());
  }
  
  return chunks.length > 0 ? chunks : ['No facts extracted'];
}

async function ingestWithRetry(
  narrative: string,
  sampleId: string,
  chunkIndex: number,
  totalChunks: number,
  sessionDate: string,
  maxRetries: number = 3
): Promise<{ facts: number; entities: number; latency: number }> {
  let lastError: string | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const startTime = Date.now();
    
    try {
      const response = await fetch(MUNNIN_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'X-Organization-ID': ORG_ID,
        },
        body: JSON.stringify({
          content: narrative,
          type: 'episodic',
          session_date: sessionDate,
          metadata: {
            source: 'locomo',
            sample_id: sampleId,
            chunk: `${chunkIndex + 1}/${totalChunks}`,
          },
        }),
      });
      
      const result = await response.json();
      const latency = Date.now() - startTime;
      
      if (result.error) {
        lastError = result.error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      
      const facts = result.extracted_facts || result.extraction?.facts || 0;
      const entities = result.extracted_entities || result.extraction?.entities || 0;
      
      return { facts, entities, latency };
    } catch (error: any) {
      lastError = error.message;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  
  return { facts: 0, entities: 0, latency: 0 };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const startConv = parseInt(args[0]) || 1;
  const endConv = parseInt(args[1]) || startConv;
  
  const data = await loadLocomoData();
  
  console.log(`============================================================`);
  console.log(`LOCOMO ROBUST INGESTION`);
  console.log(`============================================================`);
  console.log(`Processing conversations ${startConv} to ${endConv}\n`);
  
  for (let convNum = startConv; convNum <= Math.min(endConv, 10); convNum++) {
    const conv = data[convNum - 1];
    const sampleId = conv.sample_id;
    const sessionDate = SESSION_DATES[sampleId] || '2023-01-01';
    
    console.log(`\n[${convNum}/10] ${sampleId} - ${conv.qa.length} questions`);
    
    // Flatten dialogue
    const lines: string[] = [];
    const sessionKeys = Object.keys(conv.conversation)
      .filter(k => k.startsWith('session_') && !k.includes('_date'))
      .sort((a, b) => parseInt(a.replace('session_', '')) - parseInt(b.replace('session_', '')));
    
    for (const sessionKey of sessionKeys) {
      const turns: DialogTurn[] = conv.conversation[sessionKey];
      if (!Array.isArray(turns)) continue;
      for (const turn of turns) {
        if (turn.speaker && turn.text) {
          lines.push(`${turn.speaker}: ${turn.text}`);
        }
      }
    }
    
    const dialogue = lines.join('\n');
    
    // Extract speakers
    const speakerMatch = dialogue.match(/^(\w+):/gm);
    const speakers = [...new Set((speakerMatch || []).map(s => s.replace(':', '')))];
    
    // Extract facts
    const facts = extractFactsFromDialogue(dialogue, speakers);
    console.log(`  Extracted ${facts.length} factual statements`);
    
    if (facts.length === 0) {
      console.log(`  ✗ No facts extracted, skipping`);
      continue;
    }
    
    // Chunk and ingest (smaller = faster extraction)
    const chunks = chunkFacts(facts, 300);
    console.log(`  Ingesting ${chunks.length} chunks...`);
    
    let convFacts = 0;
    let convEntities = 0;
    let successChunks = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const result = await ingestWithRetry(chunks[i], sampleId, i, chunks.length, sessionDate);
      
      if (result.facts > 0) {
        convFacts += result.facts;
        convEntities += result.entities;
        successChunks++;
        console.log(`    [${i + 1}/${chunks.length}] ✓ ${result.facts} facts, ${result.entities} entities (${(result.latency / 1000).toFixed(1)}s)`);
      } else {
        console.log(`    [${i + 1}/${chunks.length}] ✗ 0 facts`);
      }
      
      // Rate limit between chunks
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log(`  ✓ Total: ${convFacts} facts, ${convEntities} entities`);
    
    // Rate limit between conversations
    if (convNum < endConv) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log(`\n============================================================`);
  console.log(`INGESTION COMPLETE`);
  console.log(`============================================================`);
}

main().catch(console.error);