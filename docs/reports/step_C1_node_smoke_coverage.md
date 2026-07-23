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

| 节点ID | 节点名称 | Card ID (唯一映射) | 状态 (ok) | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 荒域历练 | `survivor_horde` | PASSED | 动作生存 (首张竖切卡) |
| 2 | 千崖秘径 | `drag_collect_grid` | PASSED | 移动收集 |
| 3 | 镜魄试炼场 | `rhythm_timing` | PASSED | 节奏反应 |
| 4 | 天潮巢 | `dodge_counter_boss` | PASSED | 闪避反击 Boss |
| 5 | 石都大战 | `drag_to_core` | PASSED | 核心拖拽 |
| 6 | 药都风云 | `energy_balance` | PASSED | 能量平衡 |
| 7 | 三千道州天才战 | `observe_capture` | PASSED | 观察捕获 |
| 8 | 仙古遗地 | `node_iframe_microgame` | PASSED | 容器契约测试 |
| 9 | 天神书院 | `pressure_survival` | PASSED | 高压生存 |
| 10 | 边荒帝关 | `reaction_pick` | PASSED | 辨宝反应 |
| 11 | 异域大战 | `sequence_synthesis` | PASSED | 序列合成 |
| 12 | 终极血战 | `shooter_duel` | PASSED | 弹幕对决 |
| 13 | 迷宫探索试炼 | `maze_exploration_choice` | PASSED | 迷宫抉择 |
| 14 | 平台逃逸试炼 | `platform_escape` | PASSED | 平台逃逸 |
| 15 | 危局收集试炼 | `hazard_collect_waves` | PASSED | 危局波次收集 |
| 16 | 连击解谜试炼 | `sequence_puzzle_combo` | PASSED | 序列解谜 |
| 17 | 律动拾取试炼 | `rhythm_then_pickup` | PASSED | 律动拾取 |
| 18 | 划界圈地试炼 | `qix_area_capture` | PASSED | 划界圈地 |
| 19 | 点拖推进试炼 | `point_drag_progression` | PASSED | 点拖推进 |
| 20 | 符文连线试炼 | `rune_connect_sequence` | PASSED | 符文连线 |
| 21 | 对话抉择判定 | `branching_dialogue_check` | PASSED | 对话分支判定 |
| 22 | 横版横扫清刀 | `side_scrolling_brawler` | PASSED | 横版清刀 |
| 23 | 回合策略对抗 | `turn_based_skill_battle` | PASSED | 回合技能对决 |

---

## 4. 评审结论

- 通用 Mock adapter smoke 扩面任务完成，实现了 23 个节点对 23 张唯一 Card ID 的 100% 覆盖与 Headless 测试通关。
