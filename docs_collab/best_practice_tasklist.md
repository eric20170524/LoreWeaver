# 最佳实践任务清单：迈向 tasklist_goal 的成熟移动端 H5 游戏

> 依据：`docs_collab/tasklist_goal.md`、`docs_collab/design.md`、`docs_collab/workbench_capability_gap_analysis.md`，并对齐 `docs_collab/tasks.md` 中的 LW 编号。  
> 用途：可逐步落地、可验证、可持续执行；普通产品/技术取舍由 Agent 自主决策，仅在不可逆存档、公开 IP、付费/受限资产、外部密钥、发布策略上请求人类。  
> 编码实现优先使用 `gpt-5.6-terra`；Codex 负责方案、拆解、证据复核与最终 review。  
> 目标 workspace：`data/workspaces/20260611-060754-719406`  
> 日期：2026-07-13

---

## 0. 执行原则（最佳实践铁律）

| # | 原则 | 说明 |
| ---: | --- | --- |
| 1 | **先底座，后扩关** | 战斗决策、power budget、存档/结果合同未稳之前，禁止批量写 Node4–12 厚内容 |
| 2 | **先 Node1 纵向 9/10，再横向复制** | 不接受 12 关平均铺薄；Node1 独立 ≥90 且盲测能说清死因与再开局目标后，才批量扩展 |
| 3 | **证据优先于叙事** | `build passed` / `12/12 entered` / `atlas loaded` / `fresh` **不得**写成「成熟」；gate 只证明其断言 |
| 4 | **报告四分法** | 每份报告区分 `fact` / `assessment` / `missingEvidence` / `hardCaps`；waiver 仅人类可写 |
| 5 | **资产随切片交付** | 每个可玩批次必须同时交付 bitmap/动作、场景件、VFX、BGM/SFX 与覆盖报告；禁止最后贴皮 |
| 6 | **单轨 in_progress** | 同时只允许一个实现任务 `claimed`/`in_progress`；review 可并行于不相交协作文档 |
| 7 | **游戏分与平台分拆开** | 游戏 ≥90 与 LoreWeaver 生产 ≥85 独立评分；禁止把手工打磨误称为「生成能力已成熟」 |
| 8 | **任务必须可复查** | 每个任务声明：玩家价值、依赖、目标文件、patch level、done criteria、required gates、证据、残余风险 |

### 硬性封顶（任一存在则总分无效）

| Cap ID | 条件 | 上限 |
| --- | --- | ---: |
| `auto_combat` | 主动战斗仅移动，关键技能全自动 | 60 |
| `late_game_balance` | 普通技能秒 Boss / 玩家近乎无敌 / 无解释秒杀 | 55 |
| `thin_levels` | 正式关仅计时刷怪 + 通用追踪 Boss | 70 |
| `fallback_art` | 主角/Boss/场景以几何或程序化为主 | 65 |
| `no_bgm` | 无真实 BGM 与可管理音频通道 | 70 |
| `no_natural_progression` | 无零存档自然主线证据 | 75 |
| `mobile_readability` | HUD 遮挡/触控不可达/关键文本不可读 | 70 |
| `release_integrity` | 导出或 release smoke 有 error/缺资源 | 80 |
| `originality_release` | 活跃公开内容含高风险未授权 IP | 80 |

### 推荐 Gate 矩阵（按阶段启用）

| Gate | 产物 | 何时强制 |
| --- | --- | --- |
| `maturity:report` / `maturity:gate` | `reports/maturity_score_latest.json` | 每阶段 exit |
| `balance:sim` | `reports/balance_simulation_latest.json` | Stage1 起每次数值改动后 |
| `smoke:node1-12` | `reports/node1_12_release_smoke_latest.json` | 任何节点/runtime 改动后 |
| `save:migration` | `reports/save_migration_latest.json` | Save v2 与之后破坏性变更 |
| `visual:baseline` | `reports/visual_performance_baseline_latest.json` | HUD/分辨率相关改动 |
| `mechanics:e2e` | `reports/mechanics_e2e_latest.json` | Node1 切片起 |
| `natural:progression` | `reports/natural_progression_latest.json` | Node1–3 闭环起 |
| `art:coverage` / `audio:coverage` | 对应 coverage 报告 | 每资产批次 |
| `export:smoke` | `reports/export_smoke_latest.json` | 独立导出落地后 |
| `content:safety` | `workflow/reports/content_safety_scan_latest.json` | 公开文案/导出前 |
| `build` + `manifest/loreweaver/ability/progression:check` | dist + 合同 | 常规合并前 |

---

## Stage 0 — 真相与基线（诚实失败优先）

**Exit：** 基线可重复生成；当前真实问题必须失败，禁止全绿自嗨。

| ID | 任务 | 玩家价值 | 依赖 | 主要目标 | Patch | Done Criteria | Required Gates / 证据 |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| **BP-0.1** / LW-013 | 诚实成熟度评分门禁 | 防止把工程完整度当体验成熟度 | 无 | `loreweaver/maturity-rubric.json`、`scripts/report-maturity.mjs`、`check-maturity-evidence.mjs` | L2 | 机器分可复现；缺证据=0 分；hard cap 可激活；与人工基线可对照 | `maturity:self-check`；`maturity_score_latest.json` |
| **BP-0.2** / LW-014 | 确定性数值/经济仿真 | 暴露秒杀/无敌/经济断裂 | 0.1 | `balance-simulation-config.json`、`check-balance-simulation.mjs`、`report-balance-simulation.mjs` | L2 | 报告量化每境界 HP/ATK、TTK、致死时间、产出/突破成本；真实 violation 不得清零造假 | `balance_simulation_latest.json` failed-as-intended 可接受 |
| **BP-0.3** / LW-015 | 视觉/对象/性能基线 | 固定「空网格、小角色、大 HUD」等事实 | 0.1 | `run-visual-performance-baseline.py`、captures PNG | L2 | 多端点截图 + FPS/对象数；失败项诚实列出 | `visual_performance_baseline_latest.json` + PNG 哈希可对 |
| **BP-0.4** | Release smoke 严格化 | 启动/节点期 console error 必须失败 | 0.1 | `run-node-release-smoke.py` | L2 | 任何启动期或节点期 page/console error → gate fail；历史绿报告在源变更后标 stale | `node1_12_release_smoke_latest.json` |
| **BP-0.5** | 证据新鲜度合同 | 改代码后旧报告不得当证据 | 0.1–0.4 | maturity evidence 输入声明 | L2 | 输入 mtime 新于报告 → invalid；maturity 读取并扣分 | maturity facts 中 evidence state |

**Stage 0 残余风险：** 沙箱 loopback 权限可能阻断浏览器类 runner——应记为 `blocked`，不得记为 pass。

---

## Stage 1 — 运行时与数值底座（所有内容依赖此层）

**Exit：** Node1 跑在新基座上；Node1–12 仍可 smoke；仿真无「一击终局 Boss / 近乎无敌」级崩坏；存档迁移可回滚。

| ID | 任务 | 玩家价值 | 依赖 | 主要目标 | Patch | Done Criteria | Required Gates / 证据 |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| **BP-1.1** / LW-016 | Save v2 + 结果合同 | 首通/最佳/星级/构筑快照可存 | 0.x | `js/store.js`、`js/save-contract.js`、schema、迁移脚本 | **L4** | 旧档备份优先；`bestResult`/`firstClear`/`stars`/`flags`/`buildSnapshot`/`challenge`/`settings`；损坏可恢复；幂等奖励钩子 | `save_migration_latest.json` 全绿；备份失败不丢主档 |
| **BP-1.2** / LW-017 | 战斗运行时模块化 | 后续改动能控回归 | 1.1 可并行起步 | `runtime/*`、`nodes/node1.js` 瘦身 | L3 | 输入/伤害/技能/敌人/HUD/结果指标分模块；Node1 行数显著下降且行为分支有对等测试 | build + modularization browser report |
| **BP-1.3** / LW-018 | 统一 PowerBudget 与缩放 | 全战役同一套伤害/生存尺度 | 1.2 | `runtime/PowerBudget.js`、`js/data.js`、节点缩放表 | L2–L3 | 显示 2–4 位或缩写；Boss/杂兵 TTK、受击次数有报告阈值；消除终局硬编码血量与境界爆炸 ATK 脱节 | balance sim violation 数显著下降且无 instant-kill Boss |
| **BP-1.4** / LW-019 | 玩家主动操作面 | 解除「只会走」 | 1.2–1.3 | 输入控制器、技能栏、闪避/主动术/爆发 | L3 | 移动端可练习的主动闪避 + 主动技能 + 蓄能爆发；自动技能仅构筑一部分 | mechanics 断言 manual-action；倾向解除 `auto_combat` |
| **BP-1.5** / LW-020 | 敌人 archetype 状态机 | 可读行为与反制窗口 | 1.3–1.4 | `EnemyRuntime`、敌人 catalog | L3 | ≥5 职责：追击/冲锋/远程/护卫/区域；攻击 windup→active→recovery | 敌人 registry + 至少 1 条 counterplay 证据 |
| **BP-1.6** / LW-021 | Beat 导演 + 对象池 | 节奏与性能预算 | 1.5 | `RunDirector`/池、替换每秒无上限刷怪 | L3 | 同时在场上限、波次 beat、性能预算；禁止纯 `1+floor(t/30)` 线性堆压作为唯一压力 | 对象峰值与 smoke |
| **BP-1.7** / LW-022 | 战斗 HUD / 安全区 shell | 战场可读、触控可达 | 1.4 | `NodeCombatHud`、主场景 UI | L2–L3 | 顶栏紧凑、底栏摇杆+技能、Boss/目标条；技能详情不占半屏；720×1280/390×844 截图对比 | visual baseline 关键项改善 |
| **BP-1.8** / LW-023 | 离线经济与可见性生命周期 | 养成节奏可信 | 1.1 | `IdleEngine`/`store` 时间戳、pause/visibility | L2 | `lastSaveTime` 不在读离线前被覆盖；上下限仿真；暂停不吞收益 | balance 经济项 + 手测记录 |

**Stage 1 残余风险：** L4 存档需备份策略；沙箱网络/音频 provider 不在本阶段强依赖。

---

## Stage 2 — Node1 纵向 9/10 切片（质量证明）

**Exit：** Node1 独立 ≥90/100；无 hard cap 由 Node1 范围触发；10 分钟人工 playtest 无 P0/P1；死亡原因与再开局目标可复述。

| ID | 任务 | 玩家价值 | 依赖 | 主要目标 | Patch | Done Criteria | Required Gates / 证据 |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| **BP-2.1** / LW-024 | 编写 Node1 LevelContract + beats | 0–90s 可教可练 | Stage1 | `loreweaver/nodes/node-01-*.json`、导演配置、`nodes/node1.js` | L2–L3 | beats：intro→teach→pressure→elite→climax→resolution；每 beat 目标/敌人预算 | LevelContract 校验 + mechanics 片段 |
| **BP-2.2** / LW-025 | Node1 专属 Boss | 高潮与反制 | 2.1 | Boss 配置 + runtime | L3 | 2–3 招式、≥2 阶段、可读前摇、破防窗口、胜利演出；非「加强杂兵」 | boss phase E2E |
| **BP-2.3** / LW-026 | 局内构筑 + 评分结算 | 取舍与复玩 | 2.1、1.1 | LevelUp/结算、结果写回 | L2–L3 | ≥3 种局内选择改变攻击形态/节奏；星级、时间、受伤、构筑、最佳、首通/重复奖励、下一目标 | save 结果字段 + 截图 |
| **BP-2.4** / LW-027 | Node1 生产 bitmap 切片 | 去掉原型感 | 2.1–2.2 | atlas、art manifest、`RuntimeSprites` | L2 | 主角/3 类敌/精英/Boss/关键技能/场景件语义 key + 动作帧；覆盖报告；fallback 仅损坏时 | `art_coverage` Node1 段；解除 Node1 范围 `fallback_art` |
| **BP-2.5** / LW-028 | Node1 音频/VFX/callout | 情绪与反馈 | 2.2–2.4 | 音频资产、`AudioManager`、cue catalog | L2 | 关卡/Boss BGM、战斗 SFX、胜负 stinger、必要 callout；音量/静音/暂停 | `audio_coverage`；倾向解除 `no_bgm`（至少 Node1 通道完备） |
| **BP-2.6** / LW-029 | Node1 90 分验收门 | 冻结质量合同 | 2.1–2.5 | maturity + 人工记录 | — | Node1 ≥90；mechanics/visual/audio/perf/natural-slice 证据齐全；人工 10min 纪要 | 全套 Node1 gates + human playtest note |

**Node1 节奏模板（必须落地，非文档装饰）：**

| 时间窗 | 内容 |
| --- | --- |
| 0–15s | 移动、基础拳、主动闪避（无文字墙） |
| 15–35s | 三职责敌人 + 可主动利用弱点/元素反馈 |
| 35–55s | 首次局内三选一，改变形态/节奏 |
| 55–70s | 精英教学 + break window |
| 70–90s | 专属 Boss 2–3 招、两阶段、胜利高潮 |
| 结算 | 星级/最佳/首通/下一目标 |

---

## Stage 3 — Node2–3 + Meta 复玩脊柱

**Exit：** Node1–3 各 ≥88，三关整体 ≥90；≥2 种有效构筑可通关且体验可辨；零存档可自然推进到 Node3。

| ID | 任务 | 玩家价值 | 依赖 | 主要目标 | Patch | Done Criteria | Required Gates / 证据 |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| **BP-3.1** / LW-030 | Node2 完整关：宝箱风险路径 | 路径选择与风险收益 | Stage2 | `node2.js` + LevelContract | L3 | 宝箱分布、驻守读条、伏击可预判、品质、目标完成、专属守藏 Boss | mechanics + art/audio 批次 |
| **BP-3.2** / LW-031 | Node3 完整关：宿敌 duel | 高压对位而非刷怪噪音 | Stage2 | `node3.js` + LevelContract | L3 | 威压可控、蓄力可打断、阶段招式升级、失败原因具体 | 同上 |
| **BP-3.3** / LW-032 | 三流派 + relic loadout | 长期构筑辨识 | 2.3、1.1 | progression/relic 数据 + UI | L2–L3 | 雷暴清屏 / 青枝控制回复 / 潮翼机动爆发；局内选项改形态而非只加百分比；**不做**庞大装备 RPG | 三构筑通关证据 |
| **BP-3.4** / LW-033 | 主线地图/Meta UX | 可扫描的进度与目标 | 1.1、3.3 | `MainScene`/`MenuScene` | L2 | 星级/最佳/首通/掉落/挑战/推荐流派；境界不可进节点给出可见原因；去掉占屏侧栏 | 截图 + UX 手测 |
| **BP-3.5** / LW-034 | 零存档 Node1–3 自然进度 | 解除 no_natural_progression 核心路径 | 3.1–3.4 | E2E runner + 报告 | L2 | 从空档自然通 1–3；首通幂等、失败奖励、重复刷取、突破成本校验 | `natural_progression_latest.json` |

---

## Stage 4 — 全战役内容（合同复制，非复制粘贴）

**Exit：** 每关 ≥82；无 thin-level hard cap；战役均分 ≥88；Node1/3/6/9/12 关键关 ≥90。

每关强制 `LevelContract` 字段：

- `beats` / `objective` / `enemyComposition` / `boss` / `scoring` / `rewards` / `art` / `audio` / `verification`

| ID | 任务 | 玩家价值 | 依赖 | 主要目标 | Patch | Done Criteria | Required Gates / 证据 |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| **BP-4.1** / LW-035 | Node4 潮汐/漩涡 | 空间位移决策 | Stage3 | node4 + 合同 + 资产批次 | L3 | 完整关 + 专属 Boss | mechanics + balance 回归 |
| **BP-4.2** / LW-036 | Node5 多核防守 | 目标优先级 | Stage3 | node5 | L3 | 防守/修复目标 + 专属 Boss | 同上 |
| **BP-4.3** / LW-037 | Node6 毒雾/解药循环 | 资源节奏 | Stage3 | node6 | L3 | 资源循环非纯伤害堆叠 | 同上 |
| **BP-4.4** / LW-038 | Node7 多轮擂台选敌 | 信息与取舍 | 4.1–4.3 可串行 | node7 | L3 | 多轮选敌 + Boss | 同上 |
| **BP-4.5** / LW-039 | Node8 分支房间 | 路线选择 | 前序 | node8 | L3 | 分支房间非固定刷怪 | 同上 |
| **BP-4.6** / LW-040 | Node9 护送 | 保护目标压力 | 前序 | node9 | L3 | 护送路线 + 伏击选择 | 同上 |
| **BP-4.7** / LW-041 | Node10 城防主动设施 | 主动操作面扩展 | 前序 | node10 | L3 | 设施可操作，非纯自动塔防 | 同上 |
| **BP-4.8** / LW-042 | Node11 精英远征 | 高压组合 | 前序 | node11 | L3 | 精英组合有决策 | 同上 |
| **BP-4.9** / LW-043 | Node12 三阶段终局 | 战役高潮 | 前序全部 | node12 | L3 | **取消 600s 空耗与一碰即死**；3 阶段、招式复习/组合、破防、终局奖励与演出 | boss phase E2E + balance 终局项 |
| **BP-4.10** / LW-044 | 全战役平衡与复玩通扫 | 数值不随内容再次崩 | 4.1–4.9 | 仿真 + 调参 | L1–L2 | 全节点 TTK/经济/重复奖励合理；失败仍有学习价值 | balance + maturity 维度 progression |

**批次建议：** 4–6 / 7–9 / 10–11 / 12 四批；每批结束强制跑跨关经济回归与 smoke。

---

## Stage 5 — 美术、音频与手感收束

**Exit：** 生产 bitmap runtime 覆盖 ≥95%；audio matrix 100%；玩家可见无 placeholder 主导。

| ID | 任务 | 玩家价值 | 依赖 | 主要目标 | Patch | Done Criteria | Required Gates / 证据 |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| **BP-5.1** / LW-045 | 战役美术覆盖补齐 | 统一视觉身份 | Stage4 各批已有切片 | actor/environment matrix | L2 | 主角与关键敌人 `idle/walk/attack/hurt/death`（需位移加 `dash`）；Boss 按招式帧；每关背景/地面/前景/地标/危险/微装饰 | `art_coverage_latest.json`；解除 `fallback_art` |
| **BP-5.2** / LW-046 | 战役音频覆盖补齐 | 章节与 Boss 情绪 | 并行 5.1 | BGM/SFX/voice-callout | L2 | menu + 3–4 章节 + Boss + finale BGM；攻击/命中/受击/闪避/技能/UI/胜负 SFX；通道与手势解锁 | `audio_coverage`；解除 `no_bgm` |
| **BP-5.3** / LW-047 | Game feel / 无障碍 / 性能 | 舒适与可达 | 5.1–5.2、1.7 | VFX 预算、设置项 | L2 | hit-stop、镜头震幅上限、闪屏上限、震动开关、色觉轮廓、reduced-motion；P95 FPS 达标 | performance + 多分辨率截图；倾向解除 `mobile_readability` |

**人类协作触发（资产）：** 付费生成/TTS/商用授权未配置时暂停自动捏造 provenance，改为请求人类。

---

## Stage 6 — QA、导出与公开安全

**Exit：** 游戏总分 ≥90；全部 hard cap 解除；无 P0/P1；P2 有接受记录。

| ID | 任务 | 玩家价值 | 依赖 | 主要目标 | Patch | Done Criteria | Required Gates / 证据 |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| **BP-6.1** | 机制 E2E 全覆盖 | 每关核心可机器证明 | Stage4–5 | `mechanics_e2e` runner | L2 | Node1–12 核心机制、Boss phase、3 构筑、失败/重试/暂停/后台 | `mechanics_e2e_latest.json` |
| **BP-6.2** | 视觉回归矩阵 | 布局不回退 | 5.3 | 390×844 / 430×932 / 720×1280 / 桌面容器 | L2 | 非空、角色尺寸、HUD 占比、溢出、触控区 | `visual_regression_latest.json` |
| **BP-6.3** | 零存档全主线 | 自然进度闭环 | 3.5 + Stage4 | natural progression runner | L2 | 空档可完成关键主线；无测试注入 | `natural_progression_latest.json`；解除 cap |
| **BP-6.4** | 存档迁移/损坏恢复再验 | 进度安全 | 1.1 | 迁移夹具 | L2 | v1→v2、损坏、重置备份路径全绿 | `save_migration_latest.json` |
| **BP-6.5** | 活跃 runtime IP 清理 | 可公开 | 文案改动后 | content scan + `js/data.js` 与 split nodes | L1–L2 | 活跃运行时与导出包无高风险 IP；扫描覆盖玩家可见源（含 data.js） | content scan + originality 维度；解除 cap |
| **BP-6.6** / LW-048 | 独立导出 smoke | 可分享安装 | 6.1–6.5 | export 产物 | L2–L3 | 临时目录解压启动；资源/存档/Node1/Node12；不含内部协作/历史 IP 文档 | `export_smoke_latest.json`；解除 `release_integrity` |
| **BP-6.7** / LW-049 | 游戏 9/10 终验 | 正式冻结游戏分 | 全部 | maturity + 30min 人工 campaign | — | ≥90 全维度下限；0 hard cap；人工纪要 | maturity gate pass + playtest |

---

## Stage 7 — LoreWeaver 产品化（经验证后回流）

**前置：** 目标游戏已 ≥90。  
**Exit：** LoreWeaver 生产分 ≥85；新主题 cold-start 证据通过；原游戏仍 ≥90。

| ID | 任务 | 玩家价值 | 依赖 | 主要目标 | Patch | Done Criteria | Required Gates / 证据 |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| **BP-7.1** / LW-050 | 抽取已验证成熟 core | 下个项目不从零 | Stage6 | `minigame_master/core` 或等价 | L3–L4 | CombatDirector、LevelContract、主动输入、结果合同、maturity gate 模板入 core | core 契约测试 |
| **BP-7.2** / LW-051 | Workspace compiler + Card V2 | 真生成源码树 | 7.1 | backend compiler、card schema | L3–L4 | 生成完整 Vite/Phaser 树、合同、报告目录、scripts；Card 含 `runtimeTemplate`/`requiredAssets`/`balanceModel`/`scoreModel`/`testScenarios`/`performanceBudget` | 编译产物 diff 可审 |
| **BP-7.3** / LW-052 | 资产 jobs + 受控源码 patch | L3/L4 可审可回滚 | 7.2 | asset pipeline、patch workflow | L3–L4 | 切片/manifest/provenance/license；源码 patch 有 ownership、diff preview、gate invalidation、失败回滚 | job 报告 |
| **BP-7.4** / LW-053 | 真实独立导出管线 | 替换预览壳导出 | 7.2 | `backend` export | L3 | 复制 workspace 自有源码与生产资产、build、release manifest、排除内部文件、解压 smoke | export smoke |
| **BP-7.5** / LW-054 | 原创主题 cold-start | 证明生产能力 | 7.2–7.4 | 全新主题 workspace | — | 无需手改得到可玩 Node1 切片；同一成熟度框架可评分 | cold-start 证据包 |
| **BP-7.6** / LW-055 | 项目终审与关闭 | 双目标同时达成 | 7.5 + 游戏仍 90 | review 文档 | — | 游戏 ≥90 且生产 ≥85；映射全部 Acceptance Criteria 到现行证据 | final review |

**禁止在 Stage 7 之前：** 抽象未经验证的「9/10 万能模板」；用模拟 2.1–3.3 进度冒充 compiler 完成。

---

## 工作台模块：继续投 / 冻结 / 延后

| 模块 | 建议 | 原因 |
| --- | --- | --- |
| 成熟度/balance/smoke 门禁 | **继续投** | 诚实失败是前提 |
| 目标 workspace 战斗 runtime | **继续投** | 游戏分主战场 |
| LevelContract 与 Node 内容 | **继续投** | 解除 thin_levels |
| 资产/音频随批次 | **继续投** | 解除 art/audio caps |
| 玩法卡 L0–L2 knob 调参 | **维持** | 服务切片调参，不扩 design_only 库 |
| 新 VLM 维度堆砌 | **冻结** | 不增加战斗深度；Stage1 HUD 后再按需 |
| 新 design_only 玩法卡 | **冻结** | 先落地 survivor 战役质量 |
| 真 compiler / 可玩 export | **Stage7** | 先证明 Node1–12 质量 |
| 装备 RPG 大背包 | **延后** | 先三流派 + relic |

---

## 每任务模板（复制即用）

```markdown
## BP-X.Y / LW-0NN: <标题>

- status: pending | claimed | in_progress | needs_review | verified
- playerValue: <一句话玩家收益>
- dependsOn: [BP-...]
- patchLevel: L0|L1|L2|L3|L4
- targetFiles:
  - path/...
- doneCriteria:
  - ...
- requiredGates:
  - command / report path
- verificationEvidence:
  - gate / result / report / runAt / note
- residualRisk:
  - ...
- humanCollaboration: none | IP | credentials | save-irreversible | release
```

---

## 进度快照（相对 2026-07-13 state）

| 阶段 | 状态概要 |
| --- | --- |
| Stage 0 | 成熟度/仿真/视觉基线已具备；部分 smoke 可能因环境权限 stale |
| Stage 1 | 进行中（约 LW-018）；Save v2、模块化部分完成，主动操作/导演/HUD 等待闭合 |
| Stage 2–6 | 未完成（Node1 90 切片为下一关键里程碑） |
| Stage 7 | 未开始（依赖游戏 ≥90） |

| 指标 | 当前 | 目标 |
| --- | ---: | ---: |
| 机器游戏成熟度 | 28 | ≥90 |
| 人工游戏基线 | ~43 | ≥90 |
| LoreWeaver 生产 | ~42 | ≥85 |
| 活跃 hard caps | 9 | 0 |

---

## 与 Acceptance Criteria 映射

| AC（tasklist_goal） | 主要任务块 |
| --- | --- |
| 成熟度 ≥90 + 无 hard cap | BP-0.1、全程 gates、BP-6.7 |
| 主动战斗决策 | BP-1.4、1.5、2.x |
| Node1–12 数值可玩 | BP-1.3、4.10、6.1 |
| 12 完整关卡 | Stage2–4 |
| 3 构筑 + 复玩 | BP-2.3、3.3、3.5、4.10 |
| 移动端 UX | BP-1.7、5.3、6.2 |
| 生产美术动画 | BP-2.4、5.1 |
| 真实音频 | BP-2.5、5.2 |
| 零存档 + 自动化 | BP-3.5、6.1、6.3 |
| IP 清理 | BP-6.5–6.6 |
| 完整源码/导出/复用 | Stage7 |

---

## 相关文档

| 文档 | 路径 |
| --- | --- |
| 目标要求 | `docs_collab/tasklist_goal.md` |
| 详细设计与评分卡 | `docs_collab/design.md` |
| 能力差距分析（完整版） | `docs_collab/workbench_capability_gap_analysis.md` |
| 协作任务明细（LW-001–055） | `docs_collab/tasks.md` |
| 协作状态 | `docs_collab/state.md` |
