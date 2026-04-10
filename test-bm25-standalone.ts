// Standalone test of BM25 hybrid scoring logic

function computeBM25Score(query: string, facts: any[], k1: number = 1.2, b: number = 0.75): any[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  if (queryTerms.length === 0) return facts

  // Compute document frequencies
  const docFreq: Record<string, number> = {}
  const docLengths: number[] = []

  for (const fact of facts) {
    const docText = `${fact.predicate} ${fact.object_value} ${fact.evidence || ''}`.toLowerCase()
    docLengths.push(docText.split(/\s+/).length)

    const seenTerms = new Set<string>()
    for (const term of queryTerms) {
      if (docText.includes(term) && !seenTerms.has(term)) {
        docFreq[term] = (docFreq[term] || 0) + 1
        seenTerms.add(term)
      }
    }
  }

  const avgDocLength = docLengths.reduce((a, b) => a + b, 0) / (facts.length || 1)
  const N = facts.length

  // Score each fact
  return facts.map((fact, idx) => {
    const docText = `${fact.predicate} ${fact.object_value} ${fact.evidence || ''}`.toLowerCase()
    const docLength = docLengths[idx]

    let score = 0
    for (const term of queryTerms) {
      const tf = (docText.match(new RegExp(term, 'g')) || []).length
      const df = docFreq[term] || 0
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1)
      const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)))
      score += idf * tfNorm
    }

    return { ...fact, bm25_score: score }
  }).sort((a, b) => b.bm25_score - a.bm25_score)
}

function hybridFactRanking(query: string, facts: any[]): any[] {
  const bm25Facts = computeBM25Score(query, facts)
  const queryLower = query.toLowerCase()

  // Question intent patterns (with stemming/synonyms)
  const intentPatterns: Record<string, string[]> = {
    'health': ['health', 'medical', 'condition', 'illness', 'disease', 'sick', 'health problem', 'health issue'],
    'hobby': ['hobby', 'hobbies', 'interest', 'passion', 'enjoys', 'likes', 'loves', 'pastime', 'leisure', 'favorite'],
    'occupation': ['occupation', 'job', 'work', 'career', 'profession', 'works_at', 'employer', 'company', 'does for a living'],
    'car': ['car', 'cars', 'vehicle', 'drive', 'drives', 'owns', 'automobile'],
  }

  // Detect intent
  let detectedIntent: string | null = null
  for (const [intent, patterns] of Object.entries(intentPatterns)) {
    if (patterns.some(p => queryLower.includes(p))) {
      detectedIntent = intent
      break
    }
  }

  // Predicate-to-intent mapping (comprehensive)
  const predicateIntentMap: Record<string, string[]> = {
    'has_health_condition': ['health'],
    'health_issue': ['health'],
    'medical_condition': ['health'],
    'has_hobby': ['hobby', 'activity'],
    'hobby': ['hobby'],
    'interest': ['hobby'],
    'plays_instrument': ['hobby'],
    'restore': ['hobby'],  // car restoration is a hobby
    'sell': ['occupation'],  // selling is business/occupation
    'works_at': ['occupation'],
    'occupation': ['occupation'],
    'employer': ['occupation'],
    'job': ['occupation'],
    'drives': ['car'],
    'owns_car': ['car'],
    'vehicle': ['car'],
    'car': ['car'],
  }

  const maxBM25 = Math.max(...bm25Facts.map((f: any) => f.bm25_score), 0.001)

  return bm25Facts.map((fact: any) => {
    let hybridScore = fact.bm25_score

    // Intent boost
    if (detectedIntent) {
      const relevantPredicates = predicateIntentMap[fact.predicate?.toLowerCase()] || []
      if (relevantPredicates.includes(detectedIntent)) {
        hybridScore += 10
      }
    }

    // Normalize
    return {
      ...fact,
      hybrid_score: hybridScore,
      normalized_bm25: fact.bm25_score / maxBM25,
    }
  }).sort((a: any, b: any) => b.hybrid_score - a.hybrid_score)
}

// Test facts from LOCOMO
const testFacts = [
  { predicate: 'works_at', object_value: '2d adventure mobile game', evidence: 'John works at 2d adventure mobile game' },
  { predicate: 'has_health_condition', object_value: 'asthma', evidence: 'John has asthma' },
  { predicate: 'has_health_condition', object_value: 'diabetes', evidence: 'John was diagnosed with diabetes' },
  { predicate: 'has_hobby', object_value: 'painting', evidence: 'Evan enjoys painting' },
  { predicate: 'drives', object_value: 'Prius', evidence: 'Evan drives a Prius' },
  { predicate: 'sell', object_value: 'car', evidence: 'Dave sells cars' },
  { predicate: 'restore', object_value: 'car', evidence: 'Dave restores old cars' },
  { predicate: 'has_hobby', object_value: 'car restoration', evidence: 'Dave enjoys car restoration' },
]

const queries = [
  'What are John health problems?',
  'What car does Evan drive?',
  'What are Dave hobbies?',
]

console.log('=== BM25 Hybrid Scoring Test ===\n')

for (const query of queries) {
  console.log(`Query: "${query}"`)
  const ranked = hybridFactRanking(query, testFacts)
  console.log('Top 3 results:')
  ranked.slice(0, 3).forEach((f: any, i: number) => {
    console.log(`  ${i+1}. ${f.predicate}: ${f.object_value} (BM25: ${f.bm25_score?.toFixed(2)}, Hybrid: ${f.hybrid_score?.toFixed(2)})`)
  })
  console.log('')
}