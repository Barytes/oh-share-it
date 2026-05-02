# MVP Objectives

## 1. MVP 定义

`oh-share-it` 的 MVP 不是完整知识库平台，也不是先做一个聊天机器人。

第一版要验证的是一条最小产品闭环：

**share context -> layer context -> route context -> expose to agents -> improve routing。**

一句话：

**MVP 要证明 `oh-share-it` 可以把 useful context 从个人贡献，带到分层知识库，再带到高质量 context routing，并让人和 coding agent 都能调用这些能力。**

## 2. Objective 1：让用户低成本分享 useful context

用户需要能把自己的经验、判断、背景、问答或资料片段变成可被系统理解的 context。

这个 objective 关注的是供给侧：用户是否能自然地把有用 context 分享出来，而不是被迫整理成完整知识库文章。

## 3. Objective 2：建立公共库与独立 context 并存的分层结构

系统需要同时支持公共 merge 和独立 context，而不是只做其中一种。

公共层用于承载稳定、低争议、可追溯的 user-agnostic knowledge；个人和项目层用于保留 user-specific knowledge、project-specific knowledge、局部经验、未成熟判断和仍有 tension 的内容。

## 4. Objective 3：让用户提问时能被路由到有用 context

MVP 的消费侧不是浏览文档，而是通过问题或任务触发 context routing。

用户在工作目录向 coding agent 提问时，系统应该能把 query 路由到有用的 public knowledge、project context 或 user-specific knowledge，并让 agent 按需加入当前 session context。

## 5. Objective 4：让 routing 策略高效并能自我改进

MVP 需要证明 routing 不是一次性检索，而是可以通过使用反馈持续变好。

每次 query、文档选择、agent 读取、用户反馈、写回、分享和 merge proposal，都应该成为改进 routing 的信号。

## 6. Objective 5：让主流 coding agent 都能调用

MVP 需要证明 `oh-share-it` 不是只服务某一个 app 或某一个 bot，而是一个可被不同 coding agent 调用的 context capability layer。

这里的 coding agent 包括 Codex、Claude Code、OpenCode、Cursor、Trae 等类似工具。

## 7. MVP 不做什么

第一版不追求：

- 完整企业权限系统。
- 完整聊天机器人产品。
- 完整中心化知识平台。
- 自动把所有 context 合并成公共知识。
- 复杂知识图谱推理。
- 面向所有行业的通用模板。
