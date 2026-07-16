# LoreWeaver 工作台能力 vs 成熟游戏目标：差距分析报告

> 依据：`docs_collab/tasklist_goal.md`、`docs_collab/design.md`、`docs_collab/state.md`、架构与玩法/VLM 文档，以及目标 workspace `data/workspaces/20260611-060754-719406` 的代码与报告快照。  
> 分析日期：2026-07-13

---

## 结论先行：不够

现有工作台模块能支撑「可运行原型 + 可验证工程基线 + 设计记忆」，**不能**仅凭自身把 `tasklist_goal.md` 验收标准推到「成熟移动端 H5 游戏 ≥90/100、无硬性封顶」。它们是**必要条件中的一部分（脚手架与门禁）**，不是**充分条件（内容、手感、资产、完整编译与复用生产能力）**。

| 对象 | 当前估算 | 目标 | 差距性质 |
| --- | ---: | ---: | --- |
| 目标游戏成熟度（人工设计基线） | **~43/100** | **≥90** | 体验与内容 |
| 目标游戏成熟度（机器评分） | **28/100**（failed） | **≥90** | 证据与硬封顶 |
| LoreWeaver 生产能力 | **~42/100** | **≥85** | 生成/导出链路 |

机器报告还触发了 **9/9 硬性封顶**（`auto_combat`、`late_game_balance`、`thin_levels`、`fallback_art`、`no_bgm`、`no_natural_progression`、`mobile_readability`、`release_integrity`、`originality_release`），任一未解除都无法把“工程能跑”写成“成熟可玩”。

---

## 1. 目标在要什么（验收锚点）

`docs_collab/tasklist_goal.md` 的验收不是「manifest 合法 / 12 关能进 / 截图非空」，而是：

1. **独立成熟度评分卡 ≥90**，维度下限与硬封顶全部解除  
2. **战斗有主动决策**（非仅移动 + 自动施法）  
3. **Node1–12 全程数值可玩**  
4. **12 关是完整关卡**（节奏/目标/敌人组合/Boss/失败学习/复玩）  
5. **≥3 条构筑 + 局内/局外成长 + 首通幂等 + 星级/最佳**  
6. **720×1280 移动端舒适 UX**  
7. **生产级 bitmap + 动画**，程序化仅兜底  
8. **真实音频管线**（BGM/SFX/通道/控制）  
9. **零存档自然通关 + 自动化证据**  
10. **公开 IP 清理**  
11. **LoreWeaver 能维护完整源码树、资产、验证脚本与独立可玩导出包**，并可复用模板  

文档自身也写明优先级：**先修战斗基座与数值，再扩 12 关；先做 Node1 纵向 9/10，再复制质量合同**。

---

## 2. 工作台模块盘点：各自“能做什么 / 做到哪”

### 2.1 作品设计方案（Theme → GDD / Manifest / Pipeline）

| 能力 | 现状 | 对 9/10 的贡献 |
| --- | --- | --- |
| 主题生成经济/境界/12 节点大纲 | 有（Gemini 或 procedural fallback） | **中**：给叙事骨架与配置，不给手感 |
| Step 1.1–1.2 审批式 GDD | 有，pending → approve | **中**：控制设计记忆 |
| Step 2.1–3.3「编译/QA」 | **模拟进度 + 写 manifest**，非真实源码合成 | **低/误导性**：日志像“完成编译”，实际未生成完整可玩工程 |
| PRD / Agent Chat 精炼 | 有 UI 与角色提示 | **中**：协作，不替代实现 |

**判断：** 设计方案模块解决的是「写什么设定/清单」，不是「做出可练的战斗与完整战役」。对目标第 11 条（完整 workspace 源码生成）当前**明确未达标**。

证据：`backend/main.py` 中 `run_async_compilation` 对 2.1–3.3 以 `asyncio.sleep` + 进度文案为主，最终 `save_split_manifest`，并非按 LevelContract 生成完整 Phaser 节点实现。

---

### 2.2 玩法卡工作台（Gameplay Cards + Patch）

| 能力 | 现状 | 对 9/10 的贡献 |
| --- | --- | --- |
| 卡片 schema（knobs / patchLevel / provenance） | 文档与 JSON 库齐全 | **高（设计层）** |
| 基础卡库 | survivor、turn_based、rhythm、drag_grid、sequence、iframe… | **中**：覆盖广，**落地少** |
| Modifier 库 | boss_phases、defend_core、escort、hazard… 十余种 | **中**：多数仍是设计卡 |
| 前端可编辑 knob / 待审批 patch | `GameplayPanel` + L0–L2 路径 | **中**：适合调参，不适合造关卡深度 |
| Phaser Adapter 实现 | 主路径约 `survivor_horde` / `tap_reaction` / `collect_dodge` | **不足**：与卡片库规模严重不匹配 |
| 卡片字段 vs 成熟关卡合同 | 缺 `LevelContract` 级：beats、scoring、art/audio matrix、balanceModel、testScenarios | **关键缺口** |

目标工程节点体量也侧面说明「卡片/标签 ≠ 关卡」：

| 节点 | 约行数 | 形态 |
| ---: | ---: | --- |
| Node1 | ~1120 | 仍偏厚场景，模块化进行中 |
| Node2–3 | ~265–348 | 有机制钩子，未达完整关卡密度 |
| Node4–12 | ~100–160 | **机制标签 + 通用刷怪/Boss** |

**判断：** 玩法卡工作台是「配置组合器 + 安全 patch 门禁」，**不是**「成熟关卡工厂」。`design.md` Stage 7 才要求 Gameplay Card V2（`runtimeTemplate` / `requiredAssets` / `balanceModel` / `testScenarios`）——说明团队也认为**现状不够**。

---

### 2.3 游戏配置清单（Manifest / Catalogs / Runtime Feature Pack）

目标 workspace 已有较完整**配置面**：

- 经济、12 节点 split JSON、ability/passive/character/enemy/skill-effect/audio catalogs  
- progression、economy、asset-pipeline、save schema、workbench artifact status  
- 大量 `artifactStatus: fresh`（表示清单与管线元数据被维护）

这解决的是：

- 数据可版本化、可检查（`manifest:check` / `loreweaver:check` / `ability:check` / `progression:check`）  
- 能力解锁与叙事节点对齐的**合同层**

但验收要的是**玩家价值闭环**，配置清单目前**无法单独保证**：

- 三构筑可辨认且有效  
- 后期不秒杀 Boss / 玩家不无敌（机器 balance 仍大量 violation）  
- `equipment` 空 schema、relic/星级/最佳成绩/挑战目标未形成完整 replay 合同  
- 境界门槛与 UI 可点击节点、离线收益时间戳等曾出现**合同漂移**（设计文档已点名）

**判断：** 配置清单是「数据真源与门禁输入」，对成熟度是**骨架**；没有 `PowerBudget` + 关卡导演 + 结果合同落地，清单越完整越容易制造「假成熟」幻觉。

---

### 2.4 VLM 视觉审计 + 确定性视觉门禁

| 能力 | 现状 | 对 9/10 的贡献 |
| --- | --- | --- |
| 真 canvas 截图 / 非空 / FIT / 触控安全区 / 文本换行风险 | 有 | **中**：防黑屏、防基础布局事故 |
| VLM：HUD 遮挡、按钮重叠、溢出、可读性 | 可选 Codex agent（默认常关） | **中**：布局 critique，不改玩法深度 |
| 输出 → L1/L2 patch 建议 | 有回流设计 | **中**：调 knob/布局，不生成动作帧与场景美术 |
| 视觉/性能基线（workspace 脚本） | 已有 baseline 报告与截图，且诚实记录大量 quality failure | **高（诚实性）** |

**判断：** VLM 审计是**体验可读性的 QA 层**，不是**生产视觉资产系统**。目标要求 bitmap 动作矩阵、场景身份、语义 art key 覆盖——这些必须由资产管线 + 运行时接线完成；VLM 最多指出「角色太小 / HUD 过大 / 空网格」，**不能填补 10 帧静态 atlas + 程序化兜底**的硬缺口。

---

### 2.5 模拟器 / 运行时 / Gate 生态（工作台周边，但决定“能不能成游戏”）

目标 workspace 内已有可观工程面：

- Phaser 场景、Idle shell、NodeBridge、模块化 runtime（`CombatRuntime`、`TouchInputController`、`PowerBudget`、`NodeCombatHud` 等）  
- 成熟度 rubric、balance 仿真、release smoke、save migration 等脚本与报告  

协作状态（`state.md`）显示：

- 上一轮 REQ（LW-001–012）只做到 **Node1–3 钩子 + 冒烟 + 文案清理**，**不接受为 9/10**  
- 当前 REQ 在 **LW-018** 一带（底座修复阶段），Node1 纵向切片仍是 **LW-024–029**  
- 全量计划到 **LW-055**（产品化 cold-start）

**判断：** 运行时与 gate 是当前**最接近“够用”的部分**——但它们证明的是「可迭代、可测、能诚实失败」，不是「已经成熟」。这与 goal Notes 完全一致：*gate 只能证明它断言的事实*。

---

### 2.6 导出与复用

| 能力 | 现状 | 目标要求 |
| --- | --- | --- |
| Export ZIP | manifest + 预览壳 + core/lib 片段 | 完整 workspace 源码 + 生产资产 + 独立可玩包 |
| 新主题 cold-start | 主要落 manifest | 无需手改即可 Node1 级可玩切片 |
| 模板沉淀 | 半手工镜像 + 文档 | 经验证后的 compiler / Card V2 |

**判断：** 导出模块**不够**；这是 goal 第 11 条的硬缺口，也是「工作台成熟」与「单款游戏手搓成熟」必须分开评分的原因。

---

## 3. 对照 Acceptance Criteria：够不够矩阵

| 验收项 | 现有模块能否覆盖 | 缺口等级 | 说明 |
| --- | --- | --- | --- |
| 成熟度卡 ≥90 + 无 hard cap | 有 rubric + 报告，**现 28 分、9 cap** | **P0** | 体系在，内容/证据未过线 |
| 主动战斗决策 | 触控移动有；主动技能/闪避/爆发仍弱 | **P0** | `auto_combat` 仍 active |
| Node1–12 数值可玩 | balance 仿真存在且大量失败 | **P0** | 后期 ATK 与 Boss HP 失配已文档化 |
| 12 完整关卡 | 节点 JSON + 薄脚本 | **P0** | Node4–12 机制标签 |
| 3 构筑 + 复玩合同 | catalog 有能力；relic/星级/首通幂等等未闭环 | **P0** | 偏数据，缺玩法闭环 |
| 移动端 HUD/触控 | 有 audit + baseline；证据显示 HUD 过大等 | **P1** | 需重做 shell，非再多扫一遍图 |
| 生产美术动画 | 10×64 静态 frame 级 | **P0** | fallback_art cap |
| 真实音频 | WebAudio tone 为主，缺 BGM 矩阵 | **P0** | no_bgm cap |
| 零存档自然进度自动化 | smoke 有；natural campaign 证据缺失 | **P0** | no_natural_progression |
| IP 清理 | scan 有，运行时/源漂移仍风险 | **P1** | 不能只信 warning=0 |
| 完整源码合成 + 可玩导出 + 复用 | **模拟编译 + 预览导出** | **P0（平台）** | 与「做出一款成熟游戏」可暂时解耦，但 goal 要求两者 |

---

## 4. 核心批判：为什么「模块齐全」仍不够

### 4.1 三层错位

```text
LoreWeaver 工作台
  ├─ 设计/清单/卡片/审计  →  描述与校验层  (相对成熟)
  ├─ 目标 workspace 手搓运行时 →  实现层      (原型→底座修复中)
  └─ 完整生产闭环 (资产/音频/战役/导出/冷启动) →  缺失层
```

成熟游戏需要的是 **实现层密度 × 资产层完整 × 验证层诚实**。  
工作台当前强在 **验证层的起步** 和 **描述层的广度**，弱在 **实现密度** 与 **资产/导出闭环**。

### 4.2 「假阳性成熟」风险

下列信号曾被误读为成熟：

- 12/12 scenes entered  
- build passed  
- catalog / workbench `fresh`  
- content scan warning=0（但可能未覆盖全部玩家可见 runtime 文案源）  
- 文档与 prompt 很完整  

`design.md` 已把基线从偏高的 5.5–6/10 **下调到约 4.3–4.8/10**，并建立 hard cap，这是正确方向。  
**结论：现有模块足够「防止自我欺骗」，不够「直接产出 9/10」。**

### 4.3 玩法卡与参考库的“知识”尚未变成“能力”

`gameplay_inventory.md` 从 Path_to_Immortality 等抽了大量可玩节点模式（节奏、连线、平台、反击 Boss…），但：

- 目标战役仍几乎锁在 **survivor 变体**  
- 多数卡片 `status: candidate` / `design_only`  
- Adapter 实现远少于卡片描述  

因此：**案例库 + 卡片工作台 = 设计弹药库**；要达到 goal 的「每关完整节奏与目标」，还需要 **LevelContract 级内容生产 + 运行时导演**，不是再多几张 JSON 卡。

---

## 5. 什么「已经够」 vs 什么「必须另建」

### 已经够用（应继续依赖）

1. **诚实评分与 hard cap 机制**（maturity rubric/report）  
2. **数值仿真与视觉/性能基线**（暴露真问题）  
3. **Patch 分级与 artifact invalidation 思想**（L0–L4）  
4. **协作任务图 LW-013→055**（与 goal 对齐的可执行路径）  
5. **目标 workspace 的 Vite/Phaser 工程壳 + 正在拆分的 combat runtime**  
6. **Node1–3 机制钩子与 release smoke 经验**（作为纵向切片起点）

### 明显不够、必须补齐（才能谈 9/10）

| 能力包 | 是否属于现有“面板模块” | 必要性 |
| --- | --- | --- |
| 主动输入 + 技能决策面 | 否，运行时实现 | 解除 auto_combat |
| Power budget + 全战役 TTK | 部分有模块，未闭环 | 解除 late_game_balance |
| LevelContract + RunDirector + 12 关填实 | 否 | 解除 thin_levels |
| Bitmap 动作/场景批次生产与接线 | 清单有，生产弱 | 解除 fallback_art |
| BGM/SFX 资产与通道 | 否 | 解除 no_bgm |
| 自然进度 E2E + 机制断言 | smoke 有，自然进度无 | 解除 no_natural_progression |
| 独立可玩 export + 真 compiler | 否 | 达成平台 85 分 |

### 工作台模块若只做增强、仍无法单独达标的情况

即使把 **PRD 面板、玩法卡 UI、配置清单编辑、VLM 审计** 再打磨一倍：

- 仍无法凭 JSON knob 生成「三阶段终局战 + 可读前摇 + 反制窗口」的**内容密度**  
- 仍无法替代 **美术/音频生产与授权**  
- 在 2.1–3.3 仍是模拟编译时，仍无法保证 **cold-start 新主题** 达到同一成熟度  

---

## 6. 对「够不够」的分级回答

| 问题 | 回答 |
| --- | --- |
| 够不够**支撑**建设成熟游戏的工程程序？ | **够作为底座与治理层**（尤其有评分卡、仿真、任务 DAG） |
| 够不够**现在**交付 goal 中的成熟游戏？ | **不够**（机器 28、人工 ~43，9 hard cap） |
| 仅靠工作台四件套（设计方案/玩法卡/配置清单/VLM）能否闭环？ | **不能**；缺实现密度、资产、音频、战役内容、真编译导出 |
| 是否应先扩功能面板再做关卡？ | **否**；goal 与 design 一致：**先底座 + Node1 纵向 90 分**，再扩 2–12，最后产品化工作台 |

---

## 7. 建议的能力投资优先级（对齐 goal Notes）

1. **P0 运行时与数值底座**（LW-016–023 一类）：主动操作、敌人状态机、导演、HUD、存档 v2、经济修复  
2. **P0 Node1 9/10 切片**（LW-024–029）：证明质量可达，再复制合同  
3. **P0 战役批次**（LW-030–043）：把标签关做成完整关  
4. **P0 资产与音频随批次交付**（非“最后贴皮”）  
5. **P1 QA/导出/IP**（LW-048–049）  
6. **P1 工作台产品化**（LW-050–054）：compiler、Card V2、asset jobs、真 export、cold-start  

**不要**在 Node1 未达 90 前，优先堆更多 VLM 维度、更多 design_only 玩法卡、或更华丽的编排 UI——那会继续抬高「文件/门禁完整度」却不解除 hard cap。

---

## 8. 总评

| 维度 | 评分（对 goal 的充分性，10 分制） | 一句话 |
| --- | ---: | --- |
| 作品设计方案 / 管线编排 | 4/10 | 擅长出 GDD/manifest；编译阶段名实不符 |
| 玩法卡工作台 | 4.5/10 | 设计与安全 patch 好；runtime 覆盖与 LevelContract 不足 |
| 游戏配置清单 / Feature Pack | 6/10 | 数据与合同较全；不保证平衡与复玩 |
| VLM / 视觉审计 | 5/10 | 布局 QA 有价值；不解决生产美术与战斗深度 |
| 目标 workspace 运行时 + gates | 5.5/10 | 可迭代、可诚实失败；内容与手感未达标 |
| **整体是否“够”** | **否** | **治理层 ~可支撑；生产层与体验层远未达标** |

**最终判断：**  
LoreWeaver 现有设计与功能模块，**足以启动并约束**一条通往成熟游戏的工程路径（且 `docs_collab` 已把路径写到 LW-055），但**远远不足以“凭工作台现有能力直接构建”** `tasklist_goal.md` 所定义的成熟移动端 H5 游戏。  

当前正确叙事是：

> **工作台 = 编辑器 + 合同 + 门禁 +（部分）生成；**  
> **成熟游戏 = 仍须在目标 workspace 上完成底座修复、Node1 纵向切片、战役填实、资产音频与独立导出；**  
> **之后才能把验证过的质量回流为 LoreWeaver 的可复用生产能力。**

---

## 9. 相关路径索引

| 文档 / 产物 | 路径 |
| --- | --- |
| 目标要求 | `docs_collab/tasklist_goal.md` |
| 9/10 设计方案 | `docs_collab/design.md` |
| 协作状态 | `docs_collab/state.md` |
| 既有任务图 | `docs_collab/tasks.md` |
| 系统架构 | `docs/architecture/current_system_architecture_and_core_features.md` |
| 玩法盘点 | `docs/gameplay/gameplay_inventory.md` |
| VLM 审计 | `docs/workflow/visual_audit_and_vlm_backlog.md` |
| 成熟度评分卡 | `data/workspaces/20260611-060754-719406/loreweaver/maturity-rubric.json` |
| 机器成熟度报告 | `data/workspaces/20260611-060754-719406/reports/maturity_score_latest.json` |
| 目标 workspace | `data/workspaces/20260611-060754-719406` |
| 本报告的最佳实践任务清单 | `docs_collab/best_practice_tasklist.md` |
