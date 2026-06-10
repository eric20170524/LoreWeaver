# LoreWeaver - AI 辅助个人游戏工作台任务规划

> 当前定位：LoreWeaver 是 **AI 辅助的个人游戏工作台**。`minigame` 是案例库，`minigame_master/core` 是稳定引擎壳，LoreWeaver 负责玩法盘点、玩法卡管理、spec/revision/patch/gate 工作流与 Agent 协作。
>
> 版权与同人合规问题暂时后置，最后集中处理；当前优先打通“案例库 -> 玩法卡 -> core 合同 -> 局部 patch -> 最小验证”的工程闭环。

---

## 总体原则

1. **给自己用**
   - 优先可控、可追踪、可回滚。
   - 不急于做大众化产品体验。

2. **允许多玩法**
   - 不把系统锁死成单一 12 节点卡牌/放置玩法。
   - 每个关卡可以选择 Gameplay Card，也可以组合基础玩法与 modifier。

3. **尽量局部 patch**
   - Agent 默认只修改 spec、文案、参数、玩法组合。
   - 修改 adapter 或 core 需要人工确认。
   - 所有 patch 必须能 diff、能回滚、能标记下游失效。

---

## Phase 0：资产边界校准

- [x] 0.1 **确认产品定位**
  - 定位为“AI 辅助的个人游戏工作台”，不是一次性游戏生成器。
  - 记录到 `LoreWeaver_Workbench_Gameplay_Core_Roadmap.md`。

- [x] 0.2 **确认三层资产分工**
  - `minigame`：真实小游戏案例库。
  - `minigame_master/core`：稳定 Phaser 引擎壳与通用工具箱。
  - `LoreWeaver`：工作台、玩法卡管理、patch/revision/gate 编排层。

- [x] 0.3 **补齐目录约定文档**
  - 明确 `minigame`、`minigame_master/core`、`LoreWeaver` 之间的写入边界。
  - 明确哪些文件允许 Agent 改，哪些文件必须人工授权。
  - 已输出到 `LoreWeaver/docs/LoreWeaver_Workspace_Boundaries.md`。

---

## Phase 1：案例库玩法盘点

目标：先从已有 `minigame` 项目中抽取真实玩法经验，不凭空设计 core。

- [x] 1.1 **建立 Gameplay Inventory 表结构**
  - 字段包括：来源文件、玩法类型、核心行为、胜利条件、失败条件、可调参数、依赖 core 能力、是否可抽为 modifier、已知坑、适合题材、不适合题材。
  - 已输出到 `LoreWeaver/docs/gameplay_inventory.md`。

- [x] 1.2 **重点盘点 `minigame/Path_to_Immortality`**
  - 覆盖 `index.html`、`battle.html`、`node1.html` 到 `node17.html`、`docs/tasklist.md`。
  - 重点识别：挂机修炼、年龄/境界节点解锁、iframe/postMessage 节点通信、Base64 Payload、Web Audio ASMR、Canvas 微交互、通用回合战斗、成就/法宝/功法/剧情 flag。
  - 第一批玩法候选：连线采集、压力点击生存、弹幕射击、迷宫探索、能量平衡、快速反应点选、平台逃亡、节奏冥想、观察捕捉、炼丹顺序合成、拖拽聚合、机关拼图、剑阵连线、闪避反击、纯剧情分支、落雷收集。
  - 这是当前最高优先级案例库来源。
  - 已写入 `LoreWeaver/docs/gameplay_inventory.md`，并补充源码参数快照。

- [x] 1.3 **盘点 `minigame/xianni`**
  - 覆盖 `nodes/node1.js` 到 `nodes/node12.js`。
  - 重点识别：割草生存、毒雾、激光预警、防守核心、采集结晶、天雷麻痹、阵基突破、护送 NPC、禁魔区域、心魔镜像、Boss 多阶段弹幕。
  - 标注哪些是基础玩法，哪些是 modifier。
  - 已写入 `LoreWeaver/docs/gameplay_inventory.md`。

- [x] 1.4 **盘点 `minigame/perfectworld_dahuang`**
  - 覆盖 `nodes/`、`systems/NodeBridge.js`、`js/data.js`、`docs/` 中的关卡设计。
  - 重点识别主干成长、Node 进入/结算、割草生存、护送、攻城、Boss 挑战等可复用机制。
  - 已写入 `LoreWeaver/docs/gameplay_inventory.md`。

- [x] 1.5 **盘点 `minigame/gals_panic`**
  - 覆盖 `docs/`、`game/scripts/logic.rpy`、`game/cdd/cdd_gals_panic.rpy`、`game/scripts/gallery.rpy`。
  - 重点识别：Ren'Py 自定义 Displayable、Qix/区域占领、轨迹闭合检测、多边形面积、敌人与线段碰撞、动态图库加载、阶段推进、画廊持久化、测试脚本。
  - 暂不直接进入 Phaser core，先沉淀为跨引擎玩法卡候选。
  - 初版已写入 `LoreWeaver/docs/gameplay_inventory.md`。

- [x] 1.6 **盘点 `minigame/Lingmai_DualCultivation`**
  - 覆盖 `docs/`、`game/logic.py`、`game/script_new.rpy`、`game/screens.rpy`。
  - 重点识别：Ren'Py 视觉交互、点位图、拖拽轨迹评分、阶段分支、图层/差分状态、画廊解锁、角色配置表。
  - 暂不直接进入 Phaser core，先抽取“点位拖拽/轨迹评分/阶段分支”机制经验。
  - 初版已写入 `LoreWeaver/docs/gameplay_inventory.md`。

- [x] 1.7 **对比跨项目共同合同**
  - 对比 HTML iframe/postMessage、Phaser Scene.start、Ren'Py screen/displayable 三类节点通信。
  - 对比 NodePayload、NodeResult、Store/Persistent、SceneLifecycle、UI Scene、E2E 可观测点。
  - 输出“应进入 core 的最小合同”清单。
  - 已写入 `LoreWeaver/docs/gameplay_inventory.md` 与 `LoreWeaver/docs/core_contracts.md`。

- [x] 1.8 **整理第一批候选玩法卡**
  - `node_iframe_microgame`：HTML 单页节点容器与 postMessage 通信。
  - `turn_based_skill_battle`：回合制技能战斗。
  - `sequence_synthesis`：顺序投入/合成。
  - `rhythm_timing`：节奏点击/呼吸判定。
  - `drag_collect_grid`：连线采集。
  - `maze_exploration`：迷宫探索。
  - `energy_balance`：能量平衡。
  - `reaction_pick`：快速反应点选。
  - `survivor_horde`：限时割草生存。
  - `defend_core`：守护核心 modifier。
  - `escort_npc`：护送 NPC modifier。
  - `hazard_telegraph`：预警危险区域 modifier。
  - `boss_phases`：Boss 多阶段 modifier。
  - 首批机器可读 JSON 已输出到 `LoreWeaver/docs/gameplay_cards/`。

---

## Phase 2：Gameplay Card 规范

目标：把玩法从“项目代码经验”转成 LoreWeaver 可选择、可组合、可 patch 的知识单元。

- [x] 2.1 **定义 Gameplay Card schema**
  - 字段包括：`id`、`title`、`category`、`runtimeAdapter`、`inputs`、`objectives`、`failure`、`knobs`、`requiredCoreSystems`、`testFixture`、`sourceProvenance`。
  - 已输出到 `LoreWeaver/docs/gameplay_card_schema.md`。

- [x] 2.2 **创建第一张玩法卡：`survivor_horde`**
  - 来源：`minigame/xianni` 与 `minigame/perfectworld_dahuang`。
  - 描述基础循环：移动、刷怪、击杀、掉落、倒计时、Boss、结算。
  - 明确可调参数：时长、刷怪频率、敌人池、Boss、奖励表、失败惩罚。
  - 已输出到 `LoreWeaver/docs/gameplay_cards/survivor_horde.json`。

- [x] 2.3 **创建第一批 modifier 卡**
  - `poison_fog`：环境压力/缩圈/持续伤害。
  - `laser_warning`：预警线与延迟伤害。
  - `defend_core`：防守目标与目标 HP。
  - `escort_npc`：友军移动、友军 HP、敌人优先仇恨。
  - `boss_phases`：Boss 阶段、弹幕、血量阈值。
  - 已输出到 `LoreWeaver/docs/gameplay_cards/modifiers/`。

- [x] 2.4 **定义 Gameplay Card 评审门槛**
  - 必须有 schema。
  - 必须有来源样本。
  - 必须有最小 demo 或可运行 adapter。
  - 必须有 E2E 或测试 hook。
  - 必须记录适合/不适合题材与常见失败点。
  - 已写入 `LoreWeaver/docs/gameplay_card_schema.md`。

---

## Phase 3：Core 稳定合同

目标：先稳定最小合同，再逐步沉淀玩法 adapter。

- [x] 3.1 **定义 `NodePayload`**
  - 主干进入关卡时传入：`nodeId`、`nodeConfig`、`playerStats`、`playerPerks`、`inventory`、`runSeed`。
  - 明确字段默认值和向后兼容策略。
  - 已写入 `LoreWeaver/docs/core_contracts.md` 与 `minigame_master/core/lib/contracts/NodeContracts.js`。

- [x] 3.2 **定义 `NodeResult`**
  - 关卡结束时回传：`success`、`reason`、`rewards`、`penalties`、`flags`、`telemetry`。
  - 明确撤退、失败、通关、超时的 reason 枚举。
  - 已写入 `LoreWeaver/docs/core_contracts.md` 与 `minigame_master/core/lib/contracts/NodeContracts.js`。

- [x] 3.3 **定义 `GameplayAdapter` 基类**
  - 最小接口：`init(payload)`、`create(scene)`、`update(time, delta)`、`pause()`、`resume()`、`destroy()`、`end(result)`。
  - 明确 adapter 不直接写 Store，只通过 NodeResult 回传。
  - 已写入 `minigame_master/core/lib/gameplay/GameplayAdapter.js`。

- [x] 3.4 **定义 `GameplayModifier` 基类**
  - 最小接口：`install(context)`、`update(context, time, delta)`、`uninstall(context)`。
  - 明确 modifier 只能通过 context 操作玩法，不绕过生命周期。
  - 已写入 `minigame_master/core/lib/gameplay/GameplayModifier.js`。

- [x] 3.5 **定义 `SceneLifecycle` 规范**
  - 统一处理：启动、暂停、恢复、撤退、转场锁、计时器清理、物理碰撞清理、UI Scene 停止。
  - 沉淀历史坑：切场景前必须清理并行 UI Scene、定时器和物理组。
  - 已写入 `LoreWeaver/docs/core_contracts.md` 与 `minigame_master/core/lib/contracts/SceneLifecycle.js`。

- [x] 3.6 **定义 `TestHooks`**
  - 暴露：当前 scene key、node id、HP、倒计时、击杀数、结算状态、最近 NodeResult、console error。
  - 为 Playwright E2E 提供稳定观测点。
  - 已写入 `LoreWeaver/docs/core_contracts.md` 与 `minigame_master/core/lib/contracts/TestHooks.js`。

---

## Phase 4：第一条最小玩法落地

目标：把 `survivor_horde` 从案例库抽成 core 可复用 adapter。

- [x] 4.1 **从 `xianni` 抽取基础割草循环**
  - 移动。
  - 刷怪。
  - 自动攻击/子弹。
  - 击杀掉落。
  - 倒计时。
  - 撤退。
  - 结算。
  - 已以去题材化骨架写入 `minigame_master/core/lib/gameplay/survivor_horde/SurvivorHordeAdapter.js`。

- [x] 4.2 **迁移到 `minigame_master/core/gameplay/survivor_horde`**
  - 新建 adapter 目录。
  - 复用 core 的 `GameplayAdapter`、`SceneLifecycle`、`NodeResult` 合同。
  - Store、NodeBridge、UI/VFX/Audio 由 shell 或 demo 层注入，不在 adapter 内直接耦合。
  - 移除具体 IP 文案与项目特例。
  - 当前采用 `GameplayAdapter`、`SceneLifecycle`、`NodeResult` 与 Phaser scene context，不直接写 Store；目录为 `minigame_master/core/lib/gameplay/survivor_horde/`。

- [x] 4.3 **抽取 2 个优先 modifier**
  - `hazard_telegraph`：用于激光/天雷预警。
  - `defend_core` 或 `boss_phases`：根据代码复用难度选择。
  - 已先落地 `HazardTelegraphModifier` 与 `DefendCoreModifier` 骨架。

- [x] 4.4 **建立最小 demo**
  - 用纯配置启动 `survivor_horde`。
  - 不依赖某个具体 IP。
  - 能进入、游玩、撤退、结算、返回主干。
  - 已写入 `minigame_master/core/demo/survivor_horde/`；使用 DOM control 与隐藏 test-state 镜像支持 E2E。

- [x] 4.5 **跑通最小 Build Gate**
  - 目标：Vite build 通过。
  - 失败必须记录到规则文档。
  - 已通过：`minigame/xianni/node_modules/.bin/vite build minigame_master/core/demo/survivor_horde --outDir /private/tmp/lw_survivor_demo_dist`。

- [x] 4.6 **跑通最小 E2E Gate**
  - 目标：启动 demo，模拟 5-10 秒，确认无 console error，确认 TestHooks 状态更新。
  - 失败必须记录到规则文档。
  - 已通过：本地服务加载 demo，点击 Start，运行约 6 秒，确认 `status=running`、`timer` 更新、`kills` 更新、console 无 error/warning；点击 Retreat 结算为 `reason=retreated`，Back 返回菜单。
  - 备注：仓库 demo 使用 CDN Phaser；E2E 为避免外网不确定性，临时下载 Phaser 到 `/private/tmp` 并只在临时测试根目录替换为 local script，未将第三方 bundle 写入仓库。

---

## Phase 5：LoreWeaver 工作台接入

目标：让 LoreWeaver 不再只生成 GDD，而能管理玩法卡、patch 与局部重编译。

- [x] 5.1 **扩展 LoreWeaver manifest**
  - 增加 `gameplayCards`。
  - 增加每个 node 的 `gameplay` 字段。
  - 支持 `adapter` + `modifiers` + `knobs`。
  - 已在 `src/types.ts` 与 `src/utils/gameplayManifest.ts` 中实现旧 manifest 自动升级。

- [x] 5.2 **建立 patch 对象格式**
  - 字段：`target`、`operation`、`before`、`after`、`reason`、`invalidates`、`patchLevel`。
  - patchLevel 支持 L0-L4。
  - 已写入 `src/types.ts`、`src/utils/gameplayManifest.ts` 与 `docs/patch_revision_workflow.md`。

- [x] 5.3 **建立 revision 记录**
  - 每次 approve 后创建 revision。
  - 保存 manifest 快照、patch 列表、gate 结果。
  - 下游 artifact 可标记 `fresh`、`stale`、`failed`、`approved`。
  - 已在 `applyManifestPatch` 中创建 revision，并维护 artifact stale 状态。

- [x] 5.4 **实现 Gameplay Card 选择 UI**
  - 每个 node 可选择基础玩法。
  - 可添加/移除 modifier。
  - 可编辑 knobs。
  - 显示需要重跑的下游 gate。
  - 已新增 `玩法卡工作台` tab；当前支持基础玩法选择、modifier 勾选、pending patch diff 与 revision 列表。
  - knobs 结构已进入 manifest schema，细粒度 knobs 表单留给下一轮 UI 打磨。

- [x] 5.5 **Agent patch 约束**
  - 默认只允许 L0-L2。
  - L3-L4 必须人工确认。
  - Agent 返回 patch，不直接覆盖最终文件。
  - UI 中将 gameplay 组合变更排队为 pending patch；确认后才应用并写回 manifest。

- [x] 5.6 **局部重编译**
  - 修改某个 node 的玩法参数后，只标记并重编译受影响关卡。
  - 修改 core 或 adapter 时，触发更大范围回归。
  - 当前实现为局部失效标记：`node:<id>`、`adapter:<adapter>`、`gate:build`、`gate:e2e` 标记 stale；真实执行由 Phase 6 gate 负责。

- [x] 5.7 **玩法卡组合关系表达优化**
  - 将玩法卡工作台从“基础玩法 + modifier 复选框”升级为“玩法组合编辑器”。
  - 明确三层概念：基础玩法 Base Card、挂载机制 Modifier、运行时 Adapter。
  - 在 UI 中展示组合结构：`基础玩法 -> 已挂载机制 -> 组合结果预览`。
  - 为 modifier 补充关系元数据：`modifierFor`、`effectSummary`、`changes`、`requires`、`conflicts`、`implementationStatus`。
  - 根据当前基础玩法过滤或标记可用 modifier，避免用户误以为所有 modifier 都能任意组合。
  - 在 modifier 卡片上说明它改变了什么：目标、失败条件、敌人行为、地图危险、Boss 行为或资源压力。
  - 在组合结果区域显示语义 diff，例如新增失败条件、新增核心系统依赖、影响的 gate。
  - 区分 `implemented` 与 `design_only` modifier，当前仅设计项继续允许审阅但不能暗示已可运行。
  - Pending Patch 区域除 JSON before/after 外，补充“本次组合变更摘要”。
  - 保持 L2 边界：玩法卡与 modifier 组合只改 node gameplay assignment；涉及 adapter/core 行为时进入 L3/L4 人工审阅。
  - 第一阶段只覆盖 `survivor_horde` 与现有 modifier：`hazard_telegraph`、`defend_core`、`escort_npc`、`boss_phases`、`poison_fog`、`laser_warning`。

---

## Phase 6：质量门禁与知识回流

目标：用真实 gate 替代模拟成功。

- [x] 6.1 **Build Gate**
  - 执行真实构建命令。
  - 捕获语法错误、import 错误、路径错误。
  - 失败时停止并生成诊断。
  - 已新增并运行 `workflow/scripts/run_build_gate.mjs`；报告写入 `workflow/reports/build_gate_latest.json`。

- [x] 6.2 **Runtime E2E Gate**
  - 启动本地服务。
  - 进入目标 node。
  - 模拟基本交互。
  - 断言 TestHooks 更新。
  - 捕获 console error。
  - 已对 `survivor_horde` demo 执行浏览器 E2E：Start、运行约 6 秒、Retreat、Back；报告写入 `workflow/reports/runtime_e2e_survivor_horde_latest.json`。

- [x] 6.3 **Scene Hygiene Gate**
  - 静态检查 transition lock、timer cleanup、UI scene stop、physics group cleanup。
  - 先做规则检查，后续再接 VLM。
  - 已新增并运行 `workflow/scripts/check_scene_hygiene.mjs`；报告写入 `workflow/reports/scene_hygiene_latest.json`。

- [x] 6.4 **Rules & Bugs 回流**
  - 将每次失败修复记录到项目规则文档。
  - 稳定后再提炼到全局 `minigame_master/workflow/prompts`。
  - 已回流到 `workflow/templates/07_RULES_AND_BUGS.md` 与 `workflow/templates/08_SCENE_LIFECYCLE.md`。

---

## Phase 7：后置事项

- [x] 7.1 **版权与同人合规处理**
  - 当前后置。
  - 后续集中处理：用户自带语料、风格化致敬、敏感词扫描、逐字引用限制、导出前清理。
  - 已建立 `docs/copyright_and_fanwork_deferred_policy.md` 与 `workflow/scripts/content_safety_scan.mjs`。
  - 已对 export surfaces 执行扫描并清理 UI placeholder 中的具体 IP 示例；报告写入 `workflow/reports/content_safety_scan_latest.json`。

- [x] 7.2 **视觉审计与 VLM**
  - 后置到核心玩法闭环稳定之后。
  - 先保证 Build/E2E/TestHooks 可靠。
  - 已输出 `docs/visual_audit_and_vlm_backlog.md`，明确 VLM 在 deterministic gates 之后执行。

- [x] 7.3 **多 Agent 角色深化**
  - 后置到 patch/revision/gate 稳定之后。
  - Agent 角色应围绕 artifact ownership，而不是围绕漂亮称号扩张。
  - 已输出 `docs/agent_roles_artifact_ownership.md`，按 artifact ownership 划分角色与 patch 权限。

---

## 2026-06-10 复盘结论

这次复核结论：LoreWeaver 不是“只有 GDD 的空壳”，但也还没有完成“工作台内真实动态玩法运行时”。当前最关键的差异是：

- `minigame_master/core` 已经有 `GameplayAdapter`、`GameplayModifier`、`SurvivorHordeAdapter`、`HazardTelegraphModifier`、`DefendCoreModifier` 和独立 demo gate。
- `LoreWeaver/src/types.ts` 与 `src/utils/gameplayManifest.ts` 已经支持 `node.gameplay.cardId / modifiers / knobs / patchLevel`，UI 也能排队 gameplay patch。
- `LoreWeaver/src/game/GameRunner.ts` 的 `LevelActiveScene` 仍然通过 `node.mechanics` 分支写死 `tap_reaction`、`collect_dodge`、`memory_sequence` 三种小游戏；它尚未读取 `node.gameplay`，也未加载 core adapter registry。
- `backend/main.py` 的 `/api/audit` 已接入真实 Canvas PNG、像素门禁与可选 Codex 视觉审计，但 `workflow/reports/visual_audit_latest.json` 显示 `codex_visual_agent.status=available_disabled`，还不能算真正启用 VLM 视觉审计。
- `backend/theme_presets.py` 仍保留具体题材/IP 风格预设；这适合 demo，但不适合长期作为去题材化工作台 core 默认路径。

因此下一轮不应回到“创建 adapter 骨架”，而应做 **Workbench Runtime Bridge**：把已经 demo-proven 的 core adapter 接进 LoreWeaver 真实模拟器，并把 gate 覆盖范围从 core demo 扩展到工作台路径。

---

## Phase 8：Workbench Runtime Bridge

目标：让 LoreWeaver 手机模拟器真正消费 Gameplay Card，而不是只在 UI 与 manifest 层保存玩法选择。

- [x] 8.1 **建立 LoreWeaver 运行时 adapter registry**
  - 输入：`node.gameplay.cardId`、`node.gameplay.modifiers`、`node.gameplay.knobs`。
  - 输出：可实例化的 runtime adapter 与 modifier 列表。
  - 第一批只接 `survivor_horde`，其他 card 保持 legacy fallback。
  - 需要兼容 `GameRunner.ts` 的 Phaser/TypeScript 构建方式，避免直接破坏现有三种 legacy mechanics。

- [x] 8.2 **在 `LevelActiveScene` 中接入 `node.gameplay` 优先分发**
  - 当 `node.gameplay.cardId === "survivor_horde"` 时，走 core `SurvivorHordeAdapter`。
  - 当没有 gameplay 或 card 尚未有 runtime adapter 时，保留当前 `node.mechanics` legacy 分支。
  - 将 `goalValue`、`durationLimit`、`difficulty`、`resourceMultiplier` 合并为 adapter knobs。
  - 将 adapter `NodeResult` 映射回当前 `PlayerState` 解锁、奖励和保存流程。

- [x] 8.3 **实现 modifier 实例化与 knobs 合并**
  - 支持 `hazard_telegraph` 与 `defend_core` 两个已落地 modifier。
  - 未落地的 `poison_fog`、`laser_warning`、`escort_npc`、`boss_phases` 在 UI 可选择时必须标记为 design-only 或禁用运行。
  - 所有 modifier 必须经过 `install/update/uninstall` 生命周期，不能在 Scene 中散落裸定时器。

- [x] 8.4 **补齐工作台 TestHooks**
  - 在 LoreWeaver 模拟器暴露当前 scene、node id、adapter id、status、timer、kills/result reason、console error。
  - 保持 core demo 的 DOM test-state 镜像经验，但落到工作台路径。
  - E2E 不依赖视觉文案定位，优先依赖稳定 `data-testid` 或 `window.__LOREWEAVER_TEST_HOOKS__`。

- [x] 8.5 **扩展 Gate 覆盖到 LoreWeaver 工作台运行时**
  - Build Gate：继续跑 `npm run lint`、`npm run build`、core demo build。
  - Runtime E2E Gate：新增 LoreWeaver app path，选择一个 node，切换 `survivor_horde + hazard_telegraph/defend_core`，进入关卡，运行 5-10 秒，撤退，断言 NodeResult 与无 console error。
  - Scene Hygiene Gate：扫描 `GameRunner.ts` adapter path 的 timer、input、transition lock、shutdown cleanup。

---

## Phase 9：VLM 视觉审计真正启用

目标：在 deterministic gates 之后启用视觉大模型审计，避免把 VLM 当作唯一质量判断来源。

- [x] 9.1 **整理 VLM 开关与运行说明**
  - 在 `.env.example` 与 docs 中记录 `LOREWEAVER_ENABLE_CODEX_AUDIT=1`。
  - 明确未开启时报告应显示 `available_disabled`，开启后必须有真实视觉 agent 结果或明确失败原因。

- [x] 9.2 **让视觉审计报告区分 deterministic 与 VLM 两层结果**
  - deterministic：真实截图、非黑屏、比例、长文本风险、安全热区。
  - VLM：HUD 遮挡、按钮重叠、文本溢出、可读性与移动端触控风险。
  - VLM 失败不能掩盖 deterministic FAIL；VLM 未启用不能被标为完整 PASS。

- [x] 9.3 **沉淀 prompt reflow 为可审阅 patch**
  - VLM 输出只进入建议队列，不直接修改代码。
  - 坐标/布局建议映射为 L1/L2 patch；涉及 adapter/core 仍走 L3/L4 人工确认。

---

## Phase 10：去题材化与配置货币化

目标：让工作台 core 默认路径不携带具体 IP 语料，把题材、文案、数值都变成 manifest/knobs。

- [x] 10.1 **清理 `backend/theme_presets.py` 的默认 IP 风格依赖**
  - 保留通用 fallback。
  - 具体题材示例移动到 demo seed 或用户自带语料路径。
  - 导出路径默认走去题材化文案。

- [x] 10.2 **建立 theme seed 与 gameplay knobs 的边界**
  - theme seed 只负责风格、资源名、叙事方向。
  - gameplay knobs 负责目标数、时长、刷怪、伤害、奖励、modifier 参数。
  - Agent patch 默认先改 knobs，不直接改 runtime 代码。

- [x] 10.3 **补充内容安全扫描到 Workbench Runtime Bridge**
  - 扫描 manifest、generated docs、UI placeholder、export package。
  - 确保 core/demo 代码不携带特定 IP 文案。

---

## Phase 11：全玩法可运行化长期规划 -- 现阶段不考虑，除非指定要实现，不然默认跳过

目标：将 Phase 1 盘点出的玩法候选逐步从“文档候选”推进到“可选择、可配置、可运行、可测试”的 Gameplay Card 资产。

- [ ] 11.1 **建立玩法成熟度分层**
  - 为每个玩法候选标记成熟度：`inventoried`、`card_json`、`ui_registered`、`runtime_ready`、`gate_verified`。
  - UI 中区分“可运行基础玩法”“候选基础玩法”“仅设计/待实现”，避免用户误以为所有候选已经可运行。
  - 成熟度进入 Gameplay Card 元数据，并在玩法卡工作台可见。

- [ ] 11.2 **补齐候选玩法卡 JSON**
  - 将 Phase 1 已盘点但尚未机器可读化的玩法补成 Gameplay Card JSON。
  - 第一批补齐：`maze_exploration`、`energy_balance`、`reaction_pick`、`rune_connect_sequence`、`branching_dialogue_check`。
  - 第二批补齐：平台逃亡、弹幕射击、闪避反击 Boss、观察捕捉、压力点击生存、机关拼图、区域占领/Qix 类玩法。
  - 每张卡必须包含：来源证据、输入方式、胜利/失败条件、knobs、依赖系统、适合/不适合题材、已知风险。

- [ ] 11.3 **扩展基础玩法 UI 展示**
  - 基础玩法下拉不只显示已注册的 5 张基础卡，而要展示完整候选池。
  - 对未运行化玩法显示状态徽标：`候选`、`已卡片化`、`待 adapter`、`可运行`。
  - 未可运行玩法可进入设计审阅与 patch 队列，但不能暗示已能进入模拟器运行。

- [ ] 11.4 **逐步实现 runtime adapter / iframe demo**
  - 优先复用 `node_iframe_microgame` 容器，把 Path 类单页 HTML 玩法纳入统一 `NodePayload` / `NodeResult`。
  - 对 Phaser 适合玩法沉淀独立 adapter；对轻量微玩法优先用 iframe demo 降低迁移成本。
  - 每完成一个玩法，必须补 runtime smoke test、TestHooks、SceneLifecycle/cleanup 规则。

- [ ] 11.5 **建立玩法运行化优先级**
  - 优先级依据：案例来源完整度、实现复杂度、复用面、与现有 core 合同兼容度、测试可观测性。
  - 推荐顺序：`rhythm_timing`、`drag_collect_grid`、`sequence_synthesis`、`turn_based_skill_battle`、`energy_balance`、`maze_exploration`、`reaction_pick`、`rune_connect_sequence`、`dodge_counter_boss`、`platform_escape`。
  - 每轮只推进 1-2 个玩法，避免一次性扩大运行时风险。

- [ ] 11.6 **将 gate 覆盖扩展到多玩法矩阵**
  - Build Gate 覆盖所有已 runtime-ready 的 Gameplay Card。
  - Runtime E2E Gate 为每张可运行玩法至少提供一个 5-10 秒 smoke flow。
  - Scene Hygiene Gate 检查每个 adapter/demo 的 timer、input、physics、iframe/message listener 清理。
  - 视觉审计在 deterministic gates 通过后抽样覆盖多玩法，重点检查 HUD 遮挡、文本溢出和移动端触控区域。

---

## 当前下一步

所有 Phase 8-10 以及 Phase 5.7 玩法卡组合关系表达优化与 manifest 递归膨胀 bug 已全部开发完成并修复。

下一步主要执行：
1. [x] 修复 `manifest.json` 膨胀递归 bug。
2. [x] 优化玩法卡组合关系表达（包括 UI、预览、语义 diff 与元数据）。
3. [ ] 重跑工作台与 demo 编译及 E2E 校验，确保所有 gates 通过并变绿。
4. [x] 开展 Phase 12：深化玩法运行时与 Boss 挑战。
5. [x] 开展 Phase 13：表现力与音频合成重塑。
6. [x] 开展 Phase 14：结构重构与工程优化。

---

## Phase 12：深化玩法运行时与 Boss 挑战 (Deepening Core Gameplay Runtime)

- [x] 12.1 **创建 TapReaction 独立 Adapter 模块**
  - 放置在 `minigame_master/core/lib/gameplay/tap_reaction/TapReactionAdapter.js`
  - 实现圆环的收缩判定、点中得分、漏掉扣除玩家生命值 (HP) 机制
  - 导出完整的 `TestHooks` 与 `NodeResult` 数据交互
- [x] 12.2 **创建 CollectDodge 独立 Adapter 模块**
  - 放置在 `minigame_master/core/lib/gameplay/collect_dodge/CollectDodgeAdapter.js`
  - 优化玩家 Capsule 的拖拽物理、灵石掉落速度及天雷/流星的碰撞箱
- [x] 12.3 **实现关卡 Boss 战机制 (Boss Showdown)**
  - **Tap Reaction Boss**：进度达到 80% 时生成八卦雷劫阵，Boss 周期性发射红线射线，玩家需一边清除逼近的飞弹，一边连续点击击破 Boss 的八卦弱点阵眼
  - **Collect & Dodge Boss**：关卡最后阶段召唤雷兽 Boss，在屏幕顶部进行全屏激光横扫与密集陨石雷击，玩家必须灵活闪避并收集掉落的飞仙灵剑来重创 Boss
- [x] 12.4 **设计精美的关卡 UI 与过渡动画 (Juicy Game UI)**
  - 实现开场卷轴动画 (Level Intro Overlay)，显示关卡名、难度及目标提示
  - 制作通关结算金雨粒子特效与“领取机缘 (Claim Rewards)”奖励动画，点击后真实累加资源并解锁后续节点
  - 制作失败血幕效果 (Defeat Screen)，支持“原地重整旗鼓”与“撤退回主页”
- [x] 12.5 **更新 LoreWeaver 运行时桥接**
  - 在 [GameRunner.ts](file:///Users/lm/pyProj/hungry-for-knowledge/LoreWeaver/src/game/GameRunner.ts) 的 `LevelActiveScene` 注册并按 `cardId` 分发 `rhythm_timing` (TapReaction) 与 `drag_collect_grid` (CollectDodge) 的 Phaser Adapter 实例，逐步下线原有的 Legacy 硬编码分支

## Phase 13：表现力与音频合成重塑 (Polishing Expressiveness & Sound Synthesizer)

- [x] 13.1 **丰富 Phaser 粒子交互**
  - 在子弹击中怪物、灵珠被吸收、玩家受到天雷劈中时生成飞散的火花/灵能碎屑粒子
- [x] 13.2 **升级 AudioSynth 音频引擎**
  - 在 [AudioSynth.ts](file:///Users/lm/pyProj/hungry-for-knowledge/LoreWeaver/src/utils/AudioSynth.ts) 引入 Web Audio FM / LFO 合成器，设计修仙标志性的铜磐余音、飞剑呼啸声、雷鸣低音等
  - 增加长音频背景音乐 (BGM Drone)，支持进入关卡时淡入，返回主页时淡出

## Phase 14：结构重构与工程优化 (Refactoring & Engineering Polish)

- [x] 14.1 **重构 App.tsx 巨无霸单文件**
  - 拆分出 `src/components/Header.tsx` (处理主题输入、Orchestrate 按钮、亮/暗主题和语言切换)
  - 拆分出 `src/components/EmulatorPanel.tsx` (处理 Phaser 容器挂载与模拟器窗口大小缩放逻辑)
- [x] 14.2 **实现“一键导出 Phaser 独立项目包”**
  - 在 [main.py](file:///Users/lm/pyProj/hungry-for-knowledge/LoreWeaver/backend/main.py) 开发 `/api/workspaces/{id}/export` 导出端点
  - 打包生成包含 `index.html` + `core` 静态文件 + 当前配置 `manifest.json` 的单页独立运行 zip，可随时部署至 itch.io 等 Web 托管平台
- [ ] 14.3 **Ollama 本地模型接入：暂不考虑支持**
  - 现阶段不通过 `OLLAMA_API_BASE` 路由到本地模型；如环境变量存在，后端仅输出忽略提示，并继续使用 Gemini 或 procedural fallback。
