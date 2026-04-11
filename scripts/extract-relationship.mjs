import fs from 'fs';

const LOCOMO_PATH = '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json';
const locomo = JSON.parse(fs.readFileSync(LOCOMO_PATH, 'utf8'));

// Find Caroline/Melanie conversations
const conv = locomo.find(c => c.sample_id === 'conv-26');

console.log('=== Session Summaries for Caroline/Melanie ===\n');

// Check session_2_summary for charity race
const session2 = conv.session_summary?.session_2_summary;
if (session2) {
  console.log('Session 2:');
  console.log(session2.substring(0, 500));
  console.log('\n');
}

// Check session_3_summary for married
const session3 = conv.session_summary?.session_3_summary;
if (session3) {
  console.log('Session 3:');
  console.log(session3.substring(0, 600));
}
