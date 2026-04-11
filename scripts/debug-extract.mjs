import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

const conv = locomo[0];
console.log('Sample ID:', conv.sample_id);
console.log('\nSession summaries:');

// Check session summary format
for (const [k, v] of Object.entries(conv)) {
  if (k.startsWith('session_') && k.endsWith('_summary')) {
    console.log(`\n${k}:`);
    console.log(v.substring(0, 200) + '...');
    
    // Test date patterns
    const datePattern = /(\d{1,2}\s+(?:May|June|July|August|September|October|November|December)\s+\d{4})/gi;
    const dates = v.match(datePattern);
    console.log('Dates found:', dates);
  }
}
