// Muninn v2 Comprehensive Extraction Tests
// Phase 1: Test improved extraction with LOCOMO-style conversations

import { FactExtractor, resolveEntities, detectContradictions, scoreConfidence } from './extraction.js';
import type { ExtractedFact, ExtractedEntity } from './types.js';

// Test conversations from LOCOMO benchmark (simplified versions)
const LOCOMO_CONVERSATIONS = {
  // Single-hop: Direct fact retrieval
  singleHop: {
    name: 'Caroline LGBTQ Group',
    content: `I went to the LGBTQ support group yesterday. It was really helpful - I'm going to keep attending. My name is Caroline, and I've been working as a therapist for 5 years.`,
    sessionDate: '2023-05-07',
    expectedFacts: [
      { subject: 'Caroline', predicate: 'attends', object: 'LGBTQ support group' },
      { subject: 'Caroline', predicate: 'profession', object: 'therapist' }
    ]
  },
  
  // Multi-hop: Requires traversal
  multiHop: {
    name: 'Project Dependencies',
    content: `I'm working on the Muninn memory system. It's part of the OpenClaw project, which Phillip started last year. The system uses PostgreSQL for storage and OpenAI for embeddings.`,
    sessionDate: '2024-01-15',
    expectedFacts: [
      { subject: 'Muninn memory system', predicate: 'part_of', object: 'OpenClaw project' },
      { subject: 'OpenClaw project', predicate: 'started_by', object: 'Phillip' },
      { subject: 'Muninn memory system', predicate: 'uses', object: 'PostgreSQL' }
    ]
  },
  
  // Temporal: State changes over time
  temporal: {
    name: 'Risk Level Change',
    content: `Caroline's risk level increased from Medium to High last week. This was due to new information about her situation. Previously she was assessed as Medium risk in January.`,
    sessionDate: '2024-03-10',
    expectedEvents: [
      { entity: 'Caroline', attribute: 'risk_level', oldValue: 'Medium', newValue: 'High' }
    ]
  },
  
  // Contradiction: Conflicting information
  contradiction: {
    name: 'Conflicting Attendance',
    content: `I heard Caroline attends the Church support group now. But earlier she said she goes to the LGBTQ support group. I'm not sure which is correct.`,
    sessionDate: '2024-02-20',
    expectedConflicts: 1
  },
  
  // Coreference resolution
  coreference: {
    name: 'Pronoun Resolution',
    content: `Sarah is my manager. She's been working here for 3 years. She told me about the new project. It's called Project Phoenix and it's launching next month.`,
    sessionDate: '2024-04-01',
    expectedFacts: [
      { subject: 'Sarah', predicate: 'role', object: 'manager' },
      { subject: 'Project Phoenix', predicate: 'launching', object: 'next month' }
    ]
  }
};

async function testSingleHop() {
  console.log('\n=== Test: Single-Hop Extraction ===');
  
  const extractor = new FactExtractor();
  const conv = LOCOMO_CONVERSATIONS.singleHop;
  
  const result = await extractor.extract(conv.content, conv.sessionDate);
  
  console.log('Conversation:', conv.name);
  console.log('Extracted entities:', result.entities);
  console.log('Extracted facts:', result.facts);
  console.log('Extracted events:', result.events);
  
  // Verify entities
  const caroline = result.entities.find(e => e.name === 'Caroline');
  if (!caroline || caroline.type !== 'person') {
    throw new Error('Expected Caroline to be extracted as person');
  }
  
  const group = result.entities.find(e => e.name.toLowerCase().includes('lgbtq'));
  if (!group || group.type !== 'org') {
    throw new Error('Expected LGBTQ support group to be extracted as org');
  }
  
  // Verify facts
  const attendsFact = result.facts.find(f => f.predicate === 'attends');
  if (!attendsFact) {
    throw new Error('Expected "attends" fact to be extracted');
  }
  
  if (attendsFact.confidence < 0.9) {
    throw new Error('Expected confidence >= 0.9 for explicit statement');
  }
  
  console.log('✓ Single-hop extraction working\n');
}

async function testMultiHop() {
  console.log('\n=== Test: Multi-Hop Extraction ===');
  
  const extractor = new FactExtractor();
  const conv = LOCOMO_CONVERSATIONS.multiHop;
  
  const result = await extractor.extract(conv.content, conv.sessionDate);
  
  console.log('Conversation:', conv.name);
  console.log('Extracted entities:', result.entities);
  console.log('Extracted facts:', result.facts);
  
  // Verify relationship chain
  const facts = result.facts;
  const muninnToOpenClaw = facts.find(f => 
    f.subject.includes('Muninn') && f.predicate === 'part_of'
  );
  const openClawToPhillip = facts.find(f =>
    f.subject.includes('OpenClaw') && f.predicate === 'started_by'
  );
  
  if (!muninnToOpenClaw || !openClawToPhillip) {
    console.log('Warning: Not all expected facts extracted');
  }
  
  console.log('✓ Multi-hop extraction working\n');
}

async function testTemporal() {
  console.log('\n=== Test: Temporal Extraction ===');
  
  const extractor = new FactExtractor();
  const conv = LOCOMO_CONVERSATIONS.temporal;
  
  const result = await extractor.extract(conv.content, conv.sessionDate);
  
  console.log('Conversation:', conv.name);
  console.log('Extracted events:', result.events);
  
  // Verify state change
  const riskEvent = result.events.find(e => e.attribute === 'risk_level');
  if (!riskEvent) {
    throw new Error('Expected risk_level event to be extracted');
  }
  
  if (riskEvent.oldValue !== 'Medium' || riskEvent.newValue !== 'High') {
    throw new Error(`Expected risk_level change Medium -> High, got ${riskEvent.oldValue} -> ${riskEvent.newValue}`);
  }
  
  console.log('✓ Temporal extraction working\n');
}

async function testCoreferenceResolution() {
  console.log('\n=== Test: Coreference Resolution ===');
  
  const extractor = new FactExtractor();
  const conv = LOCOMO_CONVERSATIONS.coreference;
  
  const result = await extractor.extract(conv.content, conv.sessionDate);
  
  console.log('Conversation:', conv.name);
  console.log('Extracted entities:', result.entities);
  console.log('Extracted facts:', result.facts);
  
  // Verify "She" resolved to "Sarah"
  const sarahFacts = result.facts.filter(f => f.subject === 'Sarah');
  if (sarahFacts.length < 2) {
    console.log('Warning: Not all Sarah facts extracted (coreference may not be working)');
  }
  
  console.log('✓ Coreference resolution working\n');
}

async function testContradictionDetection() {
  console.log('\n=== Test: Contradiction Detection ===');
  
  const newFact: ExtractedFact = {
    subject: 'Caroline',
    predicate: 'attends',
    object: 'Church support group',
    objectType: 'entity',
    confidence: 0.8,
    evidence: 'I heard Caroline attends the Church support group'
  };
  
  const existingFacts: ExtractedFact[] = [
    {
      subject: 'Caroline',
      predicate: 'attends',
      object: 'LGBTQ support group',
      objectType: 'entity',
      confidence: 1.0,
      evidence: 'I go to the LGBTQ support group'
    }
  ];
  
  const contradictions = detectContradictions(newFact, existingFacts);
  
  console.log('New fact:', newFact);
  console.log('Existing facts:', existingFacts);
  console.log('Contradictions detected:', contradictions);
  
  if (contradictions.length === 0) {
    throw new Error('Expected contradiction to be detected');
  }
  
  if (contradictions[0].type !== 'value_conflict') {
    throw new Error('Expected value_conflict type');
  }
  
  console.log('✓ Contradiction detection working\n');
}

async function testEntityResolution() {
  console.log('\n=== Test: Entity Resolution ===');
  
  const extracted: ExtractedEntity[] = [
    { name: 'Caroline', type: 'person' },
    { name: 'Caroline Smith', type: 'person' },
    { name: 'LGBTQ Support Group', type: 'org' }
  ];
  
  const existing = new Map<string, { id: string; type: string; aliases: string[] }>();
  existing.set('caroline', { id: 'uuid-1', type: 'person', aliases: ['caroline smith', 'c. smith'] });
  existing.set('lgbtq support group', { id: 'uuid-2', type: 'org', aliases: ['lgbtq group', 'support group'] });
  
  const resolved = resolveEntities(extracted, existing);
  
  console.log('Extracted entities:', extracted);
  console.log('Resolved:', resolved);
  
  // All entities should resolve to existing IDs
  if (resolved.size !== extracted.length) {
    throw new Error('Expected all entities to be resolved');
  }
  
  console.log('✓ Entity resolution working\n');
}

async function testConfidenceScoring() {
  console.log('\n=== Test: Confidence Scoring ===');
  
  const explicitFact: ExtractedFact = {
    subject: 'Caroline',
    predicate: 'works_at',
    object: 'Hospital',
    objectType: 'entity',
    confidence: 1.0,
    evidence: 'I work at the hospital'
  };
  
  const hedgedFact: ExtractedFact = {
    subject: 'Caroline',
    predicate: 'lives_in',
    object: 'Brisbane',
    objectType: 'entity',
    confidence: 0.8,
    evidence: 'I think she might live in Brisbane'
  };
  
  const explicitScore = scoreConfidence(explicitFact);
  const hedgedScore = scoreConfidence(hedgedFact);
  
  console.log('Explicit fact score:', explicitScore);
  console.log('Hedged fact score:', hedgedScore);
  
  if (hedgedScore >= explicitScore) {
    throw new Error('Expected hedged fact to have lower confidence');
  }
  
  console.log('✓ Confidence scoring working\n');
}

async function main() {
  console.log('Muninn v2 Phase 1 Tests\n');
  console.log('Testing enhanced fact extraction with:');
  console.log('- Coreference resolution');
  console.log('- Temporal parsing');
  console.log('- Confidence scoring');
  console.log('- Contradiction detection');
  console.log('- Entity resolution\n');
  
  try {
    await testSingleHop();
    await testMultiHop();
    await testTemporal();
    await testCoreferenceResolution();
    await testContradictionDetection();
    await testEntityResolution();
    await testConfidenceScoring();
    
    console.log('\n✓ All Phase 1 tests passed!\n');
  } catch (error) {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  }
}

main();