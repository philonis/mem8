---
title: mem8 – OpenClaw 本地记忆插件
layout: default
---

# 🧠 mem8 – Local‑First Memory for OpenClaw

<div align="center">

![mem8](logo.png)

**Local-first persistent memory for OpenClaw**

[English page](./en.html) · [README](../README.md) · [SKILL](../SKILL.md)

</div>

---

## Why mem8?

| Feature | Benefit |
|---------|---------|
| **Pure local** | No cloud, fully offline |
| **Persistence** | SQLite survives restarts and new sessions |
| **Token efficiency** | Structured recall keeps prompt payload lean |
| **Auto-hygiene** | Auto-dedup, stale cleanup, merge similar memories |
| **One-click install** | Via a single raw `SKILL.md` URL |

## Install

```bash
openclaw plugin install https://raw.githubusercontent.com/philonis/mem8/main/SKILL.md
```

After installation, decide whether to import legacy memories from `MEMORY.md` and `workspace/memory/*.md`.

## Config

```json
{
  "embeddingProvider": "ollama",
  "embeddingModel": "nomic-embed-text:latest",
  "embeddingUrl": "http://127.0.0.1:11434",
  "dbPath": "~/.mem8/memories.sqlite",
  "maxTokensPerAssemble": 500,
  "debug": false
}
```

## CLI

```bash
npm run mem -- recall --query "what do I prefer?"
npm run mem -- search --query "americano coffee"
npm run mem -- import-openclaw \
  --db ~/.openclaw/memory/mem8.db \
  --memoryMd ~/.openclaw/workspace/MEMORY.md \
  --memoryDir ~/.openclaw/workspace/memory
npm run mem -- health
```

## Docs

- [README](../README.md)
- [SKILL](../SKILL.md)
- [Technical Design](./tech-design.md)
- [English landing page](./en.html)
