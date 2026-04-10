/**
 * Test two-pass extraction - minimal prompts for reliable JSON
 */

const TEST_CONTENT = `
Caroline went to an LGBTQ support group yesterday. She mentioned that Melanie has been painting a lot lately - her new series is about ocean waves. 

I am a transgender woman from Sweden. I've been single for about 6 months now. 

My friend Dave started a new job at Google last month. He's working on their AI safety team.
`;

// PASS 1: Just identify entities - minimal output
const PASS1_PROMPT = `Identify the speaker and all mentioned persons.

Text: {{CONTENT}}

Rules:
- The speaker is "I" in the text
- Resolve all pronouns to names

Output ONLY this JSON format, nothing else:
{"speaker":"Name","persons":["Name1","Name2"]}`;

// PASS 2: Extract facts for each identified entity
const PASS2_PROMPT = `Extract facts about these persons: {{PERSONS}}

Text: {{CONTENT}}
Session date: 2023-05-07

Rules:
- Identity: "I am X" → identity fact
- Origin: "from Sweden" → from fact
- Relationship: "single" → relationship_status fact
- Work: "works at X" → works_at fact
- Temporal: "yesterday" → 2023-05-06

Output ONLY this JSON format:
{"facts":[{"subject":"Name","predicate":"verb","object":"value","validFrom":"date or null"}]}`;

async function callOllama(prompt: string, model: string): Promise<string> {
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { num_ctx: 16384, num_predict: 1024 }
    })
  });
  
  const data = await response.json();
  return data.message?.content || '';
}

function parseJSON(text: string): any {
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  
  try {
    let jsonStr = jsonMatch[0];
    jsonStr = jsonStr.replace(/(\w+)\s*:/g, '"$1":');
    jsonStr = jsonStr.replace(/'/g, '"');
    jsonStr = jsonStr.replace(/,\s*}/g, '}');
    jsonStr = jsonStr.replace(/,\s*]/g, ']');
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

async function testTwoPassMinimal() {
  console.log('=== Testing Two-Pass Minimal Extraction ===\n');
  
  const startTime = Date.now();
  const MODEL = 'glm-5:cloud';
  
  // PASS 1: Just entities
  console.log('[PASS 1] Identifying entities...');
  const pass1Prompt = PASS1_PROMPT.replace('{{CONTENT}}', TEST_CONTENT);
  const pass1Response = await callOllama(pass1Prompt, MODEL);
  const pass1Data = parseJSON(pass1Response);
  
  if (!pass1Data) {
    console.log('[PASS 1] Failed:', pass1Response.substring(0, 200));
    return;
  }
  
  console.log(`[PASS 1] Speaker: ${pass1Data.speaker}`);
  console.log(`[PASS 1] Persons: ${pass1Data.persons?.join(', ')}`);
  
  // PASS 2: Extract facts
  console.log('\n[PASS 2] Extracting facts...');
  const persons = pass1Data.persons?.join(', ') || pass1Data.speaker;
  const pass2Prompt = PASS2_PROMPT
    .replace('{{PERSONS}}', persons)
    .replace('{{CONTENT}}', TEST_CONTENT);
  
  const pass2Response = await callOllama(pass2Prompt, MODEL);
  const pass2Data = parseJSON(pass2Response);
  
  if (!pass2Data) {
    console.log('[PASS 2] Failed:', pass2Response.substring(0, 200));
    return;
  }
  
  const elapsed = Date.now() - startTime;
  
  console.log(`[PASS 2] Facts: ${pass2Data.facts?.length || 0}`);
  
  console.log('\n=== RESULTS ===\n');
  console.log(`Speaker: ${pass1Data.speaker}`);
  console.log(`Entities: ${pass1Data.persons?.join(', ')}`);
  console.log(`Facts: ${pass2Data.facts?.length || 0}`);
  console.log(`Latency: ${elapsed}ms`);
  
  console.log('\n--- FACTS ---');
  pass2Data.facts?.forEach((f: any) => {
    console.log(`  ${f.subject} | ${f.predicate} | ${f.object}`);
    if (f.validFrom) console.log(`    Valid from: ${f.validFrom}`);
  });
  
  // Validation
  console.log('\n=== VALIDATION ===\n');
  
  const criticalFacts = [
    { subject: 'Caroline', predicate: 'identity', objectContains: 'transgender' },
    { subject: 'Caroline', predicate: 'relationship_status', objectContains: 'single' },
    { subject: 'Caroline', predicate: 'from', object: 'Sweden' },
    { subject: 'Dave', predicate: 'works_at', object: 'Google' }
  ];
  
  criticalFacts.forEach(expected => {
    const found = pass2Data.facts?.some((f: any) => {
      const subjectMatch = f.subject === expected.subject;
      const predicateMatch = f.predicate === expected.predicate;
      const objectMatch = expected.object 
        ? f.object === expected.object 
        : f.object?.toLowerCase().includes((expected.objectContains || '').toLowerCase());
      return subjectMatch && predicateMatch && objectMatch;
    });
    
    console.log(`${found ? '✓' : '✗'} ${expected.subject} ${expected.predicate} ${expected.object || expected.objectContains}`);
  });
}

testTwoPassMinimal().catch(console.error);