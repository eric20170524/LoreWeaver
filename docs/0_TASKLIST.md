# 0_TASKLIST.md: 玄界竖切刮骨修复

## 🎯 当前迭代目标 (Current Sprint Goal)

目标调整为《玄界之门·石牧武途（同人原型）》的**可公开试玩候选版**：主干与 12 关逐项达到功能、资源、浏览器和打包验收标准。制作筹备台已按主干→关卡逐一确认，后续用部门交接追踪资产与质检缺口。候选版必须标为候选版；没有实体设备、真人试玩和精确候选包的 VLM 证据时，不得称为 certified release。

## ⚠️ AI 工作流要求 (Workflow Rules)

1. 执行入口：阅读本文件，从第一个 `[ ]` 开始。
2. 完成子任务后将 `[ ]` 改为 `[x]`，并记录 **Decision & Audit**。
3. UI / 业务流必须有 AC；完成前跑验证命令。
4. 阻塞即停，标 `[Blocked]`，不编造修复。
5. 红线：`docs/1_PRD.md`、`docs/2_ARCHITECTURE.md`、`docs/5_AGENT_RULES.md`。

---

## 🔄 自我进化循环沉淀

- 修炼购买层只认 `clickPower` / `activeMultiplier` 时，manifest 里的战斗 `effects` 会被写成“规划中”并通过测试——那是诚实性护栏，不是养成闭环。闭环必须另测：购买 → 存档 → 入局 knobs 变化。
- `weapon_stance_cycle` 默认定时轮换是为兼容既有 survivor 单测；石牧 preset 必须显式 `controlMode: "manual"`。
- `GameRunner.setupFirstNodeGrowthLoop` 一旦存在，通用 modifier 只能打补丁禁用它。删除宿主特例，让 modifier 自己挂 `run_growth_milestones`。
- 主界面每秒把 `this.state` 写回 registry。若 MainScene 没停干净，后写的通关列表会被旧的 `[1,2]` 盖掉。进关卡必须 `scene.stop('MainScene')`，写档时合并已通关 id。
- `data/workspaces/` 被 gitignore。契约检查不能读 `xuanjie-shimu-local/manifest.json`（本机这份没有 nodes）。对照物是 `productize/fixtures/xuanjie-shimu-contract.json`。
- `append-effects` 只在快照不存在时复制角色底图。再次 `pack` 必须覆盖 `character-pack`，否则下一次追加会把新角色画回旧图集。空白格粘贴不要把 RGBA 当遮罩，否则 alpha 128 会变成 64。
- 玩法组受控 patch 见到非 `production_ready` 的 `cardId`，且该关没有 `knobs.allowExperimentalCard`，会改写成当前唯一生产卡 `survivor_horde`。石牧节点 2、4、5、7、10 是故意换节奏的，跑部门筹备前必须先写上这个开关。

## 🐛 遗留问题与技术债 (Icebox)

- [x] **Icebox A：** 批量 `production_ready` 降级为 `verified_prototype`（轻量批 ×5 + residual 卡）。
  - **Decision & Audit:** 9 张卡 `status=verified_prototype` 且 `exportPolicy.productionReady=false`。自动选卡只剩 `survivor_horde`。同步 `gameplayManifest.ts`、`check-gameplay-catalog-policy.py`、`report.md`、`task.md`。历史认证字段保留。
- [x] **Icebox B：** Node 2 `dodge_counter_boss` 几何原型升级为有招式/受击反馈的 Boss 卡。
  - **Decision & Audit:** 命中圈保留给判定/测试；叠加战士/Boss 剪影、预警斩线、受击闪白、反击刀光。`lastFeedback` = `player_hurt` / `boss_stagger`。规则未改。
- [x] **Icebox C：** 其余四条成长线（境界 HP、兵刃连射、血脉、吞月）接入运行时。
  - **Decision & Audit:** `resolveNodeCombatStats` 把境界乘到 HP/近战；连珠箭、异血强身、吞月参悟可买。白猿变身仍 planned。Node 2 读取 `playerStats.hp`。
- [ ] **Icebox D：** 真机 5 分钟 Node 1 试玩（本轮用 Chromium E2E 代理，不宣称真机）。
- [x] **Icebox E：** 白猿变身通用 `overdrive_transformation`；切态短时增益。
  - **Decision & Audit:** 手动切刀 1.5s 范围/伤害提升 + 30% 减伤；切弓前 3 发暴击击穿。`overdrive_transformation` 无 IP 名，preset 用 `requiresPassive: white_ape_overdrive_passive` 武装，E / 低血量触发。叠加 wrapper 时 modifier uninstall 倒序。

---

## 📝 任务池

### Task 0: 建立本轮 vibe 合同

- [x] **Task 0.1:** 写入 `docs/0_TASKLIST.md`–`docs/5_AGENT_RULES.md`，范围锁在红队三条结构性缺口。
  - **Decision & Audit:** 本轮 P0 仅刀弓手动、疾风刀势入局、Runner 去 IP、存档隔离。门禁降级与 Node 2 美术进 Icebox。

### Task 1: 刀弓改为玩家主动切换

- [x] **Task 1.1:** `weapon_stance_cycle` 支持 `controlMode: "manual" | "timed"`；手动模式键盘 Q/Shift + 右侧切态按钮 + semantic `toggle_stance`。
- [x] **Task 1.2:** 石牧 Node 1/3 preset 使用 `controlMode: "manual"`。
- **AC:** 定时模式原单测仍过；手动模式不随 `elapsedSeconds` 切态；`toggle_stance` 后 `currentStance` 翻转。
  - **Decision & Audit:** 默认仍为 `timed`，避免打爆既有 survivor 夹具。石牧 preset 显式 manual。文件：`WeaponStanceCycleModifier.js`、preset Node 1/3、`check-weapon-stance-cycle.mjs`、`check-survivor-combat-runtime.mjs`。

### Task 2: 打通一条真实养成

- [x] **Task 2.1:** `cultivationModel` 支持战斗 target；购买成功写入 `unlockedPassives`；未实现 target 仍拒扣费。
- [x] **Task 2.2:** `疾风刀势` 标为 `implemented`；入局时把效果折进 `weapon_stance_cycle.meleeDamage` 与 `playerStats.hp`。
- [x] **Task 2.3:** E2E：购买成功 → 已研习；`连珠箭` 仍规划中；Node 1 近战伤害 = 预设 × 1.15。
- **AC:** `check-cultivation-model.ts` 与 `run-xuanjie-local-play-e2e.mjs` 通过。
  - **Decision & Audit:** 只接通一条线。`foldPassiveEffectsIntoKnobs` 在 GameRunner 创建 modifier 时折叠。E2E 断言 meleeDamage === 5.75 且 `toggle_stance` melee→ranged。

### Task 3: 清洗 Runner 旧 IP 与存档串号

- [x] **Task 3.1:** 删除 `setupFirstNodeGrowthLoop` 及 `primordial_fist` / `suan_ni_roar` / `willow_blessing`；局内成长只走 modifier。
- [x] **Task 3.2:** 生产美术校验不再写死 `wild_rhino` / `qiongqi_cub`；只消费 knobs 映射。
- [x] **Task 3.3:** `localStorage` 键带 `workspaceId`；切换工作区加载对应存档。
- **AC:** 武器架势单测在无 legacy `runGrowthState` 时仍能挂成长；内核 E2E 主 HUD 仍无旧 IP 文案。
  - **Decision & Audit:** `weapon_stance_cycle` 默认自挂 `run_growth_milestones`。存档键 `loreweaver_player_state_${workspaceId}`，缺失不迁入全局旧档。

### Task 4: 验证与审计

- [x] **Task 4.1:** 跑本轮验证命令一次，更新本文件审计，沉淀坑点到 `docs/fangame/`。
  - **Decision & Audit:** 命令见 `docs/2_ARCHITECTURE.md`。E2E 首次失败：Node 1→2 时 MainScene 已停、survivor group.clear 在 shutdown 抛错。已改为从活动场景 restart，cleanup 对失效 Group 容错。见 [[pitfall_cultivation_passthrough_and_scene_restart]]。

### Task 5: 十二节点可玩，首通改下一场

- [x] **Task 5.1:** `black_blade_flame`、`swallow_moon`、`white_ape_overdrive` 在 preset 与 `xuanjie-shimu-local` 上带数值效果；`RewardApplier` 成功才写入，失败/撤退不解锁。
- [x] **Task 5.2:** 入局把已拥有能力折进 `weapon_stance_cycle` / `overdrive_transformation` / `player.hp`。Node 11–12 的爆发用通用 `requiresAbility` 武装，core 不写石牧技能名。
- [x] **Task 5.3:** 所有带刀弓的关卡显式 `controlMode: "manual"`。`focusNodeIds` 为 1–12。两份规格的卡牌、modifier、首通奖励一致。
- [x] **Task 5.4:** 近战一扫多目标、远程开火有伤害、Node 3 危险在预警结束后才扣血，且宿主仍是 `survivor_horde`。
- [x] **Task 5.5:** 本地试玩从预设启动节点 1–12，成功 `NodeResult` 写入 `completedNodeIds`；Node 3 撤退不给 `black_blade_flame`。
- [x] **Task 5.6:** `WorldBuilderAgent.generate_gdd` 有 `XAI_API_KEY` / `GROK_API_KEY` 时走 grok；没有密钥时返回程序预设，且 `OLLAMA_API_BASE` 不改道。不得覆盖石牧预设。
- [x] **Task 5.7:** 契约检查改读受版本控制的夹具；`pack` 刷新 character-pack 快照；半透明特效按源像素粘贴。
- **AC:** `check-cultivation-model.ts`、`check-survivor-combat-runtime.mjs`、`check-xuanjiezhimen-fangame-preset.py`、`check-weapon-stance-cycle.mjs`、`run-xuanjie-local-play-e2e.mjs`、`tsc --noEmit` 通过。Icebox D 保持未勾。
  - **Decision & Audit:** 烈炎改 `weapon_stance_cycle.meleeDamage`（×1.25），吞月改远程倍率（×1.2），白猿改爆发伤害/时长和生命。单测 `check-cultivation-model.ts`、`check-survivor-combat-runtime.mjs`、`check-weapon-stance-cycle.mjs`、`check-xuanjiezhimen-fangame-preset.py` 通过。E2E 连续两遍 `status=passed`、`errors=[]`，存档含节点 1–12；Node 3 撤退不给 `black_blade_flame`，通关后下一场 Node 1 近战高于 5.75。主界面挂机计时器曾把通关列表盖回 `[1,2]`，现进入关卡会停掉 MainScene，存档合并已通关 id。Grok 实调 provider=`grok`，标题 `Clockwork Harbor Ascension`，12 个节点；无密钥两次回退都是程序预设，provider 不是 grok，也不是 ollama。`tsc --noEmit` 通过。预设没写的战斗旋钮按 modifier 默认值再乘能力，不写成 0：Node 8 远程倍率是默认 1×1.2，Node 3 爆发伤害是默认 1.55×1.2。Icebox D 仍未做。
  - **Decision & Audit (5.7):** 预设与养成检查改为读 `productize/fixtures/xuanjie-shimu-contract.json`，不再读 gitignore 的 `xuanjie-shimu-local/manifest.json`。`pack_candidates` 在写出运行时图集后覆盖 `character-pack`。空白格 `paste` 不再把 RGBA 图本身当遮罩。`check-xuanjiezhimen-fangame-preset.py`、`check-cultivation-model.ts`、`check-sprite-gen-bridge.py` 通过。浏览器 E2E 仍受沙盒禁止监听本地端口限制，本项没有界面改动。

### Task 6: 节奏关显式允许非生产卡

- [x] **Task 6.1:** 节点 2、4、5、7、10 在预设、契约夹具和工作区节点上写入 `knobs.allowExperimentalCard: true`。
- [x] **Task 6.2:** `check-xuanjiezhimen-fangame-preset.py` 断言这五关卡牌不变；玩法组对本关的受控 patch 不改写 `cardId`。去掉该开关后，同一 patch 会落到 `survivor_horde`。
- **AC:** 预设检查通过。五关卡牌仍是 `dodge_counter_boss`、`side_scrolling_brawler`、`shooter_duel`、`rhythm_timing`、`dodge_counter_boss`。
  - **Decision & Audit:** 开关写在 preset、`productize/fixtures/xuanjie-shimu-contract.json`，以及工作区 `loreweaver/nodes` 的 node 2/4/5/7/10。检查在开关存在时拒绝 `cardId` patch，去掉节点 2 的开关后断言会改写到 `survivor_horde`。`python productize/jobs/check-xuanjiezhimen-fangame-preset.py` 通过。已有生命、伤害、modifier 和首通奖励没改。

### Task 7: 主干部门筹备

- [x] **Task 7.1:** 对工作区 `xuanjie-shimu-local` 只跑 `scope.kind = trunk`。部门按拓扑起草，导演写主干汇总，状态停在 `ready_for_review`。
- [x] **Task 7.2:** 审计作品级字段。标题、真气、五条成长线和能力 id 与跑前一致。已有字段不被补缺逻辑改写。
- **AC:** 主干导演记录点明「主干」。不自动 `confirmed`。
  - **Decision & Audit:** 主干导演 `ready_for_review`，意见以「导演组汇总 · 主干」开头。标题、货币「真气」、五条成长线未改。世界观组走了 grok，指出唯一空缺是 `pipeline_dna`；编排按该意见写入风格种子，没有摘录原著，也没有改战斗数值。能力、架构、美术、音频、质检、合规当时遇到接口 503 或连接被关闭，回退成程序草案，`source` 记为 `procedural_fallback`，没有标成 grok。没有任何部门被自动确认。

### Task 8: 关卡 1–12 逐步筹备

- [x] **Task 8.1:** 按 `node.id` 从 1 到 12，一关一次跑关卡部门。
- [x] **Task 8.2:** 每关导演汇总写入该关 scope。`cardId`、modifier id、`rewardUnlocks`、已有战斗数值与跑前一致。新写入的只是尚缺的绑定。
- **AC:** 12 关都有导演 `ready_for_review`。`check-xuanjiezhimen-fangame-preset.py` 仍通过。
  - **Decision & Audit:** 关卡 1–12 各有导演汇总，状态都是 `ready_for_review`。节点 2、4、5、7、10 的卡牌仍是 `dodge_counter_boss`、`side_scrolling_brawler`、`shooter_duel`、`rhythm_timing`、`dodge_counter_boss`。补上的是原来没有的胜利方式、撤退、运行时卡牌 id、BGM 键和胜负音效。已有生命、伤害、modifier 和首通奖励没变。模型可用时 `source=llm`，不可用时是 `procedural_fallback`。预设检查通过。

### Task 9: 启动石牧工作区并抽查第 1 关

- [x] **Task 9.1:** 打开工作台，装载《玄界之门·石牧武途（同人原型）》，筹备台能看到主干和 12 关。
- [x] **Task 9.2:** 从主界面进入节点 1，能开局，并能退回主干。
- **AC:** 浏览器里看到部门 scope 与可玩的节点 1。这次抽查不是真机验收，Icebox D 保持未勾。
  - **Decision & Audit:** 工作台在 http://127.0.0.1:3000 自动装载石牧工作区。本机 Chrome 的远程调试授权没有通过，改用 Chromium 打开同一个工作台。专家模式能看到主干和 12 关标题；点第 12 关后筹备意见是「导演组汇总 · 关卡 12」。试玩进入节点 1，跳过开场后点撤退，回到带「节点 1: 丰城夜战」的主界面。窄屏 390×844 仍能看到主干和第 12 关。页面没有 pageerror。Icebox D 仍未做。

### Task 10: 审核关卡列表的可读性

- [x] **Task 10.1:** 主界面关卡卡不要用整段 `cardId` 当玩法名。`dodge_counter_boss`、`side_scrolling_brawler` 会挡住同一行的奖励。
- [x] **Task 10.2:** 吐纳圆钮下移，默认不压住第 7 关的卡面。后几关仍靠列表滚动到达。
- **AC:** 浏览器里节点 2 显示「闪避反击」，节点 4 显示「横版清场」，奖励仍在同一行可见。第 7 关卡面不被吐纳圆钮盖住。
  - **Decision & Audit:** 审核时主界面把玩法印成 `DODGE_COUNTER_B`、`SIDE_SCROLLING`，和奖励挤在一行。现按卡牌 id 显示「割草守线 / 闪避反击 / 横版清场 / 远程对决 / 节奏参悟」。吐纳圆心从 `height - 260` 改到 `height - 210`。Chrome 里重载后，节点 2 是「闪避反击」，节点 4 是「横版清场」，奖励仍在右侧。第 7 关卡底在 y=1004，圆钮顶在 y=1006，不再盖住卡面。节点 6 站桩会被高压围杀击败，这是敌潮压力，不是结算错误；死亡没有把它写成已通关。

### Task 11: 人审确认主干和 12 关

- [x] **Task 11.1:** 按依赖顺序确认。主干先于关卡。每关内部按叙事、玩法、能力、美术、音频、代码、质检。`reprepDownstream` 保持关闭，避免确认时重跑并改写 manifest。
- [x] **Task 11.2:** 确认后卡牌、modifier、首通奖励和已写战斗数值与确认前一致。只把「不要改已有字段」的交接标成已处理。还要新美术、新音频或单独 E2E 的交接保持开放。
- **AC:** 主干应确认部门与 12 关应确认部门都是 `confirmed`。导演不计入应确认数。没有自动重跑下游。
  - **Decision & Audit:** 用户授权人审后，先确认主干世界观，再按能力、架构、美术、音频、质检、合规确认；然后关卡 1–12 各确认叙事到质检。`reprepDownstream` 为 false，没有重跑，也没有改写卡牌和奖励。导演仍是 `ready_for_review`。51 条「不要改已有字段」的交接已关闭。31 条还要新风格板、新音效、VLM 或单独 E2E 的交接保持开放。节点冒烟 12/12 通过，分数 100。阶段从制作筹备进到资产确认，门禁 blockers 为空。

### Task 12: 进入运行就绪

- [x] **Task 12.1:** 资产确认到运行就绪的门禁在没有阻断项时前进。不使用 `force`。
- [x] **Task 12.2:** 构建门缺失只保留警告，不补一份假的通过报告。
- **AC:** `stageId` 为 `runtime_stage`。卡牌和首通奖励与前进前一致。
  - **Decision & Audit:** 门禁 `allowed=true`，阻断项为空。警告仍是 `runtime:build_gate_missing`，没有补构建报告。阶段现为 `runtime_stage`。预设检查通过，节点 5 仍是 `shooter_duel`。

### Task 13: 节点 5 远射运行时证据

- [x] **Task 13.1:** `check-shooter-runtime.mjs` 用预设节点 5 的旋钮断言 `timeLimitSec` 仍是 75、`playerHp` 120、`bossHp` 420。
- [x] **Task 13.2:** 同一适配器覆盖击破成功、气血归零、计时失败。通过后只关闭这条远射证据交接。
- **AC:** `node productize/jobs/check-shooter-runtime.mjs` 通过。节点 5 仍是 `shooter_duel`。
  - **Decision & Audit:** 击破时把玩家挪开弹道再把子弹送到 Boss，避免站桩先被击倒。计时失败时清掉来袭弹，专门等满 75 秒。三条结局都断言到了。对应「补跑 shooter_duel」交接已关闭。

### Task 14: 十二关合成背景音

- [x] **Task 14.1:** 预设和石牧音频目录为 `node1_battle` 到 `node12_finale`，以及胜负短音，各写一条合成频率。不添加音频文件。
- [x] **Task 14.2:** 关卡没有音频文件时，按该条频率起背景，而不是所有关卡共用 60Hz。换关要能改频率。
- **AC:** 音频解析测试仍通过。风格板、VLM 和其余新音效交接保持开放。
  - **Decision & Audit:** 十二关底噪从 78Hz 到 174Hz 各不相同。`check-audio-asset-resolver.js` 看到切到 `node5_defense` 时请求频率是 146。浏览器进入节点 1 后，背景键是 `node1_battle`，走合成底噪。只另外关闭了节点 4「覆盖已写 bgmKey」那条交接。风格板和 VLM 仍开放，还剩 29 条。

### Task 15: 候选版基线与发布合同

- [x] **Task 15.1:** 核对制作筹备台的范围、部门状态和交接；确定本轮候选版门槛。
- [x] **Task 15.2:** 跑主干、12 关、构建和浏览器基线；把失败按部门及 node.id 归属，生成可复测缺口清单。
- **AC:** 候选版须有：主干购买/存档/进出关/首通奖励闭环；每关真实运行时胜负与撤退路径；12/12 节点冒烟、两次端到端、类型检查与构建通过；所有必需图键/音键能在打包产物中解析，关键画面无黑屏和遮挡；候选包离线可启动、无未处理页面错误。保持原 cardId、modifier、首通奖励及已有战斗数值，除非有可复测缺陷证明必须改动。
  - **Decision & Audit:** 用户选择“可公开试玩的候选版本”。部门状态：主干 7 个应确认部门已 confirmed，12 关各 7 个应确认部门已 confirmed；导演汇总保持 ready_for_review，阶段为 runtime_stage。交接 82 条中 29 条仍 open，集中在美术/音频、节点 2 构建与 E2E。现有 release decision 为 blocked / runtime_supported；五种卡的 certified 证据不完整，不能把候选版称为正式认证发布。
  - **Decision & Audit (基线):** TypeScript、生产构建、预设合同、主干成长、存档隔离、幸存者/闪避反击/远射适配器、音频解析均通过；QA 节点冒烟 12/12、100 分。合成浏览器回归通过、errors=[]，但它直接进入关卡并加速结算，不能替代手玩。实际 standalone 候选包逐关启动检查 12/12 通过，zeroApiRequests=true，控制台/页面/请求错误均为空，包哈希已落在工作区报告。美术 atlas 载入但缺少全部 env_bg_* 帧，画面回退为深色程序背景，测试观察到 art degraded；12 关 BGM 只有合成频率，29 条 art/audio 交接仍待实作或取证。这是 Task 17 的候选版阻断项。首次非提权浏览器测试因沙盒禁止 127.0.0.1 监听失败，获准本机回环后通过。

### Task 16: 主干与 12 关功能补齐

- [x] **Task 16.1:** 主干购买、入局折算、存档隔离、退出、失败、首通奖励及再入局验证。
- [x] **Task 16.2:** 逐关审计 1–12 的卡牌、胜利/失败/撤退、计时或目标、特色机制与反馈；修复真实缺陷并跑对应卡牌测试。
- [x] **Task 16.3:** 用 QA 部门复跑节点冒烟，关闭有实证支持的代码/玩法交接。
- **AC:** 每个 node.id 具备可达的成功与失败路径；不会因使用自动钩子而掩盖运行时缺陷；跨关解锁与返回主干持续正确。
  - **Decision & Audit (功能阶段):** `run-xuanjie-local-play-e2e.mjs` 以同一 RuntimeKernel 逐关进入原卡：12/12 产生成功 `NodeResult` 并保存通关，12/12 通过气血归零或超时产生失败 `NodeResult`，失败不解锁也不首通；节点 2 另用六次独立反击窗口、真实指针移动验证，节点 3 撤退不发黑刀奖励。此回归使用直接入关和加速结算，报告明确为 synthetic，不等同真人完整通关。独立候选包的桌面和手机浏览器报告还逐关点击/调用撤退并确认回主干、不误写完成。QA 节点冒烟复跑 12/12、100 分；节点 2 代码专项交接 `ho_1790134284_d815` 有对应运行时 E2E 后关闭，其他美术/音频交接不因功能通过而代关。

### Task 17: 候选版资产、音频与可读性

- [ ] **Task 17.1:** 按开放交接核对 art/audio 绑定与来源，补齐关键可见/可听反馈；风格板和音效逐项验收。
- [x] **Task 17.2:** 在桌面与手机尺寸浏览器审查 12 关的 HUD、文字、触控、黑屏、掉帧及控制提示，并记录截图/报告。
- [ ] **Task 17.3:** 合规部门审查候选包内容与素材来源，输出可公开试玩的说明和限制。
- **AC:** 关键资源随包交付并可解析，重要提示可辨认；未解决的交接标明影响和候选版是否阻断，不以关闭状态代替证据。
  - **Decision & Audit (资产阶段):** 12 张原创场景图已存入 `assets/imagegen/environments/frames/`，通过 `scripts/build_environment_atlas.py` 打成 1536×3640 的独立环境 atlas，工作区 manifest 为 `env_bg_desert` 到 `env_bg_finale` 加 frame，保留原角色 atlas。独立包 12/12 关画面不再降级，桌面及 390×844 手机视口均已逐关取图。节点 7 的旧绿色脉冲已压低亮度，交互环改为银蓝；独立包操作栏与画布分行，修正了生命文字越界与操作按钮遮挡。素材提示词见 `assets/imagegen/environments/PROMPTS.md`。现有 28 条开放交接全部流向美术或音频（16 美术、12 音频），其中风格叠层和主题化听感尚未逐条完成；已有环境画和合成 cue 不能自动算这些请求已验收。
  - **Decision & Audit (音频阶段):** `audioCueCatalog` 现有 22 条可由音频解析器注册的合成 cue，含 12 关 BGM、刀弓切换、爆发、成长、胜负及超时/阵亡。玩家跳过开场的手势会解锁 WebAudio；浏览器逐关观察到 `audioUnlocked=true`，BGM key 和各自频率匹配。独立包静音按钮已接到同一解析器；这是合成候选音轨，仍须做听感和主题层审核。
  - **Decision & Audit (视觉审计):** 精确候选包的首次真实 VLM 判定 FAIL 后，已分开画布与宿主操作栏、增加两行大触控按钮、标题背板、角色尺寸和底部 HUD 对比度。最后一次报告以 `artifactSha256` 对齐浏览器包；若仍有 `WARNING`，逐条保留，不冒充四项全 PASS。390×844 画面消除上下大块留黑，12 关运行态无黑屏或页面错误。移动端节点 4 保持竖屏、显示左右移动和攻击触控区；桌面保持横版比例。

### Task 19: 节点 4 横版横屏与分场景

- [x] **Task 19.1:** 工作台宽屏进入 `side_scrolling_brawler` 时转 960×540，窄屏独立包以竖屏铺满并提供虚拟操作；退出时回主干尺寸。
- [x] **Task 19.2:** 节点 4 的锁屏波次改成锻口、风廊、烈炎三段，每段铺满一屏，敌人用本关目录角色。
- **AC:** 横屏时模拟器框是 16:9，三段地面颜色不同，清完三段才结算。`node --test productize/jobs/check-side-scrolling-brawler-runtime.mjs` 通过。退出后主界面仍是竖屏。
  - **Decision & Audit:** 最初竖屏 720×1280 上巷道停在 y=250–460，锁屏右界窄于视野，三段默认波次叠在一起。节点 4 `waveList` 现为锻口试刃、风口回廊、烈炎开锋，舞台长度 3600；适配器只读 `theme`，不写关卡名。工作台宽屏开局 `setGameSize(960, 540)`，撤退恢复尺寸。独立包手机竖屏不会强制挤成横版，使用已有指针拖动配合新增左/右/攻击虚拟按钮，浏览器验证玩家有位移并可撤退。`check-side-scrolling-brawler-runtime.mjs` 10 项通过。

### Task 18: 候选包与最终回归

- [x] **Task 18.1:** 构建并浏览器实测离线 standalone 候选包，记录包身份、页面错误、资源请求与回归结果。
- [x] **Task 18.2:** 完整验证至少两遍，更新本文档的逐关结论与残余风险。
- **AC:** 候选版产物可复现、可启动，release compiler 返回 candidate_built；公开说明准确标识其候选状态。certified release 所需真人/实体设备/VLM 精确包证据继续单列，不伪造。
  - **Decision & Audit (最终回归):** Build gate 六项全通过（TypeScript、生产构建、幸存者 demo 构建/浏览器、工作台 12 关合成端到端、内容扫描）；旧的 `run_e2e_test.py --game loreweaver` 测根页面过时，门禁已改用当前工作台的真实运行时回归。合成端到端完成多次；最后一轮增加 12 关失败矩阵，`errors=[]`。离线 ZIP 的相同 SHA 在 720×1280 与 390×844 分别通过 12/12 实际静态宿主运行、无 `/api`、无 console/page/request error；手机触控和 12 关撤退均有报告。导出物标记为 `UNVERIFIED_CANDIDATE`，release decision 为 `candidate_allowed/runtime_supported`；它不是 certified release。需要真人试玩和实体设备证据时另走认证门禁。

#### 12 关功能与候选包核对表

以下成功/失败来自直接入关的合成运行时回归，撤退及画面来自精确候选包静态浏览器；均不是人工完整游玩结论。

| 关 | 原卡 | 失败分支 | 成功 / 桌面 / 手机 / 撤退 |
| --- | --- | --- | --- |
| 1 | `survivor_horde` | 气血归零 | 通过 / 通过 / 通过 / 通过 |
| 2 | `dodge_counter_boss` | 超时 | 通过（六次反击） / 通过 / 通过 / 通过 |
| 3 | `survivor_horde` | 气血归零 | 通过 / 通过 / 通过 / 通过 |
| 4 | `side_scrolling_brawler` | 气血归零 | 通过（三段清场） / 通过 / 通过 / 通过 |
| 5 | `shooter_duel` | 超时 | 通过 / 通过 / 通过 / 通过 |
| 6 | `survivor_horde` | 气血归零 | 通过 / 通过 / 通过 / 通过 |
| 7 | `rhythm_timing` | 失误气血归零 | 通过 / 通过 / 通过 / 通过 |
| 8 | `survivor_horde` | 气血归零 | 通过 / 通过 / 通过 / 通过 |
| 9 | `survivor_horde` | 气血归零 | 通过 / 通过 / 通过 / 通过 |
| 10 | `dodge_counter_boss` | 超时 | 通过 / 通过 / 通过 / 通过 |
| 11 | `survivor_horde` | 气血归零 | 通过 / 通过 / 通过 / 通过 |
| 12 | `survivor_horde` | 气血归零 | 通过 / 通过 / 通过 / 通过 |

**未完成的公开发布条件：** 28 条主题美术/音频交接未逐条验收；现有 12 段 BGM 是合成底噪，不是完成的配乐；仓库仍使用《玄界之门》及石牧等同人名称，未见可公开发放的授权材料。当前可交付的是可本地试玩的候选包，是否对外开放还需要明确素材与 IP 权利依据。实体设备和真人试玩也尚无可复核报告。
