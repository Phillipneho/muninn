/**
 * Quick accuracy test on re-ingested LOCOMO data
 */

const MUNNIN_API = 'https://api.muninn.au/api/memories';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';

// Sample questions from conv-26 (Caroline/Melanie)
const TEST_QUESTIONS = [
  { q: "What is Caroline's identity?", expected: ["transgender woman", "transgender"] },
  { q: "What is Caroline's relationship status?", expected: ["single"] },
  { q: "What activities does Melanie partake in?", expected: ["pottery", "camping", "painting", "swimming"] },
  { q: "How many children does Melanie have?", expected: ["3", "three"] },
  { q: "What is Melanie's relationship status?", expected: ["married"] },
  { q: "When did Caroline go to the LGBTQ support group?", expected: ["may", "2023"] },
  { q: "What instrument does Caroline play?", expected: ["guitar", "acoustic guitar"] },
  { q: "What hobbies does Caroline have?", expected: ["hiking", "camping", "painting"] },
];

async function runQuickTest(): Promise<void> {
  console.log('============================================================');
  console.log('QUICK ACCURACY TEST');
  console.log('============================================================\n');
  
  let correct = 0;
  let total = TEST_QUESTIONS.length;
  
  for (const test of TEST_QUESTIONS) {
    // Extract entity
    const knownEntities = ['Caroline', 'Melanie', 'Jon', 'Gina', 'Calvin', 'Dave'];
    let entity = 'Unknown';
    for (const e of knownEntities) {
      if (test.q.includes(e)) {
        entity = e;
        break;
      }
    }
    
    // Search
    const response = await fetch(
      `${MUNNIN_API}?q=${encodeURIComponent(entity)}&search_type=structured&limit=20`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'X-Organization-ID': ORG_ID,
        },
      }
    );
    const result = await response.json();
    
    // Check facts
    const facts = result.results?.slice(0, 10).map((r: any) => 
      `${r.predicate} ${r.object || ''}`.toLowerCase()
    ) || [];
    
    const factsStr = facts.join(' ');
    const isCorrect = test.expected.some(exp => factsStr.includes(exp.toLowerCase()));
    
    if (isCorrect) correct++;
    
    const status = isCorrect ? '✓' : '✗';
    console.log(`[${status}] ${test.q}`);
    console.log(`    Entity: ${entity}`);
    console.log(`    Expected: ${test.expected.join(', ')}`);
    console.log(`    Top facts: ${facts.slice(0, 3).join(' | ')}`);
    console.log('');
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('============================================================');
  console.log(`RESULTS: ${correct}/${total} = ${((correct/total)*100).toFixed(1)}%`);
  console.log('============================================================');
}

runQuickTest().catch(console.error);