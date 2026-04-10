/**
 * Test extraction with the working prompt
 */

const TEST_CONTENT = `
Caroline went to an LGBTQ support group yesterday. She mentioned that Melanie has been painting a lot lately - her new series is about ocean waves. 

I am a transgender woman from Sweden. I've been single for about 6 months now. 

My friend Dave started a new job at Google last month. He's working on their AI safety team.
`;

async function testExtraction() {
  console.log('=== Testing Extraction with Working Prompt ===\n');
  
  const { extractWithAI } = await import('./src/extraction.js');
  
  // Mock AI for Cloudflare (not used with ollama-local)
  const mockAI = {} as any;
  
  const startTime = Date.now();
  
  const result = await extractWithAI(mockAI, TEST_CONTENT, '2023-05-07', {
    provider: 'ollama-local',
    model: 'glm-5:cloud'
  });
  
  const elapsed = Date.now() - startTime;
  
  console.log('\n=== RESULTS ===\n');
  console.log(`Speaker: ${result.speaker || 'Unknown'}`);
  console.log(`Entities: ${result.entities.length}`);
  console.log(`Facts: ${result.facts.length}`);
  console.log(`Latency: ${elapsed}ms`);
  console.log(`Provider: ${result.provider}`);
  console.log(`Model: ${result.model}`);
  
  console.log('\n--- ENTITIES ---');
  result.entities.forEach(e => {
    console.log(`  ${e.name} (${e.type})`);
  });
  
  console.log('\n--- FACTS ---');
  result.facts.forEach(f => {
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
    const found = result.facts.some(f => {
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

testExtraction().catch(console.error);