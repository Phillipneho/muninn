/**
 * Test double-pass GLM-5 extraction via local Ollama
 */

const TEST_CONTENT = `
Caroline went to an LGBTQ support group yesterday. She mentioned that Melanie has been painting a lot lately - her new series is about ocean waves. 

I am a transgender woman from Sweden. I've been single for about 6 months now. 

My friend Dave started a new job at Google last month. He's working on their AI safety team.

The team at Acme Corp just shipped their v2.0 release. It includes better memory compression and faster retrieval.
`;

async function testDoublePassExtraction() {
  console.log('=== Testing Double-Pass GLM-5 Extraction via Local Ollama ===\n');
  console.log('Test content:');
  console.log(TEST_CONTENT);
  console.log('\n---\n');
  
  const startTime = Date.now();
  
  // Import the extraction module
  const { extractWithAI } = await import('./src/extraction.js');
  
  // Mock AI object for Cloudflare (we're using local Ollama)
  const mockAI = {} as any;
  
  const result = await extractWithAI(mockAI, TEST_CONTENT, '2023-05-07', {
    provider: 'ollama-local',
    model: 'glm-5:cloud'
  });
  
  const elapsed = Date.now() - startTime;
  
  console.log('=== RESULTS ===\n');
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
    console.log(`    Evidence: "${f.evidence}"`);
    if (f.validFrom) console.log(`    Valid from: ${f.validFrom}`);
    console.log(`    Confidence: ${f.confidence}`);
  });
  
  // Validate critical facts
  console.log('\n=== VALIDATION ===\n');
  
  const criticalFacts = [
    { subject: 'Caroline', predicate: 'identity', object: 'transgender woman' },
    { subject: 'Caroline', predicate: 'relationship_status', object: 'single' },
    { subject: 'Caroline', predicate: 'from', object: 'Sweden' },
    { subject: 'Melanie', predicate: 'has_hobby', objectContains: 'painting' },
    { subject: 'Dave', predicate: 'works_at', object: 'Google' }
  ];
  
  criticalFacts.forEach(expected => {
    const found = result.facts.some(f => {
      if (expected.objectContains) {
        return f.subject === expected.subject && 
               f.predicate === expected.predicate &&
               f.object.toLowerCase().includes(expected.objectContains.toLowerCase());
      }
      return f.subject === expected.subject && 
             f.predicate === expected.predicate &&
             f.object.toLowerCase() === expected.object.toLowerCase();
    });
    
    console.log(`${found ? '✓' : '✗'} ${expected.subject} ${expected.predicate} ${expected.objectContains || expected.object}`);
  });
}

testDoublePassExtraction().catch(console.error);