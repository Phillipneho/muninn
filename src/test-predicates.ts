// Debug lives_in predicate
import { detectContradictions } from './extraction.js';

const TRANSIENT_PATTERNS = [
  'is_at', 'is_with', 'is_feeling', 'mood', 'current_activity',
  'is_doing', 'is_thinking', 'currently', 'temporarily',
  'at_', 'location', 'is', 'was_at', 'went_to', 'visited',
  'walking', 'doing', 'feeling', 'thinking', 'current'
];

const PERSISTENT_PATTERNS = [
  'lives_in', 'moved_to', 'job', 'employment', 'relationship_status',
  'married_to', 'partner', 'education', 'career', 'identity',
  'employer', 'works_at', 'residence', 'home', 'lives'
];

const predicates = ['works_at', 'lives_in', 'moved_to', 'at', 'is_at'];

for (const predicate of predicates) {
  const isExactTransient = TRANSIENT_PATTERNS.some(t => predicate === t);
  const isExactPersistent = PERSISTENT_PATTERNS.some(p => predicate === p);
  const isSubstringTransient = !isExactPersistent && TRANSIENT_PATTERNS.some(t => t.length > 2 && predicate.includes(t));
  const isSubstringPersistent = PERSISTENT_PATTERNS.some(p => p.length > 2 && predicate.includes(p));
  const isTransient = isExactTransient || isSubstringTransient;
  const isPersistent = isExactPersistent || isSubstringPersistent;
  
  console.log(`${predicate}:`);
  console.log(`  isExactTransient: ${isExactTransient}, isExactPersistent: ${isExactPersistent}`);
  console.log(`  isSubstringTransient: ${isSubstringTransient}, isSubstringPersistent: ${isSubstringPersistent}`);
  console.log(`  isTransient: ${isTransient}, isPersistent: ${isPersistent}`);
  console.log(`  shouldCreateEvent: ${isPersistent && !isTransient}`);
}