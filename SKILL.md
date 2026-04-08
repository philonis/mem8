---
name: mem8
title: mem8 - OpenClaw 本地记忆插件
description: 在 OpenClaw 中植入本地持久记忆层，使用 SQLite + Ollama  embedding，实现 30%+ token 节省和稳定记忆恢复。
author: philonis
homepage: https://github.com/philonis/mem8
icon: 🧠
tags: [openclaw, memory, local-first, ollama, sqlite]
---

# 💾 mem8 – OpenClaw 本地记忆插件

## 🎯 核心价值

| 指标 | 中文 | English |
|------|------|--------|
| **Token 节省** | ≈ 36% vs 完整 transcript，≈ 27% vs 规则基线 | ~36% token saving vs full transcript, ~27% vs rule baseline |
| **纯本地** | 完全离线，无任何云依赖 | Fully offline, no cloud dependency |
| **持久化** | SQLite 跨会话记忆不丢失 | SQLite persistence, memories survive sessions |
| **自动清理** | 自动去重、陈旧清理、合并相似记忆 | Auto‑dedup, stale cleanup, merge similar memories |
| **一键安装** | `SKILL.md` URL 直接安装 | One‑click via SKILL.md URL |

## ⚡ 一键安装（OpenClaw 内部执行）

```bash
# 直接在 OpenClaw 中粘贴以下命令即可自动完成克隆、依赖安装、插件加载
openclaw plugin install https://github.com/philonis/mem8/blob/main/SKILL.md
```

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

## 🛠️ 配置要点

### Embedding Provider（默认 Ollama）

```json
{
  "embeddingProvider": "ollama",
  "embeddingModel": "nomic-embed-text:latest",
  "embeddingUrl": "http://127.0.0.1:11434"
}
```

### 数据库路径（默认）

```
~/.mem8/memories.sqlite
```

> **首次运行**：如果目录不存在，插件会自动创建 `~/.mem8/`。

## 🎤 CLI 命令

```bash
npm run mem -- list          # 列出已存储的记忆
npm run mem -- stats       # 统计记忆库（按 scope/type 分布）
npm run mem -- recall "你的偏好是什么？"  # 语义检索
npm run mem -- health     # 健康检查（目录/配置/Ollama）
npm run mem -- show <id>  # 查看单条记忆详情
npm run mem -- delete <id> # 删除记忆
npm run mem -- dump       # 导出全部记忆为 JSON
```

## 🧪 Benchmark（可选）

```bash
cd ~/.openclaw/plugins/mem8
npm run benchmark        # 离线运行评测基准
# 报告输出在 benchmark/output/ 目录
```

## 📚 文档

- **技术设计**：`docs/tech-design.md`
- **Benchmark 报告**：中英双语 PDF/Markdown（`benchmark/output/`）
- **API**：`openclaw-plugin.json`（定义了 `memory` 插槽）

## 🏆 适用场景

1. **长会话记忆**：跨多轮会话记住用户偏好、项目决策、技术路线
2. **Token 节省**：在不牺牲信息完整性的前提下显著降低 prompt 大小
3. **隐私敏感**：所有记忆本地存储，不外传
4. **离线 CI**：在无网络环境下持续运行

## ⚠️ 注意事项

- 首次使用请确保 **Ollama** 已启动并加载了 `nomic-embed-text` 模型（`ollama run nomic-embed-text`）。
- 如果不需要语义检索，可在配置中设置 `"embeddingProvider": "none"` 纯使用规则检索。
- 数据库默认位于 `~/.mem8/memories.sqlite`，如需迁移，直接复制文件即可。

## 📅 更新日志

- **v0.1.0**（2026‑04‑08）：首次发布，支持 SQLite、Ollama、离线 benchmark、自动合并与清理。

## 📄 许可证

MIT – 欢迎自由使用、修改、分发。

---

*一键安装方法：复制上面的一行 `openclaw plugin install https://github.com/philonis/mem8/blob/main/SKILL.md` 到你的 OpenClaw 中即可完成插件安装。*
