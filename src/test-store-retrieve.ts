import { Muninn } from './index.js';
import { existsSync, unlinkSync } from 'fs';

const dbPath = '/tmp/test-store-retrieve.db';
if (existsSync(dbPath)) unlinkSync(dbPath);

const muninn = new Muninn(dbPath);

async function test() {
  console.log('1. Storing a fact...');
  const result = await muninn.remember('Caroline went to the LGBTQ support group on May 7, 2023.', {
    source: 'test',
    sessionDate: '2023-05-08'
  });
  console.log('Remember result:', result);
  
  console.log('\n2. Checking database stats...');
  const stats = muninn['db'].getStats();
  console.log('Stats:', stats);
  
  console.log('\n3. Querying entities...');
  const entities = muninn['db']['db'].prepare('SELECT * FROM entities').all();
  console.log('Entities:', entities);
  
  console.log('\n4. Querying facts...');
  const facts = muninn['db']['db'].prepare(`
    SELECT f.id, e.name as subject, f.predicate, f.object_value, f.valid_from
    FROM facts f
    JOIN entities e ON f.subject_entity_id = e.id
  `).all();
  console.log('Facts:', facts);
  
  console.log('\n5. Retrieving with recall...');
  const recallResult = await muninn.recall('What does Caroline attend?');
  console.log('Recall result:', recallResult);
  
  console.log('\n6. Direct getCurrentFacts for Caroline...');
  const carolineFacts = muninn['db'].getCurrentFacts('Caroline');
  console.log('Caroline facts:', carolineFacts);
  
  muninn.close();
}

test().catch(console.error);