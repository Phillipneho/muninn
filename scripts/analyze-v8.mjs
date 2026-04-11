import fs from 'fs';

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

const PREDICATE_MAP = {
  'when': 'qa_temporal', 'what year': 'qa_temporal', 'what date': 'qa_temporal',
  'how long': 'qa_duration',
  'identity': 'qa_identity', 'gender': 'qa_identity',
  'personality': 'qa_traits', 'trait': 'qa_traits', 'age': 'qa_age', 'how old': 'qa_age',
  'where': 'qa_location', 'live': 'qa_location', 'from': 'qa_location',
  'job': 'qa_occupation', 'work': 'qa_occupation', 'career': 'qa_occupation', 'occupation': 'qa_occupation', 'profession': 'qa_occupation',
  'project': 'qa_projects', 'projects': 'qa_projects', 'company': 'qa_employer', 'employer': 'qa_employer',
  'children': 'qa_children', 'child': 'qa_children', 'kid': 'qa_children',
  'married': 'qa_relationship', 'husband': 'qa_relationship', 'wife': 'qa_relationship', 'partner': 'qa_relationship', 'spouse': 'qa_relationship',
  'friend': 'qa_friends', 'friends': 'qa_friends', 'family': 'qa_family', 'status': 'qa_status', 'single': 'qa_status',
  'activities': 'qa_activities', 'like': 'qa_likes', 'prefer': 'qa_likes', 'enjoy': 'qa_likes', 'favorite': 'qa_likes',
  'book': 'qa_books', 'read': 'qa_books', 'reading': 'qa_books',
  'music': 'qa_music', 'listen': 'qa_music', 'song': 'qa_music', 'band': 'qa_music', 'artist': 'qa_music',
  'game': 'qa_games', 'games': 'qa_games', 'sport': 'qa_sports', 'sports': 'qa_sports',
  'paint': 'qa_art', 'art': 'qa_art', 'painted': 'qa_art',
  'pet': 'qa_pets', 'pets': 'qa_pets', 'dog': 'qa_pets', 'cat': 'qa_pets',
  'instrument': 'qa_instruments', 'play': 'qa_instruments',
  'travel': 'qa_travel', 'trip': 'qa_travel', 'visited': 'qa_travel',
  'movie': 'qa_movies', 'film': 'qa_movies', 'watch': 'qa_movies',
  'food': 'qa_food', 'eat': 'qa_food', 'restaurant': 'qa_food',
  'event': 'qa_events', 'events': 'qa_events', 'participate': 'qa_events',
  'change': 'qa_changes', 'changes': 'qa_changes', 'face': 'qa_changes', 'faced': 'qa_changes',
  'research': 'qa_research', 'studied': 'qa_research', 'how many': 'qa_count', 'what did': 'qa_what'
};

const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

let unmapped = { temporal: [], identity: [], relationship: [], other: [] };

for (const conv of locomo) {
  if (!Array.isArray(conv.qa)) continue;
  
  for (const qa of conv.qa) {
    const q = qa.question.toLowerCase();
    const category = qa.category || 0;
    const catName = category === 2 ? 'temporal' : category === 3 ? 'identity' : category === 4 ? 'relationship' : 'other';
    
    let found = false;
    for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
      if (q.includes(keyword)) {
        found = true;
        break;
      }
    }
    
    if (!found) {
      if (unmapped[catName].length < 10) {
        unmapped[catName].push(q.substring(0, 80));
      }
    }
  }
}

console.log('=== Unmapped Questions by Category ===\n');
for (const [cat, questions] of Object.entries(unmapped)) {
  console.log(`${cat} (${questions.length} samples):`);
  questions.forEach(q => console.log(`  - ${q}`));
  console.log('');
}
