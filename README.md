# mem8 - Local-First Memory Plugin for OpenClaw

Pure local-first persistent memory plugin using OpenClaw 3.8+ ContextEngine interface.

## Features

- **Local embedding**: Ollama with `nomic-embed-text` model
- **SQLite storage**: Default at `~/.mem8/memories.sqlite`
- **Structured memory**: Scope (`session/user/project`) + Type (`preference/decision/task/fact`)
- **Memory hygiene**: Auto-merge duplicates, stale cleanup, compact pruning
- **Offline benchmark**: Built-in evaluation framework

## Installation

```bash
cd ~/.openclaw/plugins
git clone https://github.com/philonis/mem8.git
cd mem8
npm install
```

## Configuration

Default config (env or config file):

```json
{
  "dbPath": "~/.mem8/memories.sqlite",
  "embeddingProvider": "ollama",
  "embeddingModel": "nomic-embed-text:latest",
  "embeddingUrl": "http://127.0.0.1:11434",
  "maxTokensPerAssemble": 500,
  "debug": false
}
```

## Usage

### CLI

```bash
# List memories
npm run mem -- list

# Stats
npm run mem -- stats

# Recall with query
npm run mem -- recall "what did I prefer?"

# Show memory details
npm run mem -- show <id>

# Delete memory
npm run mem -- delete <id>

# Dump all
npm run mem -- dump
```

### Benchmark

```bash
npm run benchmark
```

Output in `benchmark/output/`.

## OpenClaw Plugin

Load via config:

```json
{
  "plugins": {
    "entries": {
      "memory": "mem8"
    }
  }
}
```

## Architecture

- `src/context-engine.ts` - Main ContextEngine implementation
- `src/memory-extractor.ts` - Rule-based memory extraction
- `src/memory-ranker.ts` - Heuristic + semantic ranking
- `src/memory-hygiene.ts` - Merge/cleanup/pruning
- `src/memory-store.ts` - Dual-repository (JSON + SQLite)
- `src/embedding-provider.ts` - Ollama embedding

## License

MIT
