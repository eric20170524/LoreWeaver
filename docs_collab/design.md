# Codex Design: 9/10 Mature Game Program

## Requirement

把 `LoreWeaver/data/workspaces/20260611-060754-719406` 从可运行的 12 节点原型推进为成熟度至少 9/10 的移动端 H5 游戏，同时把形成的战斗、关卡、资产、验证和导出能力沉淀为 LoreWeaver 可复用生产能力。

执行采用双角色闭环：Codex 负责设计、拆解、review 和 gate 解释；`gpt-5.6-terra` 优先担任实现与第一轮自测角色。普通产品和技术取舍由 Agent 自主完成，只有不可逆存档处理、公开 IP 方向、受限资产授权、外部密钥和发布策略需要人类确认。

## Corrected Verdict

此前约 5.5-6/10 的判断偏高。它把 manifest 完整度、合同检查、场景可启动和文档密度错误地折算成了游戏成熟度。结合实际代码和 720x1280 截图，当前游戏合理基线约为 **4.3-4.8/10**；LoreWeaver 作为可重复产出成熟游戏的生产工具约为 **3.8-4.3/10**。

近期 Node1-3 改动确实提高了工程可靠性：移动端拖拽存在、Node2 有宝箱读条、Node3 有威压和破防窗口、运行时状态可被 E2E 读取。但这些提升主要发生在“功能存在”和“可验证”层，没有解决决定成熟度的战斗决策、数值曲线、内容密度、美术动画、真实音频、复玩价值和自然进度。

## Evidence Behind The Downgrade

- Node1 基类约 2047 行，仍把输入、HUD、敌人、技能、成长、掉落、结算和测试状态揉在单一场景中；新增质量会持续放大回归风险。
- 玩家唯一持续主动操作仍主要是移动。技能按冷却自动释放，名为 `active_dodge` 的能力也由 AI 条件自动触发，玩家没有稳定的主动战斗决策链。
- Node1 每秒按 `1 + floor(time / 30)` 生成敌人，主要用数量线性堆压；所谓三角克制只是随机染色与自动技能条件，玩家无法可靠选择元素或攻击方式来主动利用克制。
- Node1 没有完整 Boss，只在 60 秒生成一次加强版敌人，再等待 120 秒计时结束。
- Node2 宝箱已经有 2 秒读条和受击/离开打断，但 Boss 仍是通用追踪敌人，没有专属招式、血条、阶段或胜利目标联动。
- Node3 有威压、蓄力和 30 伤害破防，但表现仍以圆圈、Tint 和简单弹体为主，且它仍寄生在通用生存波次上。
- Node4-12 大多只有 100-150 行局部脚本，核心差异通常是一个几何障碍、一条百分比 HUD、固定刷怪倍率或通用 Boss；这是“机制标签”，不是完成关卡。
- 境界 12 提供约 `HP +100000`、`ATK +16000`，最终 Boss 却硬编码为 `5000 HP`。基础技能伤害会乘 `baseAtk / 10`，后期普通技能足以一击结束终局 Boss；敌人攻击仍停留在 8-70 左右，玩家近乎无敌。
- 按当前洞天和境界公式计算，Node5 起基础拳已可一发击杀多数对应 Boss；对应 Boss 需要约 56 次命中才能击败玩家，Node12 普通伤害需要约 2903 次。终局弹体又绕过 HP 直接失败，形成“普通攻击完全无害、特定碰撞无解释秒杀”的双重失衡。
- Node12 时长为 600 秒，同时继承通用每秒刷怪和按时胜利逻辑；Boss 弹体碰到玩家则无视 HP 直接失败。这既可能十分钟空耗，也可能一次无充分教学的碰撞立即结束。
- `equipment.inventory` 只是空 schema；没有装备获取、品质、词条、选择或展示。`nodeResults` 只保留最近一次结果，不保留最佳成绩、首通状态、星级、构筑、挑战条件和失败学习数据。
- `perks.pointsAvailable` 初始为 0 且没有产出/消费路径，但被动树界面实际直接消耗 `suanBoneScript`；这不是“被动树完全不可用”，而是状态 schema、经济文案和真实消费合同发生了漂移，死字段会误导生成器和验证器。
- Node 结算会顺序加入 `unlockedNodes`，但 `NodeBridge` 又用境界阻止进入；主界面只看 unlocked 列表，因此会把不可进入的节点显示成可点击，点击后只写 console warning，没有玩家可见的解锁原因。
- 只按固定通关奖励估算，每次境界推进需要重复上一节点约 34-70 次，累计约 37 小时同类计时关；设计原本依赖离线收益缓冲，但离线时间戳路径当前又失效。
- `Store.init()` 会在离线收益计算前把 `lastSaveTime` 更新为当前时间，现有离线收益路径实际上无法正确读取上次退出时间。
- 当前生产 bitmap atlas 只有 10 个 64x64 静态 frame。目标没有角色 `idle/walk/attack/hurt/death` 动画矩阵，没有关卡背景/场景件矩阵，大多数 Node2-12 敌人与 Boss 依赖程序化 fallback。
- 目标工程没有 MP3/OGG/WAV 资产，音频主要是 WebAudio tone/noise；没有菜单、关卡、Boss、胜利/失败 BGM 体系。
- 已有视觉截图证明“无重叠”口径过低：战场是空网格，角色和敌人过小，HUD 技能面板占据大量首屏，后期 HP 显示可膨胀为六位数，桌面侧栏进一步压缩主战场。
- 公开文案清理还存在 source drift：拆分 manifest 文案已被原创化，但实际运行时 `js/data.js` 的 Node12 `intro/taunts` 仍保留“颂我真名者”和“一手托……”等近似原作名句。当前 content scan 的 warning=0 没有覆盖或阻断这个玩家可见运行时来源，因此不能作为发布安全结论。
- LoreWeaver 后端 2.1-3.3 阶段仍主要模拟进度并写 manifest；导出是 manifest 预览壳和 core source，不是该 workspace 的完整可玩构建包。

## Game Maturity Scorecard

最终游戏使用 100 分制。总分至少 90，且每个维度不得低于其权重的 80%；核心战斗、关卡/Boss、视觉和移动端不得低于其权重的 85%。评分必须链接机器报告、截图、视频/动图、运行时状态或人工 playtest 记录。

| Dimension | Weight | Current Estimate | 9/10 Exit Condition |
| --- | ---: | ---: | --- |
| Combat agency and feel | 18 | 7 | 移动、主动闪避、主动技能/爆发、构筑选择形成持续决策；命中、受击、取消、冷却和风险可读 |
| Enemy and Boss design | 12 | 4 | 常规敌人至少 5 个角色 archetype；精英和每个 Boss 有教学过的招式、前摇、反制和阶段变化 |
| Level and campaign content | 14 | 5 | Node1-12 均有节奏分段、目标、空间规则、敌人组合、高潮、失败条件和复玩指标 |
| Progression, economy, replay | 14 | 6 | 数值曲线稳定；3 条构筑路线；首通幂等；最佳成绩/星级；可追求 relic/挑战；失败仍提供学习价值 |
| Art, animation, UI readability | 14 | 5 | 生产 bitmap 为主；主要 actor 动作帧完整；关卡有场景身份；HUD 层级清晰且不挤压战场 |
| Audio, VFX, emotional payoff | 8 | 2 | BGM/SFX/voice-or-callout manifest 完整；Boss/胜负/觉醒有声音与视觉高潮；音量、静音、暂停可靠 |
| Mobile UX, performance, accessibility | 8 | 5 | 390x844、720x1280 稳定；触控舒适；P95 FPS 达标；对象/内存受控；色觉与震动设置可用 |
| Original identity and release safety | 4 | 3 | 活跃内容和导出包原创化；无受保护台词/名称泄漏；标题、角色、场景和视觉语言统一 |
| QA, telemetry, save and release reliability | 8 | 6 | 零存档自然主线、机制断言、视觉回归、性能、存档迁移、导出 smoke 均有机器报告且零错误 |
| **Total** | **100** | **43** | **>= 90 and no hard cap** |

### Hard Score Caps

以下任一条件存在时，成熟度不得超过对应上限；总分计算再高也无效。

| Condition | Maximum Score |
| --- | ---: |
| 主动战斗仍只有移动，关键技能全部自动释放 | 6.0 |
| Node8-12 存在普通技能秒 Boss、玩家近乎无敌或无法解释的一击死亡 | 5.5 |
| 任一正式关卡只是计时刷怪加一个通用追踪 Boss | 7.0 |
| 主要角色/Boss/场景仍以几何或程序化 fallback 为主 | 6.5 |
| 没有真实 BGM 资产和可管理音频通道 | 7.0 |
| 没有从零存档自然推进的自动化和人工证据 | 7.5 |
| 移动端 HUD 遮挡战场、触控按钮不可达或关键文本不可读 | 7.0 |
| 发布页或导出包存在 console/page error、缺失资源或不能独立启动 | 8.0 |
| 活跃公开内容仍含高风险未授权 IP 名称、台词或直接设定 | 8.0 |

## LoreWeaver Production Scorecard

LoreWeaver 单独评分，避免目标游戏被手工打磨后误称为“生成能力已经成熟”。最终目标至少 85/100；目标游戏达到 90/100 是独立前置条件。

| Capability | Weight | Current Estimate | Target |
| --- | ---: | ---: | ---: |
| Theme/GDD/spec generation | 15 | 10 | 13 |
| Reusable gameplay templates and modifiers | 15 | 7 | 13 |
| Full source-tree synthesis and safe code patches | 20 | 4 | 17 |
| Art/audio generation, provenance and runtime wiring | 15 | 4 | 13 |
| Balance/content simulation and maturity gates | 10 | 4 | 9 |
| Human review, revisions and invalidation tracking | 10 | 6 | 9 |
| Standalone build/export and release smoke | 10 | 3 | 9 |
| Documentation and reproducibility | 5 | 4 | 5 |
| **Total** | **100** | **42** | **>= 85** |

## Product Direction

### 1. Fix The Foundation Before Adding Content

先建立统一战斗尺度、存档 v2、结果合同、波次导演、主动输入和 HUD。当前数值底座已经坍塌，在此基础上扩写 Node4-12 只会生产更多无法平衡的内容。

### 2. Build One Honest 9/10 Vertical Slice

Node1 必须先成为完整纵向切片：60-90 秒节奏、无文字墙的新手引导、3 类敌人职责、一次精英教学、一个三阶段以内的真正 Boss、主动闪避/爆发、一次有意义的局内构筑、评分结算、生产级角色/敌人/Boss/场景/音频资产，以及自然存档 E2E。

Node1 只有在独立评分达到至少 90/100、且盲测玩家能理解死亡原因和再次开局目标后，才作为模板扩展到其余节点。

### 3. Scale By Contracts, Not Copy/Paste

每关使用统一 `LevelContract`：

- `beats`: intro, teach, pressure, elite, climax, resolution。
- `objective`: survive, collect/channel, duel, defend, escort, route, puzzle-combat 等。
- `enemyComposition`: 每个 beat 的 archetype、数量预算和同时在场上限。
- `boss`: phase、move pool、telegraph、counter、break window、adds、enrage。
- `scoring`: time、damageTaken、objective、buildBonus、challengeBonus。
- `rewards`: firstClear、repeat、failure、challenge、drop table。
- `art/audio`: required semantic keys、BGM state、SFX/voice/callout coverage。
- `verification`: runtime assertions、visual states、performance budget。

### 4. Prefer Relics And Schools Over A Bloated Equipment RPG

当前空的 `equipment` schema 不应直接扩成复杂背包。先实现 3 条明确流派和有限 relic loadout：雷暴清屏、青枝控制回复、潮翼机动爆发。每条流派由主动技能、自动技能、2-3 个关键词联动和局外 relic 共同构成。只有该系统证明能产生复玩价值后再考虑装备品质/词条扩展。

### 5. Produce Assets Incrementally With Each Playable Slice

不等所有玩法完成后才“补皮肤”。Node1、Node2-3、Node4-6、Node7-9、Node10-12 每个内容批次都必须同时交付该批次的 bitmap 动作帧、场景件、VFX、BGM/SFX 和运行时覆盖报告。程序化 fallback 只负责资源损坏时保持可运行。

### 6. Extract Reusable LoreWeaver Capability After The Slice Is Proven

不要先抽象未经验证的 9/10 模板。Node1 纵向切片通过后，再把 `CombatDirector`、`LevelContract`、主动输入、结果合同、成熟度 gate、资产清单和 E2E 模板提取到 `minigame_master/core` 与 LoreWeaver compiler。

## Execution Roadmap

### Stage 0: Truth And Baseline

Purpose: 建立不会自我欺骗的质量基线。

- 收口 LW-012 Node1-12 release smoke，任何启动期或节点期 console/page error 都必须使 gate 失败。
- 生成 `maturity_score_latest.json`，逐项记录分数、证据、硬性封顶原因和缺失项。
- 增加静态/仿真报告，量化每境界玩家 HP/ATK、普通敌人 TTK、Boss TTK、敌人致死时间、关卡资源产出和突破成本。
- 记录 Node1-12 当前运行时截图、active object 数、平均/P95 FPS 和场景退出后的残留对象。

Exit: 基线报告可重复生成；当前问题必须真实失败，不能全绿。

### Stage 1: Runtime And Balance Foundation

Purpose: 修复所有后续内容依赖的底座。

- 将 Node1 大场景按职责拆成输入、战斗/伤害、技能、敌人/波次、HUD、结果/指标模块；保持可增量迁移，不做一次性重写。
- 建立统一 power budget 和 per-node scaling，使用可读的 2-4 位显示数值或缩写；目标 TTK、受击次数、Boss 时长均由报告约束。
- 设计并实现玩家主动闪避、一个主动术法、一个蓄能爆发；保留自动技能作为构筑的一部分而非全部玩法。
- 建立敌人 archetype：追击者、冲锋者、远程压制者、护卫/治疗者、区域控制者；所有攻击经过 windup-active-recovery 状态。
- 建立 `RunDirector` 和对象池，使用同时在场预算、波次 beat 和性能预算，替换每秒无上限线性刷怪。
- 重做 HUD：顶部紧凑状态、底部摇杆和技能按钮、安全区、Boss/目标条；技能详情移到可展开面板或暂停页。
- Save v2 向后兼容迁移：保留旧存档备份，加入 bestResult、firstClear、stars、flags、buildSnapshot、challenge、settings；奖励幂等。
- 修复离线收益时间戳顺序和暂停/可见性行为；对在线/离线经济做上限和收益仿真。

Exit: Node1 使用新基座运行；Node1-12 旧内容仍可 smoke；数值仿真不再出现一击秒 Boss或近乎无敌；存档迁移可回滚。

### Stage 2: Node1 9/10 Vertical Slice

Purpose: 证明目标质量可以实际达到。

- 0-15 秒：移动、自动基础拳、主动闪避无文字墙教学。
- 15-35 秒：三种敌人职责和可主动利用的弱点/元素反馈。
- 35-55 秒：首次局内分支，至少三种选择会改变攻击形态或操作节奏。
- 55-70 秒：精英招式教学和明确 break window。
- 70-90 秒：专属 Boss，2-3 个招式、至少两阶段、可读前摇和胜利高潮。
- 结算给出星级、时间、受伤、构筑、最佳记录、首通/重复奖励和清晰的下一目标。
- 交付完整 Node1 bitmap 动作覆盖、场景背景/地面/装饰、Boss、关键技能、UI 图标、BGM、SFX、胜负 stinger 和必要 callout。
- 增加自然零存档 E2E、主动输入、每个 beat、Boss 反制、失败与重试、视觉状态、音频状态和性能报告。

Exit: Node1 score >= 90/100；无 hard cap；10 分钟人工 playtest 无 P0/P1，死亡原因与复玩目标可复述。

### Stage 3: Node2-3 And Meta Replay Spine

Purpose: 验证同一底座能支撑不同玩法并形成复玩。

- Node2: 宝箱分布与路径选择、驻守读条、可预判伏击、风险等级、开箱品质、目标完成条件、专属守藏 Boss。
- Node3: 减少普通生存噪声，形成宿敌 duel/arena；威压来源可控，蓄力可打断，阶段招式组合升级，失败原因具体。
- 建立三流派关键词与 relic loadout；局内选项改变 projectile、控制、回复、位移或爆发形态，而非仅加百分比。
- 主界面重做为可扫描的主线地图/节点列表，显示星级、最佳、首通、掉落、挑战和推荐流派；去掉占屏说明性侧栏。
- 打通 Node1-3 零存档自然推进和经济闭环，校验首通幂等、失败奖励、重复刷取与突破成本。

Exit: Node1-3 都 >= 88/100，三关整体 >= 90；至少两种有效构筑能通关，且路线体验有明显差异。

### Stage 4: Full Campaign Content

Purpose: 把 12 个节点从模板标签变成完整战役。

- Node4-6 batch: 潮汐位移/漩涡、核心防守/修复、毒雾/解药资源循环；每关专属 Boss 和资产。
- Node7-9 batch: 多轮擂台选敌、分支迷宫房间、护送路线与伏击选择；每关专属 Boss 和资产。
- Node10-11 batch: 城防设施主动操作、压力波次与精英远征；目标 HP、设施、精英组合都有玩家决策。
- Node12 batch: 取消 600 秒空耗和一碰即死；构建 3 阶段终局 Boss、阶段转场、招式复习与组合、破防窗口、终局奖励和结尾演出。
- 每批次补齐 `LevelContract`、机制 E2E、视觉/音频/性能证据，并进行跨关经济回归。

Exit: 每关 >= 82/100，无模板薄弱 hard cap；全战役平均 >= 88，Node1/3/6/9/12 关键关 >= 90。

### Stage 5: Art, Audio And Feel Completion

Purpose: 消除原型感并统一作品身份。

- Actor matrix: 主角与关键敌人至少 `idle/walk/attack/hurt/death`，需要位移者增加 `dash`，Boss 按招式生成专属动作帧。
- Environment matrix: 每个内容批次有背景、地面、前景、地标、目标物、危险物和至少三类微装饰；镜头内不再只是空网格。
- VFX matrix: 玩家主动/自动技能、敌人 melee/ranged/charge/zone、Boss 每个 move、pickup、break、victory、defeat 全覆盖。
- Audio matrix: menu、3-4 个章节、Boss、finale BGM；攻击/命中/受击/闪避/技能/敌人/目标/UI/胜负 SFX；音量、静音、暂停、可见性和用户手势解锁完整。
- 用 manifest 维护 semantic keys、版本、loaded count、missing keys、provenance 和 license；运行时不得把存在于 assets 的文件漏接。
- 做命中停顿、镜头震动上限、闪屏上限、震动反馈开关、色觉安全轮廓和 reduced-motion 设置。

Exit: production bitmap runtime coverage >= 95%；关键动作帧差异检查通过；audio matrix 100%；不存在玩家可见 placeholder/fallback。

### Stage 6: QA, Performance And Release

Purpose: 把成熟体验变成可重复交付，而不是一次演示。

- 自然零存档关键路径；Node1-12 快速 smoke；每关机制；所有 Boss phase；3 种构筑；失败/重试/暂停/后台恢复；存档升级/损坏恢复。
- 390x844、430x932、720x1280 和桌面容器截图回归；检查非空画面、角色/Boss 尺寸、HUD 占比、文本溢出、触控区和下一层内容。
- 中端移动设备预算：正常战斗 P95 >= 55 FPS，Boss 峰值 P95 >= 50 FPS；对象数、粒子数、纹理内存和场景退出内存增长有阈值。
- 修复所有 console/page error、404、Vite 动态导入警告和生命周期残留。
- 导出包在独立临时目录解压后启动，通过资源、存档、Node1 和 Node12 smoke；公开包不包含历史 IP 文档和内部协作文件。
- 进行最终 30 分钟人工 campaign/playtest，记录困惑点、死亡原因、疲劳段、构筑选择和复玩意愿。

Exit: 游戏评分 >= 90/100，全部 hard cap 解除，无 P0/P1，P2 有明确接受记录。

### Stage 7: LoreWeaver Productization

Purpose: 让这次质量成为系统能力。

- 增加 workspace compiler，按模板生成完整 Vite/Phaser 源码树、LevelContract、存档、运行时、资产目录、报告目录和 package scripts，而不是只写 manifest。
- Gameplay Card 增加 `runtimeTemplate`、`requiredAssets`、`balanceModel`、`scoreModel`、`testScenarios`、`performanceBudget` 和兼容 modifier 约束。
- Agent patch workflow 支持受控源码 patch、文件 ownership、L3/L4 风险、diff preview、gate invalidation 和失败回滚；不再限制为 JSON knob。
- Asset jobs 生成/切片 bitmap sheet、image/audio manifest、provenance、license、loaded/missing report，并把资产真正接到 runtime。
- Balance simulator 和 maturity score 成为 workspace gate；生成项目必须先以真实失败报告暴露缺口。
- Export 复制 workspace 自有源码和生产资产、执行 build、写 release manifest、排除内部文件，并对 ZIP 做解压启动 smoke。
- 用一个全新原创主题做 cold-start 复现：无需手改生成可玩的 Node1 纵向切片，再通过同一成熟度评分。

Exit: LoreWeaver production score >= 85/100；新主题 cold-start 证据通过；本目标游戏仍 >= 90。

## Gate Architecture

计划新增或稳定以下机器报告：

- `reports/maturity_score_latest.json`
- `reports/balance_simulation_latest.json`
- `reports/natural_progression_latest.json`
- `reports/node1_12_release_smoke_latest.json`
- `reports/mechanics_e2e_latest.json`
- `reports/visual_regression_latest.json`
- `reports/art_coverage_latest.json`
- `reports/audio_coverage_latest.json`
- `reports/performance_latest.json`
- `reports/save_migration_latest.json`
- `reports/export_smoke_latest.json`

报告必须区分：

- `fact`: 自动化实际观察到的事实。
- `assessment`: 根据事实作出的评分。
- `missingEvidence`: 没有运行或无法证明的事项。
- `hardCaps`: 当前触发的封顶条件。
- `waivers`: 人类明确接受的豁免，不能由 Agent 自行伪造。

## Human Collaboration Triggers

默认不阻塞推进，仅在以下条件请求人类：

- 需要决定是否保留任何受保护 IP 名称/角色/台词，或转为完全原创世界观。
- 音频/语音生成需要尚未配置的付费 provider、账号、API key 或接受特定许可证。
- 存档迁移无法做到向后兼容且可能清空真实玩家进度。
- 需要发布到外部平台、付费分发或接受平台合规条款。
- Node1 机器验收通过后，需要一次真实人类 10 分钟手感校准；该反馈用于调参，不阻止此前的工程推进。

## Decisions Already Made

- 继续以 9:16 触屏 H5 为主，不改成桌面优先。
- 保留 survivor/arena 核心，但加入主动操作和关卡目标，不彻底更换游戏类型。
- 优先做有限 relic + 三流派，不先做庞大装备背包。
- Node1 做到 9/10 后再批量扩展；不平均打磨 12 个薄关卡。
- 生产资产随玩法批次交付；程序化图形只作 fallback。
- 所有新公开文案和资产按原创方向制作，contract-sensitive 旧 id 可在内部暂留并通过 display name 解耦。
