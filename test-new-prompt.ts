// Test new extraction prompt directly with Ollama Cloud
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';

const NEW_PROMPT = `You are a fact extraction engine. Transform dialogue into atomic facts.

STRICT REQUIREMENTS:
1. Output ONLY valid JSON on one line - no explanation
2. EVERY 'I/me/my' in [Name]: text refers to Name
3. Use EXACT predicates from the list below - NEVER use others

PREDICATE WHITELIST (use ONLY these):
- has_identity: "I am a teacher" → has_identity: teacher
- has_relationship_status: "I'm single" → has_relationship_status: single
- moved_from: "I moved from Sweden" → moved_from: Sweden (NOT "from" or "origin")
- lives_in: "I live in Sydney" → lives_in: Sydney
- known_for: "I've been painting for 7 years" → known_for: 7 years
- camped_at: "We camped at the beach" → camped_at: beach (NOT "has_identity")
- kids_like: "my kids love dinosaurs" → kids_like: dinosaurs (NOT "has_child")
- has_child: "I have 2 kids" → has_child: 2
- activity: "I do pottery, painting" → separate facts with predicate: activity
- interested_in: "I'm interested in pottery" → interested_in: pottery
- gave_talk_at: "I gave a talk at school" → gave_talk_at: school
- attended: "I attended the conference" → attended: conference

NEGATIVE EXAMPLES (WRONG - do NOT do this):
- "My kids love dinosaurs" → has_child: dinosaurs ❌ WRONG! Use kids_like
- "We camped at beach" → has_identity: beach ❌ WRONG! Use camped_at
- "I moved from Sweden" → from: Sweden ❌ WRONG! Use moved_from

CONTEXT: 2023-05-08
TEXT: [Melanie]: I have two kids who love dinosaurs and nature. We camped at the beach, mountains, and forest. I am interested in pottery. I've been painting for 7 years.

OUTPUT: {"entities":[{"name":"Melanie","type":"person"}],"triples":[{"subject":"Melanie","predicate":"EXACT_PREDICATE","object":"Value","date":"YYYY-MM-DD","evidence":"quote"}]}`;

async function testNewPrompt() {
  console.log('=== TESTING NEW EXTRACTION PROMPT ===\n');
  
  const response = await fetch('https://api.ollama.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OLLAMA_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gemma3:12b',
      messages: [{ role: 'user', content: NEW_PROMPT }],
      temperature: 0,
      seed: 42
    })
  });
  
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  console.log('Raw response:', text);
  
  // Try to parse JSON
  try {
    const parsed = JSON.parse(text);
    console.log('\nParsed facts:');
    for (const fact of parsed.triples || []) {
      console.log(`  ${fact.predicate}: ${fact.object}`);
    }
  } catch (e) {
    console.log('\nFailed to parse JSON');
  }
}

testNewPrompt().catch(console.error);