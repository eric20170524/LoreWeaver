# 简要步骤报告: C5–C6 — Visual + Soak（survivor_horde demo）

> **交付物ID**: `step_C5C6_visual_soak`  
> **命令**: `npm run check:survivor-visual-soak`（默认 120s）· 全量 DoD：`npm run check:survivor-visual-soak:full`（600s）  
> **时间**: 2026-07-23  

---

## 1. Visual（确定性，非 VLM）

| 检查 | 视口 |
| --- | --- |
| canvas 存在 / 尺寸 | mobile 720×1280 · desktop 1280×800 |
| 非黑屏（toDataURL 长度） | 同上 |
| 控件在 viewport 内 | start/retreat |
| 截图落盘 | `minigame_master/capabilities/reports/visual/survivor_horde/*.png` |

报告：`visual_audit_latest.json` · `releaseEligible: false`

---

## 2. Soak / Performance

| 项 | 说明 |
| --- | --- |
| 目标 | 单局长跑（`?durationSec=` 避免场景重启竞态） |
| FPS | headless rAF 采样；**楼地板** avg≥20（非真机 55） |
| 敌人数 | 有界（相对 card budget） |
| heap | 可选 performance.memory，增长比 <4 |
| 全量 DoD | `SOAK_SECONDS=600` |

报告：`performance_report_latest.json`

---

## 3. 诚实边界

- Headless FPS **不能**代替真机 P95≥55  
- 无 VLM 文字溢出审计  
- **不得**单独据此标 `production_ready`  
