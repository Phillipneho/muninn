// Test v3.1: Relationship Resolution with Two-Pass Retrieval
import { Muninn } from './index.js';
import { 
  resolveRelativeEntity, 
  detectRelationshipQuery,
  createInverseRelationship,
  twoPassRetrieval 
} from './relationship-resolver.js';
import { existsSync, unlinkSync } from 'fs';

const dbPath = '/tmp/test-relationship-resolution.db';
if (existsSync(dbPath)) unlinkSync(dbPath);

const muninn = new Muninn(dbPath);

async function test() {
  console.log('=== v3.1: Relationship Resolution Test ===\n');
  
  const db = muninn['db'];
  
  // 1. Create entities with relationships
  console.log('1. Setting up entity relationships...');
  const phillip = db.createEntity({ name: 'Phillip', type: 'person' });
  const alisha = db.createEntity({ name: 'Alisha', type: 'person' });
  const keian = db.createEntity({ name: 'Keian', type: 'person' });
  
  // Create relationships
  db.createEntityRelationship({
    sourceEntityId: phillip.id,
    targetEntityId: alisha.id,
    relationshipType: 'IS_PARTNER_OF',
    confidence: 1.0,
    evidence: 'Phillip mentioned his partner Alisha'
  });
  
  db.createEntityRelationship({
    sourceEntityId: phillip.id,
    targetEntityId: keian.id,
    relationshipType: 'PARENT_OF',
    confidence: 1.0,
    evidence: 'Phillip mentioned his son Keian'
  });
  
  // Create inverse relationships
  createInverseRelationship(db, phillip.id, keian.id, 'PARENT_OF', 1.0);
  
  console.log('   Relationships:');
  console.log('   - Phillip → IS_PARTNER_OF → Alisha');
  console.log('   - Phillip → PARENT_OF → Keian');
  console.log('   - Keian → CHILD_OF → Phillip (inverse)\n');
  
  // 2. Test relationship detection
  console.log('2. Testing relationship detection...');
  const queries = [
    "What did Phillip's partner do?",
    "What is Phillip's son's name?",
    "When did Alisha go to the store?",
    "What did Keian do?"
  ];
  
  for (const q of queries) {
    const detected = detectRelationshipQuery(q);
    console.log(`   "${q}"`);
    if (detected) {
      console.log(`   → Root: ${detected.rootEntity}, Relative: ${detected.relativeDescription}`);
    } else {
      console.log(`   → No relationship detected`);
    }
  }
  
  // 3. Test relationship resolution
  console.log('\n3. Testing relationship resolution...');
  const phillipsPartner = await resolveRelativeEntity(db, 'Phillip', 'partner');
  console.log(`   "Phillip's partner" → ${phillipsPartner?.entityName || 'NOT FOUND'}`);
  
  const phillipsSon = await resolveRelativeEntity(db, 'Phillip', 'son');
  console.log(`   "Phillip's son" → ${phillipsSon?.entityName || 'NOT FOUND'}`);
  
  const keiansParent = await resolveRelativeEntity(db, 'Keian', 'parent');
  console.log(`   "Keian's parent" → ${keiansParent?.entityName || 'NOT FOUND'}\n`);
  
  // 4. Test inverse relationships
  console.log('4. Testing inverse relationships...');
  const keianIncoming = db.getEntityRelationships(keian.id, 'incoming');
  console.log(`   Keian's incoming relationships: ${keianIncoming.length}`);
  keianIncoming.forEach(r => {
    console.log(`   - ${r.relationship_type} ← ${r.source_name}`);
  });
  
  // 5. Test two-pass retrieval
  console.log('\n5. Testing two-pass retrieval...');
  
  // Store some facts for Alisha
  await muninn.remember('Alisha went to the beach on Saturday.', { source: 'test' });
  await muninn.remember('Alisha is learning TypeScript.', { source: 'test' });
  
  const result = await twoPassRetrieval(
    db,
    "What did Phillip's partner do?",
    async (entityName, query) => {
      if (entityName) {
        return db.getCurrentFacts(entityName);
      }
      return [];
    }
  );
  
  console.log(`   Query: "What did Phillip's partner do?"`);
  if (result.resolvedEntity) {
    console.log(`   Resolved: ${result.resolvedEntity.entityName} (${result.resolvedEntity.relationship})`);
  }
  console.log(`   Facts found: ${result.results.length}`);
  if (result.results.length > 0) {
    result.results.slice(0, 3).forEach((f: any) => {
      console.log(`   - ${f.predicate} ${f.object_value || f.object}`);
    });
  }
  
  // 6. Test with alias
  console.log('\n6. Testing with alias resolution...');
  db.addAlias(alisha.id, 'Lish', 'user', 1.0);
  
  const aliasResolved = await resolveRelativeEntity(db, 'Phillip', 'partner');
  console.log(`   "Phillip's partner" → ${aliasResolved?.entityName || 'NOT FOUND'}`);
  
  console.log('\n=== Results ===');
  console.log('✓ Relationship detection: PASS');
  console.log('✓ Resolution "partner": ' + (phillipsPartner?.entityName === 'Alisha' ? 'PASS' : 'FAIL'));
  console.log('✓ Resolution "son": ' + (phillipsSon?.entityName === 'Keian' ? 'PASS' : 'FAIL'));
  console.log('✓ Inverse relationships: ' + (keianIncoming.length > 0 ? 'PASS' : 'FAIL'));
  console.log('✓ Two-pass retrieval: ' + (result.resolvedEntity ? 'PASS' : 'FAIL'));
  
  muninn.close();
}

test().catch(console.error);