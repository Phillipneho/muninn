# Muninn

**Memory as evolving reality — Bi-temporal knowledge graph with Supermemory parity.**

Muninn is a Cloudflare-native memory system that provides:
- **Semantic search** over conversation sessions and documents
- **Fact extraction** with PDS (Psychological Decimal System) indexing
- **Knowledge graphs** with entity-relationship storage
- **Bi-temporal tracking** (valid_from, valid_until for temporal validity)
- **Sleep cycle** consolidation (Hippocampal → Cortex abstraction)

---

## Architecture

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Database** | Cloudflare D1 | SQLite at the edge |
| **Embeddings** | Cloudflare Workers AI | `@cf/baai/bge-m3` (1024 dims, 60K context) |
| **Vector Search** | Cloudflare Vectorize | Cosine similarity indexing |
| **Compression** | IsoQuant | 4-bit quantization, ~4x compression ratio |
| **API** | Cloudflare Workers | REST endpoints |
| **Extraction** | Ollama (GLM-5/MiniMax) | Fact extraction via LLM |

---

## Data Model

### Two-Tier Architecture

Muninn stores data in two complementary layers:

#### 1. Raw Sessions (Verbatim Storage)

```typescript
// Raw conversation sessions - the source of truth
interface RawSession {
  id: string;                    // "conv-26-7"
  content: string;               // Verbatim conversation text
  session_date: string;          // "2023-05-07" (preserved from source)
  source: string;                // "locomo", "chatgpt", "claude"
  speakers: string[];            // ["Caroline", "Melanie"]
  embedding?: Float32Array;      // BGE-M3 1024-dim, IsoQuant compressed
}
```

**Purpose**: Enable retrieval of exact source text for any query.

**Key insight**: Store verbatim sessions, search on embeddings, skip extraction for initial retrieval. This follows the MemPal architecture which achieved 88.9-100% accuracy on LOCOMO.

#### 2. Facts (Extracted Knowledge)

```typescript
// Extracted facts with PDS indexing
interface Fact {
  id: string;
  subject_entity_id: string;     // "Caroline"
  predicate: string;             // "attended"
  object_entity_id?: string;     // "LGBTQ support group"
  object_value?: string;         // Or literal value
  pds_decimal: string;           // "2101" (Immediate Kin)
  pds_domain: string;            // "200" (Relational)
  valid_from?: string;           // When fact became true
  valid_until?: string;         // When fact stopped being true
  confidence: number;            // 0.0-1.0
  source_session: string;        // Link back to raw session
}
```

**Purpose**: Enable single-hop and multi-hop reasoning queries.

---

## PDS (Psychological Decimal System)

Muninn uses PDS for deterministic fact categorization:

| Domain | Code | Category | Examples |
|--------|------|----------|----------|
| **1000** | Internal State | Identity, Health, Mood, Preferences |
| **2000** | Relational Orbit | Family, Friends, Colleagues, Professional |
| **3000** | Instrumental | Projects, Career, Infrastructure, Finance |
| **4000** | Chronological | Events, Duration, Routine, Origins |
| **5000** | Conceptual | Beliefs, Models, Philosophical |

### PDS Decimal Structure

Each fact has a 4-digit decimal code:

```
2101 → Domain 2000 (Relational)
       Subdomain 100 (Immediate Kin)
       Specific 01 (Partner)
       
4100 → Domain 4000 (Chronological)
       Subdomain 100 (Fixed Schedule)
       Specific 00 (General temporal)
```

### Query by PDS

```typescript
// Get all relationship facts
GET /api/entities/{id}/facts?pds=2100

// Get all temporal facts  
GET /api/entities/{id}/facts?pds=4100

// Get specific category
GET /api/entities/{id}/facts?pds=2101
```

---

## API Endpoints

### Raw Sessions

#### Store Session
```bash
POST /api/raw-sessions
Authorization: Bearer muninn_xxx
X-Organization-ID: your-org

{
  "content": "Full conversation text...",
  "session_date": "2024-01-15",
  "source": "chat",
  "speakers": ["user", "assistant"]
}
```

#### Search Sessions
```bash
GET /api/raw-sessions?q=what+did+they+say+about+basketball&topK=10
Authorization: Bearer muninn_xxx
X-Organization-ID: your-org

# Response
{
  "results": [
    {
      "id": "conv-26-7",
      "content": "[Caroline]: I love basketball...",
      "session_date": "2023-05-07",
      "similarity": 0.89
    }
  ]
}
```

### Facts

#### Store Fact
```bash
POST /api/facts
Authorization: Bearer muninn_xxx
X-Organization-ID: your-org

{
  "subject": "Caroline",
  "predicate": "attended",
  "object": "LGBTQ support group",
  "pds_decimal": "2301",
  "pds_domain": "200",
  "valid_from": "2023-03-15",
  "confidence": 0.95,
  "evidence": "[Caroline]: I went to the LGBTQ support group last week"
}
```

#### Get Entity Facts
```bash
GET /api/entities/{name}/facts?pds=2300
Authorization: Bearer muninn_xxx
X-Organization-ID: your-org

# Response
{
  "entity": { "name": "Caroline", "type": "person" },
  "facts": [
    {
      "predicate": "attended",
      "object": "LGBTQ support group",
      "pds_decimal": "2301",
      "valid_from": "2023-03-15"
    }
  ]
}
```

### Memories (Simple API)

#### Store Memory
```bash
POST /api/memories
Authorization: Bearer muninn_xxx
X-Organization-ID: your-org

{
  "content": "Your memory here",
  "type": "episodic|semantic|procedural"
}
```

#### Search Memories
```bash
GET /api/memories?q=query&topK=10
Authorization: Bearer muninn_xxx
X-Organization-ID: your-org
```

---

## Benchmark: LOCOMO Dataset

### Test Configuration

- **Dataset**: LOCOMO (Long-Context Memory Benchmark)
- **Questions**: 1,982 questions across 10 dialogues
- **Metric**: Recall@10 (percentage of questions where correct session appears in top 10 results)

### Results

| System | R@10 | Notes |
|--------|------|-------|
| **Muninn (BGE-M3)** | **~99%** | Pure semantic search |
| MemPalace | 96.6% R@5 | Hybrid scoring, no LLM |
| Previous (BGE-base + Hybrid) | 79% R@5 | Hybrid scoring helped |
| Previous (BGE-base Semantic) | 65% R@5 | Baseline |

### Key Findings

1. **BGE-M3 embeddings alone achieve near-perfect recall** (~99% R@10)
2. **Hybrid scoring HURTS performance** with strong embeddings (-1pp)
3. **No LLM reranking needed** - embeddings are sufficient for retrieval
4. **60K context window** - no session truncation required

### Why BGE-M3 Won

| Parameter | BGE-base-en-v1.5 | BGE-M3 |
|-----------|------------------|--------|
| Dimensions | 768 | 1024 |
| Context Window | 512 tokens | **60,000 tokens** |
| Multilingual | No | Yes |
| MTEB Retrieval | ~52 | ~54 |

The 60K context window is critical for long conversation sessions. Previous 512-token limit caused truncation and information loss.

### Running the Benchmark

```bash
# Ingest LOCOMO data
node ingest-locomo-clean.mjs

# Run benchmark
node benchmark-locomo.mjs

# Results saved to benchmark-results.json
```

---

## Fact Extraction Pipeline

### Current Status: In Development

The fact extraction system extracts structured knowledge from raw sessions:

```
Raw Session → LLM Extraction → Facts (PDS-indexed) → Knowledge Graph
```

### Architecture

```typescript
// Extraction flow
interface ExtractionPipeline {
  // 1. Load unprocessed sessions
  source: "raw_sessions WHERE extracted_at IS NULL",
  
  // 2. Extract entities and facts
  extractor: "ollama/glm-5:cloud" | "workers-ai/llama-3.1-8b",
  
  // 3. Apply PDS classification
  classifier: PDS_DECIMAL_MAP,
  
  // 4. Store in knowledge graph
  storage: "facts + entities tables"
}
```

### Background Extraction

Facts can be extracted in the background via:

1. **Sleep Cycle** (Cron: 2 AM UTC)
   - Processes unconsolidated sessions
   - Extracts entities and facts
   - Links to existing knowledge graph

2. **On-Demand API**
   ```bash
   POST /api/admin/extract-sessions
   Authorization: Bearer muninn_xxx
   ```

### Extraction Models

| Model | Quality | Speed | Cost |
|-------|---------|-------|------|
| **GLM-5 Cloud** | High | Medium | Free (Ollama) |
| MiniMax M2.5 | High | Fast | Free (Ollama) |
| Workers AI Llama 3.1 | Medium | Fast | Free tier limited |

---

## Sleep Cycle (Consolidation)

Muninn implements a sleep cycle for memory consolidation:

### Flow

```
1. Query unprocessed sessions (HIPPOCAMPAL layer)
2. Group by entity + predicate (cluster)
3. For each cluster with 3+ sessions:
   a. Pass to LLM for consolidation
   b. Create CORTEX prototype (abstracted summary)
   c. Mark sessions as consolidated
4. Run forgetting cycle:
   a. Delete expired temporal facts
   b. Decay old session embeddings
   c. Remove if strength < 0.1
```

### Trigger

```bash
# Automatic (Cron)
Cron: "0 2 * * *"  # 2 AM UTC daily

# Manual
POST /api/admin/sleep-cycle
```

### Status

```bash
GET /api/sleep-cycle/status

# Response
{
  "last_run": "2026-04-10T02:00:00Z",
  "sessions_processed": 47,
  "facts_created": 312,
  "facts_expired": 23,
  "status": "completed"
}
```

---

## Deployment

### Prerequisites

- Cloudflare account with Workers, D1, Vectorize, and Workers AI enabled
- Wrangler CLI installed (`npm install -g wrangler`)

### 1. Create Resources

```bash
# Create D1 database
wrangler d1 create muninn-db

# Create Vectorize index (1024 dimensions for BGE-M3)
wrangler vectorize create muninn-embeddings-v2 \
  --dimensions=1024 \
  --metric=cosine
```

### 2. Configure wrangler.toml

```toml
name = "muninn"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "muninn-db"
database_id = "your-database-id"

[[vectorize]]
binding = "VECTORIZE"
index_name = "muninn-embeddings-v2"

[ai]
binding = "AI"

[triggers]
crons = ["0 2 * * *"]
```

### 3. Apply Schema

```bash
wrangler d1 execute muninn-db --file=./schema.sql
```

### 4. Deploy

```bash
wrangler deploy
```

---

## Project Structure

```
muninn-cloudflare/
├── src/
│   ├── index.ts                 # Main API endpoints
│   ├── raw-sessions-endpoint.ts # Session ingestion & search
│   ├── extraction.ts            # Fact extraction (LLM-based)
│   ├── pds-retrieval.ts         # PDS-aware query building
│   ├── date-resolver.ts         # Temporal reference resolution
│   ├── sleep-cycle.ts           # Background consolidation
│   ├── embedding.ts             # BGE-M3 embedding generation
│   ├── isoquant.ts               # Compression (4-bit quantization)
│   └── schema-raw.ts            # Raw sessions schema
├── schema.sql                   # D1 database schema
├── wrangler.toml                # Cloudflare configuration
├── benchmark-locomo.mjs         # LOCOMO benchmark runner
├── ingest-locomo-clean.mjs     # LOCOMO data ingestion
└── README.md                    # This file
```

---

## Development Roadmap

### ✅ Complete

- [x] BGE-M3 embedding integration (1024 dims, 60K context)
- [x] Vectorize semantic search
- [x] IsoQuant compression (4-bit)
- [x] LOCOMO benchmark (99% R@10)
- [x] Hybrid scoring removed (hurt performance)
- [x] Raw sessions ingestion
- [x] Sleep cycle cron (2 AM UTC)

### 🔄 In Progress

- [ ] **Fact extraction pipeline** - Extract facts from raw sessions
- [ ] **PDS classification** - Auto-assign PDS decimals to facts
- [ ] **Multi-hop reasoning** - Traverse entity relationships

### 📋 Planned

- [ ] Entity resolution (merge duplicates)
- [ ] Contradiction detection
- [ ] Profile endpoint (Supermemory parity)
- [ ] Decision traces (retrieval path tracking)
- [ ] Ongoing ingestion (continuous from chat sources)

---

## Configuration

### Environment Variables

```bash
# Cloudflare (automatic in Workers)
CF_ACCOUNT_ID=your-account-id
CF_API_TOKEN=your-api-token

# Authentication (set via wrangler secret)
wrangler secret put MUNINN_API_KEY
```

### API Keys

Muninn uses a single API key for authentication:

```bash
# Generate key
openssl rand -hex 32

# Store in D1
INSERT INTO organizations (id, name, api_key_hash)
VALUES ('your-org', 'Your Org', 'hash-of-key');
```

---

## Testing

### Quick Test

```bash
# Store a session
curl -X POST "https://api.muninn.au/api/raw-sessions" \
  -H "Authorization: Bearer muninn_xxx" \
  -H "X-Organization-ID: leo-default" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "User asked about the weather. Assistant said it was sunny.",
    "session_date": "2024-01-15",
    "source": "test"
  }'

# Search
curl "https://api.muninn.au/api/raw-sessions?q=weather&topK=5" \
  -H "Authorization: Bearer muninn_xxx" \
  -H "X-Organization-ID: leo-default"
```

---

## License

MIT

---

## References

- **MemPalace Paper**: Hybrid retrieval for long-context memory
- **BGE-M3**: BAAI General Embedding (1024 dimensions, multilingual)
- **PDS**: Psychological Decimal System (adapted for knowledge graphs)
- **LOCOMO Benchmark**: Long-Context Memory evaluation dataset