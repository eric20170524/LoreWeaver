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

## 当前下一步

优先执行：

1. [x] 建立 `gameplay_inventory.md`。
2. [x] 复核并细化 `minigame/Path_to_Immortality` 的主干、battle 与 Node1-Node17。
3. [x] 盘点 `minigame/xianni` 的 Node1-Node12。
4. [x] 输出第一版 `survivor_horde` 与 `node_iframe_microgame` 玩法卡草案。
5. [x] 盘点 `minigame/perfectworld_dahuang` 并补齐跨项目共同合同。

下一步进入 Phase 4：先创建 `survivor_horde` core adapter 骨架，再抽 `hazard_telegraph` 与 `defend_core` 两个最小 modifier，随后补最小 demo 与 Build/E2E gate。
