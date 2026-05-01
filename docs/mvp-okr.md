# MVP OKR

## 1. MVP 定义

`oh-share-it` 的 MVP 不是完整知识库平台，也不是先做一个聊天机器人。

第一版要验证的是一条最小产品闭环：

1. 用户可以分享自己认为有用的 context。
2. 系统把 context 收集到一个公共库中，同时区分 user-agnostic knowledge 和 user-specific knowledge。
3. 稳定、低争议、可追溯的 user-agnostic knowledge 可以 merge 成公共层；每个人自己的 user-specific knowledge 保持独立。
4. 用户提问时，系统能够检索或路由到有用的公共知识、项目知识或个人 specific knowledge。
5. 检索和路由策略能够从使用反馈中自我改进。
6. 主流 coding agent 可以通过稳定接口调用这些 context 能力。

一句话：

**MVP 要证明 `oh-share-it` 可以把 useful context 从个人贡献，带到分层知识库，再带到高质量 context routing，并让人和 coding agent 都能调用这些能力。**

## 2. 北极星指标

**每周成功回答或辅助完成的 context routing 任务数。**

一次成功 routing 任务指：

- 用户提出一个问题或任务。
- 系统找到公共层、项目层或个人层中的相关 context。
- 回答或结果明确引用了 context 来源。
- 用户认为这些 context 对理解、判断或行动有帮助。

这个指标比“文档数量”“搜索次数”“AI 回答次数”更接近 MVP 价值。

## 3. Objective 1：让用户低成本分享 useful context

用户需要能把自己的经验、判断、背景、问答或资料片段变成可被系统理解的 context。

### Key Results

1. 用户可以在 2 分钟内创建一条 context。
2. 每条 context 至少包含 `owner`、`scope`、`visibility`、`source`、`intended_use` 五类元信息。
3. context 可以被标记为 `user-specific`、`project-specific` 或 `user-agnostic`。
4. 试点团队在 4 周内沉淀不少于 100 条 context。
5. 至少 70% 的新增 context 能说明“它未来可能在哪些问题或场景中有用”。

### 不是目标

- 不要求用户把 context 整理成完整文章。
- 不要求每条 context 默认公开。
- 不要求用户一开始准确判断它最终是否会进入公共层。

## 4. Objective 2：建立公共库与独立 context 并存的分层结构

系统需要同时支持公共 merge 和独立 context，而不是只做其中一种。

### Key Results

1. 系统支持至少四类 context 空间：`personal`、`project`、`routed`、`public / consensus`。
2. 所有 context 都能保留来源、作者、更新时间、可见范围和所属空间。
3. 至少产出 20 条公共 merge 条目，用于表示稳定事实、团队共识、术语定义、标准流程或公共入口。
4. 100% 的公共 merge 条目保留来源链和贡献者信息。
5. 存在冲突或不同视角的内容不强行 merge，而是保留为可见 tension 或并列观点。

### Merge 标准

适合 merge 的内容通常是：

- 稳定事实。
- 低争议共识。
- 标准流程。
- 术语定义。
- 项目当前状态。
- 多人反复确认过的背景。
- 已经不依赖某个人独特视角的公共入口。

不适合默认 merge 的内容通常是：

- 个人判断。
- 未成熟想法。
- 局部经验。
- 敏感信息。
- 仍在变化的策略。
- 存在明显 tension 的观点。

## 5. Objective 3：让用户提问时能被路由到有用 context

MVP 的消费侧不是浏览文档，而是通过问题或任务触发 context routing。

### Key Results

1. 对一组典型问题，Top 3 候选 context 中包含有用 context 的比例达到 75%。
2. 回答能够明确区分引用的是 public / consensus knowledge、project context 还是 user-specific knowledge。
3. 90% 的回答或结果能展示 context 来源。
4. 用户对 routing 结果“有帮助”的反馈达到 70% 以上。
5. 系统能在遇到冲突观点时提示存在 tension，而不是直接合成单一答案。

### 典型问题

- “这个项目为什么当时没有继续做？”
- “谁最了解这个客户/模块/方向？”
- “这个概念在团队里目前怎么理解？”
- “这个问题之前有人踩过坑吗？”
- “我应该看公共共识，还是找某个人的经验？”

## 6. Objective 4：让 routing 策略高效并能自我改进

MVP 需要证明 routing 不是一次性检索，而是可以通过使用反馈持续变好。

### Key Results

1. 系统记录每次 query、候选 context、最终引用 context、用户反馈和后续动作。
2. routing 策略至少支持基于 `scope`、`owner`、`freshness`、`confidence`、`source`、`usage_feedback` 的排序或过滤。
3. 系统每周基于反馈更新一次 routing 权重、索引或推荐策略。
4. 在固定评测问题集上，routing 成功率每两周有可观察提升。
5. 低质量、过期、误路由或被用户否定的 context 可以被标记，并在后续 routing 中降权。

## 7. Objective 5：让主流 coding agent 都能调用

MVP 需要证明 `oh-share-it` 不是只服务某一个 app 或某一个 bot，而是一个可被不同 coding agent 调用的 context capability layer。

这里的 coding agent 包括 Codex、Claude Code、OpenCode、Cursor、Trae 等类似工具。

### Key Results

1. 提供 agent-agnostic 的调用接口，至少覆盖 `search_context`、`read_context`、`route_context`、`contribute_context`、`propose_merge` 五类能力。
2. 接口输入输出使用稳定、可读、可调试的格式，例如 JSON、Markdown 或 MCP tool schema。
3. 任意 agent 不需要理解内部数据库结构，也能完成查询、读取、贡献和路由调用。
4. 至少用 3 类不同 coding agent 或 agent client 跑通同一组 context 查询与写回任务。
5. agent 调用结果必须包含来源、scope、visibility 和是否来自 public / project / personal context 的标记。

### 设计要求

- 不把能力绑死在某个聊天 UI。
- 不要求 agent 使用专属 SDK 才能调用。
- 不把 agent 记忆当成唯一状态来源。
- 优先提供 CLI、MCP server 或 file-based protocol 这类容易被不同 agent 接入的接口。

## 8. MVP 不做什么

第一版不追求：

- 完整企业权限系统。
- 完整聊天机器人产品。
- 完整中心化知识平台。
- 自动把所有 context 合并成公共知识。
- 复杂知识图谱推理。
- 面向所有行业的通用模板。

第一版优先验证最小闭环：

**share context -> layer context -> route context -> expose to agents -> improve routing。**

## 9. 验证方式

MVP 可以通过一个小团队或课题组进行 4 周试点。

重点观察：

1. 用户是否愿意持续分享 context。
2. 系统是否能把 context 正确放进 personal、project、public 等不同空间。
3. 公共 merge 是否真的减少重复解释，而不是制造伪共识。
4. 用户提问时是否能获得有帮助的 public 或 specific context。
5. routing 是否随着反馈变得更准。
6. 不同 coding agent 是否能用同一套接口完成 context 查询、路由、贡献和写回。

如果这些成立，`oh-share-it` 就不只是一个知识库，而是一个能管理个人 context、公共共识和 query-time routing 的团队 context layer。
