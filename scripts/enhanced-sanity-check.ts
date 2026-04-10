/**
 * Enhanced Sanity Check
 * Options A + B + C:
 * A. Ollama Cloud (kimi-k2.5) as primary
 * B. Two-pass extraction (entities → attributes)
 * C. Smaller chunk size (5k chars)
 */

const MUNNIN_API = 'https://api.muninn.au/api/memories';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';

const CHUNK_SIZE = 5000; // Option C: Smaller chunks

async function ingestChunk(content: string, chunkIndex: number, totalChunks: number): Promise<any> {
  console.log(`\n[Chunk ${chunkIndex}/${totalChunks}] Processing ${content.length} chars...`);
  
  const startTime = Date.now();
  
  // Use Muninn API with Ollama Cloud extraction
  const response = await fetch(`${MUNNIN_API}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': ORG_ID,
    },
    body: JSON.stringify({
      content,
      type: 'episodic',
      session_date: '2023-03-23',
      metadata: {
        source: 'locomo-sanity-check',
        chunk: `${chunkIndex}/${totalChunks}`,
      },
    }),
  });
  
  const result = await response.json();
  const latency = Date.now() - startTime;
  
  if (result.error) {
    console.log(`  ✗ Error: ${result.error}`);
    return null;
  }
  
  const facts = result.extracted_facts?.length || 0;
  const entities = result.extracted_entities?.length || 0;
  
  console.log(`  ✓ Ingested in ${latency}ms`);
  console.log(`    Entities: ${entities}, Facts: ${facts}`);
  console.log(`    Memory ID: ${result.id}`);
  
  return result;
}

interface DialogTurn {
  speaker: string;
  dia_id: string;
  text: string;
}

interface QA {
  question: string;
  answer: string | string[];
  category: number;
}



async function runEnhancedSanityCheck(): Promise<void> {
  console.log('============================================================');
  console.log('ENHANCED SANITY CHECK');
  console.log('Options: A (Ollama kimi-k2.5) + B (Two-pass) + C (5k chunks)');
  console.log('============================================================\n');
  
  // Load LOCOMO data
  console.log('Loading LOCOMO data...');
  const response = await fetch('https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json');
  const data = await response.json();
  
  const conv = data[0]; // conv-26
  console.log(`Conversation: ${conv.sample_id}`);
  console.log(`Questions: ${conv.qa.length}\n`);
  
  // Flatten conversation
  const sessionKeys = Object.keys(conv.conversation)
    .filter((k: string) => k.startsWith('session_') && !k.includes('_date'))
    .sort((a: string, b: string) => {
      const numA = parseInt(a.replace('session_', ''));
      const numB = parseInt(b.replace('session_', ''));
      return numA - numB;
    });
  
  const lines: string[] = [];
  for (const sessionKey of sessionKeys) {
    const turns: DialogTurn[] = conv.conversation[sessionKey];
    if (!Array.isArray(turns)) continue;
    
    for (const turn of turns) {
      if (turn.speaker && turn.text) {
        lines.push(`[${turn.dia_id}] ${turn.speaker}: ${turn.text}`);
      }
    }
  }
  
  const fullContent = lines.join('\n');
  console.log(`Total content: ${fullContent.length} chars`);
  
  // OPTION C: Split into 5k chunks
  const chunks: string[] = [];
  for (let i = 0; i < fullContent.length; i += CHUNK_SIZE) {
    chunks.push(fullContent.slice(i, i + CHUNK_SIZE));
  }
  console.log(`Split into ${chunks.length} chunks\n`);
  
  // Process each chunk with two-pass extraction
  for (let i = 0; i < chunks.length; i++) {
    await ingestChunk(chunks[i], i + 1, chunks.length);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limit
  }
  
  // Wait for indexing
  console.log('\nWaiting 10 seconds for indexing...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Test questions
  console.log('\n============================================================');
  console.log('TESTING QUESTIONS');
  console.log('============================================================\n');
  
  const testQuestions: QA[] = conv.qa.slice(0, 20);
  let correct = 0;
  let total = 0;
  
  for (const qa of testQuestions) {
    const knownEntities = ['Caroline', 'Melanie', 'Jon', 'Gina', 'Calvin', 'Dave'];
    let entity = 'Unknown';
    for (const e of knownEntities) {
      if (qa.question.includes(e)) {
        entity = e;
        break;
      }
    }
    
    const searchResponse = await fetch(
      `${MUNNIN_API}?q=${encodeURIComponent(entity)}&search_type=structured&limit=10`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'X-Organization-ID': ORG_ID,
        },
      }
    );
    const searchResult = await searchResponse.json();
    
    const facts = searchResult.results?.slice(0, 5).map((r: any) => 
      `${r.subject} ${r.predicate} ${r.object}`.toLowerCase()
    ) || [];
    
    const expected = Array.isArray(qa.answer) ? qa.answer : [qa.answer];
    const expectedLower = expected.map(a => String(a).toLowerCase());
    
    const factsStr = facts.join(' ');
    const isCorrect = expectedLower.some(exp => factsStr.includes(exp));
    
    if (isCorrect) correct++;
    total++;
    
    const status = isCorrect ? '✓' : '✗';
    console.log(`[${status}] ${qa.question.substring(0, 50)}...`);
    console.log(`    Expected: ${expected.join(', ')}`);
    console.log(`    Got: ${facts.slice(0, 2).join(' | ')}\n`);
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('============================================================');
  console.log(`RESULTS: ${correct}/${total} = ${((correct/total)*100).toFixed(1)}%`);
  console.log('============================================================');
}

runEnhancedSanityCheck().catch(console.error);