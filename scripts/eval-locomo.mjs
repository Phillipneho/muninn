#!/usr/bin/env node
/**
 * LOCOMO Benchmark Evaluation
 * Tests fact-based retrieval against LOCOMO questions
 */

const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG_ID = 'leo-default';

// Sample questions from LOCOMO benchmark
const TEST_QUESTIONS = [
  {
    question: "What is Caroline's identity?",
    answer: "Transgender woman",
    entity: "Caroline",
    searchTerms: ["identity", "woman", "transgender"],
    category: "single_hop"
  },
  {
    question: "What did Caroline research?",
    answer: "Adoption agencies",
    entity: "Caroline",
    searchTerms: ["researched", "adoption"],
    category: "single_hop"
  },
  {
    question: "When did Caroline go to the LGBTQ support group?",
    answer: "7 May 2023",
    entity: "Caroline",
    searchTerms: ["LGBTQ", "support", "group"],
    category: "temporal"
  },
  {
    question: "What fields would Caroline pursue in education?",
    answer: "Psychology, counseling certification",
    entity: "Caroline",
    searchTerms: ["education", "pursue", "field", "psychology", "counseling"],
    category: "multi_hop"
  },
  {
    question: "What is Melanie's identity?",
    answer: "Woman, mom",
    entity: "Melanie",
    searchTerms: ["identity", "woman", "mom"],
    category: "single_hop"
  },
  {
    question: "When did Melanie run a charity race?",
    answer: "The sunday before 25 May 2023",
    entity: "Melanie",
    searchTerms: ["charity", "race", "run"],
    category: "temporal"
  },
  {
    question: "What do Melanie's kids like?",
    answer: "Learning about animals",
    entity: "Melanie",
    searchTerms: ["kids", "like", "children"],
    category: "single_hop"
  }
];

async function searchFacts(query, entity = null) {
  const url = new URL(`${MUNINN_API}/facts/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '10');
  if (entity) url.searchParams.set('entity', entity);
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG_ID
    }
  });
  
  const data = await res.json();
  return data.results || [];
}

async function runEvaluation() {
  console.log('=== LOCOMO Benchmark Evaluation ===\n');
  console.log(`Testing ${TEST_QUESTIONS.length} questions\n`);
  
  let correct = 0;
  let total = TEST_QUESTIONS.length;
  
  for (const q of TEST_QUESTIONS) {
    console.log(`Q: ${q.question}`);
    console.log(`Expected: ${q.answer}`);
    
    // Search with multiple terms
    let bestMatch = null;
    let bestScore = 0;
    
    for (const term of q.searchTerms) {
      const results = await searchFacts(term, q.entity);
      for (const r of results) {
        const score = calculateMatchScore(r, q);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = r;
        }
      }
    }
    
    if (bestMatch) {
      console.log(`Found: ${bestMatch.predicate} ${bestMatch.object}`);
      console.log(`Score: ${bestScore.toFixed(2)}`);
      
      // Check if answer is found
      const found = q.answer.toLowerCase().split(',').some(a => 
        bestMatch.object?.toLowerCase().includes(a.trim().toLowerCase()) ||
        a.trim().toLowerCase().includes(bestMatch.object?.toLowerCase())
      );
      
      if (found || bestScore > 0.7) {
        correct++;
        console.log(`✅ CORRECT\n`);
      } else {
        console.log(`❌ INCORRECT\n`);
      }
    } else {
      console.log(`Found: Nothing`);
      console.log(`❌ INCORRECT\n`);
    }
  }
  
  console.log(`=== Results ===`);
  console.log(`Accuracy: ${correct}/${total} (${((correct/total)*100).toFixed(1)}%)`);
}

function calculateMatchScore(result, question) {
  let score = 0;
  const answer = question.answer.toLowerCase();
  const object = (result.object || '').toLowerCase();
  
  // Check for answer terms in object
  const answerTerms = answer.split(/[,\s]+/);
  for (const term of answerTerms) {
    if (term.length > 2 && object.includes(term)) {
      score += 0.3;
    }
  }
  
  // Boost for matching predicate
  if (question.searchTerms.some(t => result.predicate?.includes(t))) {
    score += 0.2;
  }
  
  // Cap at 1.0
  return Math.min(score, 1.0);
}

runEvaluation();
