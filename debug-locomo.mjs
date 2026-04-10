#!/usr/bin/env node
const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';

async function test() {
  // Test with actual LOCOMO-style content
  const locomoStyle = `Session (1:56 pm on 8 May, 2023)
Speakers: Caroline, Melanie

Caroline: Hey Mel! Good to see you! How have you been?
Melanie: Hey Caroline! Good to see you! I'm swamped with the kids & work. What's up with you? Anything new?`;
  
  const test1 = await fetch(`${MUNINN_API}/raw-sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 'conv-26_1',
      content: locomoStyle,
      session_date: '1:56 pm on 8 May, 2023',
      source: 'locomo',
      speakers: ['Caroline', 'Melanie']
    })
  });
  console.log('LOCOMO style:', test1.status, await test1.text());
}

test().catch(console.error);