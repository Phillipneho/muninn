// Test BM25 hybrid scoring
import { computeBM25Score, hybridFactRanking } from './src/index'

// Test facts from LOCOMO dataset
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

// Test queries
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