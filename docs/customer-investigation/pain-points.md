1. https://news.ycombinator.com/item?id=48848840
   问题：自己电脑上的信息无法低摩擦地交给团队成员以及他的Agents。例如可能需要自行筛选、传文件，然后再通知自己的团队（我猜测的他遇到的问题）。
   频率：（我猜测）应该是每天？
   严重：可能没有太严重的后果，就是很麻烦。
   现在处理方式：用Google Drive 同步一个 shared/ 文件夹，让两个 agent 读写同一份公司内容，其余留在本机。【两人同时写入时同步冲突，没有谁在什么时候改了什么的记录，一条内容属于共享还是私有只由文件夹名字决定。】

   https://www.reddit.com/r/dataengineering/comments/1t6ttuz/comment/okkhx5q/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button
   问题：people kept re-doing the same competitor analysis every quarter because nobody could find the previous one. 
   解决方法：every doc had to start with a one-line 'what is this for' header, indexed in one place. you could grep your way to relevance after that.

2. Joey Wu Team Agent Skill
   问题：每个分析师都有自己的Skill，代表自己对数据库的理解（表的用途、字段含义、常用 join 逻辑等），用来给Agent生成更准确的 query。多个分析师的Skill中理解和使用习惯会产生冲突，比如对某个指标的定义不同，或者习惯用不同的表来回答同一个业务问题。这些分歧直接导致 Agent 输出的 query 出现偏差。
   频率：不知道
   严重：（我猜测）Query出错，需要人力矫正，口头沟通，或者退回到各自为战的方式。
   现在的处理方式：1）基础版skill + 个人定制，2）中心化审核管理，指定专人负责收集、审核、合并各分析师的知识贡献，统一维护一份权威版本。

3. https://www.reddit.com/r/dataengineering/comments/1t6ttuz/how_are_you_centralizing_knowledgecontext_from_ai/?solution=7882af8b452d9c5f7882af8b452d9c5f&js_challenge=1&jsc_token=2824be10929bdc604753c70a67a1c331b24b49df2b9015510b963e025e328480&jsc_orig_r=
   问题：AI agents 只能把产物放回给定目录/仓库的文档里。A、B仓库里的incredibly valuable context并不互通。
      - 把决定和规则记录下来不一定prevent drift，LLM依旧可能会generate conflicting architectural patterns even with shared context （https://news.ycombinator.com/item?id=47103319）
      - 记录某个决定不一定等于理解这个决定的动机和理由。（团队定了「收入不算退款」。为了让 agent 以后能查到，把这句话写进 CLAUDE.md 就够了。写下来的时候，大家有没有想过为什么不算、什么情况下这样算会错。文件里可以有这句完整的话，做决定的人当时仍然可以没想明白。）
   频率：不知道
   严重：不知道
   现在的处理方式：搭建一个中心化的knowledge base，让Claude Code直接把insight存回知识库。
   其他人的处理方式：
      - 把所有东西放进一个monorepo或者一个internal wiki，让每个人可以自己搜索
      - 把AI需要知道的文档（包括全局的守则、skill和某个特定的仓库的守则、skill）放在一个单独仓库，在开始做某个代码仓库之前，把属于该仓库的规则和 skills 用符号链接放到项目根目录，让这次 agent 会话一开始就能读到。
      - 在SKILL.md文件中组织了与交叉项目相关的知识，并将这些知识放在一个专门的存储库中
      - 需要一个事实库，存放已经确定的事实，让这些结论有一处共同来源。
      - Git仓库里分层存储上下文：1）顶层上下文Claude.md，一个索引；2）任务特定的上下文；3）每个模块、目录的上下文。顶层上下文只有全团队都知道时才改。模块里的上下文可以跟该模块的代码一起提交。团队负责人定期把各分支上的上下文再审一遍：各分支里的上下文哪里已经不一致；哪些规则原来写在模块里，现在应该升到顶层，让所有人共用。
      - 区分Repo级别、User级别、Org级别的上下文，放在一个知识库，用MCP管理

4. https://news.ycombinator.com/item?id=47899844
   问题：agent 写下的内容会进入团队 wiki。作者写明：放进去的事实是错的，整理出来的摘要也是错的；每日检查能发现矛盾和过期，但不能判断对错。评论里的后果有四件：
      - 没有人看过的、由 agent 写下的条目坏得最快。半年后知识库里会有写得很确定的错误，检查分不出哪些是错的。
      - 错误条目会被别的 agent 引用，这种写得很确定的错误会越来越多。
      - 模型可以一直写，人不再读。wiki 越大越难用。记笔记本来是人在当时把事情想清楚；自动写下来把这一步跳过了。
      - 人自己不把决定讲清楚，只把会议记录交给模型，后面的提升流程也留不住对的内容。
   频率：不知道
   严重：帖子没有写业务损失。写出的后果是后续 agent 会引用这些错误。
   做法：见 docs/existing-solution/team-wiki.md

5. 我自己的科研体会
   来源：https://github.com/Barytes/knowledge-base
   - `raw/personal/writings/课题组公共知识库产品定义信念.md`
   - `wiki/topics/research-knowledge-governance/essays/课题组公共知识库-博客草稿.md`
   背景：在课题组待了几年。导师每周和每位学生做一次一对一组会，学生汇报进展，导师给出反馈和方向。其余时间学生各自做自己的课题。不同方向之间交流有限。知识共享靠个人关系、偶发讨论和口头沟通。
   问题：
   1. 课题的第一步是从大量已有工作里判断什么方向值得做。这一步要用到文献脉络、方法边界、已有共识、潜在张力和研究空白。文献管理工具和笔记工具能把论文和笔记存下来，找方向仍然要人重新读、重新判断。
   2. 导师、不同年级的学生、不同方向的学生各自掌握一部分知识、试错、判断和做法。这些内容停在口头、组会和个人笔记里。组会上具体细节和短期问题占掉时间，可再用的经验和判断到不了其他成员那里。
   3. 学生毕业后，研究过程里积累的判断、试错记录、教训、阅读经验和问题理解跟着人离开。后来的课题重新做相近的探索，重新遇到相近的坑。过去的研究经历到不了后来工作的起点，也到不了新成员和新方向。
   4. 学生要的是领域里已经比较稳定的说法、常用做法、某个问题的解法。导师要的是研究空白，以及下一步值得投入的方向。这两类内容没有同一处可以查阅。材料散在论文、个人笔记、组会和实验记录里。高价值判断主要在导师那里，或留在少数几次对话里。学生之间没有一处稳定的共享记录。
   频率：一对一组会是每周一次。跨成员、跨方向的共享没有固定节奏。来源没有写每天发生几次。
   严重：新生从零读论文、踩坑、建立理解。师兄毕业后，积累的经验和判断离开。课题组做过的研究，到下一次课题时接不上。
   现在的处理方式：口头交流、每周组会、个人笔记；文献管理和笔记工具负责存材料。
   考虑过的做法：1）在课题组服务器上放一个知识库，材料都放在服务器里，所有人的问答由服务器上的 Agent 回答。推理消耗集中在服务器上，等于导师一个人承担所有人的成本。还要处理并发、配额、鉴权和权限。2）每个人在自己的电脑上做问答，自己承担这次问答的 token；公共端只接收待聚合的贡献，再把聚合结果同步回去。同一主题上相反的判断保留双方观点和来源，留给后来的人判断。来源里这套做法还在整理，课题组当时仍按上面的口头和笔记方式工作。



