/**
 * LOCOMO Chunked Ingestion
 * 
 * Splits each conversation into 5K char chunks and ingests separately.
 * Each chunk gets full two-pass extraction without hitting timeout.
 */

const MUNNIN_API = 'https://api.muninn.au/api/memories';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';
const CHUNK_SIZE = 2000; // Smaller chunks to avoid Worker timeout

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

function chunkConversation(content: string, chunkSize: number): string[] {
  if (content.length <= chunkSize) {
    return [content];
  }
  
  const chunks: string[] = [];
  const lines = content.split('\n');
  let currentChunk = '';
  
  for (const line of lines) {
    // Don't split mid-dialog-turn
    if (currentChunk.length + line.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

async function loadLocomoData(): Promise<any[]> {
  console.log('Loading LOCOMO data...');
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
  
  const speakers = new Set<string>();
  
  for (const sessionKey of sessionKeys) {
    const turns: DialogTurn[] = convData[sessionKey];
    if (!Array.isArray(turns)) continue;
    
    for (const turn of turns) {
      if (turn.speaker && turn.text) {
        // Simple format: Speaker: Text
        lines.push(`${turn.speaker}: ${turn.text}`);
        speakers.add(turn.speaker);
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
  sessionDate: string,
  speakers: string[]
): Promise<{ success: boolean; facts: number; latency: number }> {
  const startTime = Date.now();
  
  const content = `[LOCOMO ${sampleId} chunk ${chunkIndex + 1}/${totalChunks}]\nSpeakers: ${speakers.join(', ')}\n\n${chunk}`;
  
  try {
    const response = await fetch(MUNNIN_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-Organization-ID': ORG_ID,
      },
      body: JSON.stringify({
        content,
        type: 'episodic',
        session_date: sessionDate,
        metadata: {
          source: 'locomo-chunked',
          sample_id: sampleId,
          chunk: `${chunkIndex + 1}/${totalChunks}`,
        },
      }),
    });
    
    const result = await response.json();
    const latency = Date.now() - startTime;
    
    if (result.error) {
      console.log(`    ✗ Chunk ${chunkIndex + 1}/${totalChunks}: ${result.error}`);
      return { success: false, facts: 0, latency };
    }
    
    console.log(`    ✓ Chunk ${chunkIndex + 1}/${totalChunks}: ${result.extracted_facts || 0} facts in ${(latency / 1000).toFixed(1)}s`);
    return { success: true, facts: result.extracted_facts || 0, latency };
  } catch (error: any) {
    console.log(`    ✗ Chunk ${chunkIndex + 1}/${totalChunks}: ${error.message}`);
    return { success: false, facts: 0, latency: Date.now() - startTime };
  }
}

async function runChunkedIngestion(): Promise<void> {
  console.log('============================================================');
  console.log('LOCOMO CHUNKED INGESTION');
  console.log('============================================================');
  console.log(`Chunk size: ${CHUNK_SIZE} chars`);
  console.log('');
  
  const data = await loadLocomoData();
  console.log(`Loaded ${data.length} conversations\n`);
  
  let totalFacts = 0;
  let totalChunks = 0;
  let successfulChunks = 0;
  
  for (let i = 0; i < data.length; i++) {
    const conv = data[i];
    const sampleId = conv.sample_id;
    const sessionDate = SESSION_DATES[sampleId] || '2023-01-01';
    
    console.log(`\n[${i + 1}/${data.length}] ${sampleId}`);
    console.log(`  Questions: ${conv.qa.length}`);
    
    const fullContent = flattenConversation(conv.conversation);
    
    // Extract speakers from content
    const speakerMatch = fullContent.match(/\[D\d+:\d+\]\s+(\w+):/g);
    const speakers = [...new Set((speakerMatch || []).map(s => s.replace(/\[D\d+:\d+\]\s+/, '').replace(':', '')))];
    
    const chunks = chunkConversation(fullContent, CHUNK_SIZE);
    console.log(`  Content: ${fullContent.length} chars → ${chunks.length} chunks`);
    
    let convFacts = 0;
    for (let j = 0; j < chunks.length; j++) {
      const result = await ingestChunk(chunks[j], sampleId, j, chunks.length, sessionDate, speakers);
      
      if (result.success) {
        convFacts += result.facts;
        successfulChunks++;
      }
      totalChunks++;
      
      // Rate limit between chunks
      if (j < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    totalFacts += convFacts;
    console.log(`  Total facts for ${sampleId}: ${convFacts}`);
    
    // Rate limit between conversations
    if (i < data.length - 1) {
      console.log('  Waiting 3s...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('\n============================================================');
  console.log('INGESTION COMPLETE');
  console.log('============================================================');
  console.log(`Total chunks: ${totalChunks}`);
  console.log(`Successful chunks: ${successfulChunks}`);
  console.log(`Total facts extracted: ${totalFacts}`);
  console.log(`Average facts per chunk: ${(totalFacts / successfulChunks).toFixed(1)}`);
  console.log('\nNext: Run quick-test.ts to verify extraction quality');
}

runChunkedIngestion().catch(console.error);