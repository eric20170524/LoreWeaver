# minigame_master Gameplay 关卡生产化任务清单

> 目标：让已认证的 Gameplay Card 在输入主题内容包、美术/音频资产包和关卡参数后，可以自动生成可发布的成熟关卡；不再依赖逐关修改 adapter 源码。  
> 更新：2026-07-23 — 已完成项归档，下方为**未完成任务清单**（按推荐实施顺序）。  
> 工作方式：逐步推进；每步编码前需确认。

---

## 0. 当前基线（摘要）

### 0.1 已完成（归档，不再阻塞）

- [x] 23 张基础/容器 Gameplay Card + 24 张 modifier（V2 schema 全量迁移）
- [x] 成熟度模型六级：`inventoried` → `card_json` → `ui_registered` → `runtime_ready` → `gate_verified` → `production_ready`
- [x] 基础卡成熟度：`survivor_horde` + `rhythm_timing` + `drag_collect_grid` + **`turn_based_skill_battle`** = **`production_ready`**；其余 `runtime_ready`
- [x] `GameRunner` 接入 Phaser adapter；`NodePayload` / `NodeResult` / Adapter / Modifier / SceneLifecycle / TestHooks
- [x] Theme Content Pack schema + adapter/core 去题材化 + 题材词静态门禁
- [x] 23 张卡 `requiredAssets` 合同 + RuntimeArtBinder 语义绑定（结构层）
- [x] AudioAssetResolver 接入 + synth 原型降级
- [x] Mock smoke 12/12 → 全卡 23/23 唯一卡 Headless 覆盖；V2 结构校验 47/47；文本启发式 / art binder 合同 / audio unit 检查通过
- [x] P0 成熟度 UI 与 gate 语义改造；P1 文案数据化（除真实浏览器 VLM）；P3.1 音频解析器

### 0.2 未完成基线缺口

- [x] 通用 Mock adapter smoke 从 12/12 扩到全基础卡覆盖 (23/23 唯一 Card ID 覆盖，Step C1 已完成 Headless 契约校验)
- [x] `survivor_horde` core demo 具备 Playwright E2E（进/撤/胜）；全 23 卡 + Soak 仍待
- [x] 生产模式禁用关键美术 fallback 的**运行核**（unit）；真实 Atlas 全量装载与 Playwright 硬证仍待
- [x] `survivor_horde` golden ⊆ workspace 真实 atlas 帧 + theme/recipe fixture（`check:survivor-golden-atlas`）；浏览器内装载 E2E 仍待
- [x] 缺失 build / E2E / 视觉 / 美术 / 音频 / 性能证据时**阻止**生产发布（证据包与 `specHash`/cardId/stale 全链路；`evaluateProductionExportGate` + `productize:card` hard-block；音频矩阵/VLM 细项仍见 Phase A residual）
- [x] 至少 1 张卡达到 `production_ready`（`survivor_horde`，2026-07-23 有条件认证）

---

## 1. 最终验收定义（Definition of Done）— 仍全部待满足

只有同时满足以下条件，某张 Gameplay Card 才能标记为 `production_ready`：

- [ ] 输入仅包括 Theme Content Pack、Asset Pack、Gameplay Card、modifier 和合法 knobs，不修改 adapter/core 源码
- [ ] 关卡可进入、可操作、可胜利、可失败、可撤退、可暂停恢复，并能正确返回 `NodeResult`
- [ ] 主题文案、角色名、敌人名、道具名、操作提示和结算文案均来自内容包
- [ ] 角色、敌人、场景、道具、弹体、VFX 和 UI 资产均通过语义 key 解析
- [ ] 真实 BGM、SFX、语音/视觉招式名按语义 cue 播放，支持 autoplay 解锁、静音、暂停和场景清理
- [ ] Desktop 与 Mobile 真实浏览器 E2E 全部通过，console/page/request error 为空
- [ ] 胜利、失败、撤退、暂停恢复、存档恢复、重复进入和场景销毁场景全部通过
- [ ] VLM/确定性视觉检查无文字溢出、HUD 遮挡、按钮重叠、触控区越界和关键资产缺失
- [ ] 达到 Gameplay Card 声明的 FPS、对象数量、加载时间和内存预算
- [ ] 固定 seed 与输入时间线可以复现相同业务状态轨迹和 `NodeResult`
- [ ] 自动平衡检查通过，且至少完成一次真人完整试玩验收
- [ ] standalone export 使用匹配当前 `specHash`/`runtimeVersion` 的真实浏览器报告并标记 `releaseEligible=true`

“无 bug”可验收含义：上述已知场景无未解决 blocker，错误捕获为空，必需 gate 有与当前 spec 匹配的新鲜证据；不宣称绝对零缺陷。

---

## 2. 未完成任务清单（推荐实施顺序）

> 原则：先打通 **一条竖切**（`survivor_horde` 从 `runtime_ready` → `gate_verified` → `production_ready`），再横向复制到其他卡。  
> 禁止批量把 `runtime_ready` 标成 `production_ready`。

### Phase A — 生产资产与降级策略（P2 尾 + P1.3 尾）

> 目标：换皮输入真实可用，生产模式不允许“假图假声混过门禁”。

#### A1. 美术生产接线

- [x] 生产模式禁止关键角色 / 敌人 / 环境使用程序化 fallback（`ArtAssetMissingError` 运行核 unit 通过；Playwright 真机仍待）
- [x] 原型模式保留 fallback，并在 TestHooks / 全局 status 暴露 `artSource` 与 `artDegradations`
- [x] 工作区 atlas/manifest/provenance 已挂 golden（`20260611-060754-719406`）；全量 license/credits 流水线仍待规范化
- [ ] 校验切片边界、透明背景、朝向、缩放、锚点、碰撞体与动画帧顺序
- [ ] 自动检查重要语义组是否在**真实 gameplay** 中可见（不只检查文件存在 / Playwright）
- [x] 为 `survivor_horde` 建立 golden asset fixture + theme + recipe 夹具（`releaseEligible: false`）
- [ ] 对真实主题资产跑 VLM：角色一致性、敌我可辨识度、前景遮挡、动作可读性

#### A2. 文案真实视觉溢出

- [ ] 真实浏览器截图 / VLM 视觉溢出检测（CJK / 英文 / 混合；Desktop 1280×800、Mobile 720×1280、窄屏安全区）

#### A3. 音频生产强制（承接已完成的 resolver）

- [ ] 生产模式缺失必需音频 cue 硬失败（禁止静默 synth 冒充过关）
- [ ] 每张卡声明必需 cue 覆盖矩阵并写入校验
- [ ] Boss / 精英技能具备语音或可视招式名 fallback（表现层）

---

### Phase B — 表现层事件与手感合同（P3.2 / P3.3）

> 目标：玩法状态与 VFX/SFX 解耦，手感可档位、可降级、可测泄漏。

#### B1. Gameplay Event → Presentation Event

- [ ] 玩家攻击、受击、拾取、技能、升级、Boss 阶段、胜败统一发出语义事件
- [ ] 仅在 gameplay 行为被接受后才触发 VFX / SFX / voice / callout
- [ ] 奖励结算不依赖表现层 callback

#### B2. Game Feel 统一合同

- [ ] 建立 hit-stop、shake、flash、particle、floating text、controller feedback 强度档位
- [ ] 禁止 adapter 随意使用互相冲突的震屏 / 闪白 / 粒子参数
- [ ] 低端设备自动降级档位
- [ ] 高频战斗验证：无频繁对象分配、无粒子泄漏、无音频节点泄漏

---

### Phase C — 测试竖切：`survivor_horde` 先行（P5 核心）

> 目标：用一张卡证明“证据 → gate_verified → production_ready”闭环。

#### C1. Mock / 通用 smoke 扩面

- [x] 通用 adapter smoke 从 12/12 扩到覆盖全部已实现基础卡 (Step C1 完成 23/23 唯一 Card Headless Smoke)
- [ ] CI 持续运行；失败阻断合并到生产路径

#### C2. `survivor_horde` 专项 fixture

- [ ] 独立 fixture + 专项测试文件
- [ ] 覆盖：启动与首帧、核心输入、正常胜利、硬失败、主动撤退、暂停/恢复、重试、场景销毁、`NodeResult` 与奖励写回
- [ ] 固定 seed + 输入时间线 → 业务状态轨迹与 `NodeResult` 可复现

#### C3. modifier 组合（survivor 兼容集）

- [ ] 每个 survivor 兼容 modifier 至少一个 golden fixture
- [ ] 覆盖 install / update / uninstall / 重复进入

#### C4. 真实浏览器 E2E（先一张卡）

- [x] Playwright：Chrome Desktop(1280×800) + Mobile(720×1280) — **core demo**（`npm run check:survivor-e2e`）
- [x] `survivor_horde` demo：进关 + 撤退 + force 胜利 + **自然 `hp_zero` 失败** + **pause/resume**
- [x] 报告含 `specHash` / `runtimeVersion` / cardId / modifiers / `releaseEligible:false`
- [x] demo 路径 console/page error 为空（本机最新跑次）
- [x] **standalone export** 路径 E2E（真 atlas + 启动 survivor + 失败）（`npm run check:standalone-survivor-e2e`）
- [ ] 工作台 IDE 完整 UI 进关路径 E2E
- [ ] 暂停恢复在 standalone 主机按钮路径的完整断言

#### C5. 性能与 soak（先动作卡）

- [x] demo soak 记录 FPS 采样 / 敌人数 / 可选 heap（`check:survivor-visual-soak`，默认 120s）
- [x] 全量 10 分钟路径：`npm run check:survivor-visual-soak:full`（`SOAK_SECONDS=600`）
- [x] 对照 card `performanceBudget` **记录**比较；headless 用楼地板门禁（avg≥20），**非**真机 P95 认证
- [ ] 真机/非 headless 上 normalP95Fps≥55 证据

#### C6. 视觉 / 场景卫生 Hard Gate

- [x] Canvas 非黑屏、尺寸正确（双视口截图 + toDataURL）
- [x] 控件在 viewport 内
- [ ] VLM：无文字溢出、HUD 遮挡、按钮重叠
- [x] 输出 `visual_audit_latest.json` + `performance_report_latest.json`（`releaseEligible: false`）

#### C7. 发布门禁与状态晋升

- [x] 自动化证据汇总脚本：`npm run check:survivor-c7-readiness`
- [x] `survivor_horde`：`runtime_ready` → `gate_verified` → **`production_ready`**
- [x] 真人试玩签字 approved + 报告 `releaseEligible=true`
- [x] validator `productionExportAllowed: true`
- [ ] 真机 FPS profiler / VLM 作为 residual risk 可选补强
- [x] 上游 content / knobs / 资产 / recipe 变化 → 相关报告标 stale（`markGateReportsStale`；apply recipe 写节点后联动；publish hard-gate 拒绝 stale）

---

### Phase D — 关卡 Recipe 与主题自动编译（P4）

> 目标：主题换皮有机器可读配方，而不是手搓 manifest。

#### D1. Level Recipe

- [x] 定义 `LevelRecipe` schema（`productize/schemas/level-recipe.schema.json`）
- [x] 编译器校验 card 成熟度 / content / atlas / audio / modifier / `recipeHash`（`npm run check:level-recipe`）
- [x] golden production recipes：荒域 + 霓虹（只换 content pack）
- [x] CLI 应用 Recipe 到工作区节点（`npm run recipe:apply`）
- [x] IDE UI 一键应用 Recipe 按钮（GameplayPanel + `POST /api/workspaces/{id}/level-recipe/apply`，与 CLI 共用 `apply-level-recipe-core`）
- [x] Recipe 变化精确失效对应测试与资产报告（stale 联动；`check:production-export-gate`）

#### D2. 编排器玩法选择

- [x] Catalog 成熟度列表（`npm run catalog:gameplay` / `:production`）
- [x] 策略：自动选择仅限 `production_ready`；实验卡需显式
- [x] 后端 `gameplay_catalog` + department gameplay 补丁接入
- [x] 冷启动 preset 默认生产卡 `survivor_horde`（不再轮换三种未认证 mechanics）
- [ ] 按主题、叙事功能、节奏位置、平台、目标玩家在多 production 卡间选择
- [ ] 按兼容矩阵选 modifier；禁止自动生成不支持组合
- [ ] 需要新行为时生成 L3 提案，不得把配置改动伪装成已实现玩法

#### D3. 参数与平衡安全区

- [ ] 每张卡 knobs 合法范围、相互约束、危险组合
- [ ] 可通关性估算：目标数、时间、刷新率、伤害、移速、Boss TTK
- [ ] 自动拒绝明显不可通关或无失败压力的组合
- [ ] `easy` / `normal` / `hard` 经实测的 balance profile
- [ ] modifier 叠加后重算难度、对象预算、失败条件

---

### Phase E — 全卡矩阵横向扩展（P5 扩面 + P7）

> 目标：在 `survivor_horde` 竖切成功后，按认证顺序复制流程，禁止批量贴标签。

#### E1. 其余卡专项测试

- [ ] 23 张卡各自独立 fixture 与专项测试文件
- [ ] 每张卡至少：胜利流 + 失败/撤退流（真实浏览器）
- [ ] 全部动作卡 10 分钟 soak（按预算分级可放宽非动作卡）

#### E2. 全 modifier 矩阵

- [ ] 每个 modifier 至少一个兼容组合 golden fixture
- [ ] 记录“已验证基础卡 × modifier”矩阵，UI 仅允许已验证挂载（生产路径）

#### E3. 首批认证顺序（逐张）

- [x] `survivor_horde` — **`production_ready`**（有条件；见 step_C7_production_ready.md）
- [x] `rhythm_timing` — **`production_ready`**（有条件 residual；见 step_E3_rhythm_timing_production_ready.md）
- [x] `drag_collect_grid` — **`production_ready`**（有条件 residual；见 step_E3_drag_collect_grid_production_ready.md）
- [x] `turn_based_skill_battle` — **`production_ready`**（有条件 residual；见 step_E3_turn_based_skill_battle_production_ready.md）
- [ ] `sequence_synthesis` — 第一张顺序解谜卡
- [ ] `side_scrolling_brawler` — 多输入 / 镜头 / 性能 / 资产流水线完成后
- [ ] 其余卡按复用价值与测试复杂度逐张认证

---

### Phase F — 运营与证据保鲜（持续）

- [ ] 所有生产报告统一字段：`specHash`、`runtimeVersion`、card 版本、modifier 组合、资产 manifest hash、timestamp、`status`
- [ ] 工作台展示：成熟度、最近 gate 时间、覆盖平台、已知风险、stale 标记
- [ ] 定期回归：theme-decoupling、card V2 schema、node-smoke、E2E 抽样
- [ ] 导出物 CREDITS / provenance / 合规扫描进入发布检查表

---

## 3. 建议下一步（待你确认后再编码）

**推荐从 Phase C 的前置资产竖切开始，或直接从 C1 扩 smoke——二选一由你定：**

| 选项 | 内容 | 产出 |
| --- | --- | --- |
| **S0（推荐）** | 冻结 `survivor_horde` 作为首张竖切卡：列清其 Theme Content Pack 必需 key、requiredAssets、audio cues、默认 knobs、兼容 modifier 清单与 DoD 检查表 | 设计/清单文档，无代码 |
| **S1** | Phase A1 子集：`survivor_horde` golden asset fixture + 生产/原型 fallback 策略规格 | 资产合同 + 降级规则 |
| **S2** | Phase C1：通用 mock smoke 扩面（12 → 全基础卡） | CI 可跑 smoke |
| **S3** | Phase C2–C4：`survivor_horde` 专项 fixture + Playwright 胜/败流 | 首张 E2E 证据包骨架 |

请确认下一步做哪一项（或给出你的优先级）；**确认前不进行任何编码。**

---

## 4. 已完成大段索引（查阅用）

| 段 | 状态 |
| --- | --- |
| P0 成熟度模型 / UI / gate 语义 | 完成 |
| P1 Theme Content Pack + adapter 去题材化 + 启发式字数 | 完成（真实 VLM 溢出 → A2） |
| P2 Asset Contract + RuntimeArtBinder 结构接线 | 完成（生产 fallback 禁止与 golden fixture → A1） |
| P3.1 AudioAssetResolver | 完成（生产强制与 cue 矩阵 → A3） |
| P3.2 / P3.3 表现事件与 Game Feel | 未完成 → Phase B |
| P4 Recipe / 编排器 / 平衡 | 未完成 → Phase D |
| P5 测试矩阵 | 部分（12/12 smoke）→ Phase C / E |
| P6 视觉与发布 hard gate | 未完成 → C6 / C7 |
| P7 逐张 production_ready 认证 | 未开始 → C7 / E3 |
