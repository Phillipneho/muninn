const PREDICATE_MAP = {
  'where': 'from', 'move': 'from', 'moved': 'from', 'location': 'from',
  'when did': 'qa_temporal', 'when was': 'qa_temporal', 'what year': 'qa_temporal', 'what date': 'qa_temporal', 'when is': 'qa_temporal',
  'how long': 'qa_duration', 'how many years': 'qa_duration', 'how long ago': 'qa_duration',
  'what time': 'qa_temporal', 'what day': 'qa_temporal', 'what month': 'qa_temporal',
  'who is': 'identifies_as', 'who was': 'identifies_as', 'who did': 'identifies_as',
  'what kind of person': 'qa_traits', 'personality traits': 'qa_traits', 'personality': 'qa_traits', 'traits': 'qa_traits',
  'who supports': 'supports', 'supports': 'supports', 'supported by': 'supports',
  'how many children': 'children', 'how many child': 'qa_children', 'children': 'qa_children',
  'married': 'marriage', 'husband': 'husband', 'wife': 'qa_wife',
  'friend': 'qa_friends', 'friends': 'qa_friends',
  'family': 'qa_family', 'grandma': 'qa_family', 'grandmother': 'qa_family',
  'status': 'qa_status', 'single': 'qa_status', 'relationship status': 'qa_status',
  'gift': 'qa_gift', 'present': 'qa_gift', 'gave': 'qa_gift',
  'symbol': 'qa_symbol', 'symbolize': 'qa_symbol', 'meaning': 'qa_symbol',
  'activities': 'qa_activities', 'what do': 'qa_activities', 'like to do': 'qa_activities',
  'like': 'qa_likes', 'prefer': 'qa_likes', 'enjoy': 'qa_likes', 'favorite': 'qa_likes',
  'book': 'qa_books', 'read': 'qa_books', 'reading': 'qa_books', 'library': 'qa_books',
  'music': 'qa_music', 'listen': 'qa_music', 'song': 'qa_music',
  'movie': 'qa_movies', 'film': 'qa_movies', 'watch': 'qa_movies',
  'paint': 'qa_art', 'art': 'qa_art', 'painted': 'qa_art', 'bowl': 'qa_art',
  'pet': 'qa_pets', 'pets': 'qa_pets', 'dog': 'qa_pets', 'cat': 'qa_pets',
  'travel': 'qa_travel', 'trip': 'qa_travel', 'camping': 'qa_travel',
  'food': 'qa_food', 'eat': 'qa_food', 'restaurant': 'qa_food',
  'shoes': 'qa_items', 'bought': 'qa_items',
  'destress': 'qa_selfcare', 'stress': 'qa_selfcare', 'relax': 'qa_selfcare',
  'realize': 'qa_realization', 'realization': 'qa_realization',
  'feel about': 'qa_opinion', 'think about': 'qa_opinion',
  'felt after': 'qa_feeling', 'feel after': 'qa_feeling', 'how did': 'qa_feeling', 'how does': 'qa_feeling',
  'reaction': 'reaction', 'react': 'reaction',
  'excited': 'qa_excitement', 'looking forward': 'qa_excitement',
  'motivated': 'qa_motivation', 'motivation': 'qa_motivation', 'pursue': 'qa_motivation',
  'plan': 'qa_plans', 'plans': 'qa_plans', 'planning': 'qa_plans',
  'counseling': 'qa_counseling', 'mental health': 'qa_counseling',
  'why': 'qa_reason', 'reason': 'qa_reason',
  'awareness': 'charity', 'raise awareness': 'charity', 'charity': 'charity',
  'workshop': 'workshop',
  'how many': 'qa_count',
  'what did': 'qa_what', 'what was': 'qa_what', 'what is': 'qa_what', 'what type': 'qa_what',
  'what kind': 'qa_what', 'what are': 'qa_what',
  'what country': 'qa_location',
  'inspiration': 'qa_inspiration', 'inspired': 'qa_inspiration',
  'reminder': 'reminder', 'reminds': 'reminder'
};

function getPredicate(question) {
  const q = question.toLowerCase();
  
  // Special routing
  if (q.includes('how long have') && q.includes('married')) return 'marriage';
  if (q.includes('raise awareness')) return 'charity';
  if (q.includes('how did') && q.includes('feel')) return 'qa_feeling';
  
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (q.includes(keyword)) return predicate;
  }
  return 'qa_general';
}

const questions = [
  'What did the charity race raise awareness for?',
  'What book did Caroline recommend to Melanie?',
  'What are Melanie plans for the summer?',
  'What kind of books does Caroline have in her library?',
  'What country is Caroline grandma from?',
  'What was grandma gift to Caroline?',
  'How long have Mel and her husband been married?',
  'What does Caroline necklace symbolize?'
];

for (const q of questions) {
  const pred = getPredicate(q);
  console.log(`Q: ${q}`);
  console.log(`  → ${pred}\n`);
}
