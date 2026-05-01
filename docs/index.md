# oh-share-it 文档索引

这个目录记录 `oh-share-it` 的产品定义、MVP 目标、架构思考和产品决策。

## 推荐阅读顺序

1. [产品定义与核心信念](belief.md)
2. [MVP OKR](mvp-okr.md)
3. [产品决策记录](decisions.md)
4. [架构草稿](architectue.md)

## 文档架构

### 价值与信念

- [产品定义与核心信念](belief.md)

这份文档回答：为什么要做这个产品，它相信什么，核心价值是什么。

它不再承担 MVP OKR 或具体 build brief 的职责。

### MVP 与验证

- [MVP OKR](mvp-okr.md)

这份文档回答：第一版产品要验证什么，用户具体能做什么，系统必须跑通哪条最小闭环。

当前 MVP 闭环是：

**share context -> layer context -> route context -> expose to agents -> improve routing。**

### 产品决策

- [产品决策记录](decisions.md)

决策详情：

- [D-001：产品优先做 agent-facing context layer，而不是先做 chatbot](decisions/001-agent-facing-context-layer.md)
- [D-002：保留每个人独立的 context，不把所有 context 强行合并](decisions/002-independent-context-spaces.md)
- [D-003：把“复用”改写成 context routing 问题](decisions/003-context-routing-over-reuse.md)
- [D-004：冲突观点是高价值 context，不应被默认合并](decisions/004-tension-as-context.md)
- [D-005：公共层更像路由层和治理层，而不是单一真相层](decisions/005-public-layer-as-routing-and-governance.md)
- [D-006：默认 routing，允许局部、可追溯、可撤销的 merge](decisions/006-hybrid-routing-and-merge.md)

### 架构

- [架构草稿](architectue.md)

这份文档用于承载未来的系统结构、数据模型、agent-facing tools、routing 策略和 merge 机制。

## 当前核心判断

`oh-share-it` 的核心不是做一个更大的公共知识库，而是建立一个 hybrid context layer：

- 用户可以分享 useful context。
- 系统保留个人和项目 context 的独立性。
- 稳定、低争议、可追溯的 user-agnostic knowledge 可以 merge 成公共层。
- 用户提问时，系统能路由到有用的公共知识或 user-specific knowledge。
- 主流 coding agent 可以通过稳定接口调用 context 能力。
- routing 策略能从使用反馈中自我改进。
