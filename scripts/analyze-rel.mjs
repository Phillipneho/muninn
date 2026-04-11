import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const data = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

const PREDICATE_MAP = {
  'who supports': 'qa_supports', 'supports': 'qa_supports', 'supported by': 'qa_supports',
  'how many child': 'qa_children', 'children': 'qa_children', 'child': 'qa_children',
  'married': 'qa_marriage', 'husband': 'qa_husband', 'wife': 'qa_wife',
  'friend': 'qa_friends', 'friends': 'qa_friends',
  'family': 'qa_family', 'grandma': 'qa_family', 'grandmother': 'qa_family',
  'charity': 'qa_charity', 'raise awareness': 'qa_charity',
  'book': 'qa_books', 'recommend': 'qa_books',
  'gift': 'qa_gift', 'present': 'qa_gift',
  'symbol': 'qa_symbol', 'symbolize': 'qa_symbol',
  'reminder': 'qa_reminder', 'reminds': 'qa_reminder',
  'how many': 'qa_count',
  'what did': 'qa_what', 'what is': 'qa_what', 'what was': 'qa_what',
  'what kind': 'qa_what', 'what type': 'qa_what'
};

function getPredicate(q) {
  const qLower = q.toLowerCase();
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (qLower.includes(keyword)) return predicate;
  }
  return 'qa_general';
}

const relQuestions = [];
for (const conv of data) {
  for (const qa of (conv.qa || [])) {
    if (qa.category === 4) {
      relQuestions.push({ q: qa.question, predicate: getPredicate(qa.question) });
    }
  }
}

// Group by predicate
const byPredicate = {};
for (const item of relQuestions) {
  byPredicate[item.predicate] = (byPredicate[item.predicate] || 0) + 1;
}

console.log('Relationship questions by predicate routing:');
for (const [pred, count] of Object.entries(byPredicate).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pred}: ${count}`);
}

console.log(`\nTotal: ${relQuestions.length}`);
