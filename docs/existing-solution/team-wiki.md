# [najmuzzaman-mohammad/WUPHF](https://github.com/najmuzzaman-mohammad) 团队 wiki

做法来自 [Show HN: A Karpathy-style LLM wiki](https://news.ycombinator.com/item?id=47899844)。作者是 najmuzzaman。帖子介绍的是开源项目 [WUPHF](https://github.com/nex-crm/wuphf) 里的 wiki 层。WUPHF 还想做多个编程 agent 的协作办公室；作者说只用 wiki 时，不必用那间办公室。安装命令是 `npx wuphf@latest`。wiki 跑在本机 `~/.wuphf/wiki/`，可以用 git clone 把内容带走。

痛点记录在 `docs/customer-investigation/pain-points.md` 第 4 条。

## 作者的做法

内容是 markdown，版本在 Git 里。上面有一层 Bleve 的关键词检索和 SQLite 索引。帖子说还没有向量库或图数据库。作者给的内部门槛是：500 篇材料、50 个查询上，关键词检索的 recall@20 达到 85%。低于这个数时，预先准备改用 sqlite-vec。

目录分成两处。每个 agent 有私人笔记本 `agents/{slug}/notebook/`。团队共用的在 `team/`。私人笔记经 agent 或人审过，再提升到团队 wiki，并留下回链。一个小的状态机处理过期和自动归档。

每个实体有一份只追加的事实日志 `team/entities/{kind}-{slug}.facts.jsonl`。合成程序每积累 N 条事实，就重写该实体的摘要。这些提交使用单独的 Git 身份 “Pam the Archivist”，git log 里可以看出是这套程序写的。

页面之间用 `[[Wikilinks]]`，断掉的链接标成红色。每天检查一次，找矛盾、过期条目和断掉的链接。`/lookup` 和 MCP 工具做带引用的检索。短查询走关键词检索，叙述性查询走一轮带引用的回答。

事实编号是确定的，包含句子在原文中的位置。条目的 slug 分配一次就不再改名，合并时用重定向占位。重建之后逻辑上相同，字节不必相同。

作者写明的限制有三件。85% 不是对所有查询的保证。摘要质量受放进去的事实质量限制：错误的事实进去，整理出来的摘要也是错的；每日检查不能判断对错。目前只覆盖一个办公室，没有跨办公室的联合。

作者解释不把 Obsidian 当写入端：Obsidian 是一个人用的编辑器，没有「agent A 起草、agent B 提升、团队批准」这套状态；agent 要直接调用的是 `/lookup`、记录事实、写笔记本、提升到团队 wiki 这些 MCP 工具。Obsidian 可以打开 `~/.wuphf/wiki/` 来读，写入仍由 WUPHF 做。评论里有人问目录能不能配置。作者说目前写死在 `~/.wuphf/wiki/`，应该做成配置项，并为此开了一条 issue。

## 评论里的做法

人先看过，再提升。saadn92 跑了大约六个月：会话结束后，后台从对话记录里抽出决定和被否定的做法，写成结构化 markdown，人审过再放进上下文。ryanshrott 把「随便记下」和「升成可信内容」分开。agent 可以自由起草。多个 agent 独立总结同一来源，结论一致才提升。错误条目会被别的 agent 引用，所以可信档必须人审。drewbatcheller 同意只有「自由起草、批准后才提升」能用。上面可以再放一个记得哪些已批准、哪些已拒绝的审阅 agent，拿不准的留给人。人审的队列会随这个审阅 agent 变准而变短。

人自己先把决定说清楚。smadam9 的做法是：会后由人讲出决定了什么、谁承诺了什么、自己实际怎么看，模型只负责放进文件。跳过这一步、直接拿会议记录去抽，提升流程也没用。

人来筛选，模型不单独管整份 wiki。stingraycharles 说，完全由模型维护的 markdown 会让输出变差，人维护的会变好。要人来筛选，并盯着这些文档里欠下的内容和已经不一致的地方。criley2 把所引的研究收窄成一篇：便宜模型自动生成的 `AGENTS.md` 比人改过的差。他的用法是，现场能很快查到的内容不要塞进上下文；现场查不到的信息，让模型摘要后写进文件。

控制写多少。johntash 问过怎样不让模型一直写到 wiki 越大越没用。他以前让模型根据几个链接做研究再写成 wiki，看起来整齐，读进去是错的。这条评论没有给出已经跑通的限制写法。anuramat 把没细看的内容标成 slop，以后再看；用定时任务对笔记提一个小修改，例如错字、不一致和标签。

一份 Git 知识库跨多个项目。psanchez 把公司的工单、wiki、GitHub 和构建系统接进来，像带一个新工程师一样告诉模型去哪找制度、开发者怎么工作、项目之间什么关系。模型负责写成 agent 能读的文档，包括一份 `AGENTS.md`。任务失败时，人补充上下文，并让模型更新文档。

只记决定和动作。gbram 提到另一个产品 hivemind，只抓主要决定和动作，不抓中间的全部内容。帖子里没有这个产品的使用细节。

## 评论里提出、作者没有给出做法的两件事

psteinweber 问它是否支持多个人类。他说很多同类工具不支持，而他们要的是不同角色的 agent 互相说话，决定处留人。这条下面没有作者的做法。

sails 担心把敏感业务文档放到 GitHub。贡献者 frrandias 说，当前跑在本机，Git 用来做版本。评论里没有写完怎样在内部基础设施上做一份稍可协作的共享。