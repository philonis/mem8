# 🧠 mem8 – Local‑First Memory Plugin for OpenClaw

[English](#-english) | [中文](#-中文)

---

## 🇺🇸 English

`mem8` is a pure local‑first persistent memory plugin for **OpenClaw 3.8+**.  
It uses **SQLite** for storage and **Ollama** (`nomic‑embed-text`) for local embeddings, delivering **~36% token savings** compared to full transcript replay.

### 🔑 Key Features

- **Pure local** – No cloud dependency, fully offline.
- **Token efficiency** – ~36% token saving vs raw transcript, ~27% vs rule‑based baseline.
- **Persistent** – SQLite-based, survives restarts.
- **Auto‑hygiene** – Auto‑dedup, stale cleanup, merge similar memories.
- **Structured memory** – Scope (`session`/`user`/`project`) + Type (`preference`/`decision`/`task`/`fact`).
- **One‑click install** – Via `SKILL.md` URL.

### ⚡ One‑Click Install

```bash
openclaw plugin install https://github.com/philonis/mem8/blob/main/SKILL.md
```

### 🛠️ Manual Install

```bash
# 1️⃣ Clone the repo
git clone https://github.com/philonis/mem8.git ~/.openclaw/plugins/mem8

# 2️⃣ Install dependencies
cd ~/.openclaw/plugins/mem8 && npm install

# 3️⃣ Restart OpenClaw
openclaw restart
```

### ⚙️ Configuration

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

### 🎤 CLI

```bash
npm run mem -- status                                    # memory/index status
npm run mem -- index --force true                        # backfill embeddings
npm run mem -- search --query "what do I prefer?"       # snippet-style recall
npm run mem -- get --path memory/user/u1/<id>.md        # inspect one memory
npm run mem -- list                                      # legacy table view
npm run mem -- health                                    # health check
```

### 🧪 Benchmark

```bash
npm run benchmark
```

Reports are in `benchmark/output/`.

### 📚 Docs

- **Technical Design**: `docs/tech-design.md`
- **Benchmark**: `benchmark/output/`
- **Plugin Config**: `openclaw-plugin.json`

### 📅 Changelog

- **v0.1.0** (2026‑04‑08): Initial release – SQLite, Ollama, offline benchmark, auto‑hygiene.

### 📄 License

MIT

---

## 🇨🇳 中文

`mem8` 是 **OpenClaw 3.8+** 的纯本地优先持久记忆插件。使用 **SQLite** 存储 + **Ollama** (`nomic‑embed-text`) 本地向量嵌入，实现 **约 36% token 节省**。

### 🔑 核心特性

- **纯本地** – 完全离线，无云依赖
- **Token 节省** – 约 36% vs 完整 transcript，约 27% vs 规则基线
- **持久化** – SQLite 跨会话不丢失
- **自动清理** – 自动去重、陈旧清理、相似记忆合并
- **结构化记忆** – 范围 (`session`/`user`/`project`) + 类型 (`preference`/`decision`/`task`/`fact`)
- **一键安装** – 通过 `SKILL.md` URL 直接安装

### ⚡ 一键安装

```bash
openclaw plugin install https://github.com/philonis/mem8/blob/main/SKILL.md
```

### 🛠️ 手动安装

```bash
# 1️⃣ 克隆仓库
git clone https://github.com/philonis/mem8.git ~/.openclaw/plugins/mem8

# 2️⃣ 安装依赖
cd ~/.openclaw/plugins/mem8 && npm install

# 3️⃣ 重启 OpenClaw
openclaw restart
```

### ⚙️ 配置

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

### 🎤 CLI

```bash
npm run mem -- status                                   # 查看记忆/索引状态
npm run mem -- index --force true                       # 回填向量嵌入
npm run mem -- search --query "我的偏好是什么？"        # 片段式召回
npm run mem -- get --path memory/user/u1/<id>.md       # 查看单条记忆
npm run mem -- list                                     # 兼容旧版列表视图
npm run mem -- health                                   # 健康检查
```

### 🧪 基准测试

```bash
npm run benchmark
```

报告位于 `benchmark/output/`。

### 📚 文档

- **技术设计**：`docs/tech-design.md`
- **基准报告**：`benchmark/output/`
- **插件配置**：`openclaw-plugin.json`

### 📅 更新日志

- **v0.1.0**（2026‑04‑08）：首发 – SQLite、Ollama、离线基准、自动清理

### 📄 许可证

MIT
