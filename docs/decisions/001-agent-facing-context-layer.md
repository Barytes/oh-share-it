# D-001：产品优先做 agent-facing context layer，而不是先做 chatbot

**状态**：已采纳

**日期**：2026-05-01

## 背景

AI 会是 `oh-share-it` 的重要使用者，但如果一开始把产品做成聊天机器人，产品边界很容易被具体入口牵着走，例如微信、飞书、桌面聊天框或某个 agent UI。

这些入口都可能有价值，但它们不是产品的核心。

## 决策

`oh-share-it` 应优先定义为一个 agent-facing context layer：它向人和 agent 提供稳定的 context 检索、读取、贡献、写回、同步、引用和解释能力。

聊天机器人、桌面应用、MCP client、微信或飞书 bot 都只是 channel。

## 产品含义

- 核心能力应沉到 tools / API / MCP / file protocol 层，而不是绑死在某个聊天入口。
- agent 不只是回答者，也可以是 context 的调用者、维护者、写回者和路由执行者。
- 产品的关键问题不是“bot 怎么回答”，而是“agent 如何在正确边界下拿到正确 context，并留下可审计痕迹”。

## 设计约束

- AI 输出必须尽量能追溯 context 来源。
- 写回和贡献需要确认、边界和审计。
- channel 不应决定知识库结构。
