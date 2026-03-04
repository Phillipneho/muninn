# P3: Summary Vectors Implementation Plan

## Architecture (Expert Feedback)

### 1. Storage: Fact + Evidence Embeddings
**NOT raw episodes** — embed the extracted fact with context.

```typescript
// Vector content format
const vectorContent = `${fact.subject} ${fact.predicate} ${fact.object} | Context: ${fact.evidence}`;

// Example
"Caroline feels anxious | Context: She mentioned feeling overwhelmed by the move"
```

**Why:** Keeps vectors clean. 500-word transcripts drown out signals like "Caroline feels anxious."

### 2. Retrieval: Reciprocal Rank Fusion (RRF)

```typescript
// SQL Branch
const sqlResults = db.getCurrentFacts('Caroline', { 
  temporalFilter: { start: '2023-01-01', end: '2023-12-31' }
});

// Vector Branch  
const vectorResults = await vectorSearch("emotional state", { limit: 10 });

// Merge with RRF
const merged = reciprocalRankFusion(sqlResults, vectorResults, {
  sqlWeight: 0.5,
  vectorWeight: 0.5
});
```

### 3. Query Intent Classification

| Intent | Trigger Words | Primary Retrieval |
|--------|---------------|-------------------|
| Temporal | "when", "in August", "last week" | SQL + temporal filter |
| Factual | "what", "who", "where" | SQL (structured) |
| Sentimental | "why", "feeling", "emotion" | Vector (semantic) |
| Causal | "because", "reason", "cause" | Vector (semantic) |

## Implementation Steps

### Step 1: Add embedding column to facts
```sql
ALTER TABLE facts ADD COLUMN summary_embedding BLOB;
CREATE INDEX idx_facts_embedding ON facts(summary_embedding);
```

### Step 2: Generate embeddings on fact creation
```typescript
// In createFact()
const summary = `${subject.name} ${predicate} ${object} | ${evidence}`;
const embedding = await embed(summary);
fact.summary_embedding = embedding;
```

### Step 3: Implement RRF
```typescript
function reciprocalRankFusion(
  sqlResults: Fact[],
  vectorResults: Fact[],
  weights: { sql: number; vector: number }
): RankedFact[] {
  const scores = new Map<string, number>();
  
  // SQL scores (lower rank = higher score)
  sqlResults.forEach((fact, i) => {
    const score = weights.sql / (i + 60); // RRF formula
    scores.set(fact.id, (scores.get(fact.id) || 0) + score);
  });
  
  // Vector scores
  vectorResults.forEach((fact, i) => {
    const score = weights.vector / (i + 60);
    scores.set(fact.id, (scores.get(fact.id) || 0) + score);
  });
  
  // Boost facts appearing in both
  const bothBoost = 2.0;
  sqlResults.forEach(fact => {
    if (vectorResults.find(v => v.id === fact.id)) {
      scores.set(fact.id, (scores.get(fact.id) || 0) * bothBoost);
    }
  });
  
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ fact: findFact(id), score }));
}
```

### Step 4: Query Intent Detection
```typescript
function detectIntent(query: string): 'temporal' | 'factual' | 'sentimental' {
  const lower = query.toLowerCase();
  
  if (/when|in (january|february|...)|last (week|month)/.test(lower)) {
    return 'temporal';
  }
  
  if (/why|feeling|emotion|because|reason/.test(lower)) {
    return 'sentimental';
  }
  
  return 'factual';
}
```

## Expected Results

| Benchmark | Current | With P3 | Target |
|-----------|---------|---------|--------|
| Single-hop | 40% | 50% | — |
| Temporal | 37% | 50% | — |
| Multi-hop | 50% | 60% | — |
| **Overall** | **26-40%** | **55-60%** | **55%** |

## Files to Create

- `src/embeddings.ts` — Embedding generation
- `src/hybrid-search.ts` — RRF implementation
- `src/query-intent.ts` — Intent classification
- `src/migrations/002_summary_embeddings.sql`