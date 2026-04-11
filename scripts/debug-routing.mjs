const PREDICATE_MAP = {
  // Temporal
  'when did': 'qa_temporal', 'when was': 'qa_temporal', 'what year': 'qa_temporal', 'what date': 'qa_temporal', 'when is': 'qa_temporal',
  'how long': 'qa_duration', 'how many years': 'qa_duration', 'how long ago': 'qa_duration',
  'what time': 'qa_temporal', 'what day': 'qa_temporal', 'what month': 'qa_temporal',
  
  // People/Identity
  'who is': 'qa_identity', 'who was': 'qa_identity', 'who did': 'qa_identity', 'whose birthday': 'qa_identity',
  'identity': 'qa_identity', 'gender': 'qa_identity', 'sexuality': 'qa_identity',
  'what kind of person': 'qa_traits', 'personality traits': 'qa_traits', 'personality': 'qa_traits', 'traits': 'qa_traits', 'trait': 'qa_traits', 'character': 'qa_traits',
  
  // Family/Relationships
  'who supports': 'qa_supports', 'supports': 'qa_supports', 'supported by': 'qa_supports', 'support': 'qa_supports',
  'how many child': 'qa_children', 'how many kid': 'qa_children', 'children': 'qa_children', 'child': 'qa_children', 'kid': 'qa_children',
  'married': 'qa_marriage', 'husband': 'qa_husband', 'wife': 'qa_wife', 'partner': 'qa_partner', 'spouse': 'qa_partner',
  'friend': 'qa_friends', 'friends': 'qa_friends',
  'family': 'qa_family', 'grandma': 'qa_family', 'grandpa': 'qa_family', 'grandmother': 'qa_family', 'grandfather': 'qa_family', 'dad': 'qa_family', 'mom': 'qa_family', 'parent': 'qa_family',
  'status': 'qa_status', 'single': 'qa_status', 'relationship status': 'qa_status',
  'gift': 'qa_gift', 'present': 'qa_gift', 'gave': 'qa_gift',
  'symbol': 'qa_symbol', 'symbolize': 'qa_symbol', 'meaning': 'qa_symbol',
  
  // Activities/Interests
  'activities': 'qa_activities', 'what do': 'qa_activities', 'like to do': 'qa_activities', 'activity': 'qa_activities',
  'like': 'qa_likes', 'prefer': 'qa_likes', 'enjoy': 'qa_likes', 'favorite': 'qa_likes', 'favorites': 'qa_likes',
  'book': 'qa_books', 'read': 'qa_books', 'reading': 'qa_books',
  'music': 'qa_music', 'listen': 'qa_music', 'song': 'qa_music', 'band': 'qa_music', 'artist': 'qa_music', 'genre': 'qa_music',
  'game': 'qa_games', 'games': 'qa_games',
  'sport': 'qa_sports', 'sports': 'qa_sports',
  'paint': 'qa_art', 'art': 'qa_art', 'painted': 'qa_art', 'bowl': 'qa_art', 'photo': 'qa_art', 'artwork': 'qa_art',
  'pet': 'qa_pets', 'pets': 'qa_pets', 'dog': 'qa_pets', 'cat': 'qa_pets',
  'instrument': 'qa_instruments', 'play the': 'qa_instruments',
  'travel': 'qa_travel', 'trip': 'qa_travel', 'visited': 'qa_travel', 'camping': 'qa_travel', 'camp': 'qa_travel',
  'movie': 'qa_movies', 'film': 'qa_movies', 'watch': 'qa_movies',
  'food': 'qa_food', 'eat': 'qa_food', 'restaurant': 'qa_food', 'dish': 'qa_food', 'recipe': 'qa_food', 'recipes': 'qa_food',
  'shoes': 'qa_items', 'bought': 'qa_items', 'items': 'qa_items', 'item': 'qa_items',
  'dance': 'qa_dance', 'dance piece': 'qa_dance', 'dance studio': 'qa_dance',
  
  // Mental/Emotional
  'destress': 'qa_selfcare', 'stress': 'qa_selfcare', 'relax': 'qa_selfcare', 'self-care': 'qa_selfcare', 'self care': 'qa_selfcare', 'prioritize': 'qa_selfcare',
  'realize': 'qa_realization', 'realization': 'qa_realization', 'think about': 'qa_opinion', 'feel about': 'qa_opinion',
  'felt after': 'qa_feeling', 'feel after': 'qa_feeling', 'how did': 'qa_feeling', 'how does': 'qa_feeling',
  'reaction': 'qa_reaction', 'react': 'qa_reaction',
  'excited': 'qa_excitement', 'excited about': 'qa_excitement', 'looking forward': 'qa_excitement',
  'motivated': 'qa_motivation', 'motivation': 'qa_motivation', 'pursue': 'qa_motivation',
  'plan': 'qa_plans', 'plans': 'qa_plans', 'planning': 'qa_plans', 'planning to': 'qa_plans',
  'counseling': 'qa_counseling', 'mental health': 'qa_counseling', 'therapy': 'qa_counseling',
  'why': 'qa_reason', 'reason': 'qa_reason', 'why did': 'qa_reason', 'why is': 'qa_reason', 'reason for': 'qa_reason',
  'awareness': 'qa_awareness', 'raise awareness': 'qa_awareness', 'raised awareness': 'qa_awareness',
  'symbolize': 'qa_symbol', 'symbol': 'qa_symbol', 'meaning': 'qa_symbol', 'means': 'qa_symbol',
  'reminder': 'qa_reminder', 'reminds': 'qa_reminder', 'reminder of': 'qa_reminder',
  'workshop': 'qa_workshop',
  'charity': 'qa_charity',
  
  // Events/Changes
  'event': 'qa_events', 'events': 'qa_events', 'participate': 'qa_events', 'participated': 'qa_events',
  'festival': 'qa_events', 'concert': 'qa_events', 'talent show': 'qa_events',
  'change': 'qa_changes', 'changes': 'qa_changes', 'face': 'qa_changes', 'faced': 'qa_changes', 'handle': 'qa_changes', 'handled': 'qa_changes',
  'holiday': 'qa_holiday', 'vacation': 'qa_holiday',
  'accident': 'qa_incident', 'incident': 'qa_incident',
  'setback': 'qa_setback',
  
  // Work/Education
  'occupation': 'qa_occupation', 'job': 'qa_occupation', 'work': 'qa_occupation', 'career': 'qa_occupation',
  'education': 'qa_education', 'school': 'qa_education', 'degree': 'qa_education', 'field': 'qa_education',
  'research': 'qa_research',
  
  // General
  'how many': 'qa_count',
  'what did': 'qa_what', 'what was': 'qa_what', 'what is': 'qa_what', 'what kind': 'qa_what', 'what type': 'qa_what',
  'what are': 'qa_what', 'what has': 'qa_what', 'what does': 'qa_what', 'what made': 'qa_what',
  'what aspect': 'qa_what', 'what color': 'qa_what', 'what advice': 'qa_what', 'what cause': 'qa_what', 'what precautionary': 'qa_what',
  'opinion': 'qa_opinion',
  'desire': 'qa_desire', 'want': 'qa_desire',
  'inspiration': 'qa_inspiration', 'inspired': 'qa_inspiration'
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
  'What did the charity race raise awareness for?',
  'How many children does Melanie have?',
  'How long have Mel and her husband been married?',
  "What is Melanie's reaction to her children enjoying the Grand Canyon?",
  'How did Melanie feel while watching the meteor shower?'
];

console.log('Predicate routing:\n');
for (const q of tests) {
  const pred = getPredicate(q);
  console.log(`${pred.padEnd(20)} ← ${q.substring(0, 50)}...`);
}
