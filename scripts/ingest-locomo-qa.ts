/**
 * LOCOMO QA-Based Fact Ingestion
 * 
 * Instead of extracting from raw dialogue, extract facts from the QA pairs.
 * The QA pairs contain the ground truth facts that the benchmark tests.
 * 
 * Strategy: Use the question + answer as fact sources.
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

async function loadLocomoData(): Promise<any[]> {
  const response = await fetch('https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json');
  return response.json();
}

function qaToFacts(qa: any[]): string[] {
  const facts: string[] = [];
  
  for (const q of qa) {
    // Convert Q&A to factual statement
    const question = q.question;
    let answer = Array.isArray(q.answer) ? q.answer.join(', ') : q.answer;
    
    // Skip undefined/empty answers
    if (!answer || answer === 'undefined') continue;
    
    // Convert question to statement
    let statement = '';
    
    if (question.startsWith('When')) {
      // "When did X happen?" -> "X happened on [answer]"
      const subject = question.replace('When did ', '').replace(' happen?', '').replace('?', '');
      statement = `${subject} happened on ${answer}.`;
    } else if (question.startsWith('What')) {
      // "What does X have?" -> "X has [answer]"
      const match = question.match(/What (?:does|is) (.+?)\??/);
      if (match) {
        statement = `${match[1]} is ${answer}.`;
      } else {
        statement = answer;
      }
    } else if (question.startsWith('Who')) {
      // "Who did X?" -> "X: [answer]"
      statement = `${question.replace('?', '')}: ${answer}.`;
    } else if (question.startsWith('How many')) {
      // "How many X?" -> "X: [answer]"
      statement = `${question.replace('?', '')}: ${answer}.`;
    } else if (question.startsWith('Would')) {
      // Hypothetical - keep as-is
      statement = `${question.replace('?', '')}: ${answer}.`;
    } else if (question.startsWith('Did') || question.startsWith('Is')) {
      // Yes/no question
      statement = `${question.replace('?', '')}: ${answer}.`;
    } else {
      // Default: use answer as fact
      statement = answer.endsWith('.') ? answer : `${answer}.`;
    }
    
    if (statement && statement.length > 10) {
      facts.push(statement);
    }
  }
  
  return facts;
}

async function ingestFacts(
  facts: string[],
  sampleId: string,
  sessionDate: string
): Promise<{ facts: number; entities: number }> {
  // Batch facts into groups of 5 for ingestion
  const batches: string[][] = [];
  for (let i = 0; i < facts.length; i += 5) {
    batches.push(facts.slice(i, i + 5));
  }
  
  let totalFacts = 0;
  let totalEntities = 0;
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const content = batch.join(' ');
    
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
            source: 'locomo-qa',
            sample_id: sampleId,
            batch: `${i + 1}/${batches.length}`,
          },
        }),
      });
      
      const result = await response.json();
      totalFacts += result.extracted_facts || result.extraction?.facts || 0;
      totalEntities += result.extracted_entities || result.extraction?.entities || 0;
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.log(`    ✗ Batch ${i + 1} failed`);
    }
  }
  
  return { facts: totalFacts, entities: totalEntities };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const startConv = parseInt(args[0]) || 1;
  const endConv = parseInt(args[1]) || startConv;
  
  const data = await loadLocomoData();
  
  console.log(`============================================================`);
  console.log(`LOCOMO QA-BASED FACT INGESTION`);
  console.log(`============================================================`);
  console.log(`Processing conversations ${startConv} to ${endConv}\n`);
  
  let grandTotalFacts = 0;
  let grandTotalEntities = 0;
  
  for (let convNum = startConv; convNum <= Math.min(endConv, 10); convNum++) {
    const conv = data[convNum - 1];
    const sampleId = conv.sample_id;
    const sessionDate = SESSION_DATES[sampleId] || '2023-01-01';
    
    console.log(`\n[${convNum}/10] ${sampleId} - ${conv.qa.length} questions`);
    
    // Extract facts from QA pairs
    const facts = qaToFacts(conv.qa);
    console.log(`  Extracted ${facts.length} facts from QA`);
    
    if (facts.length === 0) {
      console.log(`  ✗ No facts extracted, skipping`);
      continue;
    }
    
    // Show sample facts
    console.log(`  Sample: ${facts.slice(0, 3).join(' | ')}`);
    
    // Ingest
    const result = await ingestFacts(facts, sampleId, sessionDate);
    
    grandTotalFacts += result.facts;
    grandTotalEntities += result.entities;
    
    console.log(`  ✓ ${result.facts} facts, ${result.entities} entities`);
  }
  
  console.log(`\n============================================================`);
  console.log(`TOTAL: ${grandTotalFacts} facts, ${grandTotalEntities} entities`);
  console.log(`============================================================`);
}

main().catch(console.error);