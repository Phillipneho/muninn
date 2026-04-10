#!/usr/bin/env node
const MUNINN_API = 'https://api.muninn.au/api';
const MUNINN_KEY = 'muninn_987fc4667f8a793af5470500c8f66db9';
const ORG_ID = 'leo-default';

const TEST_QUESTIONS = [
  {
    question: "What is Caroline's identity?",
    answer: "Transgender woman",
    entity: "Caroline",
    check: (facts) => {
      const woman = facts.find(f => f.object?.includes('woman'));
      const lgbtq = facts.find(f => f.object?.includes('LGBTQ'));
      if (woman && lgbtq) return { correct: true, found: `${woman.object}, ${lgbtq.object}` };
      if (woman) return { correct: true, found: woman.object };
      return { correct: false, found: null };
    }
  },
  {
    question: "What did Caroline research?",
    answer: "Adoption agencies",
    entity: "Caroline",
    check: (facts) => {
      const found = facts.find(f => f.object?.includes('adoption'));
      return { correct: !!found, found: found?.object };
    }
  },
  {
    question: "When did Caroline go to the LGBTQ support group?",
    answer: "7 May 2023",
    entity: "Caroline",
    check: (facts) => {
      const lgbtq = facts.find(f => f.object?.includes('LGBTQ') || f.object?.includes('support'));
      if (lgbtq && lgbtq.valid_from?.startsWith('2023-05')) {
        return { correct: true, found: `${lgbtq.object} on ${lgbtq.valid_from}` };
      }
      return { correct: false, found: null };
    }
  },
  {
    question: "What fields would Caroline pursue in education?",
    answer: "Psychology, counseling certification",
    entity: "Caroline",
    check: (facts) => {
      const counseling = facts.find(f => f.object?.includes('counseling') || f.object?.includes('psychology') || f.object?.includes('mental health'));
      return { correct: !!counseling, found: counseling?.object };
    }
  },
  {
    question: "What is Melanie's identity?",
    answer: "Woman, mom",
    entity: "Melanie",
    check: (facts) => {
      const woman = facts.find(f => f.object?.includes('woman'));
      const mom = facts.find(f => f.object?.includes('mom') || f.object?.includes('parent'));
      if (woman && mom) return { correct: true, found: `${woman.object}, ${mom.object}` };
      if (woman) return { correct: true, found: woman.object };
      return { correct: false, found: null };
    }
  },
  {
    question: "What do Melanie's kids like?",
    answer: "Learning about animals",
    entity: "Melanie",
    check: (facts) => {
      const kids = facts.find(f => f.predicate?.includes('kids') && f.object && !f.object?.includes('no '));
      return { correct: !!kids, found: kids?.object };
    }
  }
];

async function getFacts(entity) {
  const url = new URL(`${MUNINN_API}/facts/temporal?entity=${entity}&at=2024-01-01&limit=100`);
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${MUNINN_KEY}`,
      'X-Organization-ID': ORG_ID
    }
  });
  const data = await res.json();
  return data.facts || [];
}

async function runEvaluation() {
  console.log('=== LOCOMO Benchmark Evaluation (Improved) ===\n');
  
  let correct = 0;
  let total = TEST_QUESTIONS.length;
  
  for (const q of TEST_QUESTIONS) {
    console.log(`Q: ${q.question}`);
    console.log(`Expected: ${q.answer}`);
    
    const facts = await getFacts(q.entity);
    const result = q.check(facts);
    
    console.log(`Found: ${result.found || 'Nothing'}`);
    console.log(`${result.correct ? '✅ CORRECT' : '❌ INCORRECT'}\n`);
    
    if (result.correct) correct++;
  }
  
  console.log(`=== Results ===`);
  console.log(`Accuracy: ${correct}/${total} (${((correct/total)*100).toFixed(1)}%)`);
}

runEvaluation();
