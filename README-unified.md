# Muninn Memory System

**Persistent memory for AI agents.** Knowledge graph with temporal reasoning, entity extraction, and multi-hop retrieval.

## Two Modes

| Mode | Storage | Embeddings | Cost |
|------|---------|------------|------|
| **Local** | SQLite | Ollama (nomic-embed-text) | Free |
| **Cloud** | Supabase | BYOK or hosted | $10/mo |

Mode is determined by environment variables:

- **Local mode**: No `MUNINN_API_KEY` → Uses SQLite + Ollama
- **Cloud mode**: `MUNINN_API_KEY` set → Uses Muninn API

## Quick Start

### Local Mode (Free)

```bash
# Install dependencies
npm install

# Pull embedding model
ollama pull nomic-embed-text

# Run
npm run mcp
```

### Cloud Mode (Paid)

```bash
# Get API key at https://muninn.au/dashboard
export MUNINN_API_KEY=muninn_xxx

# Run
npm run mcp
```

## Environment Variables

| Variable | Mode | Description |
|----------|------|-------------|
| `MUNINN_API_KEY` | Cloud | API key from muninn.au |
| `MUNINN_API_URL` | Cloud | API URL (default: api.muninn.au) |
| `DATABASE_PATH` | Local | SQLite path (default: ~/.openclaw/muninn-memories.db) |
| `EMBEDDING_MODEL` | Local | Ollama model (default: nomic-embed-text) |
| `OLLAMA_HOST` | Local | Ollama host (default: http://localhost:11434) |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Muninn Entry                           │
│                         mode.ts                             │
│                  (detect MUNINN_API_KEY)                    │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
        Local Mode                   Cloud Mode
              │                           │
    ┌─────────┴─────────┐       ┌────────┴────────┐
    │                   │       │                 │
  SQLite          Ollama       API           Supabase
  (local)         (local)      (remote)      (remote)
```

## Features

- **Knowledge Graph**: Entities, relationships, multi-hop traversal
- **Temporal Reasoning**: Query what you knew at any point in time
- **Auto-classification**: Episodic/Semantic/Procedural routing
- **Entity extraction**: People, orgs, projects, tech, locations, events, concepts
- **Contradiction detection**: Conflicting values flagged automatically
- **MCP-native**: Works with any agent framework via mcporter

## Version History

### v5.3 (Current)
- Audit trail for memory operations
- Lessons learned extraction
- Cloud API support with BYOK
- Unified local/cloud mode detection

### v5.2
- Decision traces
- Temporal validity
- Sleep cycle consolidation

### v5.0-v5.1
- SQLite + Ollama foundation
- Knowledge graph
- Multi-hop retrieval

## License

AGPL-3.0