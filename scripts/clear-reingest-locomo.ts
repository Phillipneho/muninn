/**
 * Clear existing memories and re-ingest LOCOMO benchmark data
 * 
 * Step 1: Delete all existing memories
 * Step 2: Re-ingest LOCOMO conversations with proper extraction
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

async function deleteAllMemories(): Promise<number> {
  console.log('Clearing existing memories...');
  
  let deleted = 0;
  let hasMore = true;
  
  while (hasMore) {
    const response = await fetch(`${MUNNIN_API}?limit=100`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'X-Organization-ID': ORG_ID,
      },
    });
    
    const result = await response.json();
    const memories = result.results || [];
    
    if (memories.length === 0) {
      hasMore = false;
      break;
    }
    
    for (const memory of memories) {
      await fetch(`${MUNNIN_API}/${memory.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'X-Organization-ID': ORG_ID,
        },
      });
      deleted++;
      
      if (deleted % 10 === 0) {
        console.log(`  Deleted ${deleted} memories...`);
      }
    }
    
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`✓ Deleted ${deleted} memories\n`);
  return deleted;
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

async function ingestConversation(
  content: string,
  sampleId: string,
  sessionDate: string
): Promise<{ success: boolean; facts: number; entities: number }> {
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
        content,
        type: 'episodic',
        session_date: sessionDate,
        metadata: {
          source: 'locomo',
          sample_id: sampleId,
        },
      }),
    });
    
    const result = await response.json();
    const latency = Date.now() - startTime;
    
    if (result.error) {
      console.log(`    ✗ ${sampleId}: ${result.error}`);
      return { success: false, facts: 0, entities: 0 };
    }
    
    const facts = result.extracted_facts || result.extraction?.facts || 0;
    const entities = result.extracted_entities || result.extraction?.entities || 0;
    
    console.log(`    ✓ ${sampleId}: ${facts} facts, ${entities} entities in ${(latency / 1000).toFixed(1)}s`);
    return { success: true, facts, entities };
  } catch (error: any) {
    console.log(`    ✗ ${sampleId}: ${error.message}`);
    return { success: false, facts: 0, entities: 0 };
  }
}

async function runClearAndReingest(): Promise<void> {
  console.log('============================================================');
  console.log('CLEAR AND RE-INGEST LOCOMO');
  console.log('============================================================\n');
  
  // Step 1: Clear existing data
  await deleteAllMemories();
  
  // Step 2: Load LOCOMO data
  const data = await loadLocomoData();
  console.log(`Loaded ${data.length} conversations\n`);
  
  // Step 3: Ingest each conversation
  let totalFacts = 0;
  let totalEntities = 0;
  let successful = 0;
  
  for (let i = 0; i < data.length; i++) {
    const conv = data[i];
    const sampleId = conv.sample_id;
    const sessionDate = SESSION_DATES[sampleId] || '2023-01-01';
    
    console.log(`[${i + 1}/${data.length}] ${sampleId}`);
    console.log(`  Questions: ${conv.qa.length}`);
    
    const content = flattenConversation(conv.conversation);
    console.log(`  Content: ${content.length} chars`);
    
    const result = await ingestConversation(content, sampleId, sessionDate);
    
    if (result.success) {
      totalFacts += result.facts;
      totalEntities += result.entities;
      successful++;
    }
    
    // Rate limit between conversations
    if (i < data.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('\n============================================================');
  console.log('INGESTION COMPLETE');
  console.log('============================================================');
  console.log(`Successful conversations: ${successful}/${data.length}`);
  console.log(`Total facts extracted: ${totalFacts}`);
  console.log(`Total entities extracted: ${totalEntities}`);
  console.log(`Average facts per conversation: ${(totalFacts / successful).toFixed(1)}`);
}

runClearAndReingest().catch(console.error);