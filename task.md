# minigame_master Gameplay 关卡生产化任务清单

> 目标：让已认证的 Gameplay Card 在输入主题内容包、美术/音频资产包和关卡参数后，可以自动生成可发布的成熟关卡；不再依赖逐关修改 adapter 源码。

## 0. 当前基线（2026-07-22 审计更新）

- [x] 已有 23 张基础/容器 Gameplay Card 和 24 张 modifier 卡。
- [x] `GameRunner` 已接入现有 Phaser adapter，TypeScript 类型检查通过。
- [x] 已有 `NodePayload`、`NodeResult`、`GameplayAdapter`、`GameplayModifier`、`SceneLifecycle`、`TestHooks` 等基础合同。
- [x] 已有 `RuntimeArtBinder`、运行时 spec、standalone export 和基础 gate 框架。
- [x] Gameplay Card & Modifier V2 Schema 全量迁移完成。
- [x] Core Lib & Adapter 100% 去题材化静态审计通过。
- [x] AudioAssetResolver 接入 GameRunner 并支持 Synth 降级。
- [ ] 通用 Mock adapter smoke 达到 22/22；当前本地基线为 12/12。
- [ ] 23 张卡全部具备独立、可执行的 E2E / Soak 浏览测试路径。
- [ ] 真实 Atlas 美术资产和音频资产完整装载。
- [ ] 缺失 build/E2E/视觉/美术/音频/性能证据时阻止生产发布。

## 1. 最终验收定义（Definition of Done）

只有同时满足以下条件，某张 Gameplay Card 才能标记为 `production_ready`：

- [ ] 输入仅包括 Theme Content Pack、Asset Pack、Gameplay Card、modifier 和合法 knobs，不修改 adapter/core 源码。
- [ ] 关卡可进入、可操作、可胜利、可失败、可撤退、可暂停恢复，并能正确返回 `NodeResult`。
- [ ] 主题文案、角色名、敌人名、道具名、操作提示和结算文案均来自内容包。
- [ ] 角色、敌人、场景、道具、弹体、VFX 和 UI 资产均通过语义 key 解析。
- [ ] 真实 BGM、SFX、语音/视觉招式名按语义 cue 播放，支持 autoplay 解锁、静音、暂停和场景清理。
- [ ] Desktop 与 Mobile 真实浏览器 E2E 全部通过，console/page/request error 为空。
- [ ] 胜利、失败、撤退、暂停恢复、存档恢复、重复进入和场景销毁场景全部通过。
- [ ] VLM/确定性视觉检查无文字溢出、HUD 遮挡、按钮重叠、触控区越界和关键资产缺失。
- [ ] 达到 Gameplay Card 声明的 FPS、对象数量、加载时间和内存预算。
- [ ] 固定 seed 与输入时间线可以复现相同业务状态轨迹和 `NodeResult`。
- [ ] 自动平衡检查通过，且至少完成一次真人完整试玩验收。
- [ ] standalone export 使用匹配当前 `specHash`/`runtimeVersion` 的真实浏览器报告并标记 `releaseEligible=true`。

“无 bug”在本项目中的可验收含义：上述已知场景没有未解决 blocker，错误捕获为空，所有必需 gate 有与当前 spec 匹配的新鲜证据；不宣称软件在所有未知输入下绝对零缺陷。

## 2. P0：修正成熟度模型与状态表达

### 2.1 统一 Gameplay Card schema

- [x] 将 `minigame_master/gameplay/cards/*.json` 从 v1 字段统一迁移到 Gameplay Card V2。
- [x] 为每张卡补齐 `runtime.template``performanceBudget``maturityImpact``testScenarios``requiredAssets` 和 `exportPolicy`。
- [x] 将卡片状态拆分为：
  - `inventoried`
  - `card_json`
  - `ui_registered`
  - `runtime_ready`
  - `gate_verified`
  - `production_ready`
- [x] 禁止仅凭 `status=validated` 或“有测试计划”推导生产可用。
- [x] modifier 使用相同成熟度模型，并记录已验证的基础卡组合。
- [x] 增加迁移脚本和 schema 校验，拒绝缺失生产字段的卡片。

### 2.2 工作台真实展示成熟度

- [x] Gameplay Panel 展示每张卡的成熟度、最近 gate 时间、覆盖平台和已知风险。
- [x] 未达到 `runtime_ready` 的卡不可在模拟器中伪装为可运行。
- [x] 未达到 `production_ready` 的卡显示“原型/待验证”，不显示“成熟/可发布”。
- [x] modifier 只允许挂载到兼容且存在运行实现的基础卡。
- [x] UI 明确区分：设计可选、模拟器可运行、gate 已验证、生产可发布。

### 2.3 修正 gate 语义

- [x] `runtime_stage` 缺少 build 报告时由 warning 改为 blocker。
- [x] `runtime_stage` 缺少与当前 spec 匹配的 E2E 报告时由 warning 改为 blocker。
- [x] 生产模式下 visual、scene hygiene、art、audio、performance 报告全部改为 hard gate。
- [x] 报告必须包含 `specHash`、`runtimeVersion``Gameplay Card` 版本、modifier 组合和资产 manifest hash。
- [x] 上游内容、knobs、资产或 adapter 变化后，自动将相关报告标记为 stale。
- [x] `runtime_stage` 与 `production_ready` 分离：前者表示可运行，后者表示可发布。

## 3. P1：运行时文案彻底数据化

### 3.1 建立 Theme Content Pack

- [x] 新增机器可读 `theme-content-pack` schema。
- [x] 内容包至少包含：
  - 关卡标题、intro、目标、操作提示、HUD 标签、胜败/撤退文案。
  - 角色、敌人、Boss、道具、材料、技能和状态名称。
  - 分支对话图、选项、条件提示和结局文本。
  - i18n locale 与 fallback locale。
- [x] 定义 Gameplay Card 所需 copy key，禁止 adapter 自由拼接题材字符串。
- [x] 内容包校验缺失 key、超长文本、非法占位符和不支持的 locale。

### 3.2 清除 adapter 硬编码题材文案

- [x] 逐个迁移 23 个 adapter 中的硬编码标题、提示、材料、敌人和状态文本。
- [x] 优先处理：
  - `BranchingDialogueCheckAdapter`
  - `TurnBasedSkillBattleAdapter`
  - `SequenceSynthesisAdapter`
  - `CollectDodgeAdapter`
  - `PressureSurvivalAdapter`
  - `MazeExplorationChoiceAdapter`
- [x] 将 `GameRunner.showLevelIntro()` 中仅覆盖三种玩法的硬编码说明改为 card copy contract。
- [x] 将胜利、失败、奖励、撤退和日志文案改为内容 key + 参数模板。
- [x] core 默认 fallback 使用完全去题材化文案。
- [x] 增加静态检查：`minigame_master/core/lib` 禁止出现项目/主题专属名词（硬违规 exit 1 门禁）。

### 3.3 文案视觉适配

- [x] 为每个文本槽声明最大字符数、最大行数、字体范围和对齐方式。
- [x] CJK、英文和混合文本分别跑长度与超限启发式校验。
- [x] Desktop 1280×800、Mobile 720×1280 和窄屏安全区字数槽位规则验证。
- [ ] 真实浏览器截图 / VLM 视觉溢出检测。

## 4. P2：全 Gameplay Card 美术资产接线

### 4.1 定义每张卡的 Asset Contract

- [x] 为 23 张卡声明必需与可选语义资产 (`player`, `enemy`, `projectile`, `pickup`, `environment`, `prop`, `vfx`, `ui`)。
- [x] 为每个角色类型声明 `idle/walk/attack/hurt/death` 等必需 clip。
- [x] 为 modifier 声明独立 prop/VFX key，例如 core、escort、wall、portal、chest。
- [x] 将 required asset keys 写入 Gameplay Card V2，而不是散落在 adapter 中。

### 4.2 扩展 RuntimeArtBinder 覆盖

- [x] 所有 23 张卡统一通过 `payload.runtimeArt` 读取资产。
- [x] 移除 adapter 内直接依赖固定纹理名和固定敌人 id 的逻辑。
- [x] 让环境背景、前景、地面、装饰物和交互道具均支持语义绑定。
- [x] 记录每个运行实体使用的是 atlas、fallback 还是 missing。
- [ ] 生产模式禁止关键角色/敌人/目标使用程序化 fallback。
- [ ] 原型模式保留 fallback，但必须在 HUD/TestHooks 中明确暴露降级状态。

### 4.3 资产生成与验证

- [ ] 生成资产必须进入 atlas、manifest、provenance 和 license/credits 流程。
- [ ] 校验切片边界、透明背景、朝向、缩放、锚点、碰撞体与动画帧顺序。
- [ ] 自动检查重要语义组是否在真实 gameplay 中可见，而非只检查文件存在。
- [ ] 为每张卡生成至少一套 golden asset fixture。
- [ ] 对真实主题资产跑 VLM：角色一致性、敌我可辨识度、前景遮挡和动作可读性。

## 5. P3：音频、VFX、语音与手感生产化

### 5.1 真实音频解析器

- [x] 实现运行时 Audio Asset Resolver，按 `bgmKey`、`sfxKey`、`voiceKey`、`ambienceKey` 加载真实资产。
- [x] 接入 `GameRunner.ts`，替换“记录 BGM key 后仍固定启动 synth”的逻辑。
- [x] 支持 BGM 淡入淡出、Boss 切歌、胜败 stinger、暂停恢复、静音和销毁。
- [x] 捕获并上报 missing、fetch、decode、autoplay、重复叠播错误。
- [x] synth 作为原型 fallback；生产模式缺失必需音频报错。

### 5.2 Gameplay Event → Presentation Event

- [ ] 玩家攻击、受击、拾取、技能、升级、Boss 阶段和胜败统一发出语义事件。
- [ ] 只有 gameplay 行为被接受后才触发 VFX/SFX/voice/callout。
- [ ] 奖励结算不依赖表现层 callback。
- [ ] Boss/精英技能必须具备语音或可视招式名 fallback。
- [ ] 每张卡声明必需 cue 覆盖矩阵。

### 5.3 Game Feel 统一合同

- [ ] 建立 hit-stop、shake、flash、particle、floating text 和 controller feedback 的强度档位。
- [ ] 禁止 adapter 随意使用互相冲突的震屏、闪白和粒子参数。
- [ ] 为低端设备提供自动降级档位。
- [ ] 对高频战斗验证无频繁对象分配、无粒子泄漏、无音频节点泄漏。

## 6. P4：主题 → 玩法组合的自动编译

### 6.1 扩展生成器玩法选择能力

- [ ] 移除主题生成器只能输出三种 mechanics 的限制。
- [ ] 将完整 Gameplay Card catalog、fit、poorFor、输入方式、复杂度和成熟度提供给编排器。
- [ ] 编排器只能自动选择 `production_ready` 卡；其他卡必须显式标记为实验性。
- [ ] 根据主题、节点叙事功能、节奏位置、平台和目标玩家选择基础卡。
- [ ] 根据卡兼容矩阵选择 modifier，禁止自动生成不支持组合。
- [ ] 需要新玩法行为时生成 L3 提案，不得把配置改动伪装成已实现玩法。

### 6.2 建立关卡 Recipe

- [ ] 定义 `LevelRecipe = card + modifiers + knobs + contentPack + assetPack + audioPack + balanceProfile`。
- [ ] 编译器验证 Recipe 的字段、依赖、版本和 hash。
- [ ] 同一 Recipe 在 IDE 与 standalone 使用同一 resolved runtime spec。
- [ ] Recipe 变化精确失效对应测试和资产报告。
- [ ] 支持保存 golden Recipe，作为未来主题换皮的基准模板。

### 6.3 参数与平衡安全区

- [ ] 每张卡定义 knobs 的合法范围、相互约束和危险组合。
- [ ] 增加可通关性估算：目标数量、时间、刷新率、伤害、移动速度和 Boss TTK。
- [ ] 自动拒绝明显不可通关或无失败压力的组合。
- [ ] 为 `easy/normal/hard` 建立经过实测的 balance profile。
- [ ] modifier 叠加后重新计算难度、对象预算和失败条件。

## 7. P5：补齐测试基础设施与全卡矩阵

### 7.1 修复 Mock Phaser 与通用 smoke

- [x] 补齐 `setRadius`、`ellipse`、camera bounds 等当前缺失的 Mock API。
- [x] 修复 `reaction_pick` 等 adapter 的 retreat/`onEnd` 可观测合同。
- [x] 通用 adapter smoke 达到 12/12，并在 CI 中运行。

### 7.2 每张卡的专项测试

- [ ] 23 张卡各自拥有独立 fixture 和专项测试文件。
- [ ] 每张卡至少覆盖：启动与首帧、核心输入、正常胜利、硬失败、主动撤退、暂停/恢复、重试、场景销毁、`NodeResult` 与奖励写回。

### 7.3 modifier 组合测试

- [ ] 为每个 modifier 建立至少一个兼容组合 golden fixture。
- [ ] 覆盖 modifier 安装、update、卸载和重复进入。

### 7.4 真实浏览器矩阵

- [ ] Playwright 覆盖 Chrome Desktop 与 Mobile viewport。
- [ ] 每张卡至少跑一条完整胜利流和一条失败/撤退流。

### 7.5 性能与稳定性

- [ ] 记录 normal/boss 场景 P95 FPS、帧时间、活动对象数和纹理/音频数量。
- [ ] 每张动作卡运行 10 分钟 soak test，检查定时器、listener、tween、physics 和 audio 泄漏。

## 8. P6：视觉审计与发布门禁

- [ ] Canvas 非黑屏和尺寸正确。
- [ ] 关键 UI、安全区和最小触控目标正确。
- [ ] Standalone 发布必须包含完整匹配的 E2E/视觉/性能 Hard Gate 报告。

## 9. P7：成熟模板认证与持续运营

### 9.1 首批认证顺序

- [ ] `survivor_horde`：作为第一张 `production_ready` 动作卡（待 E2E/视觉/性能 Gate 证据补齐后认证）。
- [ ] `rhythm_timing`：作为第一张轻量反应卡。
- [ ] `drag_collect_grid`：作为第一张移动/收集卡。
- [ ] `turn_based_skill_battle`：作为第一张策略战斗卡。
- [ ] `sequence_synthesis`：作为第一张顺序解谜卡。
- [ ] `side_scrolling_brawler`：在多输入、镜头、性能和资产流水线全部完成后认证。
- [ ] 其余卡按复用价值和测试复杂度逐张认证，禁止批量标记生产成熟。
