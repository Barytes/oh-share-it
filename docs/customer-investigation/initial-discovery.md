## 5 个真实场景（需求来自真实用户，可复现）

共同命题：**跨人/跨机孤岛检索「能推进任务、可共享」的 context，同时保住隐私与个人偏好。**

---

### 1. 双人创业：两台 Claude Code「公司大脑」漂移

**真实来源**  
[Ask HN: How do you share agent context across a team?](https://news.ycombinator.com/item?id=48848840)（snowhy）

**原话级需求**  
各跑本地 agent，策略/客户笔记/决策堆在本机；对方提问要从零开始。不想全量共享——一半是私人或半成品——只要 **shared 子集可读写，其余保持 private**。担心 Google Drive 同步冲突、无归属、边界只靠文件夹名。

**对应关键因素**  
隐私边界、个性化↔共识、同步/冲突、感知与审计。

**可复现任务与数据**

| 项 | 内容 |
|---|---|
| 数据 | 自建两个 fixture：`alice/memory/`、`bob/memory/`（各含 `private/` + 候选 `shared/`），再加一份 `gold_shared/`（应晋升的共识） |
| 任务 | Alice agent 已「发现」定价约定；Bob 在**不读 Alice private** 的前提下回答同一问题；再故意让双方同时写 `shared/pricing.md`，观察冲突 |
| 成功标准 | Bob 答对且未泄漏 Alice private；冲突可追溯到作者；错误晋升可撤销 |

---

### 2. Text-to-SQL：缺文档/外部知识就生成错 query

**真实来源**  
- 你们最初的分析师 YAML Skill 场景（指标/表习惯冲突）  
- 学术/工业基准把「文档=domain knowledge」做成可测信号：[BIRD](https://bird-bench.github.io/)（`evidence` 字段）、[KaggleDBQA](https://github.com/Chia-Hsuan-Lee/KaggleDBQA)（database documentation；论文称加文档可大幅提升准确率）

**需求本质**  
schema 不够 → 需要人类补充的 join/指标/口径；多人补充会冲突；Agent 必须在「有 knowledge」时明显更好。

**可复现任务与数据**

| 项 | 内容 |
|---|---|
| 数据 | [BIRD Mini-Dev](https://github.com/BIRD-bench/mini_dev)：11 库、500 题；每题有 `question` / `evidence` / `SQL`；库旁有 `database_description` CSV |
| 任务 A | 同题对比：仅 schema vs schema+evidence → execution accuracy |
| 任务 B（冲突版） | 复制某题 evidence 为 Analyst-A / Analyst-B 两份（改指标定义），测 routing 选对 vs 错误 merge |
| 成功标准 | EXECUTION MATCH（跑 gold 与预测 SQL，结果多重集相等）；冲突版应标 tension 或选对口径 |

---

### 3. 指标定义碎片化：Finance / Marketing / Product 各算一套「收入」

**真实来源**  
- [Show HN: Structured… DBT PR Reviews](https://news.ycombinator.com/item?id=41663606)：Finance 定义 revenue、Marketing 算 LTV、Product 定义 churn，同在 dbt 但逻辑略不同 → 报表对不上  
- [Building AI agents to query your databases](https://news.ycombinator.com/item?id=43361333)：评论共识——重要指标先经人确认进 semantic layer，再让 LLM 用

**对应关键因素**  
共识晋升、tension、投毒/错误持久化（错定义进公共层）、Agent 检索该听谁。

**可复现任务与数据**

| 项 | 内容 |
|---|---|
| 数据 | [dbt-labs/jaffle-sl-template](https://github.com/dbt-labs/jaffle-sl-template) 或 [jaffle_shop_metrics](https://github.com/dbt-labs/jaffle_shop_metrics)：`dbt seed` + MetricFlow（`mf query --metrics …`） |
| 任务 | Fork 出两套 `order_total`：A 含退款、B 不含；对同一自然语言问题「上周收入？」分别喂给 Agent |
| 成功标准 | 在**已声明口径**下与 `mf query` 结果一致；未声明时系统应拒绝伪共识或同时呈现两种定义 |

---

### 4. 数据工程团队：Agent 洞见散落本机，要中央 KB 但不想全塞进每个 repo

**真实来源**  
[r/dataengineering: How are you centralizing knowledge/context from AI agents?](https://www.reddit.com/r/dataengineering/comments/1t6ttuz/how_are_you_centralizing_knowledgecontext_from_ai/)  
高票实践：独立 `ai-docs` 仓（`AGENTS.md` + `skills/` + `rules/` + `docs/`）；评论提出三层——repo-local / user-scoped / org KB + MCP。

同类产品侧佐证：[Show HN: TeamContext](https://news.ycombinator.com/item?id=47103319)（Git-native 共享 context）。

**对应关键因素**  
分层空间、低成本贡献、跨工具路由、避免 context 膨胀。

**可复现任务与数据**

| 项 | 内容 |
|---|---|
| 数据 | 两个玩具 repo + 一个 `ai-docs`；或直接用 [TeamContext](https://github.com/hzhou9/TeamContext) / 自建 symlink 布局 |
| 任务 | Agent-A 在 repo1 学到「部署必须跑 X」并**晋升**到 org docs；Agent-B 在 repo2 做相关任务时应检索到；A 的个人偏好（如「我喜欢 verbose log」）不得进 org |
| 成功标准 | B 无需重教即可遵守 X；user prefs 隔离；PR 可审晋升内容 |

---

### 5. 个人 Memory ↔ 团队 Memory：要同步/共享，又怕泄私密、怕毒化 wiki

**真实来源**  
- [r/ClaudeCode: Local per repo memory was a bad idea](https://www.reddit.com/r/ClaudeCode/comments/1rzrgdy/local_per_repo_memory_was_a_bad_idea/)：有人要**不跟仓库分享**的记忆；有人要多机同步  
- [claude-autosync](https://www.reddit.com/r/ClaudeCode/comments/1uibqbq/i_built_claudeautosync_keep_your_claude_code/)：私有仓同步；`local.md` gitignore；公开仓拒绝 in-project memory  
- [Show HN: Karpathy-style LLM wiki](https://news.ycombinator.com/item?id=47899844)：`agents/{slug}/notebook` 私有 + `team/` 共享；晋升需人审；评论强调错误条目被引用会污染整个 KB（「confident BS」）

**对应关键因素**  
Sweeper/晋升、通知 vs 审计、错误持久化、离线多机、隐私（API key/路径不进共享）。

**可复现任务与数据**

| 项 | 内容 |
|---|---|
| 数据 | 最小双层仓：`notebook/private.md`（含假 API key + 半成品判断）+ `team/wiki.md`；或 WUPHF 式目录 |
| 任务 | （1）多机/双会话 sync 个人规则但不泄漏 `local.md`；（2）sweeper 提议把「可共享惯例」晋升到 team；（3）注入一条错误事实到 team，测后续 agent 是否复读、能否降级 |
| 成功标准 | private 零泄漏；晋升可审；错误事实可检出并可撤销；无「每次分享都 Slack 轰炸」也能事后审计 |

---

## 怎么用这 5 个场景验产品

| # | 场景 | 最强信号 | 复现难度 |
|---|---|---|---|
| 1 | 双 co-founder agent | 共享/私有边界 + 写冲突 | 低（自建 fixture） |
| 2 | Text-to-SQL + evidence | 知识进 context → 准确率↑ | 低–中（BIRD Mini-Dev） |
| 3 | 冲突指标定义 | tension vs 伪共识 | 低（Jaffle + 双 YAML） |
| 4 | 中央 ai-docs / TeamContext | 跨 repo 路由、分层 | 中 |
| 5 | Memory 晋升与投毒 | sweeper、审计、可撤销 | 低–中 |

若只做 **一个端到端 demo**，优先 **2（BIRD evidence）+ 3（双口径指标）**：有公开数据、有客观评分（execution match / `mf query`），且直接对应「分析师 YAML Skill」原帖。若强调 **系统形态（双层库 + 晋升）**，用 **1 + 5** 更贴 Jean-Denis / 联邦学习叙事。