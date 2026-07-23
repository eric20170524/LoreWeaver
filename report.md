# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: 进行中 / **C5–C6 visual+soak 门禁已落地**（demo；默认 120s，全量 600s）  
> **更新时间**: 2026-07-23  
> **首张竖切**: `survivor_horde` · **`runtime_ready`** · **`releaseEligible: false`**

---

## 阶段进度

| 步骤 | 状态 | 命令 |
| --- | --- | --- |
| A1 美术运行核 | 完成 | `check:art-binder` |
| N+2 golden atlas | 完成 | `check:survivor-golden-atlas` |
| C2/C3 E2E demo + standalone | 完成 | `check:survivor-e2e` · `check:standalone-survivor-e2e` |
| **C5 visual** | **完成（确定性）** | `check:survivor-visual-soak` |
| **C6 soak** | **完成（可配置时长）** | 同上 · full=`check:survivor-visual-soak:full` |
| VLM / 真机 FPS / 真人试玩 | 未做 | — |
| C7 production_ready | 未做 | 0 张 |

---

## C5–C6 摘要

```bash
npm run check:survivor-visual-soak          # default SOAK_SECONDS=120
SOAK_SECONDS=90 npm run check:survivor-visual-soak   # quick
npm run check:survivor-visual-soak:full     # 600s DoD
```

产出：

- `visual_audit_latest.json`
- `performance_report_latest.json`
- `visual/survivor_horde/*.png`

本机已跑 **全量 600s** soak：

- visual: **passed**（5 张截图）  
- performance: **passed** · `isFullDodDuration: true` · avgFps≈60.5 · minFps≈47 · maxEnemy=36 · heapGrowth≈1  
- **releaseEligible 仍 false**

详情：[step_C5C6_visual_soak.md](docs/reports/step_C5C6_visual_soak.md)

---

## 下一步（C7 前）

1. 可选 VLM 文字溢出 / 真机帧率记录  
2. 真人完整试玩签字  
3. 汇总证据包后改 card：`gate_verified` → `production_ready`（勿跳步）  
