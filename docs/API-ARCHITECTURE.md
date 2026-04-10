# Muninn API Architecture

**Generated:** 2026-04-08
**Status:** Production (Cloudflare D1 + Workers + Vectorize)

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INGESTION FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Client                                                                      │
│    │                                                                         │
│    ▼                                                                         │
│  POST /api/memories                                                          │
│    │                                                                          │
│    ├── 1. Preprocessing                                                      │
│    │     ├── normalizeDialogue() - Convert [Name]: to declarative            │
│    │     └── resolveRelativeDates() - Convert "yesterday" to ISO-8601        │
│    │                                                                         │
│    ├── 2. Extraction (extractWithAI)                                          │
│    │     ├── If content > 280 chars → extractChunked()                       │
│    │     │     ├── Split into 280-char chunks with 50-char overlap           │
│    │     │     ├── Extract from each chunk via extractSingleChunk()          │
│    │     │     └── Merge entities/facts, deduplicate                         │
│    │     └── Else → extractSingleChunk()                                     │
│    │           ├── Call Ollama Cloud (gemma3:12b) or Cloudflare Llama         │
│    │           ├── Parse JSON response                                        │
│    │           └── Resolve pronouns                                         │
│    │                                                                         │
│    ├── 3. Database Write                                                     │
│    │     ├── Insert memory row → memories table                              │
│    │     ├── Insert entities → entities table                                │
│    │     └── Insert facts → facts table                                       │
│    │                                                                         │
│    └── 4. Return                                                             │
│          { id, entities, facts, provider, model }                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           QUERY FLOW                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Client                                                                      │
│    │                                                                         │
│    ├── GET /api/memories?q=X                                                 │
│    │     ├── Keyword search on content column                                │
│    │     ├── Returns: { results: [{ id, content, ... }] }                    │
│    │     └── NO FACTS - Use /api/answer for facts                            │
│    │                                                                         │
│    ├── GET /api/answer?q=X  ← USE THIS FOR BENCHMARKS                        │
│    │     ├── Extract entity from question                                    │
│    │     ├── Query facts table by entity_id                                  │
│    │     ├── Synthesize answer from facts                                    │
│    │     └── Returns: { answer, facts: [{ subject, predicate, object }] }    │
│    │                                                                         │
│    ├── GET /api/entities/:name/facts                                         │
│    │     ├── Get entity by name                                              │
│    │     ├── Query facts WHERE subject_entity_id = X                         │
│    │     └── Returns: { entity, facts: [...] }                                │
│    │                                                                         │
│    └── GET /api/memories/:id                                                  │
│          ├── Get single memory by ID                                         │
│          └── Returns: { id, content, created_at } - NO FACTS                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### POST /api/memories

**Purpose:** Ingest new memory with extraction

**Request:**
```json
{
  "content": "Caroline went to a support group...",
  "source": "LOCOMO-conv26-session1",
  "session_date": "2023-05-08",
  "metadata": {}
}
```

**Response:**
```json
{
  "id": "264a5a20-bf5d-46bd-b164-76b2f6785169",
  "entities": 2,
  "facts": 19,
  "provider": "ollama-cloud",
  "model": "gemma3:12b",
  "extraction": {
    "entities": [{ "name": "Caroline", "type": "person" }],
    "facts": [{ "subject": "Caroline", "predicate": "has_identity", "object": "transgender woman" }]
  }
}
```

**Flow:**
1. `index.ts:2275` → `extractTwoPass()` or `extractConsensus()`
2. `extraction.ts:318` → `extractWithAI()` → `extractSingleChunk()` or `extractChunked()`
3. `extraction.ts:362` → `parseExtractionResponse()`
4. `index.ts:2310` → `storeFact()` for each fact

---

### GET /api/answer?q=X

**Purpose:** Answer question using knowledge graph (USE FOR BENCHMARKS)

**Request:**
```
GET /api/answer?q=What+is+Caroline+identity&limit=10
```

**Response:**
```json
{
  "answer": "Caroline has_identity transgender woman.",
  "facts": [
    { "subject": "Caroline", "predicate": "has_identity", "object": "transgender woman", "pds_decimal": "1201" }
  ],
  "entity": "Caroline",
  "latency_ms": 150
}
```

**Flow:**
1. `index.ts:2802` → Extract entity from question
2. `index.ts:2840` → Query facts by entity
3. `index.ts:2870` → Synthesize answer from facts

---

### GET /api/memories?q=X

**Purpose:** Keyword search on memory content (NO FACTS)

**Request:**
```
GET /api/memories?q=Caroline&limit=10&search_type=hybrid
```

**Response:**
```json
{
  "results": [
    { "id": "...", "content": "Caroline went to...", "created_at": "..." }
  ],
  "total": 5
}
```

**⚠️ WARNING:** This returns memory **content** only, NOT structured facts. Use `/api/answer` for facts.

---

### GET /api/memories/:id

**Purpose:** Get single memory by ID (NO FACTS)

**Response:**
```json
{
  "id": "264a5a20-bf5d-46bd-b164-76b2f6785169",
  "content": "Caroline went to...",
  "created_at": "2026-04-08T00:00:00Z"
}
```

**⚠️ WARNING:** This returns memory **content** only. Facts are stored separately in `facts` table.

---

### GET /api/entities/:name/facts

**Purpose:** Get all facts for an entity by name

**Response:**
```json
{
  "entity": { "name": "Caroline", "type": "person" },
  "facts": [
    { "subject": "Caroline", "predicate": "has_identity", "object": "transgender woman" }
  ]
}
```

---

## Database Schema

### memories table
```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT,
  source TEXT,
  session_date TEXT,
  created_at TEXT
);
```

### entities table
```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  name TEXT,
  type TEXT,
  organization_id TEXT
);
```

### facts table
```sql
CREATE TABLE facts (
  id TEXT PRIMARY KEY,
  subject_entity_id TEXT,  -- FK to entities.id
  predicate TEXT,
  object_value TEXT,       -- Literal value (e.g., "transgender woman")
  object_entity_id TEXT,   -- FK to entities.id (for entity references)
  pds_decimal TEXT,        -- PDS code (e.g., "1201")
  pds_domain TEXT,         -- PDS domain (e.g., "1000")
  confidence REAL,
  evidence TEXT,
  valid_from TEXT,
  valid_until TEXT,
  created_at TEXT
);
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | API endpoints, routing, database operations |
| `src/extraction.ts` | Fact extraction logic (extractWithAI, extractChunked, parseExtractionResponse) |
| `src/librarian-prompt.ts` | PDS taxonomy prompt for LLM |
| `src/inference-router.ts` | Query routing, entity extraction, PDS code mapping |
| `schema.sql` | D1 database schema |

---

## Critical Gotchas

### 1. Facts are NOT returned by /api/memories

```typescript
// WRONG - returns memory content only
GET /api/memories?q=Caroline
// Returns: { results: [{ content: "..." }] }  // NO FACTS!

// RIGHT - returns structured facts
GET /api/answer?q=What+is+Caroline+identity
// Returns: { answer: "...", facts: [...] }
```

### 2. Facts use foreign keys, not string values

```sql
-- Facts table schema
subject_entity_id TEXT,  -- FK to entities.id, NOT "Caroline" string
object_value TEXT,       -- Literal value (e.g., "transgender woman")
object_entity_id TEXT    -- FK for entity references (e.g., "Melanie")
```

### 3. Extraction has content length limit

```typescript
// Ollama Cloud limit: ~280 chars
if (content.length > 280) {
  // Use chunked extraction with 50-char overlap
  return extractChunked(ai, content, date, config, 280, 50);
}
```

### 4. Entity names use canonical_name

```typescript
// Librarian prompt outputs:
{ "canonical_name": "Caroline", "type": "person" }

// Parser must handle both:
name: e.canonical_name || e.name || ''
```

---

## Benchmark Configuration

```typescript
// CORRECT endpoint for benchmarks
const MUNINN_API = 'https://api.muninn.au';

async function queryMuninn(question: string) {
  const response = await fetch(
    `${MUNINN_API}/api/answer?q=${encodeURIComponent(question)}&limit=10`,
    {
      headers: {
        'Authorization': `Bearer ${MUNINN_KEY}`,
        'X-Organization-ID': ORG_ID
      }
    }
  );
  return response.json();
}

// Response structure
const result = await queryMuninn("What is Caroline's identity?");
// result.answer: "Caroline has_identity transgender woman."
// result.facts: [{ subject, predicate, object, pds_decimal }]
```

---

## Deployment

```bash
# Deploy to Cloudflare
cd /home/homelab/projects/muninn-cloudflare
CLOUDFLARE_API_TOKEN="..." npx wrangler deploy

# Query D1 directly
CLOUDFLARE_API_TOKEN="..." npx wrangler d1 execute muninn-db --command "SELECT COUNT(*) FROM facts" --remote
```

---

## Health Check

```bash
# Check API health
curl https://api.muninn.au/api/health

# Check extraction
curl -X POST https://api.muninn.au/api/memories \
  -H "Authorization: Bearer $MUNINN_KEY" \
  -H "X-Organization-ID: leo-default" \
  -H "Content-Type: application/json" \
  -d '{"content": "Caroline is a musician.", "session_date": "2023-05-08"}'

# Check query
curl "https://api.muninn.au/api/answer?q=What+is+Caroline" \
  -H "Authorization: Bearer $MUNINN_KEY" \
  -H "X-Organization-ID: leo-default"
```

---

*Last updated: 2026-04-08*