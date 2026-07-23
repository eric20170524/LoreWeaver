# 简要步骤报告: Step C1 — 通用 Node Smoke 测试全卡矩阵扩面 (23/23 唯一卡覆盖通关)

> **交付物ID**: `step_C1_node_smoke_coverage`  
> **关联任务**: `task.md` 0.2 (缺口1), Phase C1 (C1 扩面)  
> **完成时间**: 2026-07-23  

---

## 1. 扩面工作概述

原 `run_node_smoke.mjs` 测试 12 个节点，且包含重复 `cardId` 映射。为满足 Phase C1 通用 Mock adapter smoke 覆盖全部已实现 23 张基础卡的要求：

1. **节点映射重构与扩展**: 在 `data/workspaces/20260611-060754-719406/loreweaver/nodes/` 中建立 1 至 23 号节点契约，确保 23 个节点 1:1 覆盖全部 22 张基础 Gameplay Cards 与 1 张微型容器卡 (`node_iframe_microgame`)。
2. **Headless Mock 环境补齐**:
   - `MockPhaserScene.js` 补齐 `scene.add.ellipse(x, y, w, h)` 图形 API；
   - `MockPhaserScene.js` 补齐 `scene.cameras.main.setDeadzone()` 摄像机死区控制 API。
3. **UI / 响应类卡片进阶断言**: 在 `runAdapterSmoke.js` 中将交互/解谜/回合/选择类卡片纳入 UI 推进与状态进阶断言。

---

## 2. 验证结果 (23 节点 / 23 唯一卡 全量通过)

运行命令:
```bash
node minigame_master/capabilities/verification/run_node_smoke.mjs
```

**执行摘要**:
- **Gate 状态**: `passed`
- **评分**: 100 / 100
- **唯一卡片覆盖**: **23 / 23 (22 张基础卡 + 1 张微型容器卡)**
- **节点实例通过率**: **23 / 23 (100%)**
- **硬报错**: 0 个
- **报告生成路径**: `minigame_master/capabilities/reports/node_smoke_latest.json`

---

## 3. 23 张基础卡 1:1 映射 Smoke 矩阵清单

| 节点ID | 节点名称 / 对应文件 | Card ID (唯一映射) | 验证模式 | 状态 (ok) | 说明 / Warning 备注 |
| --- | --- | --- | --- | --- | --- |
| 1 | 荒域历练 (`node-01-dahuang.json`) | `survivor_horde` | 实体/动作控制 | PASSED | 动作生存 (首张竖切卡) |
| 2 | 千崖秘径 (`node-02-baiduan.json`) | `drag_collect_grid` | 实体/收集 | PASSED | 移动收集 |
| 3 | 镜魄试炼场 (`node-03-xushenjie.json`) | `rhythm_timing` | 节奏/判定 | PASSED | 节奏反应 |
| 4 | 天潮巢 (`node-04-kunpeng-nest.json`) | `dodge_counter_boss` | UI 推进 (软通过) | PASSED | 闪避反击 Boss (Headless 触发 UI progress) |
| 5 | 石都大战 (`node-05-shidu.json`) | `drag_to_core` | UI 推进 (软通过) | PASSED | 核心拖拽 |
| 6 | 药都风云 (`node-06-yaodu.json`) | `energy_balance` | 状态平衡 | PASSED | 能量平衡 |
| 7 | 三千道州天才战 (`node-07-three-thousand-states.json`) | `observe_capture` | UI 推进 (软通过) | PASSED | 观察捕获 |
| 8 | 仙古遗地 (`node-08-xiangu.json`) | `node_iframe_microgame` | 容器/契约 | PASSED | 容器契约测试 (真正 iframe 节点) |
| 9 | 天神书院 (`node-09-tianshen-academy.json`) | `pressure_survival` | 生存/计时 | PASSED | 高压生存 |
| 10 | 边荒帝关 (`node-10-imperial-pass.json`) | `reaction_pick` | 反应/选择 | PASSED | 辨宝反应 |
| 11 | 异域大战 (`node-11-foreign-land.json`) | `sequence_synthesis` | 序列合成 | PASSED | 序列合成 |
| 12 | 终极血战 (`node-12-final-battle.json`) | `shooter_duel` | 弹幕对决 | PASSED | 弹幕对决 |
| 13 | 迷宫探索试炼 (`node-13-maze-exploration.json`) | `maze_exploration_choice` | UI 推进 (软通过) | PASSED | 骨架节点 (Warn: no_envKey / no_bgmKey) |
| 14 | 平台逃逸试炼 (`node-14-platform-escape.json`) | `platform_escape` | 生存/物理 | PASSED | 骨架节点 (Warn: no_envKey / no_bgmKey) |
| 15 | 危局收集试炼 (`node-15-hazard-collect.json`) | `hazard_collect_waves` | 波次/收集 | PASSED | 骨架节点 (Warn: no_envKey / no_bgmKey) |
| 16 | 连击解谜试炼 (`node-16-sequence-puzzle.json`) | `sequence_puzzle_combo` | 解谜/序列 | PASSED | 骨架节点 (Warn: no_envKey / no_bgmKey) |
| 17 | 律动拾取试炼 (`node-17-rhythm-pickup.json`) | `rhythm_then_pickup` | UI 推进 (软通过) | PASSED | 骨架节点 (Warn: no_envKey / no_bgmKey) |
| 18 | 划界圈地试炼 (`node-18-qix_area_capture.json`) | `qix_area_capture` | UI 推进 (软通过) | PASSED | 骨架节点 (Warn: no_envKey / no_bgmKey) |
| 19 | 点拖推进试炼 (`node-19-point-drag.json`) | `point_drag_progression` | 点拖/推进 | PASSED | 骨架节点 (Warn: no_envKey / no_bgmKey) |
| 20 | 符文连线试炼 (`node-20-rune-connect.json`) | `rune_connect_sequence` | 连线/解谜 | PASSED | 骨架节点 (Warn: no_envKey / no_bgmKey) |
| 21 | 对话抉择判定 (`node-21-branching-dialogue.json`) | `branching_dialogue_check` | UI 推进 (软通过) | PASSED | 骨架节点 (Warn: no_envKey / no_bgmKey) |
| 22 | 横版横扫清刀 (`node-22-side-scrolling-brawler.json`) | `side_scrolling_brawler` | 动作/清刀 | PASSED | 骨架节点 (Warn: no_envKey / no_bgmKey) |
| 23 | 回合策略对抗 (`node-23-turn-based-skill-battle.json`) | `turn_based_skill_battle` | UI 推进 (软通过) | PASSED | 骨架节点 (Warn: no_envKey / no_bgmKey) |

> [!NOTE]
> **测试深度透明化说明**:
> 1. **软通过 (8/23 卡片)**: `dodge_counter_boss`, `drag_to_core`, `observe_capture`, `maze_exploration_choice`, `rhythm_then_pickup`, `qix_area_capture`, `branching_dialogue_check`, `turn_based_skill_battle` 8 张 UI/交互卡片在 Headless 环境中依赖 `spawnOrProgress=true` 进阶合同，验证为无 Crash 进入、UI 合同响应及正常退出，不等于完整 Gameplay 玩法就绪。
> 2. **骨架节点 Warning (11 节点)**: 13–23 号节点为 Smoke 扩面用的极简骨架节点 (~500B)，未配置主题环境 `envKey` 和音频 `bgmKey`。Node Smoke 在 `softWarnings` 中计入此 Warning 且判定整体通过 (Score 100)，仅作为 Card 覆盖矩阵保障，不替代真实 Campaign 内容校验。

---

## 4. 评审结论

- 通用 Mock adapter smoke 扩面任务完成，实现了 23 个节点对 23 张唯一 Card ID 的 100% Headless 覆盖与契约通关。

