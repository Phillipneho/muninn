import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';

const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

// Sample failing questions with routing issues
const failures = [
  { q: "What is Caroline's identity?", expected: "Transgender woman", keyword: "identity" },
  { q: "What career path has Caroline decided to persue?", expected: "counseling or mental health", keyword: "career" },
  { q: "What fields would Caroline be likely to pursue?", expected: "Psychology, counseling", keyword: "pursue" },
  { q: "What activities does Melanie partake in?", expected: "pottery, camping, painting", keyword: "activities" },
  { q: "What do Melanie's kids like?", expected: "dinosaurs, nature", keyword: "kids" },
];

console.log('=== Suggested new PREDICATE_PATTERNS ===\n');

for (const f of failures) {
  console.log(`// Q: ${f.q}`);
  console.log(`// Expected: ${f.expected}`);
  console.log(`['${f.keyword}', '???'],  // Need to determine predicate`);
  console.log('');
}
