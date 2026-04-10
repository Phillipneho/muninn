// Test script to trace predicate normalization

function normalizePredicate(predicate: string): string {
  const normalized = predicate.toLowerCase().trim();
  
  // Priority-ordered regex patterns (most specific first)
  const patterns: [RegExp, string, string][] = [
    [/^(kids|children)\s+(like|love|prefer|enjoy)\s+(.+)$/, 'kids_like', 'child preferences'],
    [/^camped\s+at\s+(.+)$/, 'camped_at', 'camping location'],
    [/^camping\s+at\s+(.+)$/, 'camped_at', 'camping location'],
    [/^moved\s+from\s+(.+)$/, 'moved_from', 'origin/moved from'],
    [/^originated\s+from\s+(.+)$/, 'moved_from', 'origin'],
    [/^known\s+for\s+(.+)$/, 'known_for', 'duration known for'],
    [/^married\s+for\s+(.+)$/, 'married_for', 'duration married for'],
    [/^been\s+(.+)\s+for\s+(.+)$/, 'known_for', 'duration been for'],
    [/^interested\s+in\s+(.+)$/, 'interested_in', 'interest'],
    [/^career_?interest\s+in\s+(.+)$/, 'career_interest', 'career interest'],
    [/^gave\s+(a\s+)?speech\s+at\s+(.+)$/, 'gave_speech_at', 'speech location'],
    [/^gave\s+(a\s+)?talk\s+at\s+(.+)$/, 'gave_talk_at', 'talk location'],
    [/^spoke\s+at\s+(.+)$/, 'gave_speech_at', 'speech location'],
    [/^attended\s+(.+)$/, 'attended', 'event attendance'],
    [/^going\s+to\s+(.+)$/, 'attending', 'future event'],
    [/^signed\s+up\s+for\s+(.+)$/, 'signed_up_for', 'event signup'],
    [/^(is|a|am)\s+(.+)$/, 'has_identity', 'identity'],
    [/^(gender|gender_identity|identity)$/, 'has_identity', 'identity'],
    [/^(relationship|relationship_status|status)$/, 'has_relationship_status', 'relationship'],
    [/^married\s+to\s+(.+)$/, 'married', 'married to'],
    [/^dating\s+(.+)$/, 'dated', 'dating'],
    [/^lives\s+(in|at)\s+(.+)$/, 'lives_in', 'residence'],
    [/^(residence|home_city)$/, 'lives_in', 'residence'],
    [/^works\s+(at|for)\s+(.+)$/, 'works_at', 'work'],
    [/^(employer|works_at|works_for)$/, 'works_at', 'work'],
    [/^(job|job_title|role)$/, 'job_title', 'job title'],
    [/^(has_?child|children|kids)$/, 'has_child', 'children'],
    [/^(has_?pet|pets|dog|cat)$/, 'has_pet', 'pet'],
    [/^(hobby|hobbies|activity|activities)$/, 'activity', 'hobby/activity'],
    [/^(interest|interests)$/, 'interested_in', 'interest'],
  ];
  
  // Try regex patterns first
  for (const [regex, canonical, desc] of patterns) {
    if (regex instanceof RegExp) {
      if (regex.test(normalized)) {
        console.log(`  [MATCH] "${predicate}" -> "${canonical}" via ${desc}`);
        return canonical;
      }
    }
  }
  
  // Fallback mappings
  const fallback: Record<string, string> = {
    'moved_from': 'moved_from',
    'lives_in': 'lives_in',
    'works_at': 'works_at',
    'has_identity': 'has_identity',
    'has_relationship_status': 'has_relationship_status',
    'has_child': 'has_child',
    'has_pet': 'has_pet',
    'activity': 'activity',
    'interested_in': 'interested_in',
    'known_for': 'known_for',
    'camped_at': 'camped_at',
    'kids_like': 'kids_like',
    'gave_speech_at': 'gave_speech_at',
    'gave_talk_at': 'gave_talk_at',
    'attended': 'attended',
  };
  
  if (fallback[normalized]) {
    console.log(`  [FALLBACK] "${predicate}" -> "${fallback[normalized]}"`);
    return fallback[normalized];
  }
  
  console.log(`  [NO MATCH] "${predicate}" -> stays as-is`);
  return normalized;
}

// Test cases
const testCases = [
  'has_child',
  'has_identity', 
  'moved_from',
  'from',
  'camped at beach',
  'camped_at',
  'kids like dinosaurs',
  'kids_like',
  'interested in pottery',
  'interested_in',
  'known for 7 years',
  'known_for',
  'gave talk at school',
  'gave_talk_at',
];

console.log('=== PREDICATE NORMALIZATION TEST ===\n');

for (const test of testCases) {
  normalizePredicate(test);
}