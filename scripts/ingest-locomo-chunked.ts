/**
 * Ingest LOCOMO conversations in chunks
 * Smaller chunks = better extraction, no timeout
 */

const MUNNIN_API = 'https://api.muninn.au/api/memories';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';
const CHUNK_SIZE = 2000; // Smaller chunks for better extraction

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

const CONV_IDS = ['conv-26', 'conv-30', 'conv-41', 'conv-42', 'conv-43', 'conv-44', 'conv-47', 'conv-48', 'conv-49', 'conv-50'];

interface DialogTurn {
  speaker: string;
  dia_id: string;
  text: string;
}

function chunkText(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  
  const chunks: string[] = [];
  const lines = text.split('\n');
  let current = '';
  
  for (const line of lines) {
    if (current.length + line.length > size && current.length > 0) {
      chunks.push(current.trim());
      current = line;
    } else {
      current += '\n' + line;
    }
  }
  
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function loadLocomoData(): Promise<any[]> {
  const response = await fetch('https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json');
  return response.json();
}

function flattenConversation(convData: any): string {
  const lines: string[] = [];
  
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
        lines.push(`${turn.speaker}: ${turn.text}`);
      }
    }
  }
  
  return lines.join('\n');
}

async function ingestChunk(
  chunk: string,
  sampleId: string,
  chunkIndex: number,
  totalChunks: number,
  sessionDate: string
): Promise<{ facts: number; entities: number; latency: number }> {
  const startTime = Date.now();
  
  const response = await fetch(MUNNIN_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': ORG_ID,
    },
    body: JSON.stringify({
      content: `[${sampleId} ${chunkIndex + 1}/${totalChunks}]\n\n${chunk}`,
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
    return { facts: 0, entities: 0, latency };
  }
  
  return {
    facts: result.extracted_facts || result.extraction?.facts || 0,
    entities: result.extracted_entities || result.extraction?.entities || 0,
    latency,
  };
}

async function main(): Promise<void> {
  const convNum = parseInt(process.argv[2] || '1');
  const data = await loadLocomoData();
  
  if (convNum < 1 || convNum > 10) {
    console.log('Invalid conversation number. Use 1-10.');
    return;
  }
  
  const conv = data[convNum - 1];
  const sampleId = conv.sample_id;
  const sessionDate = SESSION_DATES[sampleId] || '2023-01-01';
  
  console.log(`============================================================`);
  console.log(`INGESTING ${sampleId}`);
  console.log(`============================================================`);
  console.log(`Questions: ${conv.qa.length}`);
  
  const content = flattenConversation(conv.conversation);
  const chunks = chunkText(content, CHUNK_SIZE);
  console.log(`Content: ${content.length} chars → ${chunks.length} chunks\n`);
  
  let totalFacts = 0;
  let totalEntities = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    const result = await ingestChunk(chunks[i], sampleId, i, chunks.length, sessionDate);
    totalFacts += result.facts;
    totalEntities += result.entities;
    
    console.log(`  [${i + 1}/${chunks.length}] ${result.facts} facts, ${result.entities} entities in ${(result.latency / 1000).toFixed(1)}s`);
    
    // Rate limit between chunks
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  console.log(`\n✓ Total: ${totalFacts} facts, ${totalEntities} entities`);
}

main().catch(console.error);