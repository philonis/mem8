---
name: mem8
title: mem8 - OpenClaw 本地记忆插件
description: 在 OpenClaw 中植入本地持久记忆层，使用 SQLite + Ollama embedding，实现稳定的跨会话记忆恢复和更轻的上下文组装。
author: philonis
homepage: https://github.com/philonis/mem8
icon: 🧠
tags: [openclaw, memory, local-first, ollama, sqlite]
---

# 💾 mem8 – OpenClaw 本地记忆插件

## 🎯 核心价值

| 指标 | 中文 | English |
|------|------|--------|
| **纯本地** | 完全离线，无任何云依赖 | Fully offline, no cloud dependency |
| **持久化** | SQLite 跨重启、跨新会话保留记忆 | SQLite persistence across restarts and new sessions |
| **Token 效率** | 结构化召回比完整 transcript 更省上下文 | Structured recall is lighter than full transcript replay |
| **自动清理** | 自动去重、陈旧清理、合并相似记忆 | Auto‑dedup, stale cleanup, merge similar memories |
| **一键安装** | `SKILL.md` URL 直接安装 | One‑click via `SKILL.md` URL |

## ⚡ 一键安装（在 OpenClaw 中执行）

```bash
openclaw plugin install https://raw.githubusercontent.com/philonis/mem8/main/SKILL.md
```

安装完成后，请主动询问用户：

> 已安装完成。是否要把旧的 `MEMORY.md` / `workspace/memory/*.md` 记忆一起导入 mem8？
>
> - 选“是”：执行旧记忆导入，保留历史偏好和长期信息
> - 选“否”：保持空库启动，只记录后续新记忆

如果用户选择导入，可执行：

```bash
cd ~/.openclaw/plugins/mem8
node scripts/mem8-cli.js import-openclaw \
  --db ~/.mem8/memories.sqlite \
  --memoryMd ~/.openclaw/workspace/MEMORY.md \
  --memoryDir ~/.openclaw/workspace/memory
```

如果用户不确定，先解释差异，再让用户二选一；不要默认自动导入。

> **提示**：如果当前网络不支持 SSH/HTTPS 直连，请在本地手动克隆后复制插件目录到 `~/.openclaw/plugins/`。

## 📦 手动安装（备选方案）

```bash
# 1️⃣ 克隆插件仓库
git clone https://github.com/philonis/mem8.git ~/.openclaw/plugins/mem8

# 2️⃣ 安装依赖
cd ~/.openclaw/plugins/mem8 && npm install

# 3️⃣ 重启 OpenClaw
openclaw restart
```

说明：
- 插件代码目录：`~/.openclaw/plugins/mem8`
- 运行时数据目录：`~/.mem8/`（默认数据库：`~/.mem8/memories.sqlite`）

## 🛠️ 配置要点

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

## 🎤 CLI 命令

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

## 🧪 Benchmark（可选）

```bash
cd ~/.openclaw/plugins/mem8
npm run benchmark
```

## 📚 文档

- **技术设计**：`docs/tech-design.md`
- **落地页**：`docs/index.html`、`docs/en.html`
- **Benchmark 报告**：`benchmark/output/`
- **API**：`openclaw-plugin.json`

## 🏆 适用场景

1. **长会话记忆**：跨多轮会话记住用户偏好、项目决策、技术路线
2. **Token 节省**：在不牺牲信息完整性的前提下减少 prompt 大小
3. **隐私敏感**：所有记忆本地存储，不外传
4. **离线环境**：在无网络环境下持续运行

## ⚠️ 注意事项

- 首次使用请确保 **Ollama** 已启动并加载了 `nomic-embed-text` 模型（`ollama run nomic-embed-text`）。
- 如果不需要语义检索，可在配置中设置 `"embeddingProvider": "none"` 纯使用规则检索。
- 数据库默认位于 `~/.mem8/memories.sqlite`，如需迁移，直接复制文件即可。

## 📅 更新日志

- **v0.1.0**（2026‑04‑08）：首次发布，支持 SQLite、Ollama、离线 benchmark、自动合并与清理。

## 📄 许可证

MIT – 欢迎自由使用、修改、分发。
