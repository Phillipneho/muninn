// Test Vectorize directly
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '7e7c2e7e7e9e9e9e9e9e9e9e9e9e9e9e';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';

async function testVectorize() {
  // Get index info
  const infoUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/indexes/muninn-embeddings`;
  
  console.log('Testing Vectorize...');
  console.log('Index:', infoUrl);
}

testVectorize();
