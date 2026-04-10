/**
 * Test two-pass extraction with focused passes
 * Pass 1: Entity resolution + basic facts
 * Pass 2: Identity + temporal + state facts
 */

const TEST_CONTENT = `
Caroline went to an LGBTQ support group yesterday. She mentioned that Melanie has been painting a lot lately - her new series is about ocean waves. 

I am a transgender woman from Sweden. I've been single for about 6 months now. 

My friend Dave started a new job at Google last month. He's working on their AI safety team.

The team at Acme Corp just shipped their v2.0 release. It includes better memory compression and faster retrieval.
`;

const PASS1_PROMPT = `Identify entities and extract basic facts.

Session date: 2023-05-07
Text: {{CONTENT}}

Task: Identify speaker and all mentioned persons. Resolve pronouns ("I" = speaker, "she"/"he" = actual name). Extract basic facts.

Output ONLY compact JSON on one line:
{"speaker":"Name","entities":[{"name":"...","type":"person"}],"facts":[{"subject":"Name","predicate":"verb","object":"value"}]}

Rules:
- Subject must be resolved name, never pronoun
- Keep facts atomic: one subject, one predicate, one object
- Predicates: attended, visited, mentioned, works_at, lives_in`;

const PASS2_PROMPT = `Extract identity and temporal facts.

Session date: 2023-05-07
Entities: {{ENTITIES}}
Text: {{CONTENT}}

Extract these critical facts:
1. Identity: "I am a transgender woman" → {"subject":"Name","predicate":"identity","object":"transgender woman"}
2. Origin: "I'm from Sweden" → {"subject":"Name","predicate":"from","object":"Sweden"}
3. Relationship: "I'm single" → {"subject":"Name","predicate":"relationship_status","object":"single"}
4. Temporal: "yesterday" → 2023-05-06, "last month" → 2023-04

Output ONLY compact JSON on one line:
{"facts":[{"subject":"Name","predicate":"identity|from|relationship_status|works_at|has_hobby|attended|happened_on","object":"value","validFrom":"YYYY-MM-DD"}]}`;

async function callOllama(prompt: string, model: string): Promise<string> {
  console.log(`[OLLAMA] Calling ${model}...`);
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
    console.log('[PARSE] Error:', e);
    console.log('[PARSE] Attempted:', jsonMatch[0]?.substring(0, 300));
    return null;
  }
}

async function testTwoPassFocused() {
  console.log('=== Testing Two-Pass Focused Extraction ===\n');
  
  const startTime = Date.now();
  const MODEL = 'glm-5:cloud'; // Use GLM-5 which handles longer outputs better
  
  // PASS 1: Entity resolution + basic facts
  console.log('[PASS 1] Entity resolution + basic facts...');
  const pass1Prompt = PASS1_PROMPT.replace('{{CONTENT}}', TEST_CONTENT);
  const pass1Response = await callOllama(pass1Prompt, MODEL);
  const pass1Data = parseJSON(pass1Response);
  
  if (!pass1Data) {
    console.log('[PASS 1] Failed to parse JSON');
    console.log('Response:', pass1Response.substring(0, 500));
    return;
  }
  
  console.log(`[PASS 1] Extracted ${pass1Data.entities?.length || 0} entities, ${pass1Data.facts?.length || 0} basic facts`);
  console.log(`[PASS 1] Speaker: ${pass1Data.speaker}`);
  console.log('[PASS 1] Entities:', pass1Data.entities?.map((e: any) => e.name).join(', '));
  
  // PASS 2: Identity + temporal + state facts
  console.log('\n[PASS 2] Identity + temporal + state facts...');
  const entityNames = pass1Data.entities?.map((e: any) => e.name).join(', ') || 'unknown';
  const pass2Prompt = PASS2_PROMPT
    .replace('{{CONTENT}}', TEST_CONTENT)
    .replace('{{ENTITIES}}', entityNames);
  
  const pass2Response = await callOllama(pass2Prompt, MODEL);
  const pass2Data = parseJSON(pass2Response);
  
  if (!pass2Data) {
    console.log('[PASS 2] Failed to parse JSON');
    console.log('Response:', pass2Response.substring(0, 500));
    return;
  }
  
  console.log(`[PASS 2] Extracted ${pass2Data.facts?.length || 0} identity/temporal/state facts`);
  
  // Merge results
  const allFacts = [...(pass1Data.facts || []), ...(pass2Data.facts || [])];
  const elapsed = Date.now() - startTime;
  
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
    console.log(`    Evidence: "${f.evidence}"`);
  });
  
  // Validation
  console.log('\n=== VALIDATION ===\n');
  
  const criticalFacts = [
    { subject: 'Caroline', predicate: 'identity', objectContains: 'transgender' },
    { subject: 'Caroline', predicate: 'relationship_status', objectContains: 'single' },
    { subject: 'Caroline', predicate: 'from', object: 'Sweden' },
    { subject: 'Melanie', predicate: 'has_hobby', objectContains: 'painting' },
    { subject: 'Dave', predicate: 'works_at', object: 'Google' }
  ];
  
  criticalFacts.forEach(expected => {
    const found = allFacts.some((f: any) => {
      const subjectMatch = f.subject === expected.subject;
      const predicateMatch = f.predicate === expected.predicate;
      const objectMatch = expected.object 
        ? f.object === expected.object 
        : f.object.toLowerCase().includes((expected.objectContains || '').toLowerCase());
      return subjectMatch && predicateMatch && objectMatch;
    });
    
    console.log(`${found ? '✓' : '✗'} ${expected.subject} ${expected.predicate} ${expected.object || expected.objectContains}`);
  });
}

testTwoPassFocused().catch(console.error);