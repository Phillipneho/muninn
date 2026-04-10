/**
 * Test two-pass extraction - using working prompt format
 */

const TEST_CONTENT = `
Caroline went to an LGBTQ support group yesterday. She mentioned that Melanie has been painting a lot lately - her new series is about ocean waves. 

I am a transgender woman from Sweden. I've been single for about 6 months now. 

My friend Dave started a new job at Google last month. He's working on their AI safety team.
`;

// PASS 1: Entities + basic facts (working format from earlier)
const PASS1_PROMPT = `Extract entities and basic facts from this conversation. Output ONLY valid JSON.

Speaker: The "I" in the text
Session date: 2023-05-07

Rules:
1. Identify the speaker and all mentioned persons
2. Resolve pronouns: "I" = speaker, "she"/"he" = resolved name
3. Extract basic facts: attended, visited, works_at

Output JSON format:
{
  "speaker": "Name",
  "entities": [{"name": "Exact Name", "type": "person"}],
  "facts": [{"subject": "Name", "predicate": "verb", "object": "value", "evidence": "quote"}]
}

Text:
${TEST_CONTENT}`;

// PASS 2: Identity + temporal facts
const PASS2_PROMPT = `Extract identity and temporal facts for these persons: {{PERSONS}}

Session date: 2023-05-07
Text:
${TEST_CONTENT}

Critical facts to extract:
- Identity: "I am a transgender woman" → {subject: "Caroline", predicate: "identity", object: "transgender woman"}
- Origin: "from Sweden" → {subject: "Caroline", predicate: "from", object: "Sweden"}  
- Relationship: "single" → {subject: "Caroline", predicate: "relationship_status", object: "single"}
- Temporal: "yesterday" = 2023-05-06, "last month" = 2023-04

Output ONLY valid JSON:
{
  "facts": [
    {"subject": "Name", "predicate": "identity|from|relationship_status|works_at|has_hobby|attended", "object": "value", "validFrom": "YYYY-MM-DD or null"}
  ]
}`;

async function callOllama(prompt: string, model: string): Promise<string> {
  console.log(`[OLLAMA] Calling ${model} (${prompt.length} chars prompt)...`);
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { num_ctx: 16384, num_predict: 2048 }
    })
  });
  
  const data = await response.json();
  const content = data.message?.content || '';
  console.log(`[OLLAMA] Response: ${content.length} chars`);
  return content;
}

function parseJSON(text: string): any {
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
    console.log('[PARSE] Error:', e.message);
    return null;
  }
}

async function testTwoPassWorking() {
  console.log('=== Testing Two-Pass Extraction (Working Format) ===\n');
  
  const startTime = Date.now();
  const MODEL = 'glm-5:cloud';
  
  // PASS 1
  console.log('[PASS 1] Entities + basic facts...');
  const pass1Response = await callOllama(PASS1_PROMPT, MODEL);
  const pass1Data = parseJSON(pass1Response);
  
  if (!pass1Data) {
    console.log('[PASS 1] Failed to parse');
    console.log('Raw:', pass1Response.substring(0, 500));
    return;
  }
  
  console.log(`[PASS 1] ✓ ${pass1Data.entities?.length || 0} entities, ${pass1Data.facts?.length || 0} facts`);
  console.log(`[PASS 1] Speaker: ${pass1Data.speaker}`);
  console.log(`[PASS 1] Entities: ${pass1Data.entities?.map((e: any) => e.name).join(', ')}`);
  
  // PASS 2
  console.log('\n[PASS 2] Identity + temporal facts...');
  const persons = pass1Data.entities?.map((e: any) => e.name).join(', ') || pass1Data.speaker;
  const pass2Prompt = PASS2_PROMPT.replace('{{PERSONS}}', persons);
  const pass2Response = await callOllama(pass2Prompt, MODEL);
  const pass2Data = parseJSON(pass2Response);
  
  if (!pass2Data) {
    console.log('[PASS 2] Failed to parse');
    console.log('Raw:', pass2Response.substring(0, 500));
    // Use pass1 data only
    const elapsed = Date.now() - startTime;
    printResults(pass1Data, { facts: [] }, elapsed);
    return;
  }
  
  console.log(`[PASS 2] ✓ ${pass2Data.facts?.length || 0} identity/temporal facts`);
  
  const elapsed = Date.now() - startTime;
  printResults(pass1Data, pass2Data, elapsed);
}

function printResults(pass1Data: any, pass2Data: any, elapsed: number) {
  const allFacts = [...(pass1Data.facts || []), ...(pass2Data.facts || [])];
  
  console.log('\n=== RESULTS ===\n');
  console.log(`Speaker: ${pass1Data.speaker}`);
  console.log(`Entities: ${pass1Data.entities?.length || 0}`);
  console.log(`Total Facts: ${allFacts.length}`);
  console.log(`Latency: ${elapsed}ms`);
  
  console.log('\n--- ENTITIES ---');
  pass1Data.entities?.forEach((e: any) => {
    console.log(`  ${e.name} (${e.type})`);
  });
  
  console.log('\n--- ALL FACTS ---');
  allFacts.forEach((f: any) => {
    console.log(`  ${f.subject} | ${f.predicate} | ${f.object}`);
    if (f.validFrom) console.log(`    Valid from: ${f.validFrom}`);
  });
  
  console.log('\n=== VALIDATION ===\n');
  
  const criticalFacts = [
    { subject: 'Caroline', predicate: 'identity', objectContains: 'transgender' },
    { subject: 'Caroline', predicate: 'relationship_status', objectContains: 'single' },
    { subject: 'Caroline', predicate: 'from', object: 'Sweden' },
    { subject: 'Dave', predicate: 'works_at', object: 'Google' }
  ];
  
  criticalFacts.forEach(expected => {
    const found = allFacts.some((f: any) => {
      const subjectMatch = f.subject?.toLowerCase() === expected.subject.toLowerCase();
      const predicateMatch = f.predicate?.toLowerCase() === expected.predicate.toLowerCase();
      const objectMatch = expected.object 
        ? f.object?.toLowerCase() === expected.object.toLowerCase()
        : f.object?.toLowerCase().includes((expected.objectContains || '').toLowerCase());
      return subjectMatch && predicateMatch && objectMatch;
    });
    
    console.log(`${found ? '✓' : '✗'} ${expected.subject} ${expected.predicate} ${expected.object || expected.objectContains}`);
  });
}

testTwoPassWorking().catch(console.error);