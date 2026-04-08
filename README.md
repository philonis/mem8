# mem8

OpenClaw Memory Plugin - ContextEngine based persistent memory for AI assistants.

## Overview

mem8 is a memory plugin for OpenClaw that provides persistent, cross-session memory management using the OpenClaw 3.8+ ContextEngine interface.

## Features

- **Bootstrap** - Session startup memory restoration
- **Assemble** - Dynamic prompt assembly with relevant memories
- **Ingest** - Automatic memory extraction from conversations
- **Compact** - Intelligent memory compression when tokens are limited
- **Subagent Support** - Context inheritance and result回流 for subagents

## Installation

```bash
cd ~/mem8
npm install
npm run build
```

## Configuration

Add to your `openclaw.json`:

```json
{
  "plugins": {
    "slots": {
      "memory": "mem8"
    },
    "entries": {
      "mem8": {
        "enabled": true,
        "config": {
          "apiUrl": "https://api.mem9.ai",
          "dbPath": "~/.mem8/memories.db",
          "debug": false
        }
      }
    },
    "allow": ["mem8"]
  }
}
```

## Architecture

```
src/
├── index.ts           # Plugin entry point
├── context-engine.ts  # ContextEngine implementation
├── memory-store.ts    # SQLite storage layer
└── types.ts           # TypeScript type definitions
```

## License

MIT
