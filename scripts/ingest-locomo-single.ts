/**
 * Ingest a single LOCOMO conversation
 * Usage: npx tsx scripts/ingest-locomo-single.ts <conv-number>
 * Example: npx tsx scripts/ingest-locomo-single.ts 1  (for conv-26)
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

const CONV_IDS = ['conv-26', 'conv-30', 'conv-41', 'conv-42', 'conv-43', 'conv-44', 'conv-47', 'conv-48', 'conv-49', 'conv-50'];

interface DialogTurn {
  speaker: string;
  dia_id: string;
  text: string;
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

async function ingestConversation(
  content: string,
  sampleId: string,
  sessionDate: string
): Promise<{ success: boolean; facts: number; entities: number; latency: number }> {
  const startTime = Date.now();
  
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
    console.log(`ERROR: ${result.error}`);
    return { success: false, facts: 0, entities: 0, latency };
  }
  
  const facts = result.extracted_facts || result.extraction?.facts || 0;
  const entities = result.extracted_entities || result.extraction?.entities || 0;
  
  return { success: true, facts, entities, latency };
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
  
  console.log(`Ingesting ${sampleId}...`);
  console.log(`Questions: ${conv.qa.length}`);
  
  const content = flattenConversation(conv.conversation);
  console.log(`Content: ${content.length} chars`);
  
  const result = await ingestConversation(content, sampleId, sessionDate);
  
  if (result.success) {
    console.log(`✓ ${result.facts} facts, ${result.entities} entities in ${(result.latency / 1000).toFixed(1)}s`);
  } else {
    console.log(`✗ Failed`);
  }
}

main().catch(console.error);