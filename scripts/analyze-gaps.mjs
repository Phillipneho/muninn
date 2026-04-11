import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

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

// Map question patterns to predicates
const PREDICATE_MAP = {
  'when did': 'qa_temporal', 'when was': 'qa_temporal', 'what year': 'qa_temporal', 'what date': 'qa_temporal',
  'what time': 'qa_temporal', 'which month': 'qa_temporal', 'which year': 'qa_temporal', 'which week': 'qa_temporal',
  'how long': 'qa_duration',
  'who did': 'qa_person', 'who was': 'qa_person', 'who had': 'qa_person',
  'identity': 'qa_identity', 'gender': 'qa_identity',
  'personality': 'qa_traits', 'trait': 'qa_traits', 'attributes': 'qa_traits', 'character': 'qa_traits',
  'age': 'qa_age', 'how old': 'qa_age',
  'where': 'qa_location', 'live': 'qa_location', 'from': 'qa_location',
  'would be considered': 'qa_inference', 'would be more interested': 'qa_inference', 'would be open': 'qa_inference',
  'would want': 'qa_inference', 'would likely': 'qa_inference', 'might': 'qa_inference',
  'degree': 'qa_education', 'education': 'qa_education', 'major in': 'qa_education', 'study in': 'qa_education',
  'condition': 'qa_health', 'allergy': 'qa_health', 'allergies': 'qa_health', 'health': 'qa_health',
  'job': 'qa_occupation', 'work': 'qa_occupation', 'career': 'qa_occupation', 'occupation': 'qa_occupation', 'profession': 'qa_occupation',
  'project': 'qa_projects', 'projects': 'qa_projects', 'company': 'qa_employer', 'employer': 'qa_employer',
  'how many child': 'qa_children', 'how many kid': 'qa_children', 'child': 'qa_children', 'kid': 'qa_children',
  'married': 'qa_relationship', 'husband': 'qa_relationship', 'wife': 'qa_relationship', 'partner': 'qa_relationship', 'spouse': 'qa_relationship',
  'friend': 'qa_friends', 'friends': 'qa_friends', 'family': 'qa_family', 'status': 'qa_status', 'single': 'qa_status',
  'grandma': 'qa_family', 'grandpa': 'qa_family', 'grandmother': 'qa_family', 'grandfather': 'qa_family',
  'gift': 'qa_gift', 'present': 'qa_gift', 'gave': 'qa_gift',
  'symbol': 'qa_symbol', 'symbolize': 'qa_symbol', 'meaning': 'qa_symbol',
  'activities': 'qa_activities', 'what do': 'qa_activities', 'like to do': 'qa_activities',
  'like': 'qa_likes', 'prefer': 'qa_likes', 'enjoy': 'qa_likes', 'favorite': 'qa_likes',
  'book': 'qa_books', 'read': 'qa_books', 'reading': 'qa_books',
  'music': 'qa_music', 'listen': 'qa_music', 'song': 'qa_music', 'band': 'qa_music', 'artist': 'qa_music',
  'game': 'qa_games', 'games': 'qa_games', 'sport': 'qa_sports', 'sports': 'qa_sports',
  'paint': 'qa_art', 'art': 'qa_art', 'painted': 'qa_art', 'bowl': 'qa_art', 'photo': 'qa_art',
  'pet': 'qa_pets', 'pets': 'qa_pets', 'dog': 'qa_pets', 'cat': 'qa_pets',
  'instrument': 'qa_instruments', 'play': 'qa_instruments',
  'travel': 'qa_travel', 'trip': 'qa_travel', 'visited': 'qa_travel',
  'movie': 'qa_movies', 'film': 'qa_movies', 'watch': 'qa_movies',
  'food': 'qa_food', 'eat': 'qa_food', 'restaurant': 'qa_food',
  'shoes': 'qa_items', 'bought': 'qa_items',
  'destress': 'qa_selfcare', 'stress': 'qa_selfcare', 'relax': 'qa_selfcare',
  'self-care': 'qa_selfcare', 'self care': 'qa_selfcare', 'prioritize': 'qa_selfcare',
  'realize': 'qa_realization', 'realization': 'qa_realization', 'think about': 'qa_realization',
  'excited': 'qa_excitement', 'excited about': 'qa_excitement', 'looking forward': 'qa_excitement',
  'motivated': 'qa_motivation', 'motivation': 'qa_motivation', 'pursue': 'qa_motivation',
  'plan': 'qa_plans', 'plans': 'qa_plans', 'planning': 'qa_plans',
  'counseling': 'qa_counseling', 'mental health': 'qa_counseling', 'therapy': 'qa_counseling',
  'event': 'qa_events', 'events': 'qa_events', 'participate': 'qa_events',
  'change': 'qa_changes', 'changes': 'qa_changes', 'face': 'qa_changes', 'faced': 'qa_changes',
  'holiday': 'qa_holiday', 'vacation': 'qa_holiday',
  'research': 'qa_research', 'studied': 'qa_research',
  'how many': 'qa_count',
  'what did': 'qa_what', 'what was': 'qa_what', 'what is': 'qa_what'
};

let stats = {
  total: 0,
  mapped: 0,
  byCategory: { temporal: { total: 0, mapped: 0, unmapped: [] }, identity: { total: 0, mapped: 0, unmapped: [] }, relationship: { total: 0, mapped: 0, unmapped: [] }, other: { total: 0, mapped: 0, unmapped: [] } }
};

for (const conv of locomo) {
  if (!Array.isArray(conv.qa)) continue;
  
  for (const qa of conv.qa) {
    stats.total++;
    const q = qa.question.toLowerCase();
    const category = qa.category || 0;
    const catName = category === 2 ? 'temporal' : category === 3 ? 'identity' : category === 4 ? 'relationship' : 'other';
    
    stats.byCategory[catName].total++;
    
    let found = false;
    for (const [keyword, predicate] of Object.entries(PREDICATE_MAP)) {
      if (q.includes(keyword)) {
        found = true;
        break;
      }
    }
    
    if (found) {
      stats.mapped++;
      stats.byCategory[catName].mapped++;
    } else if (stats.byCategory[catName].unmapped.length < 15) {
      stats.byCategory[catName].unmapped.push(q.substring(0, 100));
    }
  }
}

console.log('=== Coverage Analysis ===\n');
console.log(`Total questions: ${stats.total}`);
console.log(`Mapped to predicates: ${stats.mapped} (${((stats.mapped / stats.total) * 100).toFixed(1)}%)`);
console.log(`Unmapped: ${stats.total - stats.mapped}\n`);

for (const [cat, data] of Object.entries(stats.byCategory)) {
  const pct = data.total > 0 ? ((data.mapped / data.total) * 100).toFixed(1) : '0.0';
  console.log(`${cat}: ${data.mapped}/${data.total} = ${pct}% mapped`);
  if (data.unmapped.length > 0) {
    console.log(`  Unmapped samples:`);
    data.unmapped.slice(0, 10).forEach(q => console.log(`    - ${q}`));
  }
  console.log('');
}
