#!/usr/bin/env tsx
/**
 * Test pre-processing pipeline for LOCOMO-grade retrieval
 * 
 * Usage: npx tsx test-preprocess.ts
 */

const API_URL = 'https://api.muninn.au';
const API_KEY = 'muninn_729186836cbd4aada2352cb4c06c4ef0';
const ORG_ID = 'leo-default';

// Sample long conversation (LOCOMO-style)
const SAMPLE_CONVERSATION = `
[Session Date: 2023-05-25]

Caroline: Hi, I'm Caroline. I'm a transgender woman and I've been transitioning for about 2 years now. I went to the LGBTQ support group yesterday and met some amazing people.

Melanie: That's wonderful, Caroline. I've been meaning to ask you about your painting hobby. You mentioned you started last month?

Caroline: Yes! I started painting about 3 weeks ago. Melanie, you've been such an inspiration. Your artwork is amazing. I particularly loved the piece you showed me last Friday - the sunset over Bali.

Melanie: Thank you! I painted that during my trip to Bali in October last year. Alisha and I went together. We stayed at this beautiful villa in Ubud.

Caroline: I've never been to Bali. Is Alisha your partner?

Melanie: Yes, Alisha is my wife. We've been married for 5 years now. We actually met at an art gallery in Sydney. She was working as a curator there.

Caroline: That's such a romantic story! I'm currently single, but I'm hopeful I'll find someone. The support group has been helping me build confidence.

Melanie: You will, Caroline. So tell me more about the support group. When did you start attending?

Caroline: I started going about 2 months ago. The Sunday before May 25th was particularly helpful. We talked about navigating relationships as a trans woman. The facilitator, Dr. Sarah Chen, is amazing.

Melanie: Dr. Sarah Chen? I think I've heard of her. Does she work at the Brisbane Gender Clinic?

Caroline: Yes! She's the lead counselor there. I've been seeing her for individual sessions too. My next appointment is next Tuesday.

Melanie: That's great that you have that support. So about painting - I could teach you some techniques if you'd like. The Friday before 15 July I'm free, if you want to come over?

Caroline: That would be wonderful! July 14th works for me. I'll bring some supplies. What brand of paints do you recommend?

Melanie: I use Winsor & Newton mainly. They're a bit pricey but the quality is worth it. I can show you some blending techniques.

Caroline: Perfect! By the way, did I mention I work at the community center now? I started last month as a counselor.

Melanie: Congratulations! That's such meaningful work. How are you finding it?

Caroline: It's rewarding. I mainly work with LGBTQ youth. Last week we had a session with about 15 kids. The Sunday before last was particularly emotional - one of the teens came out to their parents.

Melanie: That must have been intense. How did you handle it?

Caroline: We have protocols. I called Dr. Chen for guidance. The parents were actually supportive, which was a relief. The teen, Alex, is doing much better now.

Melanie: That's wonderful. You're making such a difference. Speaking of making a difference, Alisha and I are planning to start a family soon. We've been looking into adoption agencies.

Caroline: That's exciting! Have you found any good agencies?

Melanie: We've shortlisted three. There's one called Family First that specializes in LGBTQ families. We have an appointment with them the week before 14 August.

Caroline: August 7-13? That's coming up soon! I'm so happy for you both.

Melanie: Thank you. It's been a journey. The two weekends before 17 July we're doing a home study preparation course.

Caroline: That sounds intense but worth it. I'm rooting for you both!

Melanie: Thanks, Caroline. So for our painting session on July 14th, my address is 42 Riverstone Drive, Brisbane. Alisha will be at work, so it'll just be us.

Caroline: Perfect. I'll be there at 10am if that works?

Melanie: 10am works great. Bring a snack if you want - I'll have tea and coffee ready.

Caroline: Sounds perfect. I'm really looking forward to learning from you. You've become such a good friend.

Melanie: Likewise, Caroline. It's rare to find genuine connections like this.

Caroline: Agreed. Well, I should go - I have my appointment with Dr. Chen tomorrow morning at 9.

Melanie: Good luck! Let me know how it goes.

Caroline: Will do. See you July 14th!

Melanie: See you then, Caroline. Take care!
`;

async function testPreprocess() {
  console.log('=== Testing Preprocessing Pipeline ===\n');
  console.log(`Content length: ${SAMPLE_CONVERSATION.length} characters\n`);
  
  const response = await fetch(`${API_URL}/api/memories/preprocess`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'X-Organization-ID': ORG_ID
    },
    body: JSON.stringify({
      content: SAMPLE_CONVERSATION,
      type: 'conversation',
      metadata: {
        session_date: '2023-05-25',
        speakers: ['Caroline', 'Melanie']
      }
    })
  });
  
  const result = await response.json();
  console.log('Response:', JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log('\n=== Preprocessing Successful ===');
    console.log(`Segments created: ${result.segments}`);
    console.log(`Total tokens: ${result.total_tokens}`);
    console.log(`Header length: ${result.header_length} words`);
    console.log(`Facts extracted: ${result.facts_extracted}`);
    console.log(`Entities resolved: ${result.entities_resolved}`);
  }
}

// Also test queries that would benefit from preprocessing
async function testQueries() {
  console.log('\n=== Testing Query Performance ===\n');
  
  const queries = [
    'What mini PC does Phillip use?', // Single-hop
    'Where did Melanie go with Alisha?', // Multi-hop (Melanie → Alisha → Bali)
    'When is Caroline\'s appointment with Dr. Chen?', // Temporal
    'What art supplies does Melanie recommend?' // Open-domain
  ];
  
  for (const query of queries) {
    console.log(`\nQuery: ${query}`);
    
    const response = await fetch(`${API_URL}/api/memories?q=${encodeURIComponent(query)}&limit=5`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'X-Organization-ID': ORG_ID
      }
    });
    
    const result = await response.json();
    console.log(`Results: ${result.count} matches`);
    
    if (result.results?.[0]) {
      console.log(`Top result preview: ${result.results[0].content?.substring(0, 200)}...`);
    }
  }
}

async function main() {
  try {
    await testPreprocess();
    // await testQueries(); // Uncomment to test queries after ingestion
  } catch (error) {
    console.error('Error:', error);
  }
}

main();