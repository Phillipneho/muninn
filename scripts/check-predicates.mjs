const PREDICATE_MAP = {
  // Temporal
  'when did': 'qa_temporal', 'when was': 'qa_temporal', 'what year': 'qa_temporal',
  'what date': 'qa_temporal', 'when is': 'qa_temporal',
  'how long': 'qa_duration', 'how many years': 'qa_duration',
  
  // People
  'who did': 'qa_person', 'who was': 'qa_person', 'whose birthday': 'qa_person',
  'who supports': 'qa_supports', 'supports': 'qa_supports', 'supported by': 'qa_supports',
  
  // Identity/Traits
  'identity': 'qa_identity', 'gender': 'qa_identity',
  'personality traits': 'qa_traits', 'traits': 'qa_traits', 'trait': 'qa_traits',
  
  // Family
  'how many child': 'qa_children', 'how many kid': 'qa_children',
  'children': 'qa_children', 'child': 'qa_children', 'kid': 'qa_children',
  'married': 'qa_marriage', 'husband': 'qa_husband', 'wife': 'qa_wife',
  'partner': 'qa_partner', 'spouse': 'qa_partner',
  'friend': 'qa_friends', 'friends': 'qa_friends',
  'family': 'qa_family', 'grandma': 'qa_family', 'grandmother': 'qa_family',
  
  // Gifts
  'gift': 'qa_gift', 'present': 'qa_gift',
  
  // Inspiration/Motivation
  'inspired': 'qa_inspiration', 'inspiration': 'qa_inspiration',
  'motivated': 'qa_motivation', 'motivation': 'qa_motivation',
  
  // Feelings/Reactions
  'how did': 'qa_feeling', 'how does': 'qa_feeling',
  'felt after': 'qa_feeling', 'feel after': 'qa_feeling',
  'reaction': 'qa_reaction', 'react': 'qa_reaction',
  
  // Likes/Favorites
  'favorite': 'qa_likes', 'favorite book': 'qa_books',
  'favorite song': 'qa_music', 'favorite movie': 'qa_movies',
  'like': 'qa_likes', 'love': 'qa_likes', 'enjoy': 'qa_likes',
  
  // Activities/Hobbies
  'hobby': 'qa_hobby', 'hobbies': 'qa_hobby',
  'activity': 'qa_activities', 'activities': 'qa_activities',
  
  // Symbols/Meaning
  'symbolize': 'qa_symbol', 'symbol': 'qa_symbol', 'meaning': 'qa_symbol',
  'reminder': 'qa_reminder', 'reminds': 'qa_reminder',
  
  // Advice
  'advice': 'qa_advice', 'recommend': 'qa_advice',
  
  // Events
  'event': 'qa_event', 'events': 'qa_event',
  'workshop': 'qa_workshop',
  'charity': 'qa_charity',
  
  // Setbacks
  'setback': 'qa_setback', 'accident': 'qa_setback',
  
  // Work/Research
  'research': 'qa_research', 'studied': 'qa_research',
  'cause': 'qa_cause',
  
  // General
  'what did': 'qa_what', 'what was': 'qa_what', 'what is': 'qa_what',
  'what kind': 'qa_what', 'what type': 'qa_what',
  'why': 'qa_reason', 'reason': 'qa_reason',
  'how many': 'qa_count'
};

function getPredicate(q) {
  const lower = q.toLowerCase();
  for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
    if (lower.includes(keyword)) return predicate;
  }
  return 'qa_general';
}

const questions = [
  "What did the charity race raise awareness for?",
  "What did Melanie realize after the charity race?",
  "How does Melanie prioritize self-care?",
  "What are Caroline's plans for the summer?",
  "How long have Mel and her husband been married?",
  "What does Caroline's necklace symbolize?",
  "What is Caroline's relationship status?",
  "Who supports Caroline?",
  "How many children does Melanie have?"
];

console.log('=== Predicate Mapping ===\n');
for (const q of questions) {
  console.log(`Q: ${q}`);
  console.log(`Predicate: ${getPredicate(q)}`);
  console.log('');
}
