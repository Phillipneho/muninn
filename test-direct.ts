// Direct test with minimal prompt

const PROMPT = `Extract facts from this conversation. Output ONLY valid JSON.

Speaker: The "I" in the text - identify from context
Session date: 2023-05-07

Rules:
1. Resolve pronouns: "I" = speaker, "She"/"He" = resolved name from context
2. Extract identity facts: "I am a transgender woman" → {subject: "Name", predicate: "identity", object: "transgender woman"}
3. Extract temporal facts with dates
4. One fact per line, atomic

Output JSON format:
{
  "entities": [{"name": "...", "type": "person"}],
  "facts": [{"subject": "...", "predicate": "...", "object": "...", "evidence": "..."}]
}

Text:
Caroline went to an LGBTQ support group yesterday. She mentioned that Melanie has been painting a lot lately - her new series is about ocean waves. 

I am a transgender woman from Sweden. I've been single for about 6 months now. 

My friend Dave started a new job at Google last month. He's working on their AI safety team.`;

async function test() {
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'glm-5:cloud',
      messages: [{ role: 'user', content: PROMPT }],
      stream: false,
      options: { num_ctx: 16384 }
    })
  });
  
  const data = await response.json();
  console.log('Response:', data.message?.content?.substring(0, 500));
  
  const jsonMatch = data.message?.content?.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('\nParsed:', parsed.entities?.length, 'entities,', parsed.facts?.length, 'facts');
    } catch (e) {
      console.log('\nParse error:', e.message);
    }
  }
}

test().catch(console.error);
