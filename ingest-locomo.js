import fs from 'fs';
const data = JSON.parse(fs.readFileSync('/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json'));

const API = 'https://api.muninn.au/api/memories';
const TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';

function buildConversationContent(conv) {
  const speakers = [conv.conversation.speaker_a, conv.conversation.speaker_b].filter(Boolean);
  const sessionKeys = Object.keys(conv.conversation)
    .filter(k => k.startsWith('session_') && !k.includes('date'))
    .sort((a, b) => parseInt(a.replace('session_', '')) - parseInt(b.replace('session_', '')));
  
  const parts = [];
  
  for (const sessionKey of sessionKeys) {
    const turns = conv.conversation[sessionKey];
    const dateKey = sessionKey + '_date_time';
    const date = conv.conversation[dateKey] || 'unknown';
    
    if (!Array.isArray(turns)) continue;
    
    const dialogueNum = sessionKey.replace('session_', '');
    const dialogueId = 'D' + dialogueNum;
    
    parts.push('\n=== SESSION_' + dialogueNum + ' (' + date + ') ===');
    for (let i = 0; i < turns.length; i++) {
      parts.push('[' + dialogueId + ':' + (i+1) + '] ' + turns[i].speaker + ': ' + turns[i].text);
    }
  }
  
  return 'LOCOMO ' + conv.sample_id + '\nSpeakers: ' + speakers.join(', ') + '\n' + parts.join('\n');
}

async function ingest(conv) {
  const content = buildConversationContent(conv);
  const speakers = [conv.conversation.speaker_a, conv.conversation.speaker_b].filter(Boolean);
  
  console.log(conv.sample_id + ': ' + content.length + ' chars');
  
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Type': 'application/json',
        'X-Organization-ID': ORG
      },
      body: JSON.stringify({
        content,
        type: 'episodic',
        metadata: {
          source: 'locomo_benchmark',
          sample_id: conv.sample_id,
          speakers
        }
      })
    });
    
    const result = await res.json();
    if (result.id) {
      console.log('  -> ' + result.id.substring(0, 8) + ' OK');
      return { success: true, id: result.id };
    } else {
      console.log('  -> ERROR: ' + JSON.stringify(result));
      return { success: false, error: result };
    }
  } catch (e) {
    console.log('  -> ERROR: ' + e.message);
    return { success: false, error: e.message };
  }
}

async function run() {
  console.log('=== INGESTING WHOLE CONVERSATIONS ===\n');
  console.log('Total conversations:', data.length);
  
  let success = 0;
  for (const conv of data) {
    const result = await ingest(conv);
    if (result.success) success++;
    // Wait 5 seconds between ingestions to allow embedding generation
    await new Promise(r => setTimeout(r, 5000));
  }
  
  console.log('\n=== COMPLETE ===');
  console.log('Success:', success + '/' + data.length);
}

run().catch(e => console.error('Error:', e));