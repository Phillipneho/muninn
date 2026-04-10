/**
 * LOCOMO Batch Ingestion - Ingest sessions one at a time with proper timeouts
 */

const MUNINN_API = 'https://api.muninn.au';
const MUNINN_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';
const LOCOMO_URL = 'https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clearMemories() {
  console.log('Clearing existing memories...');
  
  // Get all memories
  const listResponse = await fetch(`${MUNINN_API}/api/memories?limit=1000`, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG_ID
    }
  });
  
  const data = await listResponse.json();
  const memories = data.results || [];
  console.log(`Found ${memories.length} memories to delete`);
  
  // Delete in batches
  let deleted = 0;
  for (const memory of memories) {
    try {
      await fetch(`${MUNINN_API}/api/memories/${memory.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${MUNINN_KEY}`,
          'X-Organization-ID': ORG_ID
        }
      });
      deleted++;
      if (deleted % 10 === 0) {
        console.log(`  Deleted ${deleted}/${memories.length}...`);
      }
    } catch (e) {
      console.log(`  Error deleting ${memory.id}: ${e.message}`);
    }
  }
  
  console.log(`✓ Deleted ${deleted} memories\n`);
}

async function ingestSession(convId, sessionId, content) {
  const sessionDate = '2023-05-08'; // Default date
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout
  
  try {
    const response = await fetch(`${MUNINN_API}/api/memories`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MUNINN_KEY}`,
        'Content-Type': 'application/json',
        'X-Organization-ID': ORG_ID
      },
      body: JSON.stringify({
        content: content,
        source: `LOCOMO-${convId}-${sessionId}`,
        session_date: sessionDate
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const result = await response.json();
    return {
      success: true,
      id: result.id,
      entities: result.extraction?.entities || 0,
      facts: result.extraction?.facts || 0
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      return { success: false, error: 'Timeout (120s)' };
    }
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('LOCOMO BATCH INGESTION');
  console.log('='.repeat(60));
  console.log('');
  
  // Step 1: Clear existing memories
  await clearMemories();
  
  // Step 2: Fetch LOCOMO data
  console.log('Fetching LOCOMO data...');
  const response = await fetch(LOCOMO_URL);
  const conversations = await response.json();
  console.log(`Loaded ${conversations.length} conversations\n`);
  
  // Step 3: Ingest sessions one at a time
  let totalSessions = 0;
  let totalEntities = 0;
  let totalFacts = 0;
  let failed = [];
  
  for (const conv of conversations) {
    const convId = conv.sample_id || `conv-${conversations.indexOf(conv)}`;
    console.log(`\n[${convId}] Processing...`);
    
    // Get all session keys
    const sessionKeys = Object.keys(conv.conversation || {})
      .filter(k => k.startsWith('session_') && !k.endsWith('_date_time'));
    
    console.log(`  ${sessionKeys.length} sessions to ingest`);
    
    for (const sessionKey of sessionKeys) {
      const sessionData = conv.conversation[sessionKey];
      
      // Convert session data to text
      let content = '';
      if (Array.isArray(sessionData)) {
        content = sessionData.map(d => `[${d.speaker}]: ${d.text}`).join('\n');
      } else if (typeof sessionData === 'string') {
        content = sessionData;
      } else {
        content = JSON.stringify(sessionData);
      }
      
      if (content.length < 50) continue; // Skip tiny sessions
      
      totalSessions++;
      console.log(`  [${totalSessions}] ${sessionKey}: ${content.length} chars`);
      
      const result = await ingestSession(convId, sessionKey, content);
      
      if (result.success) {
        console.log(`      ✓ ${result.entities} entities, ${result.facts} facts`);
        totalEntities += result.entities;
        totalFacts += result.facts;
      } else {
        console.log(`      ✗ ${result.error}`);
        failed.push({ convId, sessionKey, error: result.error });
      }
      
      // Rate limiting
      await sleep(500);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('INGESTION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Sessions processed: ${totalSessions}`);
  console.log(`Total entities: ${totalEntities}`);
  console.log(`Total facts: ${totalFacts}`);
  console.log(`Failed: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log('\nFailed sessions:');
    failed.forEach(f => console.log(`  ${f.convId}/${f.sessionKey}: ${f.error}`));
  }
}

main().catch(console.error);