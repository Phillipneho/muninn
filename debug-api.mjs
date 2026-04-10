#!/usr/bin/env node
const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_TOKEN = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG = 'leo-default';

async function test() {
  // Test with a simple session
  const test1 = await fetch(`${MUNINN_API}/raw-sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 'test-short',
      content: 'Short content',
      session_date: '2023-05-07',
      source: 'test',
      speakers: ['A', 'B']
    })
  });
  console.log('Short content:', test1.status, await test1.text());
  
  // Test with long content
  const longContent = 'A: Test\n'.repeat(100);
  const test2 = await fetch(`${MUNINN_API}/raw-sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 'test-long',
      content: longContent,
      session_date: '2023-05-07',
      source: 'test',
      speakers: ['A', 'B']
    })
  });
  console.log('Long content:', test2.status, await test2.text());
  
  // Test with special characters
  const test3 = await fetch(`${MUNINN_API}/raw-sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_TOKEN}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 'test-special',
      content: "Test with \"quotes\" and 'apostrophes' and\nnewlines\ttabs",
      session_date: '2023-05-07',
      source: 'test',
      speakers: ['A', 'B']
    })
  });
  console.log('Special chars:', test3.status, await test3.text());
}

test().catch(console.error);