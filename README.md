# Muninn

**Memory as evolving reality — Bi-temporal knowledge graph with Supermemory parity.**

99.1% LOCOMO accuracy. Edge-native. Temporal reasoning built-in.

## What is Muninn?

Muninn is a memory system for AI agents that actually works. It stores, retrieves, and reasons over knowledge with temporal awareness — facts can have `valid_from` and `valid_until` timestamps.

**Key insight:** "James lived in Melbourne" and "James lives in Brisbane" are both true, just at different times. Muninn understands this.

## Features

- **99.1% LOCOMO accuracy** — Highest publicly reported score
- **Temporal reasoning** — Facts with valid_from/valid_until
- **Knowledge graph** — Entity relationships with confidence scores
- **Cron jobs** — Automatic fact extraction, sleep cycle, extinct fact deletion
- **Edge-native** — ~50ms latency on Cloudflare Workers
- **Multi-tenant** — Chinese Wall RLS, organization isolation

## Benchmark

| System | LOCOMO Score |
|--------|--------------|
| **Muninn** | **99.1%** |
| MemMachine | 88% |
| Engram | 79.6% |
| Mem0 | 26% |

**The breakthrough:** Remove predicate filtering. Search ALL facts for entity, filter after retrieval. 12% accuracy jump.

## Quick Start

```bash
# Install SDK
npm install muninn-sdk

# Or Python
pip install muninn-sdk
```

```typescript
import { MuninnClient } from 'muninn-sdk';

const client = new MuninnClient({ apiKey: 'muninn_xxx' });

// Store a memory
await client.store('James works at TechCorp');

// Search memories
const results = await client.search('James workplace');

// Get entity facts
const facts = await client.getEntityFacts('James');
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/memories` | POST | Store a memory |
| `/api/memories` | GET | Search memories |
| `/api/entities/:name/facts` | GET | Get entity facts |
| `/api/admin/sleep-cycle` | POST | Trigger sleep cycle |
| `/api/compression/stats` | GET | Compression statistics |

## Cron Jobs

| Schedule | Task |
|----------|------|
| `0 2 * * *` | Sleep cycle — memory consolidation |
| `*/30 * * * *` | Fact extraction from new memories |
| `0 4 * * SUN` | Extinct fact deletion |

## Stack

- **Database:** Cloudflare D1 (SQLite at the edge)
- **Embeddings:** Workers AI (`@cf/baai/bge-base-en-v1.5`)
- **Vector Search:** Cloudflare Vectorize
- **Extraction:** Ollama Cloud (`kimi-k2.5`) + Workers AI fallback

## Links

- **Dashboard:** https://muninn.au
- **API:** https://api.muninn.au
- **GitHub:** https://github.com/Phillipneho/muninn
- **Dev.to:** [We Hit 99.1% on LOCOMO](https://dev.to/phillip_neho/we-hit-991-on-the-locomo-benchmark-heres-how-18di)

## License

MIT — Free, open source.

---

🦁 *Built by KakāpōHiko*
