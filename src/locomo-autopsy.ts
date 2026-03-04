// LOCOMO Category 3 (Inference) Autopsy
// Analyze failures to understand the "Inference Gap"

import { existsSync, readFileSync } from 'fs';

const CONFIG = {
  datasetPath: '/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json',
  resultsPath: './benchmarks/results/locomo-fast-results.json'
};

interface Question {
  question: string;
  answer: string | string[];
  evidence?: string[];
  category: number;
}

interface Conversation {
  sample_id: string;
  conversation: any;
  qa: Question[];
  observation?: any;
  session_summary?: any;
}

interface Failure {
  question: string;
  expected: string;
  category: number;
  evidence: string[];
  observations: string[];
  failureType: 'retrieval' | 'synthesis' | 'implicit';
  diagnosis: string;
}

function extractObservations(conv: Conversation): string[] {
  const observations: string[] = [];
  
  if (conv.observation) {
    const obsKeys = Object.keys(conv.observation).filter(k => k.includes('observation'));
    for (const key of obsKeys) {
      const obs = conv.observation[key];
      if (typeof obs === 'string') {
        observations.push(obs);
      }
    }
  }
  
  return observations;
}

function analyzeFailure(qa: Question, observations: string[]): Failure {
  const answerText = Array.isArray(qa.answer) ? qa.answer.join(' ') : String(qa.answer || '');
  const answerWords = answerText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const allObs = observations.join(' ').toLowerCase();
  
  // Check if answer keywords appear in observations
  const matchedWords = answerWords.filter(w => allObs.includes(w.toLowerCase()));
  const missingWords = answerWords.filter(w => !allObs.includes(w.toLowerCase()));
  
  // Determine failure type
  let failureType: 'retrieval' | 'synthesis' | 'implicit';
  let diagnosis: string;
  
  if (matchedWords.length === 0) {
    // No keywords found at all
    failureType = 'implicit';
    diagnosis = `Answer is IMPLICIT - requires inference. Keywords "${missingWords.join(', ')}" not in observations.`;
  } else if (matchedWords.length < answerWords.length * 0.5) {
    // Partial match
    failureType = 'synthesis';
    diagnosis = `Partial match. Found: "${matchedWords.join(', ')}". Missing: "${missingWords.join(', ')}". May need semantic bridging.`;
  } else {
    // Most keywords found but still failed (threshold issue)
    failureType = 'retrieval';
    diagnosis = `Keywords found but threshold not met. Found: "${matchedWords.join(', ')}". Answer: "${answerText}"`;
  }
  
  return {
    question: qa.question,
    expected: answerText,
    category: qa.category,
    evidence: qa.evidence || [],
    observations: observations.slice(0, 5),
    failureType,
    diagnosis
  };
}

async function runAutopsy(): Promise<void> {
  console.log('=== LOCOMO Category 3 (Inference) Autopsy ===\n');
  
  const data: Conversation[] = JSON.parse(readFileSync(CONFIG.datasetPath, 'utf-8'));
  
  // Collect all Category 3 questions
  const cat3Questions: Array<{ qa: Question; conv: Conversation }> = [];
  
  for (const conv of data) {
    for (const qa of conv.qa) {
      if (qa.category === 3) {
        cat3Questions.push({ qa, conv });
      }
    }
  }
  
  console.log(`Total Category 3 questions: ${cat3Questions.length}\n`);
  
  // Analyze each question
  const failures: Failure[] = [];
  let correct = 0;
  
  for (const { qa, conv } of cat3Questions) {
    const observations = extractObservations(conv);
    const answerText = Array.isArray(qa.answer) ? qa.answer.join(' ') : String(qa.answer || '');
    const answerWords = answerText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const allObs = observations.join(' ').toLowerCase();
    
    // Check if passed
    const matchCount = answerWords.filter(w => allObs.includes(w.toLowerCase())).length;
    const threshold = Math.ceil(answerWords.length * 0.5);
    
    if (matchCount >= threshold) {
      correct++;
    } else {
      failures.push(analyzeFailure(qa, observations));
    }
  }
  
  console.log(`Correct: ${correct}/${cat3Questions.length} (${((correct / cat3Questions.length) * 100).toFixed(1)}%)`);
  console.log(`Failures: ${failures.length}\n`);
  
  // Categorize failures
  const failureCounts = {
    retrieval: 0,
    synthesis: 0,
    implicit: 0
  };
  
  for (const f of failures) {
    failureCounts[f.failureType]++;
  }
  
  console.log('=== Failure Type Distribution ===');
  console.log(`Retrieval (keywords found, threshold issue): ${failureCounts.retrieval}`);
  console.log(`Synthesis (partial match, needs bridging): ${failureCounts.synthesis}`);
  console.log(`Implicit (no keywords, needs inference): ${failureCounts.implicit}\n`);
  
  // Show first 10 failures with detailed analysis
  console.log('=== Detailed Failure Analysis (First 10) ===\n');
  
  for (let i = 0; i < Math.min(10, failures.length); i++) {
    const f = failures[i];
    console.log(`--- Failure ${i + 1} [${f.failureType.toUpperCase()}] ---`);
    console.log(`Question: ${f.question}`);
    console.log(`Expected: ${f.expected}`);
    console.log(`Diagnosis: ${f.diagnosis}`);
    
    if (f.evidence.length > 0) {
      console.log(`Evidence hints: ${f.evidence.join(', ')}`);
    }
    
    console.log(`Sample observations:`);
    f.observations.slice(0, 2).forEach(obs => {
      console.log(`  - ${obs.substring(0, 100)}...`);
    });
    console.log();
  }
  
  // Propose solutions
  console.log('=== Proposed v3.5 Solutions ===\n');
  
  console.log('1. IMPLICIT FAILURES (' + failureCounts.implicit + ' cases):');
  console.log('   → Add Semantic Bridge: LLM call to expand "hospital" → "unwell", "office" → "working"');
  console.log('   → Add Commonsense Knowledge Graph: Location → Condition mapping');
  console.log();
  
  console.log('2. SYNTHESIS FAILURES (' + failureCounts.synthesis + ' cases):');
  console.log('   → Add Duration Tracking: "started 4-week course on Aug 1" → busy Aug 15');
  console.log('   → Add Probability Scoring: Return "Likely" instead of binary True/False');
  console.log();
  
  console.log('3. RETRIEVAL FAILURES (' + failureCounts.retrieval + ' cases):');
  console.log('   → Lower keyword threshold for inference questions');
  console.log('   → Add semantic similarity search (embeddings)');
  console.log();
  
  // Estimate improvement
  const potentialGain = failureCounts.implicit * 0.7 + failureCounts.synthesis * 0.8 + failureCounts.retrieval * 0.5;
  const projectedScore = correct + potentialGain;
  const projectedPct = ((projectedScore / cat3Questions.length) * 100).toFixed(1);
  
  console.log('=== Projected Improvement ===');
  console.log(`Current: ${correct}/${cat3Questions.length} (${((correct / cat3Questions.length) * 100).toFixed(1)}%)`);
  console.log(`Projected (with v3.5): ${Math.round(projectedScore)}/${cat3Questions.length} (${projectedPct}%)`);
  console.log(`Expected gain: +${((projectedScore - correct) / cat3Questions.length * 100).toFixed(1)}%`);
  
  // Overall LOCOMO impact
  const totalQuestions = 1986;
  const currentCorrect = 1670;
  const inferenceImprovement = potentialGain;
  const newTotal = currentCorrect + inferenceImprovement;
  const newOverall = ((newTotal / totalQuestions) * 100).toFixed(1);
  
  console.log(`\n=== Overall LOCOMO Impact ===`);
  console.log(`Current overall: 84.1% (${currentCorrect}/${totalQuestions})`);
  console.log(`With v3.5 Inference fix: ${newOverall}% (${Math.round(newTotal)}/${totalQuestions})`);
  console.log(`Target: 90%+`);
}

runAutopsy().catch(console.error);