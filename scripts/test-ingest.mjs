const MUNINN_API = 'https://muninn.phillipneho.workers.dev/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG = 'leo-default';

async function test() {
  const testFacts = [{
    subject: 'Caroline',
    predicate: 'qa_temporal',
    object: '7 May 2023',
    valid_from: '2023-05-07',
    evidence: '[]',
    pds_decimal: '4101',
    pds_domain: '4000',
    confidence: 0.9
  }];
  
  const entities = [{ name: 'Caroline', type: 'person' }];
  
  console.log('Sending:', JSON.stringify({ facts: testFacts, entities }, null, 2));
  
  const res = await fetch(`${MUNINN_API}/facts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ facts: testFacts, entities })
  });
  
  const text = await res.text();
  console.log('\nResponse status:', res.status);
  console.log('Response:', text);
}

test();
