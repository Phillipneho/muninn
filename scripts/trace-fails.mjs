import fs from 'fs';

const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';
const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

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
const NICKNAME_MAP = { 'mel': 'Melanie', 'carol': 'Caroline' };

function extractEntity(question) {
  const q = question.toLowerCase();
  for (const entity of ALL_ENTITIES) {
    if (q.includes(entity.toLowerCase())) return entity;
  }
  for (const [nick, full] of Object.entries(NICKNAME_MAP)) {
    if (q.includes(nick)) return full;
  }
  return null;
}

// Get all predicates from PREDICATE_MAP
const PREDICATE_MAP = {
  'where': 'qa_from', 'move': 'qa_from', 'moved': 'qa_from',
  'when did': 'qa_temporal', 'when was': 'qa_temporal',
  'how long': 'qa_duration',
  'who is': 'qa_identity', 'identity': 'qa_identity',
  'who supports': 'qa_supports', 'supports': 'qa_supports',
  'charity': 'qa_charity',
  'workshop': 'workshop',
  'setback': 'qa_setback',
  'why': 'qa_reason', 'reason': 'qa_reason',
  'plan': 'qa_plans', 'plans': 'qa_plans'
};

function getPredicate(q) {
  const qLower = q.toLowerCase();
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (qLower.includes(keyword)) return predicate;
  }
  return 'qa_general';
}

const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

let failed = [];
for (const conv of locomo) {
  for (const qa of (conv.qa || [])) {
    if (qa.category !== 4) continue;
    
    const q = qa.question;
    const predicate = getPredicate(q);
    if (predicate === 'qa_general') {
      failed.push(q.substring(0, 80));
      if (failed.length >= 20) break;
    }
  }
  if (failed.length >= 20) break;
}

console.log('Relationship questions routing to qa_general:\n');
failed.forEach((q, i) => console.log(`${i+1}. ${q}...`));
