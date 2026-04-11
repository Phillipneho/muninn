import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

// Sample relationship questions
const relQuestions = locomo
  .flatMap(c => c.qa || [])
  .filter(qa => qa.category === 4) // relationship
  .slice(0, 10);

console.log('=== Sample Relationship Questions ===\n');
for (const qa of relQuestions) {
  console.log(`Q: ${qa.question}`);
  console.log(`A: ${qa.answer}`);
  console.log('');
}
