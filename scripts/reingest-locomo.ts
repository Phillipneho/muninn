/**
 * LOCOMO Re-ingestion with Enhanced Two-Pass Extraction
 * 
 * Enhancements:
 * A. Ollama Cloud (kimi-k2.5) for pass 1
 * B. Two-pass extraction (entities → attributes)
 * C. 5k chunk splitting at natural boundaries
 * D. Deduplication across chunks
 */

const MUNNIN_API = 'https://api.muninn.au/api/memories';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';

// Session dates for each conversation
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
  console.log('Loading LOCOMO data from GitHub...');
  const response = await fetch('https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json');
  return response.json();
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
  
  return {
    content: lines.join('\n'),
    speakers: Array.from(speakers),
  };
}

async function ingestConversation(conv: any, index: number, total: number): Promise<{ success: boolean; facts: number; latency: number }> {
  const startTime = Date.now();
  const sessionDate = SESSION_DATES[conv.sample_id] || '2023-01-01';
  
  console.log(`\n[${index + 1}/${total}] Ingesting ${conv.sample_id}...`);
  console.log(`  Questions: ${conv.qa.length}`);
  console.log(`  Session date: ${sessionDate}`);
  
  const { content, speakers } = flattenConversation(conv.conversation);
  console.log(`  Content: ${content.length} chars, Speakers: ${speakers.join(', ')}`);
  
  // Create memory with full content - the API will chunk and extract
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
          question_count: conv.qa.length,
          extraction_version: 'two-pass-enhanced',
        },
      }),
    });
    
    const result = await response.json();
    const latency = Date.now() - startTime;
    
    if (result.error) {
      console.log(`  ✗ Error: ${result.error}`);
      return { success: false, facts: 0, latency };
    }
    
    console.log(`  ✓ Ingested in ${(latency / 1000).toFixed(1)}s`);
    console.log(`    Memory ID: ${result.id}`);
    console.log(`    Facts: ${result.extracted_facts || 'N/A'}`);
    console.log(`    Entities: ${result.extracted_entities || 'N/A'}`);
    
    return {
      success: true,
      facts: result.extracted_facts || 0,
      latency,
    };
  } catch (error: any) {
    console.log(`  ✗ Error: ${error.message}`);
    return { success: false, facts: 0, latency: Date.now() - startTime };
  }
}

async function runBenchmark(): Promise<void> {
  console.log('============================================================');
  console.log('LOCOMO RE-INGESTION WITH ENHANCED EXTRACTION');
  console.log('============================================================');
  console.log('');
  console.log('Enhancements:');
  console.log('  A. Ollama Cloud (kimi-k2.5) for Pass 1');
  console.log('  B. Two-pass extraction (entities → attributes)');
  console.log('  C. 5k chunk splitting at natural boundaries');
  console.log('  D. Deduplication across chunks');
  console.log('');
  
  const data = await loadLocomoData();
  console.log(`Loaded ${data.length} conversations\n`);
  
  const results: { success: boolean; facts: number; latency: number }[] = [];
  let totalFacts = 0;
  let totalTime = 0;
  
  for (let i = 0; i < data.length; i++) {
    const result = await ingestConversation(data[i], i, data.length);
    results.push(result);
    
    if (result.success) {
      totalFacts += result.facts;
      totalTime += result.latency;
    }
    
    // Rate limit between conversations
    if (i < data.length - 1) {
      console.log(`  Waiting 5s before next conversation...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log('\n============================================================');
  console.log('INGESTION SUMMARY');
  console.log('============================================================');
  
  const successful = results.filter(r => r.success).length;
  console.log(`Successful: ${successful}/${data.length}`);
  console.log(`Total facts extracted: ${totalFacts}`);
  console.log(`Total time: ${(totalTime / 1000 / 60).toFixed(1)} minutes`);
  console.log(`Average per conversation: ${(totalTime / data.length / 1000).toFixed(1)}s`);
  
  console.log('\nPer-conversation stats:');
  results.forEach((r, i) => {
    const status = r.success ? '✓' : '✗';
    console.log(`  [${status}] ${data[i].sample_id}: ${r.facts} facts in ${(r.latency / 1000).toFixed(1)}s`);
  });
  
  console.log('\n============================================================');
  console.log('NEXT STEPS');
  console.log('============================================================');
  console.log('1. Wait 30 seconds for indexing');
  console.log('2. Run: npx tsx scripts/locomo-full-benchmark.ts');
  console.log('============================================================');
}

runBenchmark().catch(console.error);