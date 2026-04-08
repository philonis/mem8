---
title: mem8 – OpenClaw 本地记忆插件
layout: default
---

# 🧠 mem8 – Local‑First Memory for OpenClaw

<div align="center">

![mem8](logo.png)

**Pure local memory plugin with ~36% token savings**

[🇺🇸 English](#english) · [🇨🇳 中文](#中文)

</div>

---

## 🇺🇸 English

### Why mem8?

| Feature | Benefit |
|---------|---------|
| **Pure local** | No cloud, fully offline |
| **Token efficiency** | ~36% saving vs raw transcript |
| **Persistence** | SQLite survives restarts |
| **Auto‑hygiene** | Auto‑dedup, stale cleanup |
| **One‑click install** | Via `SKILL.md` URL |

### ⚡ One‑Click Install

```bash
openclaw plugin install https://github.com/philonis/mem8/blob/main/SKILL.md
```

### 🛠️ Manual Install

```bash
git clone https://github.com/philonis/mem8.git ~/.openclaw/plugins/mem8
cd ~/.openclaw/plugins/mem8 && npm install
openclaw restart
```

### 🎤 Quick Demo

```bash
npm run mem -- list       # list memories
npm run mem -- recall "我的偏好是什么？"
npm run mem -- health   # health check
```

### 📚 Documentation

- [README.md](README.md)
- [Technical Design](docs/tech-design.md)
- [Benchmark Reports](benchmark/output/)

---

## 🇨🇳 中文

### 为什么选择 mem8？

| 特性 | 收益 |
|------|------|
| **纯本地** | 完全离线，无云依赖 |
| **Token 节省** | 约 36% 节省 vs 完整 transcript |
| **持久化** | SQLite 跨会话不丢失 |
| **自动清理** | 自动去重、陈旧清理 |
| **一键安装** | 通过 `SKILL.md` URL 直接安装 |

### ⚡ 一键安装

```bash
openclaw plugin install https://github.com/philonis/mem8/blob/main/SKILL.md
```

### 🛠️ 手动安装

```bash
git clone https://github.com/philonis/mem8.git ~/.openclaw/plugins/mem8
cd ~/.openclaw/plugins/mem8 && npm install
openclaw restart
```

### 🎤 快速演示

```bash
npm run mem -- list           # 列出记忆
npm run mem -- recall "我的偏好是什么？" # 语义检索
npm run mem -- health      # 健康检查
```

### 📚 文档

- [README.md](README.md)
- [技术设计](docs/tech-design.md)
- [基准测试报告](benchmark/output/)

---

<div align="center">

**MIT License · [GitHub](https://github.com/philonis/mem8)**

</div>
