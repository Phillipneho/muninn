/**
 * Test extraction quality across different Cloudflare AI models
 * Compares: llama-3.1-8b, llama-3.3-70b, llama-4-scout, qwen3-30b
 */

const TEST_CONTENT = `
Caroline went to an LGBTQ support group yesterday. She mentioned that Melanie has been painting a lot lately - her new series is about ocean waves. 

I am a transgender woman from Sweden. I've been single for about 6 months now. 

My friend Dave started a new job at Google last month. He's working on their AI safety team.

The team at Acme Corp just shipped their v2.0 release. It includes better memory compression and faster retrieval.
`;

const EXTRACTION_PROMPT = `You are a precise fact extraction system. Extract atomic facts, entities, and events from conversations.

## CRITICAL: EXTRACT FACTS FOR ALL SPEAKERS
Do NOT focus only on the primary speaker. Extract facts for EVERY person mentioned:
- If Caroline talks about Melanie's painting, extract facts about Melanie
- If Melanie mentions her kids, extract facts about Melanie and the kids
- Every speaker's facts are EQUALLY important

## CRITICAL: IDENTITY & STATE DETECTION (P1)
You MUST capture declarative statements about identity, relationships, and permanent states.

Examples:
- "I am a transgender woman" → fact: {subject: "Caroline", predicate: "identity", object: "transgender woman", confidence: 1.0}
- "She identifies as non-binary" → fact: {subject: "She", predicate: "gender_identity", object: "non-binary"}
- "I'm single" → fact: {subject: "I", predicate: "relationship_status", object: "single"}
- "I'm from Sweden" → fact: {subject: "I", predicate: "from", object: "Sweden"}

## TEMPORAL PARSING
Convert relative dates to ISO dates based on the session date (2025-03-31):
- "yesterday" → 2025-03-30
- "last month" → 2025-02-28

OUTPUT FORMAT (JSON Only, no markdown):
{
  "speaker": "Name",
  "entities": [
    {"name": "Caroline", "type": "person", "aliases": []}
  ],
  "facts": [
    {
      "subject": "Caroline",
      "predicate": "attends",
      "object": "LGBTQ support group",
      "objectType": "entity",
      "validFrom": "2025-03-30",
      "confidence": 1.0,
      "evidence": "I went to the LGBTQ support group yesterday"
    }
  ]
}`;

interface ExtractionResult {
  speaker?: string;
  entities: Array<{ name: string; type: string }>;
  facts: Array<{
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
    evidence: string;
  }>;
  parseTime?: number;
  error?: string;
}

const MODELS = [
  { name: 'llama-3.1-8b-instruct', model: '@cf/meta/llama-3.1-8b-instruct', tier: 'free' },
  { name: 'llama-3.3-70b-instruct', model: '@cf/meta/llama-3.3-70b-instruct', tier: 'paid' },
  { name: 'llama-4-scout-17b', model: '@cf/meta/llama-4-scout-17b-16e-instruct', tier: 'paid' },
  { name: 'qwen3-30b-fp8', model: '@cf/qwen/qwen3-30b-a3b-fp8', tier: 'paid' },
];

async function testModel(ai: any, modelId: string, modelName: string): Promise<ExtractionResult> {
  const startTime = Date.now();
  
  try {
    const response = await ai.run(modelId, {
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: `Session date: 2025-03-31\n\nExtract facts and entities from:\n\n${TEST_CONTENT}` }
      ],
      max_tokens: 4096,
      temperature: 0.1
    }) as { response: string };

    const parseTime = Date.now() - startTime;
    
    // Parse JSON from response
    const jsonMatch = response.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { entities: [], facts: [], parseTime, error: 'No JSON in response' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      speaker: parsed.speaker,
      entities: parsed.entities || [],
      facts: parsed.facts || [],
      parseTime
    };
  } catch (error: any) {
    return { 
      entities: [], 
      facts: [], 
      parseTime: Date.now() - startTime,
      error: error.message 
    };
  }
}

function scoreResult(result: ExtractionResult): { 
  entityScore: number; 
  factScore: number; 
  coverage: string[];
  issues: string[];
} {
  const expectedEntities = ['Caroline', 'Melanie', 'Dave', 'Acme Corp', 'Google'];
  const expectedFacts = [
    'Caroline attends LGBTQ support group',
    'Caroline identity transgender woman',
    'Caroline from Sweden',
    'Caroline relationship_status single',
    'Melanie painting',
    'Dave job Google',
    'Dave started job',
    'Acme Corp shipped v2.0'
  ];
  
  const foundEntities = result.entities.map(e => e.name.toLowerCase());
  const entityScore = expectedEntities.filter(e => 
    foundEntities.some(fe => fe.includes(e.toLowerCase()) || e.toLowerCase().includes(fe))
  ).length / expectedEntities.length;
  
  const factTexts = result.facts.map(f => `${f.subject} ${f.predicate} ${f.object}`.toLowerCase());
  
  const coverage: string[] = [];
  const issues: string[] = [];
  
  expectedFacts.forEach(expected => {
    const found = factTexts.some(ft => {
      const expectedWords = expected.toLowerCase().split(' ');
      return expectedWords.every(w => ft.includes(w));
    });
    
    if (found) {
      coverage.push(`✓ ${expected}`);
    } else {
      issues.push(`✗ Missing: ${expected}`);
    }
  });
  
  const factScore = coverage.length / expectedFacts.length;
  
  // Check for hallucinations
  result.facts.forEach(f => {
    if (f.confidence < 0.5) {
      issues.push(`? Low confidence: ${f.subject} ${f.predicate} ${f.object}`);
    }
    if (!f.evidence || f.evidence.length < 5) {
      issues.push(`! No evidence: ${f.subject} ${f.predicate} ${f.object}`);
    }
  });
  
  return { entityScore, factScore, coverage, issues };
}

// Export for use in Worker
export async function runComparison(env: { AI: any }): Promise<string> {
  const results: Array<{
    model: string;
    tier: string;
    entities: number;
    facts: number;
    entityScore: number;
    factScore: number;
    parseTime: number;
    coverage: string[];
    issues: string[];
    error?: string;
  }> = [];

  console.log('=== EXTRACTION MODEL COMPARISON ===\n');
  console.log('Test content:');
  console.log(TEST_CONTENT);
  console.log('\n---\n');

  for (const { name, model, tier } of MODELS) {
    console.log(`Testing ${name} (${tier})...`);
    
    const result = await testModel(env.AI, model, name);
    const scores = scoreResult(result);
    
    results.push({
      model: name,
      tier,
      entities: result.entities.length,
      facts: result.facts.length,
      entityScore: scores.entityScore,
      factScore: scores.factScore,
      parseTime: result.parseTime || 0,
      coverage: scores.coverage,
      issues: scores.issues,
      error: result.error
    });
    
    console.log(`  Entities: ${result.entities.length} (${(scores.entityScore * 100).toFixed(0)}% accuracy)`);
    console.log(`  Facts: ${result.facts.length} (${(scores.factScore * 100).toFixed(0)}% coverage)`);
    console.log(`  Time: ${result.parseTime}ms`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    console.log('');
  }

  // Summary
  console.log('=== SUMMARY ===\n');
  console.log('| Model | Tier | Entities | Facts | Entity Score | Fact Score | Time |');
  console.log('|-------|------|----------|-------|--------------|------------|------|');
  results.forEach(r => {
    console.log(`| ${r.model} | ${r.tier} | ${r.entities} | ${r.facts} | ${(r.entityScore * 100).toFixed(0)}% | ${(r.factScore * 100).toFixed(0)}% | ${r.parseTime}ms |`);
  });
  
  // Best model
  const best = results.reduce((a, b) => a.factScore > b.factScore ? a : b);
  console.log(`\nBest model: ${best.model} (${(best.factScore * 100).toFixed(0)}% fact coverage)`);
  
  return JSON.stringify(results, null, 2);
}