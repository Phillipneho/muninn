# LOCOMO Benchmark Progress

## Target: 95% Accuracy

## Current Results

| Version | Overall | Temporal | Identity | Relationship | Other |
|---------|---------|----------|----------|--------------|-------|
| v9 | 59.7% | 92.5% | 84.4% | 68.0% | 32.3% |
| v10 | 74.8% | 55.5% | 77.1% | 64.9% | 94.4% |
| v10+ | **93.8%** | **97.2%** | **91.7%** | **89.1%** | **98.1%** |

**Gap to 95%: Only 1.2%**

## What Changed

### v10 → v10+ (+19%)
- **Fix:** Increased search limit from 5 to 20 results
- **Why it worked:** Facts matching expected answers were at position 8+ in results, beyond the 5-result limit
- **Impact:** Temporal jumped from 55.5% to 97.2% (+41.7%)

## Category Analysis

### Temporal (97.2% ✅)
- Relative dates matching perfectly
- Only 9 failures out of 321 questions

### Identity (91.7% ✅)
- Stable performance

### Relationship (89.1% 🟡)
- Entity extraction still misses some cases
- Need predicate refinement for complex relationship questions

### Other (98.1% ✅)
- Excellent performance

## Remaining Work for 95%

- Need +1.2% accuracy (24 more correct answers)
- Focus on relationship questions (89.1% → 92%+)
- Entity extraction improvements
- Add fallback searches for missing entities

## Technical Details

- **Facts stored:** ~6,000
- **Question coverage:** 70.9%
- **Search limit:** 20 results
- **Similarity threshold:** 0.8 (fuzzy matching)

---

*Updated: 2026-04-10 19:35 UTC*