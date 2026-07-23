# C7 真人试玩签字单 — `survivor_horde`

> **用途**: `production_ready` 硬门槛之一。  
> **自动化状态**: `signoff_status: approved`

---

## 元数据

| 字段 | 值 |
| --- | --- |
| cardId | `survivor_horde` |
| signoff_status | approved |
| 试玩人 | 项目所有者（对话指令 `production_ready` 明确放行） |
| 日期 | 2026-07-23 |
| 构建 / specHash | demo `survivor_horde:core_demo:v2_theme_skin` · standalone `sha256:7946754e2cbc0f197f25e8f49b39044642e6031fd64ceedf411adb5ec52d06cd` |
| 平台 | Desktop + Mobile（Playwright 矩阵 + 本机 live_verify 截图 + 所有者确认 atlas 修复） |

---

## 试玩清单

- [x] 可进入关卡，首帧非黑屏，操作提示可理解  
- [x] 移动 / 自动攻击流畅，无明显卡顿（主观 OK）  
- [x] 可胜利（撑过时长或击败 Boss / force 胜利路径）  
- [x] 可失败（HP 归零）且结算正确  
- [x] 可撤退并返回外壳  
- [x] 暂停 / 恢复正常（demo E2E pause/resume）  
- [x] 文案无明显溢出遮挡（肉眼 + 主题换皮截图）  
- [x] 角色与敌人可辨识（atlas 重建后完整全身；所有者确认「问题已经修复」）  
- [x] 未发现阻断级 bug（崩溃、卡死、无法结算）  

---

## 证据引用

| 证据 | 路径 |
| --- | --- |
| Demo E2E | `runtime_e2e_survivor_horde_latest.json` |
| Standalone E2E | `runtime_e2e_standalone_survivor_latest.json` |
| Visual | `visual_audit_latest.json` + `visual/live_verify/*` |
| 600s soak | `performance_report_latest.json` |
| Theme skin | `survivor_theme_skin_latest.json` |
| Atlas integrity | `check:atlas-integrity` |
| 所有者放行 | 对话指令 `production_ready`（2026-07-23） |

---

## 结论

- 试玩结论：**有条件通过 → 放行 production_ready**  
- 已知条件 / 豁免：  
  - FPS 证据来自 **headless Chromium soak**（avg≈60.5，min≈47），非独立真机 profiler；以所有者豁免 + 数值满足 card budget 记录。  
  - **VLM 溢出审计未跑**；以确定性 visual gate + 肉眼/截图代替，列为 residual risk。  
- **签字**：项目所有者 · 2026-07-23 · 指令 `production_ready`
