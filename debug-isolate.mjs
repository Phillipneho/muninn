#!/usr/bin/env node
const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';

async function test() {
  // Test 1: Just ID with LOCOMO prefix
  const test1 = await fetch(`${MUNINN_API}/raw-sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 'conv-26_1',
      content: 'Simple test',
      session_date: '2023-05-08',
      source: 'test',
      speakers: ['A']
    })
  });
  console.log('Test 1 (LOCOMO ID):', test1.status, await test1.text());
  
  // Test 2: Just source=locomo
  const test2 = await fetch(`${MUNINN_API}/raw-sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 'test-source',
      content: 'Simple test',
      session_date: '2023-05-08',
      source: 'locomo',
      speakers: ['A']
    })
  });
  console.log('Test 2 (source=locomo):', test2.status, await test2.text());
  
  // Test 3: Date with special format
  const test3 = await fetch(`${MUNINN_API}/raw-sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 'test-date',
      content: 'Simple test',
      session_date: '1:56 pm on 8 May, 2023',
      source: 'test',
      speakers: ['A']
    })
  });
  console.log('Test 3 (special date):', test3.status, await test3.text());
  
  // Test 4: Speakers array
  const test4 = await fetch(`${MUNINN_API}/raw-sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 'test-speakers',
      content: 'Simple test',
      session_date: '2023-05-08',
      source: 'test',
      speakers: ['Caroline', 'Melanie']
    })
  });
  console.log('Test 4 (speakers):', test4.status, await test4.text());
}

test().catch(console.error);