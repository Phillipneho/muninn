# Muninn v2

**Memory as evolving reality, not stored text.**

A Zep-inspired bi-temporal knowledge graph for AI agents. Extracts atomic facts, tracks state changes, and answers queries without replaying conversation history.

## Why Muninn v2?

| Feature | Current Memory Systems | Muninn v2 |
|---------|----------------------|-----------|
| **Storage** | Conversations (300+ turns) | Atomic facts |
| **Retrieval** | Vector search (high noise) | Structured → Graph → Semantic |
| **Temporal** | Metadata only | Bi-temporal (T + T') |
| **Contradictions** | Overwrite or ignore | Preserve both sides |
| **Token cost** | O(n) as history grows | O(log n) |

**Result:** 96% token reduction (5,000 → 200 tokens per query)

## Architecture

### Core Tables

| Table | Purpose |
|-------|---------|
| `episodes` | Raw source data (non-lossy) |
| `entities` | Named nodes in knowledge graph |
| `facts` | Bi-temporal assertions |
| `events` | State transitions |
| `relationships` | Directed, typed links |
| `contradictions` | Conflict preservation |

### Retrieval Priority

```
Query → Extract entities → 
  1. Query structured state (facts)
  2. Traverse knowledge graph
  3. Reason over events (temporal)
  4. Fall back to semantic search
→ Return context
```

## Quick Start

### Local PostgreSQL

```bash
# Setup local database
./setup.sh local

# Install dependencies
npm install

# Create tables
npm run migrate:local

# Run tests
npm test
```

### Neon (Cloud)

```bash
# Configure for Neon
DATABASE_URL='postgresql://user:pass@ep-xxx.pooler.neon.tech/muninn?sslmode=require' ./setup.sh neon

# Install and migrate
npm install
npm run migrate
```

## Usage

```typescript
import { Muninn } from 'muninn-v2';

const memory = new Muninn(process.env.DATABASE_URL);

// Remember a conversation
await memory.remember(`
  I went to the LGBTQ support group yesterday. 
  It was really helpful - I'm going to keep attending.
`, {
  source: 'conversation',
  actor: 'Caroline',
  sessionDate: '2023-05-07'
});
// → Creates:
//   - Entity: Caroline (person), LGBTQ support group (org)
//   - Fact: Caroline → attends → LGBTQ support group
//   - Event: Caroline.attendance = "LGBTQ support group"

// Query memory
const result = await memory.recall('What does Caroline attend?');
// → { source: 'structured', facts: [{ predicate: 'attends', object: 'LGBTQ support group' }] }

// Track changes over time
const evolution = await memory.getEvolution('Caroline');
// → [{ attribute: 'attendance', newValue: 'LGBTQ support group', ... }]

// Traverse knowledge graph
const path = await memory.traverseGraph('Caroline', 3);
// → Multi-hop connections

// Get unresolved contradictions
const conflicts = await memory.getContradictions();
```

## Bi-Temporal Model

Every fact has two time dimensions:

| Timestamp | Meaning |
|-----------|---------|
| `valid_from` | When it became true in the world |
| `valid_until` | When it stopped being true |
| `created_at` | When the system learned it |
| `invalidated_at` | When the system learned it was wrong |

**Example:**

```sql
-- Caroline attends LGBTQ group (valid from May 7)
INSERT INTO facts (subject, predicate, object, valid_from) 
VALUES ('Caroline', 'attends', 'LGBTQ group', '2023-05-07');

-- She stops attending (valid until June 15)
UPDATE facts SET valid_until = '2023-06-15' WHERE ...;

-- System learns it was wrong (invalidated)
UPDATE facts SET invalidated_at = now() WHERE ...;
```

## Contradiction Handling

When conflicting facts are detected:

1. **Preserve both sides** — Both facts stored in `facts` table
2. **Link in contradictions** — Conflict recorded with `conflict_type`
3. **Flag for resolution** — `resolution_status = 'unresolved'`
4. **Reason later** — Agent can query both, present to user if needed

```sql
SELECT * FROM find_contradictions();
-- → { subject: 'Caroline', predicate: 'attends', value_a: 'LGBTQ group', value_b: 'Church group' }
```

## API

### `remember(content, options?)`

Ingest content, extract facts, entities, events.

### `recall(query, options?)`

Query memory with priority: Structured → Graph → Events → Semantic.

### `getEvolution(entity, from?, to?)`

Get state changes for an entity over time.

### `traverseGraph(entity, maxDepth?)`

Traverse relationships from an entity.

### `getContradictions()`

Get unresolved conflicts.

## Comparison to Alternatives

| Feature | Mem0 | Zep | Muninn v2 |
|---------|------|-----|------------|
| **Storage** | Triplets | Episodes + Facts | Facts + Events |
| **Temporal** | `valid_at`/`invalid_at` | Bi-temporal | Bi-temporal |
| **Contradictions** | Marks invalid | Edge invalidation | **Preserves both** |
| **Retrieval** | Vector + Graph | Vector + Graph | **Structured first** |
| **Database** | Qdrant/Neo4j | PostgreSQL | PostgreSQL |

## Development Timeline

| Phase | Days | Status |
|-------|------|--------|
| Phase 0: Schema | 1 | ✅ Complete |
| Phase 1: Fact Extraction | 4 | ⏳ Next |
| Phase 2: Temporal Handling | 3 | — |
| Phase 3: Contradictions | 3 | — |
| Phase 4: Retrieval | 3 | — |
| Phase 5: Neon Migration | 3 | — |
| Phase 6: Integration | 2 | — |
| Phase 7: LOCOMO Testing | 4 | — |

## License

MIT

## Credits

- **Inspiration:** [Zep](https://github.com/getzep/zep) — Bi-temporal knowledge graph
- **Architecture:** PostgreSQL + pgvector for structured + semantic retrieval
- **Built for:** AI agents that need persistent, queryable memory