// Use the EXACT working prompt from earlier successful test

const TEST_CONTENT = `
Caroline went to an LGBTQ support group yesterday. She mentioned that Melanie has been painting a lot lately - her new series is about ocean waves. 

I am a transgender woman from Sweden. I've been single for about 6 months now. 

My friend Dave started a new job at Google last month. He's working on their AI safety team.
`;

const WORKING_PROMPT = `Extract facts from this conversation. Output ONLY valid JSON.

Speaker: Caroline (the "I" in the text)
Session date: 2023-05-07

Rules:
1. Resolve pronouns: "I" = Caroline, "She" = Melanie, "He" = Dave
2. Extract identity facts: "I am a transgender woman" → {subject: "Caroline", predicate: "identity", object: "transgender woman"}
3. Extract temporal facts with dates
4. One fact per line, atomic

Output JSON format:
{
  "entities": [{"name": "...", "type": "person"}],
  "facts": [{"subject": "...", "predicate": "...", "object": "...", "evidence": "..."}]
}

Text:
${TEST_CONTENT}`;

async function test() {
  console.log('=== Testing Working Prompt ===\n');
  
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'glm-5:cloud',
      messages: [{ role: 'user', content: WORKING_PROMPT }],
      stream: false,
      options: { num_ctx: 16384 }
    })
  });
  
  const data = await response.json();
  const content = data.message?.content || '';
  
  console.log(`Response: ${content.length} chars\n`);
  console.log(content);
  
  // Try to parse
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('\n=== PARSED ===\n');
      console.log(`Entities: ${parsed.entities?.length || 0}`);
      console.log(`Facts: ${parsed.facts?.length || 0}`);
      
      console.log('\nFacts:');
      parsed.facts?.forEach((f: any) => {
        console.log(`  ${f.subject} | ${f.predicate} | ${f.object}`);
      });
    } catch (e) {
      console.log('\nParse error:', e.message);
    }
  }
}

test().catch(console.error);
