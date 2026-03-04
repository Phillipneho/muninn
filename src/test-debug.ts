import { Muninn } from './index.js';
import { existsSync, unlinkSync } from 'fs';

const dbPath = '/tmp/test-store-retrieve.db';
if (existsSync(dbPath)) unlinkSync(dbPath);

const muninn = new Muninn(dbPath);

async function test() {
  console.log('1. Storing a fact...');
  await muninn.remember('Caroline went to the LGBTQ support group on May 7, 2023.', {
    source: 'test',
    sessionDate: '2023-05-08'
  });
  
  console.log('\n2. Testing entity extraction from query...');
  const query = 'What does Caroline attend?';
  
  // Check what extractEntitiesSimple returns
  const capitalized = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  console.log('Capitalized words:', capitalized);
  
  const questionWords = ['who', 'what', 'where', 'when', 'why', 'how', 'which', 'does', 'is', 'are', 'was', 'were', 'the', 'a', 'an', 'that', 'this', 'these', 'those'];
  const filtered = capitalized.filter(word => !questionWords.includes(word.toLowerCase()));
  console.log('After filtering:', filtered);
  
  console.log('\n3. Direct getCurrentFacts for Caroline...');
  const facts = muninn['db'].getCurrentFacts('Caroline');
  console.log('Direct facts:', facts.length > 0 ? 'FOUND' : 'NOT FOUND');
  
  console.log('\n4. Using recall...');
  const result = await muninn.recall(query);
  console.log('Recall source:', result.source);
  console.log('Recall result:', JSON.stringify(result, null, 2));
  
  muninn.close();
}

test().catch(console.error);