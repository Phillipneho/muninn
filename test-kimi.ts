/**
 * Test extraction with Kimi K2.5 (default model)
 */

const TEST_CONTENT = `
Caroline went to an LGBTQ support group yesterday. She mentioned that Melanie has been painting a lot lately - her new series is about ocean waves. 

I am a transgender woman from Sweden. I've been single for about 6 months now. 

My friend Dave started a new job at Google last month. He's working on their AI safety team.
`;

async function test() {
  console.log('=== Testing with kimi-k2.5:cloud (default) ===\n');
  
  const { extractWithAI } = await import('./src/extraction.js');
  
  const result = await extractWithAI({}, TEST_CONTENT, '2023-05-07', {
    provider: 'ollama-local',
    model: 'kimi-k2.5:cloud'
  });
  
  console.log('Speaker:', result.speaker);
  console.log('Entities:', result.entities.length);
  console.log('Facts:', result.facts.length);
  console.log('Latency:', result.latency, 'ms');
  
  console.log('\nEntities:');
  result.entities.forEach(e => console.log(`  ${e.name} (${e.type})`));
  
  console.log('\nFacts:');
  result.facts.forEach(f => console.log(`  ${f.subject} | ${f.predicate} | ${f.object}`));
  
  // Validation
  console.log('\n=== VALIDATION ===');
  const criticalFacts = [
    { subject: 'Caroline', predicate: 'identity', objectContains: 'transgender' },
    { subject: 'Caroline', predicate: 'relationship_status', objectContains: 'single' },
    { subject: 'Caroline', predicate: 'from', object: 'Sweden' },
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

test().catch(console.error);