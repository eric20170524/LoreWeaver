# LoreWeaver Gameplay Inventory

> 目的：从 `minigame` 案例库中抽取真实玩法经验，作为 Gameplay Card、core 合同与局部 patch 工作流的输入。本文先记录第一版人工盘点，后续每次抽取/验证后继续修订。

---

## 盘点字段

| 字段 | 说明 |
| --- | --- |
| 来源文件 | 对应项目、节点或关键实现文件 |
| 玩法类型 | 可沉淀为 Gameplay Card 或 modifier 的类型 |
| 核心行为 | 玩家主要做什么 |
| 胜利条件 | 如何通关 |
| 失败条件 | 如何失败或受惩罚 |
| 可调参数 | 可被 Agent 局部 patch 的参数 |
| 依赖 core 能力 | 抽入稳定引擎壳时需要的通用能力 |
| 抽象建议 | 基础玩法、modifier、系统合同或暂不抽取 |
| 已知坑/备注 | 迁移到 core 前需要注意的问题 |

---

## 1. Path to Immortality

项目路径：`minigame/Path_to_Immortality`

技术形态：Vanilla HTML/CSS/JS + Canvas + Web Audio + LocalStorage。主界面通过 iframe 打开独立节点页，使用 Base64 JSON query payload 传入状态，并通过 `postMessage({ type: "NODE_RESULT", reward })` 回传奖励。

### 1.1 主干与系统

| 来源文件 | 玩法类型 | 核心行为 | 胜利条件 | 失败条件 | 可调参数 | 依赖 core 能力 | 抽象建议 | 已知坑/备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `index.html` | idle_cultivation_shell | 挂机积累灵气/修为，突破境界，解锁年龄节点 | 达到资源/境界要求并完成节点 | 突破概率失败、资源不足 | 离线收益、突破成本、境界表、年龄节点表 | Store、离线收益、解锁系统、节点入口 UI | 系统合同 | 可反推 LoreWeaver 主干成长 spec |
| `index.html` | node_iframe_microgame | 主界面 iframe 打开单页节点，传入 payload，接收 reward | 子节点发送 `NODE_RESULT` | 子节点发送失败 reward 或关闭 | payload 字段、reward schema、iframe 展示方式 | NodePayload、NodeResult、NodeBridge、sandbox 容器 | 系统合同/Gameplay Card | 对 Phaser Scene.start 有参考价值，但实现形态不同 |
| `index.html` | progression_registry | 年龄、境界、节点、奖励、storyFlags 驱动推进 | 解锁下一年龄节点 | 前置境界不满足 | unlockAges、reqStage、storyFlags | Registry、条件解锁、持久化 | 系统合同 | 适合并入 LoreWeaver manifest 的 node dependency |
| `index.html` | relic_skill_achievement_meta | 功法、法宝主动技能、成就、剧情 flag | 获得/升级/触发成就 | 冷却、条件不足 | 功法加成、法宝 CD、成就条件 | Store、Cooldown、Achievement、Toast | 系统合同 | 是多玩法工作台的 meta 层好样本 |
| `battle.html` | turn_based_skill_battle | 回合制行动按钮、技能 CD、敌我轮转、战斗日志 | 敌方 HP 归零 | 玩家 HP 归零 | HP/ATK、技能卡、CD、敌方 AI、奖励 | Battle Loop、ActionBar、CombatLog、NodeResult | Gameplay Card | 可作为跨题材通用小战斗模板 |

### 1.2 节点玩法

| 来源文件 | 玩法类型 | 核心行为 | 胜利条件 | 失败条件 | 可调参数 | 依赖 core 能力 | 抽象建议 | 已知坑/备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `node1.html` | rhythm_then_pickup | 先节奏点击呼吸环，再限时点击随机出现目标 | 呼吸进度达标并拾取目标 | 错过目标窗口 | 节奏周期、判定窗、目标出现间隔、目标存活时间 | Canvas loop、TimingJudge、TargetSpawner、NodeResult | Gameplay Card | 可拆成 `rhythm_timing` + `timed_pickup` |
| `node2.html` | drag_collect_grid | 拖拽连线相邻同类格子采集目标 | 采集指定数量目标灵草 | 误采扣时间/尝试次数耗尽 | 网格尺寸、目标数量、时间、尝试次数、邻接规则 | Grid、DragPath、MatchValidator、Timer | Gameplay Card | 很适合作为移动端轻量采集玩法 |
| `node3.html` | pressure_click_survival | 点击画布煞气降低压力，使用技能抵御压力 | 30 秒内压力未满 | 压力条满或时间耗尽 | 压力增长、目标刷新、技能 CD、技能效果 | Timer、PressureBar、Cooldown、TargetClick | Gameplay Card | 可抽为 `pressure_survival` |
| `node4.html` | shooter_duel | 横向移动并点击发射弹体攻击 Boss | 击败 Boss | HP 耗尽或超时 | 玩家血量、Boss 血量、弹速、时限、敌弹 | Shooter、Collision、HPBar、Timer | Gameplay Card | 可沉淀为轻量 Boss 射击 |
| `node5.html` | maze_exploration_choice | 键盘/虚拟方向键移动，探索迷宫并做剧情选择 | 到达出口 | 迷宫阻挡/选择资源不足 | 迷宫尺寸、出口、移动速度、选择成本/奖励 | TileMap、DPad、ChoiceModal、StoryFlags | Gameplay Card | 剧情选择可抽成 modifier |
| `node6.html` | energy_balance | 拖拽不同属性能量球到中心，保持指针在安全区累计稳定时间 | 稳定累计达到目标时长 | 指针偏离警戒区 | 能量类型、偏移量、安全区宽度、稳定时长 | DragDrop、Gauge、StabilityTimer | Gameplay Card | 很适合养成属性反哺难度 |
| `node7.html` | reaction_pick | 根据提示快速点击正确宝物，避开陷阱 | 完成指定轮数 | 误点/超时扣机会，机会耗尽 | 轮数、目标数量、陷阱比例、展示时间、机会数 | PromptHUD、RandomSpawner、ClickJudge | Gameplay Card | 移动端需防手指遮挡 |
| `node8.html` | platform_escape | 左右移动/跳跃躲避坠石、飞刃、裂隙，推进进度 | 进度条满 | 碰撞障碍或掉落 | 重力、跳跃、障碍速度、平台生成、进度速度 | Platformer、Collision、Progress | Gameplay Card | 可沉淀土狼时间、移动端宽容度 |
| `node9.html` | rhythm_timing | 跟随光团最亮瞬间点击呼吸按钮 | 进度累计达标 | 错失节奏降低效率但可继续 | 节奏周期、判定窗、连击加成、目标进度 | TimingJudge、ProgressBar、Combo | Gameplay Card | 比 node1 更纯粹，可优先抽 `rhythm_timing` |
| `node10.html` | observe_capture | 观察高速移动目标，在短暂停顿/锁定环时点击捕捉 | 成功点击停顿窗口 | 误点使目标短暂逃逸 | 移动速度、停顿频率、锁定窗口、误点惩罚 | TargetMotion、WindowJudge、ClickJudge | Gameplay Card | 适合“观察-抓取”类节点 |
| `node11.html` | sequence_synthesis | 按提示顺序点击/投入材料炼制 | 完成完整配方顺序 | 错序/连续误投导致爆炉重置 | 配方长度、材料池、容错、热度、进度惩罚 | RecipeState、InputOrderJudge、Gauge、VFX | Gameplay Card | 可作为炼丹/锻造/合成通用玩法 |
| `node12.html` | drag_collect_core | 拖动碎片汇聚到核心，避开干扰区域 | 汇聚进度达到 100 | 干扰核心时投入碎片失败 | 碎片数量、核心半径、干扰数量/速度、得分 | DragObject、CoreZone、HazardOrbit | Gameplay Card | 可抽成 `drag_to_core` + hazard modifier |
| `node13.html` | sequence_puzzle_combo | 按顺序点亮机关并拖拽拼图碎片 | 完成灯火顺序与符文拼图 | 顺序错误重置进度 | 顺序长度、拼图数量、容错、提示 | SequenceJudge、DragSnap、PuzzleState | Gameplay Card | 可以拆成两个 puzzle modifier |
| `node14.html` | rune_connect_sequence | 按提示顺序拖动连接符文节点 | 完成全部连线 | 误连产生反噬并重连当前步 | 符文数量、顺序生成、吸附半径、误连惩罚 | DragPath、NodeGraph、SequenceJudge | Gameplay Card | 适合剑阵/阵法/电路题材 |
| `node15.html` | dodge_counter_boss | 躲避攻击间隙反击，积攒槽击败 Boss | 槽满/击败 Boss | 血量耗尽 | 攻击波、闪避窗口、反击窗口、HP、槽增长 | Telegraph、Dodge、CounterWindow、HPBar | Gameplay Card | 可与 `boss_phases` 共享合同 |
| `node16.html` | branching_dialogue_check | 纯剧情多分支选择，受法宝/功法影响结果 | 选择路线并获得结果 | 条件不足导致较差结果 | 选项条件、好感/flag、奖励 | ChoiceGraph、ConditionCheck、StoryFlags | Gameplay Card/System | 可作为非动作节点模板 |
| `node17.html` | hazard_collect_waves | 躲避落雷预警区，雷击后收集产物，撑过多波 | 完成 3 波并收集目标 | 被雷击硬直扣血至失败 | 波数、预警时间、雷击伤害、收集物数量 | HazardTelegraph、WaveManager、Collectible、HPBar | Gameplay Card/modifier | 可反哺 `hazard_telegraph` modifier |

### 1.3 Path 优先抽取结论

第一优先级 Gameplay Card 候选：

- `node_iframe_microgame`：单页节点容器与 postMessage 回传协议。
- `turn_based_skill_battle`：回合制技能战斗。
- `rhythm_timing`：节奏点击。
- `drag_collect_grid`：连线采集。
- `sequence_synthesis`：顺序合成。
- `energy_balance`：能量平衡。
- `rune_connect_sequence`：连线顺序。
- `branching_dialogue_check`：条件分支剧情节点。

第一优先级 core 合同候选：

- `NodePayload` / `NodeResult` 需要同时兼容 iframe 单页、Phaser Scene 与 Ren'Py screen。
- `RewardApplier` 需要支持 `qi`、`xp`、`skill`、`skillUp`、`relic`、`unlockAges`、`flag`。
- `NodeContainer` 应抽象“打开节点、暂停主干、接收结果、移除容器、刷新主干”。
- `TestHooks` 应支持 iframe 节点观测：当前节点页、运行状态、进度、结果消息。

### 1.4 源码参数快照

以下参数来自源码复核，后续应转为 Gameplay Card 的 `knobs`。

| 来源文件 | 关键参数 |
| --- | --- |
| `index.html` | `DEFAULT_STATE` 包含 `qi`、`xp`、`age`、`realm`、`realmStage`、`skills`、`relics`、`relicCDs`、`achievements`、`storyFlags`、`unlockedNodes`；`BREAK_REQ = [100, 1000, 8000, 60000]`；`NODE_LIST` 使用 `age`、`page`、`reqStage`、`enemyConfig` 驱动节点 |
| `index.html` | `openNode` 将 `age`、`realm`、`realmStage`、`qi`、`xp`、`skills`、`relics` 编成 Base64 JSON；iframe 全屏挂载；监听 `NODE_RESULT`、`NODE_CLOSE`、`NODE_EXIT` |
| `battle.html` | 敌人可由 `enemy` query 注入；默认 reward 结构兼容 `qi`、`xp`；胜负通过 `NODE_RESULT` 回传 |
| `node1.html` | `BEAT_INTERVAL = 1200`、`HIT_WINDOW_PERFECT = 90`、`HIT_WINDOW_GOOD = 180`、`phase2Limit = 20`、`bottleAppearMin/Max = 1.2/3.0`、`bottleLifeMin/Max = 0.9/1.5`、成功解锁 `[14]` |
| `node2.html` | `GRID_COLS = 8`、`GRID_ROWS = 10`、`timeLimit = 40`、`needAmount = 16`、`mistakesMax = 3`、`ENSURE_INTERVAL = 1.0`、`MIN_TARGET_ON_BOARD = 12` |
| `node5.html` | 迷宫 `W = 21`、`H = 15`、`moveDelay = 140`、`RESCUE_COST = 60`、选择救助会返回 `relic: '南宫玉佩'` |
| `node6.html` | `TARGET_STABLE = 20`、`FAIL_OVER_WARN = 5`、`FAIL_VIO = 5`、`ORB_SPAWN_MIN/MAX = 0.8/1.6` |
| `node7.html` | `TARGET_ROUNDS = 6`、`lives = 3`、目标展示 `life = 2.0-3.0`、假目标数 `2-5`、包含 traps |
| `node8.html` | `G = 1800`、`MOVE_SPEED = 280`、`JUMP_V0 = 720`、`levelLen = 1800`、障碍含坠石与飞刃 |
| `node9.html` | `BEAT_INTERVAL = 1500`、`HIT_WINDOW_PERFECT = 80`、`HIT_WINDOW_GOOD = 160`、`passCombo = 18` |
| `node10.html` | 目标高速移动，锁定/停顿窗口内点击捕捉；进度随时间增长，误点减少进度 |
| `node11.html` | `recipe` 顺序驱动；正确输入增加 `100 / recipe.length`；错误输入 `progress - 30`；成功解锁 `[126]` |
| `node12.html` | `FRAG_COUNT = 14`；每片贡献 `100 / FRAG_COUNT * 1.1`；核心干扰时投入扣 `12` 进度；成功解锁 `[147]` |
| `node13.html` | `targetLength = 4`；阶段一顺序记忆占 50% 进度，阶段二拼图占 50%；成功解锁 `[175]` |
| `node14.html` | `RUNE_COUNT = 8`；按生成顺序拖拽连接符文；完成全部连接通关 |
| `node15.html` | 玩家 `hpMax = 100`、Boss `hpMax = 300`、`breakGauge = 0-100`；弹幕闪避与反击共同驱动胜利 |
| `node16.html` | 基础 `favor = 40`；受 `realmStage`、选择态度、携带法宝影响；成功构建奖励并解锁 `[217]` |
| `node17.html` | 玩家 `hpMax = 100`、`maxWave = 3`、`waveTime = 15`、`nascent = 0-100`；收集雷灵珠增加婴气与少量回血 |

---

## 2. Gals Panic

项目路径：`minigame/gals_panic`

技术形态：Ren'Py + Python + `pygame_sdl2` + 自定义 Displayable。当前只抽玩法机制，不直接迁入 Phaser core。

| 来源文件 | 玩法类型 | 核心行为 | 胜利条件 | 失败条件 | 可调参数 | 依赖 core 能力 | 抽象建议 | 已知坑/备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `docs/1_PRD.md` | qix_area_capture | 方向键移动画线，闭合区域，逐步清除遮罩 | 占领率达到阈值后阶段推进 | 时间归零或路径被敌人碰撞 | 时间、阈值、敌人速度/数量、阶段奖励 | PathTrail、PolygonArea、MaskLayer、EnemyCollision | 跨引擎 Gameplay Card | 抽机制时去题材化，只保留区域占领玩法 |
| `game/scripts/logic.rpy` | polygon_capture_engine | 计算线段距离、点在多边形、面积、路径闭合、敌人碰撞 | 闭合路径有效且面积计入占领率 | 敌人碰撞当前路径扣时间/打断 | 闭合距离、最小路径长度、扣时、敌人半径 | GeometryUtils、PathValidator、Collision | core utility 候选 | 这里的几何工具可复用于 Phaser/Canvas |
| `game/cdd/cdd_gals_panic.rpy` | dynamic_mask_displayable | 多层渲染、遮罩破洞、HUD、闪光与阶段演出 | 阶段切换显示下一资源 | 渲染/状态不同步 | 遮罩 alpha、闪光时长、HUD 阈值色 | RenderLayer、MaskSurface、HUD | 暂作参考 | Ren'Py Displayable 不直接进 Phaser |
| `game/scripts/gallery.rpy` | gallery_unlock_persistence | 解锁已见资源并持久化画廊 | 解锁记录写入 persistent | 持久化失败 | 分页、筛选、解锁条件 | GalleryStore、PersistentStore | 系统合同 | 可反哺 Meta/Gallery 工作台 |

可沉淀候选：

- `qix_area_capture`
- `polygon_path_capture`
- `dynamic_asset_stage_chain`
- `gallery_unlock_persistence`

---

## 3. Lingmai Dual Cultivation

项目路径：`minigame/Lingmai_DualCultivation`

技术形态：Ren'Py + Python 配置表 + 视觉交互脚本。当前只抽“点位交互、轨迹评分、阶段分支、资源/画廊”机制，不处理题材表现。

| 来源文件 | 玩法类型 | 核心行为 | 胜利条件 | 失败条件 | 可调参数 | 依赖 core 能力 | 抽象建议 | 已知坑/备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `docs/1_PRD.md` | acupoint_drag_session | 从能量池拖拽到目标点位，积累进度并影响分支 | 阶段进度达到要求 | 失稳或操作不足 | 点位数、属性匹配、阶段阈值、失稳增长 | DragDrop、PointMap、ProgressState、BranchWeights | 跨引擎 Gameplay Card | 抽机制时去题材化 |
| `game/logic.py` | character_point_config | 角色/点位/阶段配置表 | 配置驱动可见点位和阶段状态 | 配置缺失或资源不存在 | point 坐标、region、stage config | ConfigRegistry、AssetResolver | 系统合同 | 很适合作为 Gameplay Card knobs 示例 |
| `game/script_new.rpy` | path_smoothness_scoring | 记录拖拽路径，计算顺滑度/偏差，影响效果 | 轨迹评分达到有效阈值 | 轨迹太短/偏差过大 | 最小采样点、偏差权重、倍率范围 | PathAnalyzer、InputTelemetry | core utility 候选 | 可用于符文连线、注入、轨迹施法等玩法 |
| `game/script_new.rpy` | stage_branching_visual_state | 根据阶段与区域偏好切换分支状态 | 达成阶段突破 | 分支权重失衡/条件不足 | stage、branch_weight、visible point ratio | BranchState、StageMachine | 系统合同 | 与剧情/视觉资源耦合，需要解耦 |

可沉淀候选：

- `point_drag_progression`
- `path_smoothness_scoring`
- `stage_branching_state`
- `point_map_config`

---

## 4. Xianni

项目路径：`minigame/xianni`

技术形态：Phaser + Vite + `minigame_master/core/lib` 工具引用。`Node1Scene` 是基础割草生存关卡，`node2.js` 到 `node12.js` 基本采用“继承 Node1Scene，再覆盖/追加机制”的方式实现，是当前最适合沉淀 `survivor_horde` adapter 与 modifier 体系的样本。

### 4.1 主干与基础循环

| 来源文件 | 玩法类型 | 核心行为 | 胜利条件 | 失败条件 | 可调参数 | 依赖 core 能力 | 抽象建议 | 已知坑/备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `js/data.js` | phaser_progression_registry | 境界成本、节点解锁、节点配置、技能池、主题色集中配置 | 满足 progression 条件后解锁节点 | 资源不足 | realm cost、node duration、enemyPool、boss、rewards、failPenalty | Registry、Store、Unlocks、RewardApplier | 系统合同 | 当前 `mechanics.type` 是字符串，适合映射 Gameplay Card id |
| `nodes/node1.js` | survivor_horde_base | 指针移动、敌人追击、自动攻击、掉落收集、局内升级、Boss、撤退 | 倒计时结束或 Boss 逻辑通关 | HP 归零或撤退 | 玩家 HP/speed、刷怪间隔、敌人 HP/speed、技能 CD、Boss spawnAt/rewards | Phaser Scene、Physics、Timer、VFX、Audio、Modal、NodeResult | 第一批 core adapter | 结算直接 `scene.start('MainScene')`，后续应改成 `NodeBridge.returnToMain` 或 adapter `end(result)` |
| `nodes/node1.js` | in_run_skill_growth | 收集生魂升级，弹窗选择/升级技能，刷新 HP | 选择后继续局内循环 | 弹窗暂停状态错乱 | `soulsToNextLevel`、技能 maxLevel、CD 缩减、回血策略 | LevelUpModal、SkillRegistry、PauseLifecycle | adapter 内部系统 | 需要保证 modal 关闭时物理、timer、input 状态一致 |

### 4.2 Node1-Node12 机制盘点

| 来源文件 | 玩法类型 | 核心行为 | 胜利条件 | 失败条件 | 可调参数 | 抽象建议 |
| --- | --- | --- | --- | --- | --- | --- |
| `nodes/node1.js` | survivor_horde | 移动、刷怪、自动攻击、拾取、升级、Boss/倒计时 | 关卡完成 | HP 归零/撤退 | `duration`、`spawnInterval`、enemy speed/hp、skill cooldown、boss hp/spawnAt | 基础 Gameplay Card |
| `nodes/node2.js` | poison_fog + self_destruct_enemy | 安全圈逐秒缩小，圈外持续掉血；部分敌人为自爆单位 | 继承基础通关 | 圈外死亡/自爆伤害致死 | safeRadius shrink、min radius、fog damage、selfDestruct chance/speed/damage | modifier |
| `nodes/node3.js` | laser_warning | 随机预警线，延迟后生成真实激光造成伤害 | 继承基础通关 | 被激光击杀 | laser interval、warning duration、laser width、damage | modifier |
| `nodes/node4.js` | defend_core | 场中央阵眼有独立 HP，敌人优先攻击阵眼 | 继承基础通关 | 阵眼 HP 归零 | core HP、core radius、enemy damage、taunt target | modifier |
| `nodes/node5.js` | crystal_collection | 场上维持若干可采集晶体，拾取后给资源/升级 | 继承基础通关 | 继承基础失败 | crystal count、respawn interval、reward amount | modifier |
| `nodes/node6.js` | thunder_hazard | 周期生成预警圆，延迟后雷击并麻痹玩家 | 继承基础通关 | 雷击伤害致死 | strike interval、warning delay、radius、damage、paralyze duration/speed | `hazard_telegraph` modifier |
| `nodes/node7.js` | horde_intensity | 每次刷怪调用三次基础生成，并追加厚血巨兽 | 继承基础通关 | 高压刷怪致死 | spawn multiplier、elite chance、elite hp/speed/scale | modifier |
| `nodes/node8.js` | destroy_pillars | 四个阵基作为可攻击目标，全部摧毁立即胜利 | 阵基全毁 | 继承基础失败 | pillar count/hp/positions、bullet damage | objective modifier |
| `nodes/node9.js` | escort_npc | NPC 有独立 HP，敌人可攻击 NPC | 继承基础通关或护送成功 | NPC HP 归零 | npc HP、enemy aggro、collision damage | modifier |
| `nodes/node10.js` | debuff_zone | 移动禁魔/减速区域，玩家进入后削弱移动与自动攻击 | 继承基础通关 | 被削弱后死亡 | zone radius、move interval、speed cap、silence flag | modifier |
| `nodes/node11.js` | mirror_boss | 心魔镜像独立 HP、周期射击、击败即胜 | 击败镜像 | 镜像弹体/碰撞致死 | clone HP/speed、fire interval、bullet damage、player damage | boss modifier |
| `nodes/node12.js` | boss_phases | 手工 Boss 多阶段弹幕，按血量切换攻击模式 | Boss HP 归零 | 被 Boss 弹幕击杀 | boss HP、phase thresholds、bullet speed/count/damage | `boss_phases` modifier |

### 4.3 源码参数快照

| 来源文件 | 关键参数 |
| --- | --- |
| `js/data.js` | `PROGRESSION_REGISTRY` 1-12 阶，每阶 `cost` 与 `unlocks`；`NODE_REGISTRY` 每个节点含 `duration = 120`、`enemyPool`、`boss.hp`、`boss.spawnAt = 30`、`rewards`、`failPenalty.rewardMultiplier = 0.5`、`mechanics.type` |
| `nodes/node1.js` | 默认 `baseStats = { hp: 100, speed: 150 }`；`soulsToNextLevel = 30`；刷怪 `delay = 1000`；自动攻击 `delay = 1500`；倒计时 `delay = 1000`；敌人默认 `hp = 2`；子弹伤害 `2`；尊魂幡范围 `150 + level * 25`，伤害 `level * 2` |
| `nodes/node2.js` | `safeRadius` 初始为画布宽，每秒 `-5`，最小 `100`；圈外伤害 `5/sec`；自爆敌概率 `30%`，自爆伤害 `20`，自爆速度 `120`，普通速度 `80` |
| `nodes/node3.js` | 激光每 `4000ms` 生成，预警 `1000ms`，真实激光持续 `1000ms`，伤害 `20` |
| `nodes/node4.js` | 阵眼半径约 `40`，HP `1000`，敌人碰撞阵眼伤害 `50` |
| `nodes/node5.js` | 维持 `5` 个晶体，低于数量后每 `3000ms` 补充；采集给 `100 souls` 并可能触发升级 |
| `nodes/node6.js` | 雷击每 `3000ms`，预警后 `1000ms` 落雷，半径 `50`，伤害 `20`，麻痹约 `1000ms` |
| `nodes/node7.js` | 基础刷怪调用三次；额外 `15%` 生成厚血巨兽，`scale = 2.5`、`hp = 15`、`speed = 40` |
| `nodes/node8.js` | 四个阵基位于角落；每个 `hp = 10`；玩家子弹每次 `-2`；全毁立即通关 |
| `nodes/node9.js` | 护送 NPC `hp = 100`；敌人碰撞 NPC 伤害约 `10` |
| `nodes/node10.js` | 禁魔/减速区域半径约 `100`，每 `5000ms` 移动；区域内速度约 `50`，区域外速度恢复约 `150` |
| `nodes/node11.js` | 镜像 `hp = 1000`、`speed = 100`、每 `2000ms` 射击；弹体伤害 `15`；玩家子弹对镜像伤害 `50` |
| `nodes/node12.js` | Boss 手工创建，`hp = 300`；`>200` 追踪弹，`>100` 八向环弹，`<=100` 追踪 + 十二向环弹；Boss 弹体伤害 `15`，玩家子弹伤害 `2` |

可沉淀候选：

- `survivor_horde` 基础 adapter。
- `poison_fog`、`laser_warning`、`defend_core`、`escort_npc`、`hazard_telegraph`、`boss_phases` modifier。
- `SceneLifecycle` 清理要求：转场锁、`time.removeAllEvents()`、物理暂停、UI/modal 清理。

---

## 5. Perfectworld Dahuang

项目路径：`minigame/perfectworld_dahuang`

技术形态：Phaser + Vite + 主干 Store/IdleEngine/NodeBridge。它比 `xianni` 更像完整 game shell：有境界/洞天成长、挂机收益、被动树、节点入口、Node 结算回写、UI Scene 清理。因此它是 `NodePayload`、`NodeResult`、`SceneLifecycle` 与 Store 边界的关键样本。

### 5.1 主干与系统合同

| 来源文件 | 玩法类型 | 核心行为 | 胜利条件 | 失败条件 | 可调参数 | 依赖 core 能力 | 抽象建议 | 已知坑/备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `js/data.js` | realm_node_registry | 境界、洞天、技能池、节点、敌人全用配置表驱动 | 满足 realmRequired 进入节点 | 资源/境界不足 | realm cost、cave cost、skill tier、enemy stats、node rewards | Registry、Store、Unlock、RewardApplier | 系统合同 | 适合 LoreWeaver manifest 的配置来源 |
| `systems/NodeBridge.js` | phaser_node_bridge | 根据 nodeId 找配置，检查境界，组装 payload，停止 IdleEngine，启动 Scene | Scene 返回 result 后写 Store 并回 MainScene | nodeConfig 不存在或 realm 不足 | payload 字段、cooldown、sceneClass | NodePayload、NodeResult、StoreAdapter、SceneLifecycle | 进入 core 的最小合同 | 当前直接写 Store，core adapter 应只返回 result，由 shell 决定写入 |
| `scenes/MainScene.js` | idle_hub_scene | 主界面挂机收益、资源栏、境界突破、节点分页入口、战前弹窗 | 进入可解锁节点 | UI 状态或资源校验失败 | itemsPerPage、panel layout、idle tick、unlock rules | MainShell、IdleEngine、NodeLauncher、Modal | 工作台 shell 参考 | shutdown 时停止 IdleEngine，是 lifecycle 规则样本 |
| `nodes/node1.js` | survivor_horde_rich_base | WASD/方向键移动、摄像机跟随、大地图、技能自动释放、掉落奖励、UI Scene | 倒计时结束 | HP 归零/撤退 | duration、spawn scaling、skill cooldown、enemy pool、rewards/fail policy | GameplayAdapter、UIScene、SkillSystem、RewardRoll | core adapter 参考 | 已有 `this.scene.stop(this.uiSceneKey)`，比 `xianni` 更成熟 |

### 5.2 Node1-Node12 机制盘点

| 来源文件 | 玩法类型 | 核心行为 | 胜利条件 | 失败条件 | 可调参数 | 抽象建议 |
| --- | --- | --- | --- | --- | --- | --- |
| `nodes/node1.js` | survivor_horde_rich_base | 开阔地图移动、自动技能、刷怪、经验/战利品、UI Scene | 存活到时长 | HP 归零/撤退 | `duration`、enemyPool、skillTier、spawn scaling、reward table | 基础 adapter 参考 |
| `nodes/node2.js` | treasure_chest_horde | 生存同时拾取宝箱，后期 Boss 出现 | 到时通关 | HP 归零 | chestCount、chest reward、boss spawn ratio | loot modifier |
| `nodes/node3.js` | boss_rush_survival | 更高刷怪强度，80% 时长刷 Boss | 到时通关 | HP 归零 | spawnCount scaling、boss timing | intensity + boss modifier |
| `nodes/node4.js` | sea_hazard_movement | 海面/漩涡危险区域，周期生成环境干扰 | 到时通关 | 危险区/敌人致死 | whirlpool interval、duration、slow/damage | hazard modifier |
| `nodes/node5.js` | defend_array | 防守皇宫阵眼/塔防型割草 | 到时通关 | 阵眼被毁 | core HP、enemy target, boss timing | defend_core modifier |
| `nodes/node6.js` | poison_resist_survival | 毒素抗性持续下降，击杀精英拿解药补抗性 | 到时通关 | poisonResist 归零 | resist drain、elite interval、gem restore | resource_pressure modifier |
| `nodes/node7.js` | arena_wave_boss | 连续 5 波精英/Boss，击败一波后延迟下一波 | 全部波次完成 | HP 归零 | totalWaves、boss list、hp scaling、inter-wave delay | wave_boss modifier |
| `nodes/node8.js` | random_room_portals | 周期生成传送门/房间，难度与奖励倍率变化 | 到时通关 | HP 归零 | portal interval、difficultyMultiplier、rewardsMultiplier | room_modifier |
| `nodes/node9.js` | escort_elder | 护送目标移动，敌人攻击护送目标 | 到时或护送目标达成 | 护送目标死亡 | elder HP/speed/path、enemy aggro | escort_npc modifier |
| `nodes/node10.js` | siege_wall_defense | 城墙有独立 HP，敌军越线扣城防，床弩辅助清屏 | 到时通关 | wallHp 归零 | wall HP、breach damage、ballista cooldown/damage | defend_line modifier |
| `nodes/node11.js` | extreme_survival_miniboss | 高压刷怪、周期小 Boss、终局 Boss | 到时通关 | HP 归零 | spawn scaling、miniBoss interval、boss hp multiplier | intensity modifier |
| `nodes/node12.js` | final_boss_phases | 独立 Boss 实体、多阶段弹幕/冲锋 | Boss HP 归零 | 被 Boss 弹幕击中或 HP 归零 | boss HP、phase thresholds 70/30、attack interval、bullet speed | boss_phases modifier |

### 5.3 源码参数快照

| 来源文件 | 关键参数 |
| --- | --- |
| `js/data.js` | `REALM_REGISTRY` 12 阶，每阶含 `caveCount`、`breakthroughCost`、`unlockNodes`、`statBonus`；`CAVE_COST_REGISTRY` 1-25 洞天成本和属性；`NODE_REGISTRY` 每个节点含 `realmRequired`、`duration`、`enemyPool`、`bossId`、`skillTierAvailable`、`rewards`、`failRewardMultiplier`、`sceneClass` |
| `systems/NodeBridge.js` | `launchNode` 组装 `{ nodeId, nodeConfig, playerStats: store.getEffectiveStats(), playerPerks: store.getUnlockedPerks(), skillTier }`；进入节点前停止 `idleEngine`；`returnToMain` 调 `store.applyNodeResult(result)` 后回 `MainScene` |
| `scenes/MainScene.js` | 主干 `IdleEngine.start` 后在 `shutdown` 事件中 stop；节点入口分页 `itemsPerPage = 4`；进入节点前展示 intro modal |
| `nodes/node1.js` | 地图固定 `720 x 1280` 视口、世界为 `3x`；初始技能 `primordial_fist`；每秒 tick，刷怪数量 `1 + floor(surviveTime / 30)`；基础结束时停止 UI Scene 并结算随机区间奖励 |
| `nodes/node6.js` | `poisonResist = 100`，每秒约 `-4`，低于 `30` 显示警告；解药精英每 `15000ms`，击杀后宝石回复 `40` 抗性 |
| `nodes/node7.js` | `totalWaves = 5`，每波 Boss HP 为 `bossData.hp * (wave * 0.8)`，波间隔约 `3000ms` |
| `nodes/node10.js` | `wallHp = 100`，敌人越线每次 `-5`；城墙是纵向线防守目标 |
| `nodes/node12.js` | Boss `hp = 5000`，阶段阈值 `>70% / 70%-30% / <=30%`；攻击间隔约 `1500/2000/1200ms`；弹体存在约 `3000ms` |

可沉淀候选：

- `NodeBridge` 的进入/返回协议。
- `MainScene` 的 idle engine shutdown 规则。
- `Node1UI` 的独立 UI Scene 清理经验。
- 更复杂的 `survivor_horde` 技能系统与掉落奖励结算。

---

## 6. Three Kingdoms Brawl

项目路径：`minigame/three_kingdoms_brawl`

技术形态：Vanilla HTML/CSS/JS + Canvas 主画面 + Pixi/WebGL 特效层 + WebAudio + 静态 H5 启动脚本。它应作为 private case library 与 mechanics extraction 来源，第一阶段只抽机制、参数、验证方法和资产管线，不把具体题材表达或单例运行时代码迁入 LoreWeaver core。

### 6.1 主干、清版循环与 modifier

| 来源文件 | 玩法类型 | 核心行为 | 胜利条件 | 失败条件 | 可调参数 | 依赖 core 能力 | 抽象建议 | 已知坑/备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `README.md`、`js/game-data.js`、`js/game.js` | `side_scrolling_brawler` | 横向推进，在触发点锁屏，清掉本屏敌人/Boss 后继续向右推进 | 全部章节/波次清完并回传 NodeResult | HP 归零、命数耗尽、放弃续关、时间压力导致死亡 | 关卡长度、玩家数量、角色数值、敌人表、波次表、Boss 表、道具表、奖励表 | GameplayAdapter、WaveManager、LockScreenController、ActorController、HitboxResolver、DropTable、NodeResult、TestHooks | 新增基础 Gameplay Card，状态 `candidate` | 源项目是 Canvas + Pixi 特效层，原生迁入 Phaser adapter 是 L3 任务，短期优先 iframe 承载 |
| `js/game-data.js`、`js/game.js` | `locked_screen_wave` | 玩家推进到 `triggerX` 后锁住屏幕和右边界，刷出敌人，清屏后解除推进 | 当前波敌人全部死亡 | 玩家在锁屏波次内被击败 | `triggerX`、`lockX`、`cameraMax`、enemy spawns、Boss intro、clear drops | WaveManager、LockScreenController、CameraController、ActorSpawner、DropTable | modifier | camera clamp、玩家 clamp、wave active 状态必须同源，否则多人边界容易错位 |
| `js/game-data.js`、`js/stage-renderer.js`、`js/game.js` | `hazard_telegraph_lane` | 在清版 lane 上预警滚木、火油、炮火、乱箭等区域，延迟后造成伤害或迫使跳避/换线 | 躲过危险并继续清屏 | 被机关击中、超时或被敌人夹击 | hazard type、warning、life、interval、rx/ry、damage、color | TelegraphRenderer、Collision、Timer、LaneDepth、VFX | 复用/扩展 `hazard_telegraph` modifier | 预警范围必须和实际 hit area 一致；跳跃 dodge 也要进入 telemetry |
| `js/arcade-timer.js`、`js/game-data.js`、`js/game.js` | `arcade_timer_pressure` | 每波独立 TIME 倒计时，低时触发 HURRY，归零后周期扣血 | 在压力惩罚杀死玩家前清屏 | TIME OVER 后持续扣血到失败 | `baseLimit`、`chapterLimits`、`bossBonus`、`enemyBonus`、`hurryAt`、`timeoutDamage`、`timeoutPulse` | ArcadeTimer、Timer、HP、HUD、WebAudioSynth、TestHooks | modifier | 暂停、章节/Boss intro、node 结束后都不能继续 tick |
| `js/arcade-session.js`、`js/player-life.js`、`js/input-controller.js`、`js/game.js` | `arcade_credit_continue` | 投币增加 CREDIT，开局/续关扣 CREDIT，Game Over 后可继续复归 | 扣费后复归并继续当前 run | CREDIT 不足或玩家拒绝续关 | max credits、start credits、start/continue cost、respawn invuln、input mapping | ArcadeSession、LifeStock、InputMapper、HUD、NodeResult | modifier | 不能让 continue 流重复发送 NodeResult；不要把 CREDIT 自动映射为外层经济资源 |
| `js/input-controller.js`、`js/game-data.js`、`js/game.js` | `local_coop_4p` | 1-4P 键盘、手柄、WebHID、触屏虚拟控件统一成 per-player action frame | 多人共同清屏 | 输入冲突、玩家被 camera/lock clamp 卡死 | keyboard layouts、gamepad slots、deadzone、button threshold、touch controls、edge actions | LocalCoopInput、GamepadMapper、TouchControls、HUD、CameraController | modifier | 四套键盘和浏览器快捷键冲突风险高；gamepad 与 keyboard 必须共享 edge-trigger 语义 |
| `js/game-data.js`、`js/game.js`、`js/verify-scenarios.js` | `elemental_directional_combo` | 根据方向轴 + 普攻/重击触发 forward/back/up/down 方向组合技，并按角色 element 选 VFX/命中盒 | 用组合技打开波次缺口、达成连击事件或 Boss 压制 | 输入窗口不清、锁身过长、方向相对朝向误判 | directions、strengths、axis threshold、lock/cooldown、element tags、ranged overrides | InputMapper、AbilityCatalog、HitboxResolver、ProjectileSystem、VFX、SFX | modifier + ability catalog 输入 | 元素名、技能名和 callout 需要 catalog 化，公开导出时去具体表达 |
| `js/route-events.js`、`js/branch-rooms.js`、`js/game.js` | `branch_route_chain` | 每波按 speedClear/noDamage/jumpDodge/comboClear/secretCache 等条件结算支线事件，多事件达成后开启连续路线奖励/军需房 | 达成单事件或完整 branch chain | 条件未达成或重复奖励 | event specs、condition types、branch specs、prompt duration、reward items、room template | RouteConditionEvaluator、RewardSpawner、BranchRoomBuilder、Telemetry、TestHooks | modifier | route key 必须稳定，重试/续关不能重复发奖；支线房在不支持 side-room 的 runtime 中要可降级 |
| `js/score-awards.js`、`js/game-data.js` | `score_extend_1up` | 分数达到阈值后给生命最少的可用玩家奖命 | 达到阈值并未超过 max lives | max lives 已满或没有有效玩家 | thresholds、max lives、recipient policy | ScoreSystem、LifeStock、HUD、Telemetry | 后续 modifier | 对非街机主题可改写为 extra chance / shield charge 等中性资源 |
| `assets/imagegen/README.md`、`assets/imagegen/manifest.json`、`assets/imagegen/manifest.js` | `generated_brawler_atlas_pipeline` | imagegen atlas 切片，派生角色/敌人/Boss 动作帧、道具、场景件、装饰和 sheet manifest | runtime 优先加载真实 PNG，verify 能报告加载数和关键 art key | manifest 缺失、贴图 key 漂移、fallback 掩盖美术缺口 | atlas source、semantic groups、clip names、manifest paths、style lock、verification keys | RuntimeFeaturePack、AssetManifest、SpriteClipResolver、VisualGate | Runtime Feature Pack asset pipeline 样例 | 资产和题材表达保留在 case library；core 只吸收合同、manifest 形状和验证方法 |

### 6.2 源码参数快照

| 来源文件 | 关键参数 |
| --- | --- |
| `js/game-data.js` | `PLAYER_START_LIVES = 2`、`MAX_PLAYER_LIVES = 6`、`INVENTORY_LIMIT = 6`、`SCORE_EXTEND_THRESHOLDS = [5000, 12000, 24000, 42000, 65000]` |
| `js/game-data.js` | `ARCADE_TIMER_CONFIG` 含 `baseLimit = 78`、10 个 chapter limit、`bossBonus = 18`、`enemyBonus = 2`、`maxEnemyBonus = 14`、`minLimit = 55`、`hurryAt = 10`、`timeoutDamage = 14`、`timeoutPulse = 1.2` |
| `js/game-data.js` | 5 名英雄含 `role`、`hp`、`speed`、`damage`、`heavy`、`range`、`element`、`palette`；敌人和 Boss 含 `hp/speed/damage/range/score/size/artKey` 等运行时字段 |
| `js/game-data.js` | 10 个章节、21 个波次；每波含 `chapter`、`triggerX`、`lockX`、`cameraMax`、`name`、`hint`、`hazard`、`bossIntro`、`enemies` |
| `js/route-events.js` | 13 个 route event，条件枚举包括 `speedClear`、`noDamage`、`jumpDodge`、`comboClear`、`secretCache`；4 条连续 branch chain，奖励含 score 与 items |
| `js/arcade-session.js` | `maxCredits` 默认 9，状态包含 `credits`、`inserted`、`continues`、`canStart`、`canContinue` |
| `assets/imagegen/README.md` | 当前 manifest 暴露 491 个 imagegen PNG leaves：462 个 actor animation frame，加上 item、setpiece、prop、decoration slice；同时输出 individual frames 与 combo sprite sheets |
| `README.md`、`js/verify-scenarios.js` | `?verify=1` 可验证 `arcadeTimer`、`creditContinue`、`routeEvents`、`clearCampaign`、`skillEffects`、`lifeStock`、imagegen 加载数、十关 21 波通关等场景 |

### 6.3 第一阶段抽取结论

已新增候选卡片：

- `side_scrolling_brawler`
- `locked_screen_wave`
- `branch_route_chain`
- `arcade_timer_pressure`
- `arcade_credit_continue`
- `elemental_directional_combo`
- `local_coop_4p`

短期接入顺序：

1. 先把它作为机制案例进入 inventory 与 Gameplay Card，不迁移运行时代码。
2. 使用 `node_iframe_microgame` 做可运行 iframe demo，因为源项目本身是静态 H5，并且 Core Contract 已允许 iframe 通过 Base64 JSON 接收 NodePayload。
3. 把角色、敌人、Boss、技能效果、WebAudio cue、imagegen atlas manifest 整理成 Runtime Feature Pack catalogs 样例。
4. 等 iframe 与卡片验证稳定后，再评估 `SideScrollingBrawlerAdapter`；这属于 L3 adapter 工作，不应与第一阶段混在一起。

边界要求：

- LoreWeaver core 只吸收机制、参数、合同和测试方法。
- 具体角色名、地名、阵营、章节表达、专属素材与美术 provenance 保留在 `minigame` case library。
- 公开导出前必须做去题材化审查；private case library 可以保留完整案例用于 mechanics extraction。

---

## 7. 跨项目共同合同

### 7.1 三类节点容器协议

| 来源 | 进入节点 | 节点运行 | 返回结果 | 主要风险 | core 抽象 |
| --- | --- | --- | --- | --- | --- |
| `Path_to_Immortality` | 主页面创建 iframe，并用 Base64 JSON query 传 payload | 独立 HTML/Canvas 页面自己跑 loop | `postMessage({ type: "NODE_RESULT", reward })` | message schema 漂移、iframe 未清理、返回后主干刷新 | `NodeContainer` + `NodePayload` + `NodeResult` |
| `three_kingdoms_brawl` | 短期应由 LoreWeaver iframe node 打开静态 H5，并传入 NodePayload；原项目自身是独立页面启动 | Canvas 主画面 + Pixi/WebGL 特效层 + WebAudio；多玩家输入和街机 session 自管 | 第一阶段需要补 `postMessage`/NodeResult adapter；原项目当前以本地 UI 结算为主 | HTML case 可以低风险承载，native adapter 则涉及引擎不一致和多人/锁屏/计时状态 | `node_iframe_microgame` + `side_scrolling_brawler`，后续 `SideScrollingBrawlerAdapter` |
| `xianni` | Phaser `scene.start(nodeScene, data)` | Node Scene 直接继承/覆盖基类 | `scene.start('MainScene', { nodeResult })` | Store/Scene 耦合、timer/modal 清理不统一 | `GameplayAdapter.end(result)` + `SceneLifecycle` |
| `perfectworld_dahuang` | `NodeBridge.launchNode` 查 registry、校验 realm、停止 IdleEngine、启动 Scene | Node Scene + UI Scene 双场景运行 | `NodeBridge.returnToMain(scene, result)` 写 Store 后回主干 | NodeBridge 仍直接写 Store；UI Scene 清理需强制 | `NodeBridge` + `RewardApplier` + `SceneLifecycle` |
| `gals_panic` | Ren'Py screen/displayable 进入小游戏 | Displayable 持有几何、遮罩、敌人、HUD | 写 persistent/gallery 或回剧情 label | 与引擎渲染/存档耦合 | 跨引擎 `GameplayCard`，先不进 Phaser adapter |
| `Lingmai_DualCultivation` | Ren'Py screen + Python 配置表 | 点位拖拽、轨迹采样、分支权重 | 写阶段状态/画廊/分支结果 | 视觉差分与机制耦合 | `PointMap`、`PathAnalyzer`、`BranchState` utility |

### 7.2 应进入 core 的最小合同

| 合同 | 必须解决的问题 | 来源证据 | 第一版范围 |
| --- | --- | --- | --- |
| `NodePayload` | 主干进入任意玩法时，用统一数据传入当前节点配置、玩家状态、背包、随机种子 | Path Base64 payload；perfectworld `NodeBridge.launchNode` payload；xianni `init(data)` | `nodeId`、`nodeConfig`、`playerStats`、`playerPerks`、`inventory`、`runSeed` |
| `NodeResult` | 任意玩法结束后只回传结果，不直接改 Store | Path `NODE_RESULT`；xianni `payload`；perfectworld `returnToMain(result)` | `success`、`reason`、`rewards`、`penalties`、`flags`、`telemetry` |
| `RewardApplier` | 把不同项目的 `qi/xp/souls/magicPill/bloodEssence/pureBlood/flag/unlock` 归一写回 | Path reward、xianni rewards、perfectworld random range rewards | 支持数字、区间、flag、unlock 与失败倍率 |
| `GameplayAdapter` | 让基础玩法从具体项目 Scene 中拆出来 | xianni / perfectworld `Node1Scene` 共同割草循环 | `init/create/update/pause/resume/destroy/end` |
| `GameplayModifier` | 让毒雾、激光、防守、护送、Boss 阶段等局部玩法组合化 | xianni Node2-12 与 perfectworld Node2-12 都是“基类 + 附加机制” | `install/update/uninstall`，只能通过 context 操作玩法状态 |
| `SceneLifecycle` | 统一清理 timer、physics、UI Scene、modal、transition lock | xianni `time.removeAllEvents()`；perfectworld `scene.stop(uiSceneKey)` 与 IdleEngine shutdown | `start/pause/resume/end/cleanup`，失败时可观测 |
| `TestHooks` | 让 Build/E2E gate 不靠肉眼猜 | Path iframe 状态、Phaser HP/timer/kills/result、Ren'Py persistent 状态 | 暴露当前 node、hp、timer、kills、result、console errors |

### 7.3 当前优先级判断

1. `Path_to_Immortality` 仍是第一优先级案例源：它证明了一个主干可以容纳十几种轻量微玩法，且 iframe/postMessage 协议天然适合“局部 patch、局部验证”。
2. `node_iframe_microgame` 应作为 LoreWeaver 工作台的第一条节点容器协议先稳定下来，因为它最适合多玩法并行实验。
3. `survivor_horde` 应作为 Phaser core 的第一条 adapter，因为 `xianni` 与 `perfectworld_dahuang` 都有真实实现，而且 modifier 经验足够密集。
4. `three_kingdoms_brawl` 应作为 `side_scrolling_brawler` 的案例矿场先进入 Gameplay Card + modifier + iframe demo，不急着原生迁入 core。
5. Ren'Py 两个样本暂不迁入 Phaser core，但它们提供了重要 utility 候选：几何路径、区域占领、点位配置、轨迹评分、分支状态。

---

## 8. 下一步

1. 将 `survivor_horde` 从“玩法卡”推进到 core adapter 骨架：先沉淀接口、上下文和配置命名，不急着整段搬代码。
2. 先抽 `hazard_telegraph` 与 `defend_core` 两个 modifier：一个覆盖激光/雷击/漩涡，一个覆盖阵眼/城墙/护送类目标。
3. 为 `node_iframe_microgame` 补一份最小 demo 计划，确保 Path 类 HTML 单页节点也能走统一 `NodePayload`/`NodeResult`。
4. 为 `three_kingdoms_brawl` 补 iframe NodePayload/NodeResult demo，并把 imagegen atlas、英雄/敌人/技能/音效整理成 Runtime Feature Pack 样例。
