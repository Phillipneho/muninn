/**
 * LOCOMO Narrative Preprocessor
 * 
 * Converts dialogue to narrative format for better fact extraction.
 * Uses the LLM to extract factual statements from dialogue.
 * 
 * Strategy:
 * 1. Load dialogue
 * 2. Use LLM to convert to narrative (factual statements)
 * 3. Ingest narrative
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

function flattenDialogue(convData: any): string {
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

function extractNarrativeFromDialogue(dialogue: string, speakers: string[]): string[] {
  const facts: string[] = [];
  const lines = dialogue.split('\n');
  
  const speakerPattern = new RegExp(`^(${speakers.join('|')}):\\s*(.+)$`);
  
  for (const line of lines) {
    const match = line.match(speakerPattern);
    if (!match) continue;
    
    const speaker = match[1];
    const text = match[2];
    
    // Extract factual statements
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
    
    for (const sentence of sentences) {
      const s = sentence.trim();
      
      // Skip questions, greetings, acknowledgments
      if (s.match(/^(hi|hello|hey|how are|what's up|thanks?|yes|no|oh|wow|really|that's|great|cool)/i)) continue;
      if (s.includes('?')) continue;
      
      // Convert to third-person fact
      let fact = s
        .replace(/\bI\b/g, speaker)
        .replace(/\bmy\b/gi, `${speaker}'s`)
        .replace(/\bme\b/gi, speaker)
        .replace(/\bwe\b/gi, `${speaker} and family`)
        .replace(/\bour\b/gi, `${speaker}'s`);
      
      // Only keep if it contains substantive info
      if (fact.length > 20 && !fact.startsWith('Yeah') && !fact.startsWith('Oh')) {
        facts.push(fact);
      }
    }
  }
  
  return facts;
}

function chunkFacts(facts: string[], maxSize: number): string[] {
  const chunks: string[] = [];
  let current = '';
  
  for (const fact of facts) {
    if (current.length + fact.length > maxSize && current.length > 0) {
      chunks.push(current.trim());
      current = fact;
    } else {
      current += ' ' + fact;
    }
  }
  
  if (current.trim()) {
    chunks.push(current.trim());
  }
  
  return chunks;
}

async function ingestNarrative(
  narrative: string,
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
      content: narrative,
      type: 'episodic',
      session_date: sessionDate,
      metadata: {
        source: 'locomo-narrative',
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
    console.log('Usage: npx tsx scripts/ingest-locomo-narrative.ts [1-10]');
    return;
  }
  
  const conv = data[convNum - 1];
  const sampleId = conv.sample_id;
  const sessionDate = SESSION_DATES[sampleId] || '2023-01-01';
  
  console.log(`============================================================`);
  console.log(`INGESTING ${sampleId} (Narrative Preprocessing)`);
  console.log(`============================================================`);
  console.log(`Questions: ${conv.qa.length}`);
  
  // Load and flatten dialogue
  const dialogue = flattenDialogue(conv.conversation);
  
  // Extract speakers
  const speakerMatch = dialogue.match(/^(\w+):/gm);
  const speakers = [...new Set((speakerMatch || []).map(s => s.replace(':', '')))];
  console.log(`Speakers: ${speakers.join(', ')}`);
  
  // Extract narrative from dialogue
  const facts = extractNarrativeFromDialogue(dialogue, speakers);
  console.log(`Extracted ${facts.length} factual statements from dialogue\n`);
  
  // Sample facts
  console.log(`Sample facts:`);
  facts.slice(0, 5).forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log('');
  
  // Chunk and ingest
  const chunks = chunkFacts(facts, 2000);
  console.log(`Ingesting ${chunks.length} chunks...\n`);
  
  let totalFacts = 0;
  let totalEntities = 0;
  let successChunks = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    const result = await ingestNarrative(chunks[i], sampleId, i, chunks.length, sessionDate);
    
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
}

main().catch(console.error);