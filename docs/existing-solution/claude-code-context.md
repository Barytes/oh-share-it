# Claude Code 上下文工程功能演进（2026 年 4–9 月）

2026 年 4 月到 9 月，Claude Code 把一次编程会话的上下文从「主窗口里尽量多放、快满了再压缩」拆成几件可以分开控制的事：启动时量出每块常驻内容的成本，过程中把大段探索和审查赶出主窗口，压缩可以拦截、也可以只压前面一段，会话之间传递的是写好的一段话。9 月又把账号上的技能、没有 `CLAUDE.md` 时的 `AGENTS.md`，以及云端项目里多条线程共用的记忆，接进同一次工作的上下文来源。

版本和日期以 [Claude Code 周报](https://code.claude.com/docs/en/whats-new) 和 [更新日志](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) 为准。下面只记改变上下文如何进入、停留、压缩、分拆和传递的功能。

## 4 月之前已经在用的分层

4 月之前，一次会话开始时已经会载入人写的 `CLAUDE.md`、自动记忆里 `MEMORY.md` 的开头一段，以及技能的名称和描述。技能正文在被调用或被判断为相关时才进入对话。MCP 工具说明若超过上下文窗口的 10%，从 v2.1.7 起默认不全部放进窗口，改由 MCPSearch 按需发现。对话变长后，自动压缩把较早的记录收成摘要，会话可以继续。子代理使用自己的上下文，把结果交回主会话。v2.1.0 已允许在技能 frontmatter 里写 `context: fork`，让该技能在分叉出的子代理上下文里运行。4 月之后的改动加在这几层上面。

## 4 月：先看清窗口被什么占满

4 月的改动集中在两件事：大块工具结果不要整段留在窗口里，以及让人看见长上下文和缓存未命中各自占了多少用量。

1. v2.1.89 把超过 5 万字符的 hook 输出写到磁盘，上下文里只保留路径和一段预览。
2. v2.1.91 允许 MCP 工具在 `tools/list` 里用 `_meta["anthropic/maxResultSizeChars"]` 提高单次结果上限，最高 50 万字符。数据库 schema、完整文件树这类本来就会很大的结果可以留在对话里，不必先被截成磁盘引用。
3. v2.1.98 加入 Monitor 工具。它在后台监视脚本或日志，每条事件作为一条新的对话消息进入记录，模型随即处理，不需要用 Bash 睡眠循环把当前回合占住。
4. v2.1.105 的 `PreCompact` hook 可以拦住压缩：退出码 2，或返回 `{"decision":"block"}`。同一版把技能描述在列表中的上限从 250 字符提高到 1,536 字符，描述被截断时启动时给出警告。
5. v2.1.108 起，API key、Bedrock、Vertex、Foundry 可以用 `ENABLE_PROMPT_CACHING_1H` 把 prompt cache 的存活时间选成 1 小时。同一版的 `/recap` 在人回到一个离开过的会话时，给出离开期间发生了什么的一行摘要。`/model` 在对话中途换模型前会警告：下一次回复会把整段历史当作未缓存输入重读。
6. v2.1.117 让 Opus 4.7 会话按该模型原生的 100 万 token 窗口计算用量。此前 `/context` 按 20 万窗口计算，百分比偏高，自动压缩也偏早。同一版在外部构建上可以用 `CLAUDE_CODE_FORK_SUBAGENT=1` 打开分叉子代理：分叉继承当前整段对话，单独的子代理从空白上下文开始。v2.1.121 把这个开关扩到 `claude -p` 和非交互会话。
7. 4 月 20–24 日那一周，大会话的 `/resume` 最快大约快 67%，并可以在重新读入一条又大又旧的会话之前先做摘要。
8. v2.1.121 给 MCP 服务器配置加了 `alwaysLoad: true`。设上之后，该服务器的工具全部跳过 tool search 的延迟加载，每次会话都放进上下文。

## 5 月：压缩可以只压前面一段，成本按技能和连接拆开

5 月把压缩从「整段对话换成一份摘要」变成可以指定保留最近若干轮，并把上下文成本算到具体的技能、插件和 MCP 服务器上。

v2.1.141 在 Rewind 菜单里加入 “Summarize up to here”。它压缩这一点之前的上下文，这一点之后的轮次保持原样。

v2.1.143 在 `/plugin` 的市场浏览里给出预计的上下文成本，包括每轮和每次调用的 token 估计。同一时期的周报还写明，`claude plugin details` 会列出插件组件和预计的每会话 token 成本。5 月 18–22 日那一周，`/usage` 把用量归因到技能、子代理、插件和单个 MCP 服务器。4 月的 `/usage` 已经按并行会话、子代理、缓存未命中和长上下文拆过最近 24 小时或一周的用量，5 月是把这笔账算到具体扩展上。

5 月 4–8 日那一周，子代理的进度摘要开始命中 prompt cache，周报写的是 `cache_creation` token 成本大约降到原来的三分之一。

v2.1.154 在 5 月 25–29 日那一周推出动态工作流，当时是研究预览。人描述一项单次对话协调不过来的任务，Claude 写一份编排脚本，在后台把工作分给多个子代理。`/workflows` 查看这些运行。触发词后来在 6 月从 `workflow` 改成 `ultracode`，用自己的话要求一份工作流仍然有效。

技能的装载在同一周变得可以在会话中途改：

1. v2.1.152 的 `/reload-skills` 重新扫描技能目录，不必重启。`SessionStart` hook 也可以返回 `reloadSkills: true`，让本会话刚装上的技能立刻可用。
2. 技能和命令的 frontmatter 可以写 `disallowed-tools`，技能处于活动状态时，这些工具从模型可用的工具里拿掉。
3. `.claude/skills` 目录里的插件改为自动加载，不必先经过市场。

## 6 月：换目录不拆掉缓存，子代理开始在后台把结果送回来

6 月的主线是让主会话的已有上下文在换目录、换一层代理之后仍然可用，同时把自定义的那一层上下文整层关掉以便排查。

v2.1.163 允许 Stop 和 SubagentStop hook 返回 `hookSpecificOutput.additionalContext`。hook 的这段文字作为反馈进入上下文，回合继续，不再被当成 hook 错误。

v2.1.169 加入 `/cd`。当前会话改到另一个工作目录时，不重建 prompt cache；新目录的 `CLAUDE.md` 作为一条消息追加，不替换系统提示。会话的存储也改到新目录所属的项目下，之后的 `--resume` 和 `--continue` 在那里找到它。同一版的 `--safe-mode`（或 `CLAUDE_CODE_SAFE_MODE`）启动时不加载 `CLAUDE.md`、技能、插件、hook、MCP 服务器，以及自定义命令和自定义代理。认证、模型、内置工具和权限仍然可用。`disableBundledSkills` 和 `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` 则把内置技能、工作流和内置斜杠命令从模型可见的列表里隐藏。

v2.1.172 允许子代理再生成子代理，链的深度上限是 5 层。这个默认值在 7 月被改掉，见下一节。

6 月 15–19 日那一周，嵌套目录里的 `.claude/skills` 改为在处理该目录中的文件时加载。名称冲突时，嵌套技能显示为带目录前缀的名字，两份都保留。同一周的实验开关 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 让每个会话有一个隐含的团队，可以用 Agent 工具的 `name` 直接生成队友。

6 月 22–26 日那一周，以 `!` 运行的 shell 命令在输出进入记录后，由 Claude 直接回应这段输出。把 `respondToBashCommands` 设为 `false` 时，输出仍然进入上下文，但不自动再开一轮回复。`/rewind` 可以恢复到执行 `/clear` 之前的对话。v2.1.186 在 `MEMORY.md` 索引接近读取上限时提醒模型自行压缩这份索引。自动记忆本身不是这个月新加的；这个月改的是索引快超出启动时会读入的那一段时，模型会收到压缩提醒。

v2.1.197 在 6 月 29 日前后让 Sonnet 5 成为 Pro、Team Standard 和企业订阅席位的默认模型，上下文窗口是原生 100 万 token。v2.1.198 起，子代理默认在后台运行，主会话继续工作，子代理结束时再接收结果；需要结果才能继续的子代理仍然在前台运行。权限提示回到主会话，不再默认拒绝。内置 Explore 代理改为继承主会话的模型，上限到 Opus，不再固定用 Haiku。v2.1.199 让 `/skill-a /skill-b ...` 这种叠放调用加载前面的全部分技能，最多 5 个。

## 7 月：审查和大批子任务离开主窗口

7 月开始把会占满主对话的工作挪到独立上下文，并给常驻说明做清理。

v2.1.205 把 `/doctor` 从只读报告改成可以诊断并在确认后修改的检查，`/checkup` 是它的别名。它对照上下文成本找出用不上的技能、MCP 服务器和插件，把本机 `CLAUDE.md` 和已提交的 `CLAUDE.md` 去重，并标出慢的 hook。v2.1.206 再加上一条：对已提交的 `CLAUDE.md`，提议删掉 Claude 可以从代码库里推出来的内容。

7 月 13–17 日那一周，`/fork` 改为把当前对话复制成 `claude agents` 里的一条新后台会话，人可以继续留在原会话。原先由 `/fork` 在会话内拉起的分叉子代理，改由 `/subtask` 启动。v2.1.212 给单个会话的子代理生成次数加上默认 200 的上限，`/clear` 会重置这笔预算。8 月初这个总数上限被取消。

v2.1.214 在记忆文件的 frontmatter 里写入 ISO 格式的 `modified` 时间。v2.1.211 把记忆索引超限警告改成只计算实际载入的内容，frontmatter 和 HTML 注释不计入。

7 月 20–24 日，分拆上下文的几个默认值一起变了：

1. v2.1.219 让 Opus 5 成为默认的 Opus 模型。在 Anthropic API 以及 Max、Team、Enterprise 上，它使用 100 万 token 窗口；Bedrock 和 Google Cloud 的 Agent Platform 上要选用 100 万的模型变体。
2. v2.1.218 让 `/code-review` 作为后台子代理运行，审查使用自己的上下文窗口，发现完成后回到原对话。`/verify`、`/code-review`、`/deep-research` 改为只在人调用时运行。
3. 带 `context: fork` 的技能默认在后台运行，frontmatter 里写 `background: false` 则在同一回合里等待结果。
4. v2.1.217 把同时运行的子代理默认上限设为 20，用 `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` 修改。同一版把「子代理再生成子代理」的默认值关掉；要更深的嵌套，需要设置 `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`。6 月 v2.1.172 的 5 层默认链从此不再是默认行为。
5. 动态工作流的默认规模指导改成中等，目标是少于 15 个代理。这是建议，不是硬上限，可在 `/config` 里改成别的规模或不限制。

## 8 月：分叉继承整段对话，会话之间只传写好的一段话

8 月把 4 月还要手动打开的分叉，变成交互会话的默认委派方式，并加上同一台机器上会话之间的消息。

v2.1.224（8 月 3–7 日那一周）加入跨会话的 `SendMessage` 和 `ListAgents`，当时在 macOS 和 Linux 上可用。Claude 可以发现其他会话并送出一段文字。周报写明，这段文字是 Claude 写给另一个会话的内容，不包含本会话的对话记录，也不包含文件。接收方读到后，对话里出现一行 `Message from`。`/list-agents` 查看当前能到达哪些会话。同一版取消了每会话 200 次子代理生成的总数上限；同时运行的数量上限和嵌套深度上限仍然保留。

v2.1.232（8 月 10–14 日）把分叉模式开成交互会话的默认行为。`subagent_type` 为 `fork` 的子代理继承完整对话和已有的 prompt cache。交互会话里由主会话生成的子代理（队友再生成的除外）也默认在后台运行。关掉分叉用 `CLAUDE_CODE_FORK_SUBAGENT=0`。同一版可以在提示里用 `@` 点名另一个 Claude 会话，Claude 用 `SendMessage` 直接发给它；名字精确匹配唯一一个正在运行的会话时，不再先要求确认。

v2.1.233 在 Opus 4.8、Sonnet 5、Fable 5、Mythos 5 以及这些系列里更新的模型上，去掉 TaskCreate、TaskUpdate、TodoWrite 这类任务清单工具。设置 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` 可以加回来。这些工具的定义因此不再占用这些模型每次请求的工具上下文。

跨会话消息在 8 月后半继续补齐边界：

1. v2.1.236 给 `SendMessage` 增加 `notify_when_idle`。一个会话可以请同一台机器上的另一个会话在下次空闲时发一条通知，只发一次。
2. v2.1.239 把 `SendMessage` 和 `ListAgents` 扩到 Windows。
3. v2.1.248 再扩到 Bedrock、Vertex、Foundry，以及关闭了遥测的会话。同一版给代理 frontmatter 增加 `experimental.cacheTtl`（`5m` 或 `1h`），在没有单独的子代理 TTL 设置时使用。
4. v2.1.248 把 Workflow 工具的说明从大约 5,700 token 收到大约 1,000 token，写脚本的参考移进内置的 `workflow-authoring` 技能。工具定义里只留短说明，长说明按技能按需加载。

缓存和换目录的行为在 8 月 24–28 日那一周对齐到这种分叉用法。v2.1.243 的 `promptCacheTtl` 可以让 API key 和云厂商会话的主对话使用 1 小时 prompt cache；`subagentPromptCacheTtl` 单独设置子代理以及其他主对话之外请求的 TTL。v2.1.246 让 `/cd` 之后新目录的项目设置、hook、`.mcp.json` 里的服务器、技能和代理立即生效，不必等到下一次 `--resume`。碰到 `maxTurns` 上限的子代理把结果标成部分完成，并提示可以用 `SendMessage` 继续，不再显示为已经做完。

同一周，Claude Code Desktop 的 `/resume` 可以接上从终端开始的会话，对话和上下文一起带过去。`/usage` 增加 Loops 分解：对最耗 token 的 `/loop` 和定时任务，列出运行次数、总 token、每次运行的 token 和上次运行。

v2.1.237 加入内置输出风格 Concise。模型先给结果，省掉开场和过程叙述；人要求解释时再写完整内容。错误、安全警告和破坏性操作的确认保持完整。这改变的是模型自己的回复在后续轮次里占多少上下文。

## 9 月：启动时的上下文来源扩到账号和多条云端线程

9 月上旬继续把缓存和技能成本显式标出来。v2.1.251 的 `/cost` 增加主对话的 prompt cache 一行：命中比例、未命中、重新写入缓存的 token、缓存是热是冷。v2.1.260 再加上最近一次未命中时能够说出的原因，例如工具定义或系统提示变了，或空闲时间超过了 TTL。状态行可以读到对应的 `prompt_cache` 字段。同一版的 `PreModelSwitch` 可以拦住换模型，`PostModelSwitch` 可以在模型切换之后给 Claude 补一段上下文。`SessionStart` 的 resume hook 会收到会话有多旧，以及重新建立缓存的估计成本。

v2.1.252 起可以运行 `/skill-doctor`。它列出每个技能的上下文成本和被使用的频率。周报写明原因：出现在技能列表里的每个技能，每一轮都占上下文，无论 Claude 有没有用到它。技能正文仍然是调用时才进入对话；这个命令量的是列表本身的常驻成本。

v2.1.257（9 月 1 日前后）加入 Claude Fable 5.1，上下文窗口 100 万 token。同一版的 `/fork` 让新后台会话沿用原对话的 prompt cache：工作树说明作为一条消息进入，不再靠改系统提示。

v2.1.247 把 Sonnet 5 在 100 万窗口上的默认自动压缩点调到大约 96.7 万 token。v2.1.260 再改进 100 万上下文模型的自动压缩：Opus 和 Fable 在接近 100 万 token 上限时才压缩，超大上下文上的恢复压缩不再以 10 分钟为超时。

9 月中旬，一次启动会读到的内容不再只来自本机仓库：

1. v2.1.275（2026-09-17）把 claude.ai 账号上已启用的技能和插件同步到用该账号登录的终端会话。`syncClaudeAiSkills: false` 或 `syncClaudeAiPlugins: false` 可以分别关掉。对同步下来的账号技能目录执行 Write 或 Edit 时，结果会说明这次修改没有写回账号。
2. 同一天，Anthropic 把 Claude Code 的 Projects 作为 beta 开放给一部分使用云端会话、且还没有网页或桌面端旧项目的 Pro 和 Max 用户。项目有一个目标和选定的仓库或上下文。协调者拆分工作、把任务分到线程、查看输出并组装结果。每条线程是一个 Claude Code 云端会话，使用自己的分支和仓库副本；线程还可以再用子代理、loop 和工作流往下拆。官方说明写明，每条线程都会写入并读取同一份共享记忆，例如发布改到周五、某项导出为什么被拿掉、改账单服务之前要问谁。项目还有一个库，收集人添加的文件和 Claude 产出的 artifact。线程之间改到同一处代码时，按普通的合并冲突处理。
3. v2.1.277（2026-09-18）的发布说明写明：项目里没有 `CLAUDE.md` 时，Claude Code 改为读取 `AGENTS.md`，并可以在 `/config` 的 Project instructions 里更改。这一版还没有覆盖 Bedrock、Vertex 和 Foundry。同一版把子代理结果交回主代理时加上子代理输出的标记并缩进，避免结果正文被当成会话自己的指令。同一版移除了 TaskOutput 工具，后台任务的输出改由 Read 去读文件，`taskOutputMaxChars` 不再起作用。8 月底周报里把成功命令和后台任务的内联输出上限提高到最多 12.8 万字符；9 月 18 日之后，后台任务这条路径改为读文件，不再靠那个上限把输出塞回对话。

2026-09-26 仍能打开的[记忆文档](https://code.claude.com/docs/en/memory)写的是另一条路径：Claude Code 读取 `CLAUDE.md`，不直接读取 `AGENTS.md`；已有 `AGENTS.md` 时，在 `CLAUDE.md` 里写 `@AGENTS.md` 导入，或做符号链接。发布说明里的回退读取，和这篇文档里的导入写法，在这一天同时存在。以本机安装的版本实际加载了哪个文件为准。

## 来源

- 周报：<https://code.claude.com/docs/en/whats-new>，2026 年第 14 周（3 月 30 日–4 月 3 日）到第 37 周（9 月 7–11 日）
- 更新日志：<https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md>，以及 v2.1.275、v2.1.277 的发布说明
- 记忆文档：<https://code.claude.com/docs/en/memory>
- Projects：<https://claude.com/blog/projects-redesigned>（2026-09-17）
