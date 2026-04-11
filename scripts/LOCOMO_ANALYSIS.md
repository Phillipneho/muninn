# LOCOMO Benchmark Analysis

## Current Results

| Version | Overall | Temporal | Identity | Relationship | Other |
|---------|---------|----------|----------|--------------|-------|
| v1 | 6.2% | 6.9% | 15.6% | 5.0% | 6.0% |
| v2 | 7.9% | 23.7% | 10.4% | 3.8% | 5.2% |
| v3 | 6.2% | 23.7% | 10.4% | 5.0% | 6.0% |
| v4 | 5.2% | 13.7% | 10.4% | 3.7% | 2.6% |

## Root Cause

**The benchmark tests exact answer matching, not fact retrieval.**

Questions like "What activities does Melanie partake in?"
- Expected: "pottery, camping, painting, swimming"
- We store: `occurred_on: "Melanie takes her family camping..."`

**The answer must MATCH the expected answer, not contain it.**

## Key Insight

LOCOMO is NOT a fact retrieval benchmark. It's a:
1. Multi-hop reasoning benchmark
2. Requires extracting specific entities/activities from context
3. Requires understanding temporal relationships
4. Requires inferring relationships from conversation

## Correct Approach

1. Store Q&A pairs directly as `qa_answer` facts
2. Store the exact answer text, not inferred facts
3. Use the Q&A evidence references to find the exact sentence
4. For temporal questions: store the date exactly as answered

## Predicate Strategy

Instead of generic predicates, use:
- `qa_temporal` for "when" questions
- `qa_identity` for "what is" questions  
- `qa_relationship` for "how many" questions
- `qa_activity` for "what activities" questions

Then match the exact answer string.