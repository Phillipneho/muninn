/**
 * Sanity Check: Re-ingest conv-26 with enhanced extraction
 * Test 20 questions before/after to validate improvement
 */

const MUNNIN_API = 'https://api.muninn.au/api/memories';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';

interface DialogTurn {
  speaker: string;
  dia_id: string;
  text: string;
}

interface QA {
  question: string;
  answer: string | string[];
  evidence: string[];
  category: number;
}

async function ingestConv26(): Promise<void> {
  console.log('Loading LOCOMO data...');
  const response = await fetch('https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json');
  const data = await response.json();
  
  const conv = data[0]; // conv-26
  console.log(`\nIngesting ${conv.sample_id}...`);
  console.log(`Questions: ${conv.qa.length}`);
  
  // Flatten conversation
  const sessionKeys = Object.keys(conv.conversation)
    .filter(k => k.startsWith('session_') && !k.includes('_date'))
    .sort((a, b) => {
      const numA = parseInt(a.replace('session_', ''));
      const numB = parseInt(b.replace('session_', ''));
      return numA - numB;
    });
  
  const lines: string[] = [];
  const speakers = new Set<string>();
  
  for (const sessionKey of sessionKeys) {
    const turns: DialogTurn[] = conv.conversation[sessionKey];
    if (!Array.isArray(turns)) continue;
    
    for (const turn of turns) {
      if (turn.speaker && turn.text) {
        lines.push(`[${turn.dia_id}] ${turn.speaker}: ${turn.text}`);
        speakers.add(turn.speaker);
      }
    }
  }
  
  const content = `[LOCOMO conv-26]
Speakers: ${Array.from(speakers).join(', ')}

=== CONVERSATION ===
${lines.join('\n')}`;

  console.log(`Content length: ${content.length} chars`);
  console.log(`First 500 chars: ${content.substring(0, 500)}...`);
  
  // Ingest
  const start = Date.now();
  const ingestResponse = await fetch(MUNNIN_API, {
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
    }),
  });
  
  const result = await ingestResponse.json();
  const latency = Date.now() - start;
  
  if (result.error) {
    console.log(`✗ Error: ${result.error}`);
    return;
  }
  
  console.log(`\n✓ Ingested in ${latency}ms`);
  console.log(`  Memory ID: ${result.id}`);
  console.log(`  Facts extracted: ${result.extracted_facts?.length || 'N/A'}`);
  
  // Wait for indexing
  console.log('\nWaiting 5 seconds for indexing...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Test 20 questions
  console.log('\n============================================================');
  console.log('SANITY CHECK: Testing 20 questions');
  console.log('============================================================\n');
  
  const testQuestions: QA[] = conv.qa.slice(0, 20);
  let correct = 0;
  let total = 0;
  
  for (const qa of testQuestions) {
    // Extract entity
    const knownEntities = ['Caroline', 'Melanie', 'Jon', 'Gina', 'Calvin', 'Dave'];
    let entity = 'Unknown';
    for (const e of knownEntities) {
      if (qa.question.includes(e)) {
        entity = e;
        break;
      }
    }
    
    // Search
    const searchStart = Date.now();
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
    const searchLatency = Date.now() - searchStart;
    
    // Check answer
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
    console.log(`[${status}] Q: ${qa.question.substring(0, 50)}...`);
    console.log(`    Entity: ${entity}, Category: ${qa.category}`);
    console.log(`    Expected: ${expected.join(', ')}`);
    console.log(`    Top facts: ${facts.slice(0, 2).join(' | ')}`);
    console.log(`    Latency: ${searchLatency}ms\n`);
    
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('============================================================');
  console.log(`RESULTS: ${correct}/${total} = ${((correct/total)*100).toFixed(1)}%`);
  console.log('============================================================');
}

ingestConv26().catch(console.error);