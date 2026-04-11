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

let count = 0;
for (const conv of data) {
  for (const qa of (conv.qa || [])) {
    if (qa.category === 4 && getPredicate(qa.question) === 'qa_general') {
      console.log(`${qa.question}`);
      count++;
      if (count >= 30) break;
    }
  }
  if (count >= 30) break;
}
