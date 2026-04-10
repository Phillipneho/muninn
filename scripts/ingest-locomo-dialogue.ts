/**
 * LOCOMO Dialogue-First Ingestion
 * 
 * Strategy: Convert dialogue to facts using LLM in two passes:
 * 1. First pass: Identify speakers and entities
 * 2. Second pass: Extract facts from dialogue context
 * 
 * Uses smaller chunks with speaker context preserved.
 */

const MUNNIN_API = 'https://api.muninn.au/api/memories';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';
const CHUNK_SIZE = 3000; // Smaller chunks for dialogue

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

function extractDialogueFacts(turns: DialogTurn[]): string {
  // Group consecutive turns by speaker and extract key facts
  const facts: string[] = [];
  const speakerContext: Record<string, string[]> = {};
  
  for (const turn of turns) {
    const speaker = turn.speaker;
    const text = turn.text;
    
    if (!speakerContext[speaker]) {
      speakerContext[speaker] = [];
    }
    
    // Extract factual statements from dialogue
    // Convert first-person statements to third-person facts
    const statements = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    for (const stmt of statements) {
      // Skip questions and greetings
      if (stmt.includes('?') || stmt.match(/^(hi|hello|hey|how are|what's up)/i)) {
        continue;
      }
      
      // Convert to factual statement
      let fact = stmt.trim();
      
      // "I have three children" -> "Speaker has three children"
      fact = fact.replace(/^I\s+/i, `${speaker} `);
      fact = fact.replace(/^My\s+/i, `${speaker}'s `);
      fact = fact.replace(/^Me\s+/i, `${speaker} `);
      fact = fact.replace(/^We\s+/i, `${speaker} `);
      
      // Store as fact
      facts.push(fact);
    }
  }
  
  // Combine into factual narrative
  return facts.slice(0, 20).map(f => f.endsWith('.') ? f : f + '.').join(' ');
}

function flattenConversation(convData: any): { turns: DialogTurn[], speakers: string[] }[] {
  const sessions: { turns: DialogTurn[], speakers: string[] }[] = [];
  
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
    
    const speakers = [...new Set(turns.map(t => t.speaker))];
    sessions.push({ turns, speakers });
  }
  
  return sessions;
}

function chunkSessions(sessions: { turns: DialogTurn[], speakers: string[] }[], maxChars: number): string[] {
  const chunks: string[] = [];
  let current = '';
  let currentSpeakers = new Set<string>();
  
  for (const session of sessions) {
    for (const turn of session.turns) {
      const line = `${turn.speaker}: ${turn.text}\n`;
      
      if (current.length + line.length > maxChars && current.length > 0) {
        // Add speaker context to chunk
        const speakerList = [...currentSpeakers].join(', ');
        chunks.push(`[Conversation between: ${speakerList}]\n\n${current.trim()}`);
        current = line;
        currentSpeakers = new Set([turn.speaker]);
      } else {
        current += line;
        currentSpeakers.add(turn.speaker);
      }
    }
  }
  
  if (current.trim()) {
    const speakerList = [...currentSpeakers].join(', ');
    chunks.push(`[Conversation between: ${speakerList}]\n\n${current.trim()}`);
  }
  
  return chunks;
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
      content: chunk,
      type: 'episodic',
      session_date: sessionDate,
      metadata: {
        source: 'locomo-dialogue',
        sample_id: sampleId,
        chunk: `${chunkIndex + 1}/${totalChunks}`,
      },
    }),
  });
  
  const result = await response.json();
  const latency = Date.now() - startTime;
  
  if (result.error) {
    console.log(`      ERROR: ${result.error}`);
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
    console.log('Usage: npx tsx scripts/ingest-locomo-dialogue.ts [1-10]');
    return;
  }
  
  const conv = data[convNum - 1];
  const sampleId = conv.sample_id;
  const sessionDate = SESSION_DATES[sampleId] || '2023-01-01';
  
  console.log(`============================================================`);
  console.log(`INGESTING ${sampleId} (Dialogue-Aware)`);
  console.log(`============================================================`);
  console.log(`Questions: ${conv.qa.length}`);
  
  const sessions = flattenConversation(conv.conversation);
  const allSpeakers = [...new Set(sessions.flatMap(s => s.speakers))];
  console.log(`Sessions: ${sessions.length}, Speakers: ${allSpeakers.join(', ')}\n`);
  
  const chunks = chunkSessions(sessions, CHUNK_SIZE);
  console.log(`Content → ${chunks.length} chunks\n`);
  
  let totalFacts = 0;
  let totalEntities = 0;
  let successChunks = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    const result = await ingestChunk(chunks[i], sampleId, i, chunks.length, sessionDate);
    
    if (result.facts > 0) {
      totalFacts += result.facts;
      totalEntities += result.entities;
      successChunks++;
      console.log(`  [${i + 1}/${chunks.length}] ✓ ${result.facts} facts, ${result.entities} entities (${(result.latency / 1000).toFixed(1)}s)`);
    } else {
      console.log(`  [${i + 1}/${chunks.length}] ✗ 0 facts (${(result.latency / 1000).toFixed(1)}s)`);
    }
    
    // Rate limit between chunks
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`\n✓ Total: ${totalFacts} facts, ${totalEntities} entities from ${successChunks}/${chunks.length} chunks`);
  console.log(`  Avg facts per successful chunk: ${(totalFacts / Math.max(1, successChunks)).toFixed(1)}`);
}

main().catch(console.error);