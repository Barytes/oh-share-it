# MVP 架构设计

## 1. 架构目标

`oh-share-it` 的 MVP 架构要服务 [MVP OKR](mvp-okr.md)。

## 2. 核心架构问题

`oh-share-it` 的 MVP 可以理解为把两类能力拼在一起：

```text
Git-like file distribution
        +
OpenViking-like agent context organization
```

也就是先解决两个问题：

1. **收集和分发文件**：用户指定本地文件或目录，`oh-share-it` 把它们收集到共享库，再把共享库内容分发回其他用户指定的本地目录。
2. **组织成 agent 可检索的 context**：共享库不能只是一堆原始文件，还需要 manifest、metadata、overview、source map 或 index，让 coding agent 能先读轻量入口，再按需读取原文。

最小数据流是：

```text
user files
  -> shared raw library
  -> agent-readable context layer
  -> attached local directory
  -> coding agent reads it as extra context
```

## 3. Agent Context 边界

`oh-share-it` 是 coding agent 的 external context provider，而不是 agent runtime。完整产品边界见 [D-007：oh-share-it 是 external context provider，而不是 agent runtime](decisions/007-external-context-provider-not-agent-runtime.md)。

在架构上，这意味着：

- working directory 仍是 agent 的主工作现场。
- `oh-share-it` 不接管 agent 读写本地 repo、执行命令或完成任务的方式。
- `oh-share-it` 只在 agent 需要额外背景时，提供可治理、可追溯、可分享的外置 context。
- agent-facing tools 暴露的是 context capability，而不是完整任务执行能力。
