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

const ALL_ENTITIES = [...new Set(Object.values(ENTITY_MAP).flat())];

// Current predicate map
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

// Extract key phrases from unmapped questions
const phraseCounts = {};

for (const conv of locomo) {
  if (!Array.isArray(conv.qa)) continue;
  
  for (const qa of conv.qa) {
    const q = qa.question.toLowerCase();
    
    let mapped = false;
    for (const keyword of Object.keys(PREDICATE_MAP)) {
      if (q.includes(keyword)) {
        mapped = true;
        break;
      }
    }
    
    if (!mapped) {
      // Extract meaningful phrases
      const phrases = q.match(/\b([a-z]+(?:\s+[a-z]+)?)\s+(?:is|are|was|were|did|does|do|has|have|had|would|could|should|will|can|may|might)\b/g);
      if (phrases) {
        phrases.forEach(p => {
          const clean = p.trim().replace(/\s+(is|are|was|were|did|does|do|has|have|had|would|could|should|will|can|may|might)\b/, '');
          if (clean.length > 3 && !['what', 'when', 'where', 'which', 'how', 'who', 'why'].includes(clean)) {
            phraseCounts[clean] = (phraseCounts[clean] || 0) + 1;
          }
        });
      }
      
      // Also look for "what X" patterns
      const whatMatch = q.match(/what\s+([a-z]+(?:\s+[a-z]+)?)/g);
      if (whatMatch) {
        whatMatch.forEach(p => {
          const clean = p.replace('what ', '').trim();
          if (clean.length > 2) {
            phraseCounts[`what_${clean}`] = (phraseCounts[`what_${clean}`] || 0) + 1;
          }
        });
      }
      
      // Look for "how X" patterns
      const howMatch = q.match(/how\s+([a-z]+(?:\s+[a-z]+)?)/g);
      if (howMatch) {
        howMatch.forEach(p => {
          const clean = p.replace('how ', '').trim();
          if (clean.length > 2) {
            phraseCounts[`how_${clean}`] = (phraseCounts[`how_${clean}`] || 0) + 1;
          }
        });
      }
      
      // Look for "whose X" patterns
      const whoseMatch = q.match(/whose\s+([a-z]+(?:\s+[a-z]+)?)/g);
      if (whoseMatch) {
        whoseMatch.forEach(p => {
          const clean = p.replace('whose ', '').trim();
          phraseCounts[`whose_${clean}`] = (phraseCounts[`whose_${clean}`] || 0) + 1;
        });
      }
    }
  }
}

// Sort by frequency
const sorted = Object.entries(phraseCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 50);

console.log('=== Most Common Unmapped Patterns ===\n');
console.log('Pattern | Count | Suggested Predicate\n');
console.log('-'.repeat(50));

for (const [pattern, count] of sorted) {
  console.log(`${pattern.padEnd(30)} | ${String(count).padStart(4)} |`);
}
