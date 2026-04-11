import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

// Get all relationship questions
const relQuestions = locomo
  .flatMap(c => (c.qa || []).map(qa => ({ ...qa, sample_id: c.sample_id })))
  .filter(qa => qa.category === 4);

console.log(`=== ${relQuestions.length} Relationship Questions ===\n`);

// Sample 20 failing questions to analyze
const ENTITY_MAP = {
  'conv-26': ['Caroline', 'Melanie'],
  'conv-30': ['Gina', 'Jon'],
  'conv-41': ['John', 'Maria'],
  'conv-42': ['Joanna', 'Nate'],
  'conv-43': ['John', 'Tim'],
  'conv-44': ['Andrew', 'Audrey'],
  'conv-47': ['James', 'John'],
  'conv-48': ['Deborah', 'Jolene'],
  'conv-49': ['Evan', 'Sam'],
  'conv-50': ['Calvin', 'Dave']
};

const ALL_ENTITIES = [...new Set(Object.values(ENTITY_MAP).flat())];

const NICKNAME_MAP = {
  'mel': 'Melanie', 'carol': 'Caroline', 'caro': 'Caroline',
  'gin': 'Gina', 'jo': 'John', 'mar': 'Maria',
  'deb': 'Deborah', 'joe': 'Jolene', 'ev': 'Evan',
  'cal': 'Calvin', 'dave': 'Dave'
};

function extractEntity(q) {
  const lower = q.toLowerCase();
  for (const entity of ALL_ENTITIES) {
    if (lower.includes(entity.toLowerCase())) return entity;
    if (lower.includes(entity.toLowerCase() + "'s")) return entity;
    if (lower.includes(entity.toLowerCase() + "'")) return entity;
  }
  for (const [nick, full] of Object.entries(NICKNAME_MAP)) {
    if (lower.includes(nick)) return full;
  }
  return null;
}

// Check entity extraction
let noEntity = 0;
let withEntity = 0;
const entityCounts = {};

for (const qa of relQuestions) {
  const entity = extractEntity(qa.question);
  if (!entity) {
    noEntity++;
    if (noEntity <= 5) {
      console.log(`NO ENTITY: "${qa.question.substring(0, 60)}..."`);
    }
  } else {
    withEntity++;
    entityCounts[entity] = (entityCounts[entity] || 0) + 1;
  }
}

console.log(`\n=== Entity Extraction Stats ===`);
console.log(`With entity: ${withEntity}/${relQuestions.length}`);
console.log(`No entity: ${noEntity}/${relQuestions.length}`);
console.log(`\nEntity distribution:`);
Object.entries(entityCounts).sort((a, b) => b[1] - a[1]).forEach(([e, c]) => {
  console.log(`  ${e}: ${c}`);
});
