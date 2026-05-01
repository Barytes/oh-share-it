# 产品决策记录

这个文档是 `oh-share-it` 的产品决策索引。每条决策的详细解释放在 `docs/decisions/` 下，便于后续持续补充背景、取舍和设计约束。

## 决策列表

| ID | 决策 | 状态 | 日期 | 详情 |
|---|---|---|---|---|
| D-001 | 产品优先做 agent-facing context layer，而不是先做 chatbot | 已采纳 | 2026-05-01 | [查看详情](decisions/001-agent-facing-context-layer.md) |
| D-002 | 保留每个人独立的 context，不把所有 context 强行合并 | 已采纳 | 2026-05-01 | [查看详情](decisions/002-independent-context-spaces.md) |
| D-003 | 把“复用”改写成 context routing 问题 | 已采纳 | 2026-05-01 | [查看详情](decisions/003-context-routing-over-reuse.md) |
| D-004 | 冲突观点是高价值 context，不应被默认合并 | 已采纳 | 2026-05-01 | [查看详情](decisions/004-tension-as-context.md) |
| D-005 | 公共层更像路由层和治理层，而不是单一真相层 | 已采纳 | 2026-05-01 | [查看详情](decisions/005-public-layer-as-routing-and-governance.md) |
| D-006 | 默认 routing，允许局部、可追溯、可撤销的 merge | 已采纳 | 2026-05-01 | [查看详情](decisions/006-hybrid-routing-and-merge.md) |

## 当前主线判断

`oh-share-it` 不应该在“把所有 context 合并成一个公共知识库”和“每个人完全保留孤立 context”之间二选一。

更稳的方向是：

**默认保留独立 context，用 routing 解决调用问题；当内容足够稳定、低争议、可验证、可追溯时，再允许局部 merge 成公共入口、共识页或项目记忆。**

这意味着产品的核心不是强行复用，也不是制造一个统一大脑，而是在个人、项目、团队和公共层之间建立可控的 context routing 与有限 merge 机制。
