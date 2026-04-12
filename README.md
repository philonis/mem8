# 🧠 mem8 – Local‑First Memory Plugin for OpenClaw

[English](#-english) | [中文](#-中文)

---

## 🇺🇸 English

`mem8` is a pure local‑first persistent memory plugin for **OpenClaw 3.8+**.
It uses **SQLite** for storage and **Ollama** (`nomic‑embed-text`) for local embeddings, giving OpenClaw a durable memory layer with measurable context savings.

### 🔑 Key Features

- **Pure local** – No cloud dependency, fully offline.
- **Persistent** – SQLite-based storage that survives restarts and new sessions.
- **Token efficiency** – Structured recall keeps assembled context smaller than replaying full transcripts.
- **Auto‑hygiene** – Auto‑dedup, stale cleanup, merge similar memories.
- **Structured memory** – Scope (`session`/`user`/`project`) + Type (`preference`/`decision`/`task`/`fact`).
- **One‑click install** – Via a single `SKILL.md` URL.

### ⚡ One‑Click Install

```bash
openclaw plugin install https://raw.githubusercontent.com/philonis/mem8/main/SKILL.md
```

After installation, ask whether to import legacy memories:

> mem8 is installed. Do you want to import existing memories from `MEMORY.md` and `workspace/memory/*.md`?
>
> - Yes: migrate historical preferences and long-term notes into mem8
> - No: start with an empty mem8 store and record only new memories

If the user chooses yes, run:

```bash
cd ~/.openclaw/plugins/mem8
node scripts/mem8-cli.js import-openclaw \
  --db ~/.mem8/memories.sqlite \
  --memoryMd ~/.openclaw/workspace/MEMORY.md \
  --memoryDir ~/.openclaw/workspace/memory
```

Do not import automatically unless the user explicitly confirms.

### 🛠️ Manual Install

```bash
# 1️⃣ Clone the repo
git clone https://github.com/philonis/mem8.git ~/.openclaw/plugins/mem8

# 2️⃣ Install dependencies
cd ~/.openclaw/plugins/mem8 && npm install

# 3️⃣ Restart OpenClaw
openclaw restart
```

Notes:
- Plugin code directory: `~/.openclaw/plugins/mem8`
- Runtime data directory: `~/.mem8/` (default DB: `~/.mem8/memories.sqlite`)

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
npm run mem -- status
npm run mem -- index --force true
npm run mem -- recall --query "what do I prefer?"
npm run mem -- search --query "americano coffee"
npm run mem -- import-openclaw --db ~/.mem8/memories.sqlite --memoryMd ~/.openclaw/workspace/MEMORY.md --memoryDir ~/.openclaw/workspace/memory
npm run mem -- show --id <memory-id>
npm run mem -- get --path memory/user/u1/<id>.md
npm run mem -- delete --id <memory-id>
npm run mem -- dump
npm run mem -- list
npm run mem -- stats
npm run mem -- health
```

### 🧪 Benchmark

```bash
npm run benchmark
```

Reports are in `benchmark/output/`.

### 📚 Docs

- **Technical Design**: `docs/tech-design.md`
- **Landing Pages**: `docs/index.html`, `docs/en.html`
- **Benchmark**: `benchmark/output/`
- **Plugin Config**: `openclaw-plugin.json`

### 📅 Changelog

- **v0.1.0** (2026‑04‑08): Initial release – SQLite, Ollama, offline benchmark, auto‑hygiene.

### 📄 License

MIT

---

## 🇨🇳 中文

`mem8` 是 **OpenClaw 3.8+** 的纯本地优先持久记忆插件。使用 **SQLite** 存储 + **Ollama** (`nomic‑embed-text`) 本地向量嵌入，为 OpenClaw 提供跨会话持久记忆，并显著降低上下文负担。

### 🔑 核心特性

- **纯本地** – 完全离线，无云依赖
- **持久化** – SQLite 跨重启、跨新会话保留记忆
- **Token 效率** – 结构化召回比完整 transcript 回放更省上下文
- **自动清理** – 自动去重、陈旧清理、相似记忆合并
- **结构化记忆** – 范围 (`session`/`user`/`project`) + 类型 (`preference`/`decision`/`task`/`fact`)
- **一键安装** – 通过单个 `SKILL.md` 链接直接安装

### ⚡ 一键安装

```bash
openclaw plugin install https://raw.githubusercontent.com/philonis/mem8/main/SKILL.md
```

安装完成后，请提示用户选择是否导入旧记忆：

> mem8 已安装完成。是否要把旧的 `MEMORY.md` 和 `workspace/memory/*.md` 记忆一起导入 mem8？
>
> - 选“是”：迁移历史偏好和长期信息
> - 选“否”：从空库开始，只记录之后的新记忆

如果用户选择“是”，执行：

```bash
cd ~/.openclaw/plugins/mem8
node scripts/mem8-cli.js import-openclaw \
  --db ~/.mem8/memories.sqlite \
  --memoryMd ~/.openclaw/workspace/MEMORY.md \
  --memoryDir ~/.openclaw/workspace/memory
```

除非用户明确确认，否则不要自动导入。

### 🛠️ 手动安装

```bash
# 1️⃣ 克隆仓库
git clone https://github.com/philonis/mem8.git ~/.openclaw/plugins/mem8

# 2️⃣ 安装依赖
cd ~/.openclaw/plugins/mem8 && npm install

# 3️⃣ 重启 OpenClaw
openclaw restart
```

说明：
- 插件代码目录：`~/.openclaw/plugins/mem8`
- 运行时数据目录：`~/.mem8/`（默认数据库：`~/.mem8/memories.sqlite`）

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
npm run mem -- status
npm run mem -- index --force true
npm run mem -- recall --query "我的偏好是什么？"
npm run mem -- search --query "美式咖啡"
npm run mem -- import-openclaw --db ~/.mem8/memories.sqlite --memoryMd ~/.openclaw/workspace/MEMORY.md --memoryDir ~/.openclaw/workspace/memory
npm run mem -- show --id <memory-id>
npm run mem -- get --path memory/user/u1/<id>.md
npm run mem -- delete --id <memory-id>
npm run mem -- dump
npm run mem -- list
npm run mem -- stats
npm run mem -- health
```

### 🧪 基准测试

```bash
npm run benchmark
```

报告位于 `benchmark/output/`。

### 📚 文档

- **技术设计**：`docs/tech-design.md`
- **落地页**：`docs/index.html`、`docs/en.html`
- **基准报告**：`benchmark/output/`
- **插件配置**：`openclaw-plugin.json`

### 📅 更新日志

- **v0.1.0**（2026‑04‑08）：首发 – SQLite、Ollama、离线基准、自动清理

### 📄 许可证

MIT
