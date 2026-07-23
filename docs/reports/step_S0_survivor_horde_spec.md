# 简要步骤报告: Step S0 — `survivor_horde` 关卡规格与 DoD 最终判定定义

> **交付物ID**: `step_S0_survivor_horde_spec`  
> **关联任务**: `task.md` 0.2, 1, 2 (Phase C 前置 S0)  
> **完成时间**: 2026-07-23  

---

## 1. 关卡规格冻结 (Base Spec Baseline)

首张生产化竖切关卡定为 **`survivor_horde` (动作生存吸血鬼幸存者玩法)**。

| 配置维度 | 规范描述 / 契约定义 |
| --- | --- |
| **Card ID** | `survivor_horde` |
| **Schema Version** | `2.0` |
| **Adapter Class** | `SurvivorHordeAdapter` (`minigame_master/core/lib/gameplay/survivor_horde/SurvivorHordeAdapter.js`) |
| **输入方式 (Inputs)** | `pointer_move`, `keyboard_move` |
| **目标 (Objectives)** | `survive_duration`, `kill_count`, `boss_defeat` |
| **失败条件 (Failure)** | `player_hp_zero`, `escort_dead`, `timer_expired`, `retreated` |
| **主题内容包必需 Key** | `title`, `intro`, `taunts`, `enemyNames`, `bossName`, `skillNames`, `settlementText` *(详见下方 Schema 对照表)* |
| **必需美术 Key (requiredAssets)** | `playerClips` (`idle`, `walk`, `attack`, `hurt`, `death`), `enemyKinds` (`mob`, `elite`, `boss`), `environments` (`bg_default`) |
| **必需音频 Key (audioCues)** | `bgm_main`, `sfx_attack`, `sfx_hit`, `sfx_win`, `sfx_lose` |
| **默认 Knobs 边界** | `durationSec` (10~600, 默认 120), `enemySpawnRateSec` (0.05~20, 默认 1.0), `boss` (可选对象), `rewardTable` (对象) |
| **兼容 Modifier 集合** | `hazard_telegraph`, `horde_intensity`, `arena_wave_boss`, `boss_phases`, `crystal_collection`, `poison_fog`, `resource_pressure` |

### 1.1 主题文案 Key 与 `theme-content-pack.schema.json` 契约对照表

| 规格简称 Key | 对应 `ThemeContentPack` Schema 规范路径 | 运行时解析位置 |
| --- | --- | --- |
| `title` | `levelMeta.title.<locale>` | 关卡标题 / 顶栏 HUD |
| `intro` | `levelMeta.intro.<locale>` | 关卡简介 / 引导对话 |
| `taunts` | `copyKeys.taunts.<locale>` 或 `dialogue.nodes` | 敌人/Boss 战挑衅文案 |
| `enemyNames` | `entities.enemies.<enemyKind>.<locale>` | 小怪与精英敌人名称 |
| `bossName` | `entities.bosses.<bossKind>.<locale>` | Boss 血条与叫阵文案 |
| `skillNames` | `entities.skills.<skillId>.<locale>` | 技能选择与升级提示文案 |
| `settlementText` | `levelMeta.victoryText` / `levelMeta.failureText` / `levelMeta.retreatText` | 结算面板评价文案 |

---

## 2. 单关 `production_ready` DoD 判定标准定义 (12 项硬判定，当前均待验收 [ ])

只有同时满足以下 12 项条件，`survivor_horde` 才能从 `runtime_ready` / `gate_verified` 标为 `production_ready`（目前完成度为 **待验收 [ ]**）：

1. [ ] **架构解耦**: 仅通过 Recipe 输入 Content/Asset/Audio 包与 Knobs，不修改 `SurvivorHordeAdapter` / `GameRunner` 源码。
2. [ ] **全流程状态机**: 场景可进入、可移动/攻击、可胜利、可失败、可主动撤退、可暂停/恢复，并写回包含 `telemetry` 的 `NodeResult`。
3. [ ] **文案完全数据化**: 场景内 UI、角色名、敌人名、结算评价全量由 `ThemeContentPack` 驱动。
4. [ ] **美术语义映射**: 玩家、敌人、背景、弹体与 VFX 均通过 `RuntimeArtBinder` 映射。
5. [ ] **音频强制与清理**: BGM/SFX 场景按 Cue 播放，销毁时自动 stop & clean，生产模式下无 fallback 硬报错。
6. [ ] **多端 E2E 无错**: Chrome Desktop (1280×800) / Mobile (720×1280) Playwright E2E 跑通，控制台/页面/网络错误 0 次。
7. [ ] **视觉与场景卫生 Gate**: 无文字溢出、无 HUD 遮挡、安全区避让、Canvas 非黑屏。
8. [ ] **性能预算硬指标**: 60 人同屏 P95 FPS ≥ 55 (Boss战 ≥ 45)，10 分钟 Soak 内存/对象 0 泄漏。
9. [ ] **确定性复现**: 固定 seed + 输入时间线产出 100% 相同状态轨迹与 `NodeResult`。
10. [ ] **自动化关卡可通关估算**: enemy/boss TTK 与玩家 DPS 处于可通关安全区间。
11. [ ] **真实验收记录**: 包含有效 timestamp 与证据包 Hash 的真实验收签署。
12. [ ] **生产导出标记**: `standalone_browser_report.json` 中 `releaseEligible === true` 且 `specHash` 匹配当前 card 与 runtime。

---

## 3. 评审结论

- `survivor_horde` 竖切卡规格与 DoD 12 项判定标准已明确冻结，作为后续 Phase A、Phase B、Phase C 编码与校验的唯一依据。各项 DoD 判定需在后续具体测试步骤中逐步签署（目前均保持 `[ ]` 待验收状态）。

