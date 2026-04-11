import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

const conv = locomo[0];
console.log('Keys:', Object.keys(conv));
console.log('\n');

// Check session_summary type
for (const [k, v] of Object.entries(conv)) {
  if (k.includes('session')) {
    console.log(`${k}: type=${typeof v}, isArray=${Array.isArray(v)}`);
    if (typeof v === 'object' && !Array.isArray(v)) {
      console.log('  Keys:', Object.keys(v));
    }
  }
}
