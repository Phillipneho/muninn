const PREDICATE_MAP = {
  'when did': 'qa_temporal', 'when was': 'qa_temporal',
  'how long': 'qa_duration',
  'who supports': 'qa_supports', 'whose birthday': 'qa_person',
  'personality': 'qa_traits', 'trait': 'qa_traits',
  'gift': 'qa_gift', 'present': 'qa_gift',
  'inspired': 'qa_inspiration', 'motivated': 'qa_motivation',
  'how did': 'qa_feeling', 'feel': 'qa_feeling',
  'children': 'qa_children', 'child': 'qa_children', 'kid': 'qa_children',
  'reaction': 'qa_reaction', 'how did': 'qa_reaction'
};

function getPredicate(question) {
  const q = question.toLowerCase();
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (q.includes(keyword)) return predicate;
  }
  return 'qa_general';
}

const tests = [
  'Who supports Caroline when she has a negative experience?',
  'What personality traits might Melanie say Caroline has?',
  'What was grandma\'s gift to Caroline?',
  'What inspired Caroline\'s painting for the art show?',
  'How many children does Melanie have?',
  'How did Melanie feel while watching the meteor shower?',
  'What was Melanie\'s reaction to her children enjoying the Grand Canyon?'
];

console.log('Predicate routing:\n');
for (const q of tests) {
  const pred = getPredicate(q);
  console.log(`${pred.padEnd(15)} ← ${q.substring(0, 50)}...`);
}
