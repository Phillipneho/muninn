/**
 * Batch clear all memories efficiently
 */

const MUNNIN_API = 'https://api.muninn.au/api/memories';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';

async function clearAll(): Promise<void> {
  console.log('Clearing all memories...\n');
  
  let deleted = 0;
  
  while (true) {
    // Get batch of memories
    const response = await fetch(`${MUNNIN_API}?limit=100`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'X-Organization-ID': ORG_ID,
      },
    });
    
    const result = await response.json();
    const memories = result.results || [];
    
    if (memories.length === 0) {
      break;
    }
    
    // Delete batch concurrently
    const deletePromises = memories.map((m: any) => 
      fetch(`${MUNNIN_API}/${m.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'X-Organization-ID': ORG_ID,
        },
      })
    );
    
    await Promise.all(deletePromises);
    deleted += memories.length;
    console.log(`Deleted ${deleted} memories...`);
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`\n✓ Cleared ${deleted} memories`);
}

clearAll().catch(console.error);