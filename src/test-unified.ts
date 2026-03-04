// Test Unified Observations
// Validates the new schema captures Identity, Trait, Activity, and State

import { Muninn } from './index-unified.js';
import { existsSync, unlinkSync } from 'fs';

const dbPath = '/tmp/test-unified-observations.db';
if (existsSync(dbPath)) unlinkSync(dbPath);

const muninn = new Muninn(dbPath);

async function test() {
  console.log('=== Unified Observations Test ===\n');
  
  // Test session with multiple types of observations
  console.log('1. Ingesting session with Identity, Trait, Activity, State...');
  
  const result = await muninn.remember(
    `Caroline: I am a transgender woman. I've known for 10 years now.
Melanie: That's wonderful, Caroline. I paint sunrises - been doing it for years. I'm married with two kids.
Caroline: I went to the LGBTQ support group on May 7. It was really empowering.
Melanie: I ran a charity race last Sunday - the one before May 25. It was for mental health awareness.
Caroline: I'm researching adoption agencies right now. I want to give kids a loving home.
Melanie: I'm planning to go camping in June with my family.`,
    { source: 'test', sessionDate: '2023-05-08' }
  );
  
  console.log(`   Observations created: ${result.observationsCreated}`);
  console.log(`   Entities created: ${result.entitiesCreated}\n`);
  
  // Check stats
  const stats = muninn.getStats();
  console.log(`   Database stats: ${stats.entityCount} entities, ${stats.observationCount} observations\n`);
  
  // Test queries
  console.log('2. Testing weighted retrieval...\n');
  
  // Query 1: Identity (should have highest weight)
  console.log('Query: "What is Caroline\'s identity?"');
  const identityResult = await muninn.recall("What is Caroline's identity?");
  console.log(`   Source: ${identityResult.source}`);
  if (identityResult.facts) {
    identityResult.facts.slice(0, 3).forEach((f: any) => {
      const weight = f.weight || 1;
      const tags = f.tags || [];
      console.log(`   [${tags.join(',')}] (weight: ${weight.toFixed(1)}) ${f.predicate}: ${f.object}`);
    });
  }
  
  // Query 2: Trait
  console.log('\nQuery: "What does Melanie paint?"');
  const traitResult = await muninn.recall("What does Melanie paint?");
  console.log(`   Source: ${traitResult.source}`);
  if (traitResult.facts) {
    traitResult.facts.slice(0, 3).forEach((f: any) => {
      const tags = f.tags || [];
      console.log(`   [${tags.join(',')}] ${f.predicate}: ${f.object}`);
    });
  }
  
  // Query 3: Activity (temporal)
  console.log('\nQuery: "When did Caroline go to the support group?"');
  const activityResult = await muninn.recall("When did Caroline go to the support group?");
  console.log(`   Source: ${activityResult.source}`);
  if (activityResult.facts) {
    activityResult.facts.slice(0, 3).forEach((f: any) => {
      const tags = f.tags || [];
      const date = f.validFrom ? ` (${f.validFrom})` : '';
      console.log(`   [${tags.join(',')}] ${f.predicate}: ${f.object}${date}`);
    });
  }
  
  // Query 4: State (current)
  console.log('\nQuery: "What is Caroline researching?"');
  const stateResult = await muninn.recall("What is Caroline researching?");
  console.log(`   Source: ${stateResult.source}`);
  if (stateResult.facts) {
    stateResult.facts.slice(0, 3).forEach((f: any) => {
      const tags = f.tags || [];
      console.log(`   [${tags.join(',')}] ${f.predicate}: ${f.object}`);
    });
  }
  
  // Tag-specific queries
  console.log('\n3. Testing tag-specific queries...\n');
  
  console.log('Query: Get all IDENTITY observations for Caroline');
  const identityObs = await muninn.getObservationsByTag('Caroline', 'IDENTITY');
  console.log(`   Found ${identityObs.facts?.length || 0} identity observations`);
  if (identityObs.facts) {
    identityObs.facts.forEach((f: any) => {
      console.log(`   - ${f.predicate}: ${f.object}`);
    });
  }
  
  console.log('\nQuery: Get all TRAIT observations for Melanie');
  const traitObs = await muninn.getObservationsByTag('Melanie', 'TRAIT');
  console.log(`   Found ${traitObs.facts?.length || 0} trait observations`);
  if (traitObs.facts) {
    traitObs.facts.forEach((f: any) => {
      console.log(`   - ${f.predicate}: ${f.object}`);
    });
  }
  
  console.log('\nQuery: Get all ACTIVITY observations for Caroline');
  const activityObs = await muninn.getObservationsByTag('Caroline', 'ACTIVITY');
  console.log(`   Found ${activityObs.facts?.length || 0} activity observations`);
  if (activityObs.facts) {
    activityObs.facts.forEach((f: any) => {
      const date = f.validFrom ? ` (${f.validFrom})` : '';
      console.log(`   - ${f.predicate}: ${f.object}${date}`);
    });
  }
  
  console.log('\n=== Test Complete ===');
  
  // Show weight calculation
  console.log('\nWeight Summary:');
  console.log('  IDENTITY: 10.0x (permanent, core to who someone is)');
  console.log('  STATE: 5.0x (current, changeable values)');
  console.log('  TRAIT: 3.0x (stable habits and preferences)');
  console.log('  ACTIVITY: 1.0x (one-off events)');
  
  muninn.close();
}

test().catch(console.error);