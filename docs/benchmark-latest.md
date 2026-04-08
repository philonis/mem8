# mem8 local memory benchmark 评测报告

## 核心指标摘要

- 提取准确率: 56.9%
- 提取召回率: 91.7%
- 召回命中率: 66.7%
- 平均 Token 消耗 (原始对话): 34.2
- 平均 Token 消耗 (规则基线): 32.0
- 平均 Token 消耗 (mem8): 24.3
- Token 节省 (vs 原始对话): 20.3%
- Token 节省 (vs 规则基线): 13.4%

## 对比表格

| 测试用例 | 提取召回率 | 召回命中率 | 原始对话 Token | 规则基线 Token | mem8 Token | Token 节省 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| pref-1 | 100.0% | 100.0% | 51.0 | 45.0 | 32.0 | 37.3% |
| decision-1 | 100.0% | 50.0% | 65.0 | 64.0 | 31.0 | 52.3% |
| noise-1 | 100.0% | 100.0% | 15.0 | 12.0 | 12.0 | 20.0% |
| multi-update-1 | 100.0% | 100.0% | 22.0 | 22.0 | 22.0 | 0.0% |
| conflicting-notes-1 | 100.0% | 50.0% | 30.0 | 29.0 | 29.0 | 3.3% |
| stale-cleanup-1 | 50.0% | 0.0% | 22.0 | 20.0 | 20.0 | 9.1% |

## 核心价值

- **记忆提纯**: 将多轮噪声对话转化为结构化紧凑 memory
- **Token 节省**: 保留关键用户偏好/项目决策的同时，大幅降低上下文 payload 大小
- **更强上下文**: 比传统 transcript 重放方式拥有更低 token 开销的记忆层

## 各用例详细结果

### pref-1
- User preference survives noisy turns and should be recalled compactly.
- 提取结果: 1/1 条匹配预期 memory
- 召回命中率: 100.0%
- 查询: What response style does the user want?
  - 命中: 是
  - 最高结果: user/preference - I prefer concise bullet-point answers instead of long narrative reports
  - Token: 原始=51, 规则=45, mem8=32

### decision-1
- Project decision should outrank weaker session notes.
- 提取结果: 3/3 条匹配预期 memory
- 召回命中率: 50.0%
- 查询: What storage choice did we settle on for mem8?
  - 命中: 是
  - 最高结果: project/decision - We decided to use SQLite as the default store for mem8
  - Token: 原始=65, 规则=64, mem8=31
- 查询: What is the next step for retrieval?
  - 命中: 否
  - 最高结果: project/decision - We decided to use SQLite as the default store for mem8
  - Token: 原始=65, 规则=64, mem8=31

### noise-1
- Chat noise should not dominate memory output.
- 提取结果: 2/2 条匹配预期 memory
- 召回命中率: 100.0%
- 查询: What principle should mem8 follow?
  - 命中: 是
  - 最高结果: project/fact - mem8 必须保持本地优先，不能依赖云同步
  - Token: 原始=15, 规则=12, mem8=12

### multi-update-1
- Multiple updates to the same memory should merge correctly.
- 提取结果: 1/1 条匹配预期 memory
- 召回命中率: 100.0%
- 查询: What is the user's preference for answers?
  - 命中: 是
  - 最高结果: user/preference - Actually, I prefer concise bullet points
  - Token: 原始=22, 规则=22, mem8=22

### conflicting-notes-1
- Conflicting notes should be handled, preferring higher confidence/importance.
- 提取结果: 2/2 条匹配预期 memory
- 召回命中率: 50.0%
- 查询: What can you tell me about feature X in mem8?
  - 命中: 否
  - 最高结果: project/fact - Project mem8 has feature X
  - Token: 原始=30, 规则=29, mem8=29
- 查询: What about feature Y?
  - 命中: 是
  - 最高结果: project/fact - Project mem8 has feature Y
  - Token: 原始=30, 规则=29, mem8=29

### stale-cleanup-1
- Stale session tasks should be pruned within user/project preferences.
- 提取结果: 1/2 条匹配预期 memory
- 召回命中率: 0.0%
- 查询: What tasks do we have?
  - 命中: 否
  - 最高结果: project/fact - Now, about mem8's architecture
  - Token: 原始=22, 规则=20, mem8=20
