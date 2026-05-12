# oh-share-it

`oh-share-it` 是一个面向团队和 coding agent 的 context sharing / routing MVP。

它不是传统知识库，也不是聊天机器人。当前 `main` 分支实现的是一个 file-based context layer：成员可以把本地项目中的有用文件按规则打包上传到共享库，其他成员可以同步这些共享内容到自己的工作目录，coding agent 再通过轻量索引和原始文件读取相关 context。

最小闭环：

```text
share context -> layer context -> route context -> expose to agents
```

## 当前能力

- 创建共享 library，并为 owner 生成访问 token。
- 通过 invite 邀请其他成员加入 library。
- 使用 `share-it.rules` 明确允许/拒绝上传哪些文件。
- 将本地文件打包为 share package 并上传到 library。
- 为 library 和每次 share 生成 agent-readable indexes。
- 将共享库同步到当前工作目录的 `.oh-share-it/public/<library>`。
- 读取同步后的文件，支持普通路径和 `oh://library/<library>/...` URI。
- 根据 query 路由到相关 documents。
- 提供一个本地 Web UI 和 JSON API。

## 环境要求

- Node.js 20 或更高版本。
- 当前项目没有外部 npm 依赖。

## 快速启动

启动服务：

```bash
npm start
```

默认监听：

```text
http://127.0.0.1:4317
```

健康检查：

```bash
curl http://127.0.0.1:4317/api/health
```

服务默认把数据写入当前工作目录下的 `data/`。如果设置 `HOST` 为非 localhost 地址，必须同时设置 `OH_SHARE_IT_ADMIN_TOKEN`，否则服务会拒绝启动。

可用环境变量：

- `PORT`：服务端口，默认 `4317`。
- `HOST`：监听地址，默认 `127.0.0.1`。
- `OH_SHARE_IT_ADMIN_TOKEN`：创建 library 的管理员 token；非 localhost 监听时必填。
- `OH_SHARE_IT_UPLOAD_LIMIT_BYTES`：share 上传 JSON body 的大小上限，默认 `25MB`。

## CLI 使用

CLI 入口：

```bash
node cli/share-it.js <command>
```

### 创建 library

```bash
node cli/share-it.js library create acme-product \
  --server http://127.0.0.1:4317 \
  --member alice
```

如果服务端配置了 `OH_SHARE_IT_ADMIN_TOKEN`，创建 library 时需要传入：

```bash
node cli/share-it.js library create acme-product \
  --server http://127.0.0.1:4317 \
  --member alice \
  --admin-token <admin-token>
```

创建成功后，CLI 会把凭证保存到：

```text
~/.oh-share-it/credentials.json
```

### 绑定当前目录

```bash
node cli/share-it.js bind \
  --server http://127.0.0.1:4317 \
  --library acme-product
```

绑定信息会写入：

```text
.oh-share-it/binding.json
```

### 配置分享规则

在要分享的项目根目录创建 `share-it.rules`：

```text
+ README.md
+ docs/**
- **/.env
- **/.git/**
- **/node_modules/**
- **/dist/**
- **/*.log
```

规则含义：

- `+` 表示允许上传。
- `-` 表示拒绝上传。
- 拒绝规则优先级更高。

如果执行 `share` 时缺少 `share-it.rules`，CLI 会生成一个 starter 文件并要求你确认后重新运行。

### 上传当前目录的 context

```bash
node cli/share-it.js share --name alice-notes
```

### 同步共享库

```bash
node cli/share-it.js sync
```

同步内容会写入：

```text
.oh-share-it/public/<library>
```

常见入口文件：

- `.oh-share-it/public/<library>/indexes/L0.md`
- `.oh-share-it/public/<library>/indexes/L1.md`
- `.oh-share-it/public/<library>/indexes/L2.json`
- `.oh-share-it/public/<library>/shares/<share-name>/manifest.json`
- `.oh-share-it/public/<library>/shares/<share-name>/raw/...`

### 查看、读取和查询

列出 shares：

```bash
node cli/share-it.js list
```

读取同步后的文件：

```bash
node cli/share-it.js read indexes/L0.md
```

使用 `oh://` URI 读取：

```bash
node cli/share-it.js read oh://library/acme-product/indexes/L0.md
```

按 query 路由 context：

```bash
node cli/share-it.js query "agent skill"
```

### 邀请成员

创建邀请：

```bash
node cli/share-it.js invite create --role reader
```

用邀请加入：

```bash
node cli/share-it.js join \
  --invite <invite-token> \
  --server http://127.0.0.1:4317 \
  --member bob
```

列出当前凭证可访问的 libraries：

```bash
node cli/share-it.js libraries --server http://127.0.0.1:4317
```

## HTTP API 概览

### 系统

- `GET /api/health`

### Libraries

- `POST /api/libraries`
- `GET /api/libraries`
- `GET /api/libraries/:library`
- `GET /api/libraries/:library/members`
- `DELETE /api/libraries/:library/members/:member`

### Invites

- `POST /api/libraries/:library/invites`
- `GET /api/libraries/:library/invites`
- `POST /api/invites/:token/join`

### Shares 和同步

- `GET /api/libraries/:library/shares`
- `GET /api/libraries/:library/shares/:share`
- `POST /api/libraries/:library/shares`
- `GET /api/libraries/:library/sync`
- `POST /api/libraries/:library/reindex`

### 文件与路由

- `GET /api/libraries/:library/file?path=<relative-path>`
- `POST /api/route`

除健康检查、创建公开 invite join 等少数路径外，大多数 API 需要：

```text
Authorization: Bearer <token>
```

## 项目结构

```text
client/                 本地 Web UI
cli/share-it.js         命令行入口
server/index.js         HTTP server 和 API route
server/lib/             打包、索引、路由、权限、文件工具
skills/oh-share-it/     给 coding agent 使用的本地 skill
docs/                   产品定义、MVP 目标、架构和决策记录
tests/                  node:test 测试
```

## 测试

运行完整测试：

```bash
npm test
```

## 设计文档

推荐从这里开始读：

- [docs/index.md](docs/index.md)
- [docs/belief.md](docs/belief.md)
- [docs/mvp-okr.md](docs/mvp-okr.md)
- [docs/decisions.md](docs/decisions.md)
- [docs/architectue.md](docs/architectue.md)

## 当前边界

`oh-share-it` 当前是 external context provider，而不是 agent runtime。它不会接管 coding agent 的执行环境，也不会替代 agent 读写 repo、运行命令或完成任务的能力。

当前 MVP 重点是验证 context 的分享、分层、同步、索引和路由能力。完整企业权限、复杂知识图谱推理、自动公共知识合并和完整聊天产品不属于当前版本范围。
