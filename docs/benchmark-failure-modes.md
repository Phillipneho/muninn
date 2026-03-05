# Benchmark Failure Modes & Mitigations

## Token Waste Analysis

| Failure | Tokens Wasted | Cause | Fix |
|---------|---------------|-------|-----|
| Session timeout | ~50K | 30s timeout too short | 60s+ timeout |
| API key missing | 0 | dotenv not loaded | dotenv.config() |
| ES module __dirname | 0 | CommonJS pattern | fileURLToPath |
| Process killed | All | No graceful shutdown | SIGINT handler |
| OOM | All | Memory leak | Periodic cleanup |
| Rate limit | Varies | 429 from OpenAI | Exponential backoff |
| Bad JSON | ~5K | LLM malformed | Try-catch + fallback |

## Failure Modes to Plan For

### 1. Timeouts (CRITICAL)

| Operation | Current | Safe | Mitigation |
|-----------|---------|------|------------|
| Session ingestion | 30s | 90s | 60s base + 30s per 100 sessions |
| Answer generation | 30s | 45s | Retry with backoff |
| Recall query | 30s | 30s | OK as-is |

**Root cause:** LLM extraction is slow (2-5s per sentence × 50 sentences = 250s worst case)

**Solution:** Increase timeouts AND add progress logging:
```typescript
// Ingestion: 90s base + 10s buffer
const INGESTION_TIMEOUT_MS = 90000;
const ANSWER_TIMEOUT_MS = 45000;
```

### 2. OpenAI Rate Limiting (429)

**Symptom:** After sustained calls, OpenAI returns 429

**Mitigation:**
```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      if (e.status === 429 || e.code === 'ECONNRESET') {
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        console.log(`   ⏳ Rate limited, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw e;
      }
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 3. Memory Exhaustion

**Symptom:** Node.js OOM kill at ~500MB heap

**Root cause:** SQLite WAL grows with observations, not released

**Mitigation:**
```typescript
// After each conversation, prune memory
if ((i + 1) % 3 === 0) {
  const stats = muninn.getStats();
  console.log(`   📊 DB: ${stats.entityCount} entities, ${stats.observationCount} observations`);
  
  // If too large, warn (can't easily prune with current architecture)
  if (stats.observationCount > 50000) {
    console.log(`   ⚠️ Large DB, consider clearing between runs`);
  }
}
```

**Better solution:** Use separate DB per conversation, then merge stats at end.

### 4. Malformed JSON from LLM

**Symptom:** `SyntaxError: Unexpected token` when parsing extraction

**Mitigation:**
```typescript
async function extractSafe(content: string): Promise<ExtractionResult> {
  try {
    return await extractor.extract(content);
  } catch (e) {
    console.log(`   ⚠️ Extraction failed, using empty result`);
    return { entities: [], observations: [] };
  }
}
```

### 5. Network Failures

**Symptom:** `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`

**Mitigation:** Same as rate limiting - exponential backoff with retries

### 6. Process Termination (SIGINT/SIGTERM)

**Symptom:** Ctrl+C kills process without saving

**Current:** Checkpoint saved on SIGINT/SIGTERM

**Issue:** Checkpoint might be partial if killed mid-write

**Mitigation:**
```typescript
// Atomic checkpoint write
function saveCheckpointAtomic(cp: Checkpoint): void {
  const tmpPath = CHECKPOINT_PATH + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(cp, null, 2));
  renameSync(tmpPath, CHECKPOINT_PATH); // Atomic on most filesystems
}
```

### 7. SQLite Lock Contention

**Symptom:** `SQLITE_BUSY` errors under heavy write

**Mitigation:** Already using WAL mode, but should increase timeout:
```typescript
// In database init
db.pragma('busy_timeout = 30000'); // 30s wait for lock
```

### 8. Empty Recall Results

**Symptom:** `facts: []` even though observations stored

**Root cause:** Search query doesn't match stored predicates

**Mitigation:** Log recall queries and results:
```typescript
console.log(`   🔍 Query: "${question.substring(0, 30)}..."`);
console.log(`   📊 Found: ${result.facts?.length || 0} facts`);
```

### 9. Answer Generation Failure

**Symptom:** OpenAI returns empty or malformed answer

**Mitigation:**
```typescript
async function generateAnswer(query: string, facts: any[]): Promise<string> {
  if (!facts || facts.length === 0) {
    return "I don't have information about that.";
  }
  
  try {
    const response = await withRetry(() => 
      openai.chat.completions.create({...})
    , 3);
    
    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer || answer.length < 2) {
      return "I don't have information about that.";
    }
    return answer;
  } catch (e) {
    return "I don't have information about that.";
  }
}
```

### 10. JSONL Corruption

**Symptom:** Partial write on crash

**Current:** `appendFileSync` per question

**Issue:** If crash mid-write, JSONL line is corrupted

**Mitigation:**
```typescript
// Write complete line atomically
const line = JSON.stringify(result) + '\n';
appendFileSync(RESULTS_STREAM, line);
```

Actually, `appendFileSync` is already atomic for small writes (< 4KB on most systems).

## Pre-Flight Checklist

Before running, verify:
- [ ] `.env` has `OPENAI_API_KEY`
- [ ] Timeout is 90s for ingestion
- [ ] Rate limit retry is enabled
- [ ] Graceful shutdown is wired
- [ ] Results directory exists
- [ ] Previous run is cleaned up (no stale DB)

## Token Budget Estimation

| Operation | Tokens/Call | Calls | Total |
|-----------|-------------|-------|-------|
| Session extraction | ~2000 | 190 | 380K |
| Answer generation | ~500 | 1542 | 771K |
| **Total** | | | **~1.15M tokens** |

At GPT-4o-mini pricing: ~$1.15 per full run

## Recommendations

1. **Run overnight** when there's time for 3+ hour runs
2. **Use checkpointing** to resume from crashes
3. **Log progress** every question to diagnose issues
4. **Separate concerns** - test ingestion separately from full benchmark
5. **Dry run** - run 1 conversation first to validate timeouts

---

*Created: 2026-03-05 after multiple failed benchmark runs*