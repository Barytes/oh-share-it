# D-007：oh-share-it 是 external context provider，而不是 agent runtime

**状态**：已采纳

**日期**：2026-05-02

## 背景

`oh-share-it` 面向 coding agent，但它不应该把自己定义成一个新的 agent runtime。

用户已经在自己的 working directory 里使用 Codex、Claude Code、OpenCode、Cursor、Trae 或其他 coding agent。这些 agent 本来就会读取当前 repo、理解本地代码、遵循用户指令、执行命令、修改文件，并由用户决定它们在工作目录里的权限和行为。

如果 `oh-share-it` 试图接管这部分行为，产品边界会变得很重：它既要做知识库，又要定义 agent 如何工作、如何读本地文件、如何修改代码、如何执行任务。这会和用户已有工具、权限模型、工作习惯发生冲突。

更稳的边界是：`oh-share-it` 给某个 working directory 挂接一个外置知识库，让 agent 在需要额外背景时主动查询。

## 决策

`oh-share-it` 应定义为 coding agent 的 **external context provider**，而不是 agent runtime。

也就是说：

- coding agent 的 working directory 行为仍由用户和 agent 自己控制。
- `oh-share-it` 不侵入用户 repo，不改变 agent 默认读写本地文件的方式。
- `oh-share-it` 给当前工作目录挂接外置 context，包括 personal、project、public / consensus、tension 和 pending contribution。
- agent 可以通过 MCP、skill、CLI 或 file protocol 查询、读取、引用和写回这些外置 context。
- `oh-share-it` 负责组织、治理、路由和解释外置 context，但不替代 agent 对当前任务的推理。

一句话：

**本地工作目录仍是 agent 的主工作现场；`oh-share-it` 是它按需查询的外置知识层。**

## Working Directory 与 External Context 的边界

Working directory context 包括当前 repo 中的代码、README、docs、配置、测试、本地任务说明和当前对话。它默认由当前项目拥有，agent 可以在用户授权下直接读取或修改。

`oh-share-it` context 是工作目录之外的知识层。它可以包含：

- 某个人的经验和判断。
- 某个项目的历史、决策和交接。
- 团队稳定共识和公共入口。
- 冲突观点和 tension。
- 还未确认的贡献和 merge proposal。

这两组 context 的关系不是替代，而是叠加：

```text
User asks coding agent in a working directory
        |
        v
Agent understands local working directory context
        |
        v
Agent asks oh-share-it for extra context when useful
        |
        v
oh-share-it routes to relevant external docs
        |
        v
Agent combines local context + selected external context
        |
        v
Agent answers / edits / explains under user control
```

## 检索策略的边界

`oh-share-it` 不应该在 MVP 阶段制定一套重型的 agent 检索策略，强行规定 agent 每次如何搜索、如何阅读、如何判断。

更合适的分工是：

- `oh-share-it` 负责提供好的知识组织和 routing primitive。
- agent 负责在具体任务中决定是否查询、读哪些摘要、是否展开全文、如何结合本地 repo 得出结论。
- 用户保留覆盖权，可以要求只查 public / project / personal context，指定 owner，限制写回，或跳过外置 context。

因此，MVP 的策略应该是：

**提供可解释的默认 routing，而不是接管 agent 的检索推理。**

`oh-share-it` 可以根据 query、working directory、project binding、用户、权限、metadata 和历史反馈生成 `Session Context Pack`。但这个 pack 是对 agent 的建议和材料选择，不是不可覆盖的执行计划。

## 产品含义

- MCP、skill、CLI 和 file protocol 都只是外置 context 的访问方式，不应决定知识库结构。
- `oh-share-it` 的核心能力应聚焦在 context organization、routing、permission、source tracing、feedback 和 write-back。
- 对 agent 暴露的接口应是能力型接口，例如 `route_context`、`search_docs`、`read_doc`、`record_feedback`，而不是完整任务执行接口。
- `Session Context Pack` 应是临时运行时对象，用来帮助 agent 选择外置 context，而不是永久改变 agent 的全部上下文。
- 写回默认进入 personal、project 或 pending；公共 merge 仍遵循独立的治理规则。

## 设计约束

- 不默认把外置文档复制进用户 working directory。
- 不默认修改 repo 内的 agent 配置、提示词或行为规则。
- 不要求所有 coding agent 都实现同一种 runtime，只要求它们能调用同一组 context capability。
- 不把“被路由出来”理解为“必须被 agent 采纳”。
- 不把“agent 读过某文档”理解为“该文档应该 merge 到公共层”。
- 所有外置 context 的使用都应尽量保留来源、scope、visibility 和 why selected。

## 一句话

`oh-share-it` 不制造一个新的 coding agent；它让现有 coding agent 在用户控制的工作目录之外，多一个可治理、可追溯、可分享的外置知识层。
