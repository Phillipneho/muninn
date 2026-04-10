/**
 * Test single-pass extraction with different models
 */

const TEST_CONTENT = `
Caroline went to an LGBTQ support group yesterday. She mentioned that Melanie has been painting a lot lately - her new series is about ocean waves. 

I am a transgender woman from Sweden. I've been single for about 6 months now. 

My friend Dave started a new job at Google last month. He's working on their AI safety team.
`;

const PROMPT = `Extract facts from this conversation. Output ONLY valid JSON.

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

async function testModel(model: string) {
  console.log(`\n=== Testing ${model} ===\n`);
  
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: PROMPT }],
      stream: false,
      options: { num_ctx: 16384 }
    })
  });
  
  const data = await response.json();
  const content = data.message?.content || '';
  
  console.log(`Response length: ${content.length} chars`);
  console.log(`Response:\n${content.substring(0, 1000)}...`);
  
  // Try to parse JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`\n✓ Parsed: ${parsed.entities?.length || 0} entities, ${parsed.facts?.length || 0} facts`);
      if (parsed.facts) {
        console.log('\nFacts:');
        parsed.facts.slice(0, 10).forEach((f: any) => {
          console.log(`  ${f.subject} | ${f.predicate} | ${f.object}`);
        });
      }
    } catch (e) {
      console.log(`\n✗ JSON parse error`);
    }
  }
}

async function main() {
  await testModel('glm-5:cloud');
  await testModel('minimax-m2.5:cloud');
}

main().catch(console.error);
