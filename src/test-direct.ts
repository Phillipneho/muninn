import { MuninnDatabase } from './database-sqlite.js';
import { Retriever } from './retrieval-sqlite.js';
import { existsSync, unlinkSync } from 'fs';

const dbPath = '/tmp/test-direct.db';
if (existsSync(dbPath)) unlinkSync(dbPath);

const db = new MuninnDatabase(dbPath);
const retriever = new Retriever(db);

async function test() {
  console.log('1. Creating entity...');
  const caroline = db.findOrCreateEntity('Caroline', 'person');
  const group = db.findOrCreateEntity('LGBTQ support group', 'org');
  console.log('Entities:', caroline.name, group.name);
  
  console.log('\n2. Creating fact...');
  const fact = db.createFact({
    subjectEntityId: caroline.id,
    predicate: 'went_to',
    objectValue: 'LGBTQ support group',
    valueType: 'string',
    confidence: 1,
    validFrom: new Date('2023-05-07')
  });
  console.log('Fact created:', fact.id);
  
  console.log('\n3. Direct getCurrentFacts...');
  const directFacts = db.getCurrentFacts('Caroline');
  console.log('Direct facts:', directFacts.length);
  if (directFacts.length > 0) {
    console.log('First fact:', directFacts[0]);
  }
  
  console.log('\n4. Using Retriever...');
  const result = await retriever.recall('What does Caroline attend?');
  console.log('Retriever result:', JSON.stringify(result, null, 2));
  
  console.log('\n5. Testing entity extraction...');
  const query = 'What does Caroline attend?';
  const capitalized = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  const questionWords = ['who', 'what', 'where', 'when', 'why', 'how', 'which', 'does', 'is', 'are', 'was', 'were', 'the', 'a', 'an', 'that', 'this', 'these', 'those'];
  const entities = capitalized.filter(word => !questionWords.includes(word.toLowerCase()));
  console.log('Extracted entities:', entities);
  
  console.log('\n6. Manually calling getCurrentFacts from retriever...');
  if (entities.length > 0) {
    const retrieverFacts = db.getCurrentFacts(entities[0]);
    console.log('Retriever facts:', retrieverFacts.length);
  }
  
  db.close();
}

test().catch(console.error);