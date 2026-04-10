/**
 * Ingest all 10 LOCOMO conversations into Muninn
 */

interface Conversation {
  conversation: string;
  qa: any[];
  sample_id: string;
  session_summary: string;
}

const MUNNIN_API = 'https://api.muninn.au/api/memories';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';

// Session dates for each conversation (approximate)
const SESSION_DATES = [
  '2023-03-23', // Calvin/Dave
  '2023-05-07', // Caroline/Melanie
  '2023-06-15', // Additional
  '2023-07-20', // Additional
  '2023-08-10', // Additional
  '2023-08-26', // Calvin/Dave continuation
  '2023-09-15', // Additional
  '2023-10-05', // Additional
  '2023-10-26', // Calvin party
  '2023-11-10', // Additional
];

async function loadLocomoData(): Promise<Conversation[]> {
  const response = await fetch('https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json');
  return response.json();
}

interface DialogTurn {
  speaker: string;
  dia_id: string;
  text: string;
}

function flattenConversation(convData: any): string {
  // Flatten nested session structure
  const lines: string[] = [];
  
  // Get all session keys (session_1, session_2, etc.)
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
      }
    }
  }
  
  return lines.join('\n');
}

function extractSpeakers(convData: any): string {
  const speakers = new Set<string>();
  const sessionKeys = Object.keys(convData)
    .filter(k => k.startsWith('session_') && !k.includes('_date'));
  
  for (const sessionKey of sessionKeys) {
    const turns: DialogTurn[] = convData[sessionKey];
    if (!Array.isArray(turns)) continue;
    
    for (const turn of turns) {
      if (turn.speaker) speakers.add(turn.speaker);
    }
  }
  
  return Array.from(speakers).join(', ');
}

async function ingestConversation(conv: Conversation, index: number): Promise<void> {
  const sessionDate = SESSION_DATES[index] || '2023-01-01';
  const convData = (conv as any).conversation;
  
  console.log(`\n[${index + 1}/10] Ingesting ${conv.sample_id}...`);
  
  const flattenedText = flattenConversation(convData);
  console.log(`  Conversation length: ${flattenedText.length} chars`);
  console.log(`  Questions: ${conv.qa.length}`);
  
  // Get speakers
  const speakers = extractSpeakers(convData);
  
  // Get session summary
  const summaryData = (conv as any).session_summary;
  let summary = '';
  if (summaryData && typeof summaryData === 'object') {
    summary = JSON.stringify(summaryData, null, 2);
  } else if (typeof summaryData === 'string') {
    summary = summaryData;
  }
  
  // Prepend session summary as context
  const content = `[LOCOMO conv-${index + 1}]
Speakers: ${speakers}

=== SESSION_SUMMARY ===
${summary.substring(0, 1000)}

=== CONVERSATION ===
${flattenedText}`;

  const start = Date.now();
  
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
          sample_id: conv.sample_id,
          question_count: conv.qa.length,
        },
      }),
    });
    
    const result = await response.json();
    const latency = Date.now() - start;
    
    if (result.error) {
      console.log(`  ✗ Error: ${result.error}`);
    } else {
      console.log(`  ✓ Ingested in ${latency}ms`);
      console.log(`    Entities: ${result.extraction?.entities || 'N/A'}`);
      console.log(`    Facts: ${result.extraction?.facts || 'N/A'}`);
    }
    
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    console.log(`  ✗ Error: ${error}`);
  }
}



async function main(): Promise<void> {
  console.log('============================================================');
  console.log('LOCOMO INGESTION');
  console.log('============================================================');
  
  const data = await loadLocomoData();
  console.log(`\nLoaded ${data.length} conversations`);
  
  // Only ingest conversations 6-10 (indices 5-9)
  const startIndex = 5;
  
  for (let i = startIndex; i < data.length; i++) {
    await ingestConversation(data[i], i);
  }
  
  console.log('\n============================================================');
  console.log('INGESTION COMPLETE');
  console.log('============================================================');
}

main().catch(console.error);