/**
 * Test Cloudflare AI models for deterministic extraction
 */

interface TestResult {
  model: string;
  facts: number;
  entities: number;
  latency: number;
  factQuality: string[];
  issues: string[];
}

const TEST_CONTENT = `
[Caroline]: I went to an LGBTQ support group yesterday. It was empowering.
[Melanie]: That's wonderful! I painted a lake sunrise last year - it's special to me.
[Caroline]: As a single parent, I'm looking into adoption agencies.
`;

async function testModel(ai: any, modelId: string): Promise<TestResult> {
  const start = Date.now();
  
  const prompt = `Extract facts from this conversation. Output JSON only.

Session date: 2025-03-31

Conversation:
${TEST_CONTENT}

Expected facts:
- Caroline attends LGBTQ support group [2025-03-30]
- Melanie painted lake sunrise [2024]
- Caroline relationship_status: single
- Caroline researches adoption agencies

Output format:
{
  "entities": [{"name": "Caroline", "type": "person"}],
  "facts": [{"subject": "Caroline", "predicate": "attends", "object": "LGBTQ support group", "validFrom": "2025-03-30"}]
}`;

  try {
    const response = await ai.run(modelId, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0.1
    }) as { response: string };
    
    const latency = Date.now() - start;
    
    // Parse response
    const jsonMatch = response.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { model: modelId, facts: 0, entities: 0, latency, factQuality: [], issues: ['No JSON in response'] };
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    const factQuality: string[] = [];
    const issues: string[] = [];
    
    // Check for expected facts
    const factTexts = (parsed.facts || []).map(f => `${f.subject} ${f.predicate} ${f.object}`.toLowerCase());
    
    const expectedFacts = [
      { pattern: /caroline.*attends.*lgbtq/i, desc: 'Caroline attends LGBTQ group' },
      { pattern: /melanie.*paint.*lake/i, desc: 'Melanie painted lake' },
      { pattern: /relationship.*single|single.*parent/i, desc: 'Relationship status: single' },
      { pattern: /adoption/i, desc: 'Adoption agencies' }
    ];
    
    for (const expected of expectedFacts) {
      if (factTexts.some(ft => expected.pattern.test(ft))) {
        factQuality.push(`✓ ${expected.desc}`);
      } else {
        issues.push(`✗ Missing: ${expected.desc}`);
      }
    }
    
    return {
      model: modelId,
      facts: parsed.facts?.length || 0,
      entities: parsed.entities?.length || 0,
      latency,
      factQuality,
      issues
    };
  } catch (e: any) {
    return { model: modelId, facts: 0, entities: 0, latency: Date.now() - start, factQuality: [], issues: [e.message] };
  }
}

export { testModel, TEST_CONTENT };
