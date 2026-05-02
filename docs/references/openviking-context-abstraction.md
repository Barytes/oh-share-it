# OpenViking 的 Context 抽象

## 摘要

OpenViking 对 `oh-share-it` 最有启发的地方，不是把 context 抽象成一个细粒度的知识单元，而是把 context 抽象成：

**可寻址的虚拟文件系统节点 + context 类型 + L0/L1/L2 分层表示。**

这和 `oh-share-it` 当前的 document-first 方向比较一致：用户和 agent 面对的是文档、目录、路径、摘要和按需读取，而不是一开始就面对一堆原子化 context unit。

## 1. 三种 Context 类型

OpenViking 把 context 分成三类：

| 类型 | 含义 | 主要来源 | 生命周期 |
|---|---|---|---|
| `Resource` | Agent 可引用的外部知识、规则、文档、代码库等 | 用户主动添加 | 长期、相对静态 |
| `Memory` | Agent 对用户、世界、任务、交互的记忆 | Agent 从交互中记录和更新 | 长期、动态更新 |
| `Skill` | Agent 可调用的能力，例如工具定义、MCP、工作流 | 用户或系统提供，Agent 调用 | 长期、相对静态 |

这个分类有两个值得借鉴的点：

1. 它没有把所有 context 混成一种对象。
2. 它把“知识资料”“记忆”“能力”分开，方便 agent 在不同任务中按需调用。

对应到 `oh-share-it`：

- `Resource` 类似公共文档、项目文档、研究资料、代码背景。
- `Memory` 类似个人 context、项目经验、历史判断、使用反馈。
- `Skill` 类似可复用工作流、agent-facing tools、团队操作方法。

## 2. Viking URI：context 是可寻址节点

OpenViking 使用 `viking://{scope}/{path}` 作为统一资源标识。

典型 scope 包括：

```text
resources
user
agent
session
```

例如：

```text
viking://resources/my-project/docs/api.md
viking://user/memories/preferences/
viking://agent/skills/search-web
viking://session/{session_id}/messages/
```

这个设计说明：OpenViking 的 context identity 更像文件系统路径，而不是数据库中的孤立 row。

它的核心优势是：

- agent 可以通过确定性路径定位 context。
- context 可以天然组织成目录树。
- 目录和文件都可以有摘要、关系和元数据。
- 检索不是唯一入口，agent 也可以 browse 和 read。

这对 `oh-share-it` 的启发是：可以为每篇文档和每个 context 空间设计稳定 URI，例如：

```text
oh://personal/alice/payment-retry-notes.md
oh://project/billing/decisions/retry-policy.md
oh://public/terms/idempotency.md
oh://tensions/payment-retry-risk.md
```

这样 agent 可以在 search 之外，稳定引用、读取、分享和写回 context。

## 3. L0 / L1 / L2 分层表示

OpenViking 对每个 context 或目录使用三层信息表示：

| 层级 | 文件 | 用途 |
|---|---|---|
| `L0 Abstract` | `.abstract.md` | 超短摘要，用于向量检索和快速过滤 |
| `L1 Overview` | `.overview.md` | 中等长度概览，用于 rerank、导航和判断是否需要深入 |
| `L2 Detail` | 原始文件或子目录 | 完整内容，按需读取 |

这个设计非常重要：它没有要求把文档切成大量小单元，而是保留原始文件和目录，再为它们生成不同密度的表示。

对应到 `oh-share-it`：

```text
Document / Directory
  L0: short summary for retrieval
  L1: overview for routing and navigation
  L2: full markdown document
```

这比强制 `ContextUnit` 更适合 MVP：

- 用户仍然写文档。
- agent 先看 L0/L1，必要时再读 L2。
- routing 可以先选文档或目录，再选择片段。
- token 使用更可控。

## 4. 内容层与索引层分离

OpenViking 的架构把文件内容和向量索引分开：

```text
AGFS / virtual filesystem
  保存文件内容、L0/L1/L2、关系、元数据

Vector Index
  保存 URI、向量、metadata，用于检索
```

这个分离对 `oh-share-it` 很有用。

MVP 可以采用：

```text
docs/
  保存 markdown 文档、frontmatter、abstract、overview

registry/
  保存 document id、owner、scope、visibility、knowledge_type

indexes/
  保存全文索引、embedding 索引、关系索引
```

也就是说，向量索引只是辅助检索，不应该成为 context 的唯一真实来源。

## 5. 对 oh-share-it 的架构启发

### 5.1 支持 Document-first

OpenViking 的抽象更像“文件系统节点 + 多层摘要”，而不是“原子 ContextUnit”。

这支持 `oh-share-it` 采用 document-first：

- 文档是用户心智。
- URI 是 agent 寻址方式。
- L0/L1/L2 是 agent 渐进读取策略。
- anchor / span 是精确引用机制。

### 5.2 需要稳定 URI

`oh-share-it` 应该设计自己的 URI 或 path convention。

可能形式：

```text
oh://personal/{user}/{path}
oh://project/{project}/{path}
oh://public/{path}
oh://pending/{path}
oh://tensions/{path}
```

这会比只暴露随机 `document_id` 更适合 agent 使用，也更方便人类调试。

### 5.3 每个目录也应该有 overview

OpenViking 不只是给文件生成摘要，也给目录生成 L0/L1。

这对 `oh-share-it` 很关键，因为 routing 经常需要先判断：

- 哪个用户的 context 空间可能相关？
- 哪个项目空间可能相关？
- 哪个公共主题入口可能相关？

因此，`personal/alice/`、`project/billing/`、`public/payments/` 这类目录也应该有 `.overview.md` 或等价 metadata。

### 5.4 Agent 先 browse，再 read

OpenViking 的设计暗示一个重要调用模式：

```text
find / abstract
  -> overview
  -> read detail
```

`oh-share-it` 的 agent tools 也可以按这个思路拆分：

```text
search_context
read_overview
read_document
route_context
```

这样 agent 不必一次性读取完整文档。

## 6. 与 oh-share-it 的差异

OpenViking 更像 agent context database，重点是让 agent 管理 Resource、Memory、Skill。

`oh-share-it` 的额外问题是多人 context governance：

- 谁拥有 context。
- 谁能看。
- 哪些内容可以点对点分享。
- 哪些 user-agnostic knowledge 可以 merge 到公共层。
- 哪些观点应该保留 tension。
- routing 如何在 public / project / personal context 之间选择。

所以 `oh-share-it` 可以借鉴 OpenViking 的 context representation，但不能只复制它的抽象。

`oh-share-it` 需要在 OpenViking 的文件系统式 context 之上，增加：

- owner
- visibility
- scope
- sharing event
- merge proposal
- tension
- routing feedback
- audit log

## 7. 对当前架构的建议

结合 OpenViking，当前 `oh-share-it` MVP 架构可以进一步调整为：

1. 保持 document-first，不把 `ContextUnit` 作为 MVP 一等对象。
2. 为文档和目录引入稳定 URI。
3. 为文档和目录生成 L0 abstract 与 L1 overview。
4. routing 先基于 L0/L1 找空间和文档，再按需读取 L2。
5. anchor / span 只做精确引用和 feedback，不作为用户必须管理的对象。
6. content storage 与 search index 分离，索引只保存 URI、metadata 和向量。

## 来源

- [OpenViking Context Types](https://github.com/volcengine/OpenViking/blob/main/docs/en/concepts/02-context-types.md)
- [OpenViking Context Layers](https://github.com/volcengine/OpenViking/blob/main/docs/en/concepts/03-context-layers.md)
- [OpenViking Viking URI](https://github.com/volcengine/OpenViking/blob/main/docs/en/concepts/04-viking-uri.md)
- [OpenViking Architecture Overview](https://github.com/volcengine/OpenViking/blob/main/docs/en/concepts/01-architecture.md)
