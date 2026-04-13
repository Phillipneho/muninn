// Test batch ingestion limits
const API_URL = 'https://api.muninn.au';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'batch-test-' + Date.now();

async function ingestMemory(content: string, metadata: any) {
  const response = await fetch(`${API_URL}/api/memories`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': ORG_ID
    },
    body: JSON.stringify({ content, type: 'conversation', metadata })
  });
  return response.json();
}

async function testBatch(size: number) {
  console.log(`\nTesting batch of ${size} memories...`);
  const start = Date.now();
  
  const promises = [];
  for (let i = 0; i < size; i++) {
    promises.push(ingestMemory(`Test memory ${i} from batch ${size}`, { batch_test: true, index: i }));
  }
  
  try {
    const results = await Promise.all(promises);
    const time = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✅ ${size} memories: ${time}s (${(size / parseFloat(time)).toFixed(1)}/sec)`);
    return { size, success: true, time: parseFloat(time) };
  } catch (error: any) {
    console.log(`❌ ${size} memories failed: ${error.message}`);
    return { size, success: false, error: error.message };
  }
}

async function main() {
  console.log('Testing batch ingestion limits...');
  console.log(`Org: ${ORG_ID}\n`);
  
  // Test progressively larger batches
  const sizes = [5, 10, 20, 30, 50];
  const results = [];
  
  for (const size of sizes) {
    const result = await testBatch(size);
    results.push(result);
    if (!result.success) {
      console.log(`\n⚠️ Failed at ${size}, stopping tests`);
      break;
    }
    // Small delay between batches
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log('\n=== RESULTS ===');
  for (const r of results) {
    if (r.success) {
      console.log(`${r.size}: ${r.time}s (${(r.size / r.time!).toFixed(1)}/sec)`);
    } else {
      console.log(`${r.size}: FAILED - ${r.error}`);
    }
  }
}

main().catch(console.error);
